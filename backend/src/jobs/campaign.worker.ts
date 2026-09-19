import { Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PCloudAdapterFactory } from '../pcloud/pcloud.factory';
import { decryptPCloudCredential } from '../pcloud/pcloud-credentials';
import { decryptProviderCredentials } from '../email/email.credentials';
import { PCloudShareOptions, PCloudTransferOptions } from '../pcloud/pcloud.interface';
import { TemplateVariableResolver } from '../templates/template-variable.resolver';

const logger = new Logger('CampaignWorker');

interface CampaignJobData {
  campaignId: string;
  organizationId: string;
  pcloudAccountId: string;
  pcloudFileId: string;
  templateId: string;
  emailAccountId?: string;
  deliveryMode: 'EMAIL' | 'PCLOUD_NATIVE';
  attachmentMode: string;
  subject: string;
  operationType: 'sharefolder' | 'uploadtransfer';
  retryCount: number;
}

import { getRedisConnectionOptions } from '../config/redis.config';

export function createCampaignWorker(redisHost?: string, redisPort?: number): Worker {
  const prisma = new PrismaClient();
  const connection = (redisHost && !process.env.REDIS_URL)
    ? { host: redisHost, port: redisPort || 6379, maxRetriesPerRequest: null }
    : getRedisConnectionOptions();

  const worker = new Worker(
    'campaign-queue',
    async (job: Job<CampaignJobData>) => {
      const data = job.data;
      logger.log(`🚀 Processing campaign ${data.campaignId} (mode: ${data.deliveryMode}, op: ${data.operationType})`);

      try {
        // Update campaign status to PROCESSING
        await prisma.campaign.update({
          where: { id: data.campaignId },
          data: { status: 'PROCESSING' },
        });

        // Get pCloud account credentials
        const pcloudAccount = await prisma.pCloudAccount.findFirst({
          where: { id: data.pcloudAccountId, organizationId: data.organizationId },
        });

        if (!pcloudAccount) {
          throw new Error(`pCloud account ${data.pcloudAccountId} not found`);
        }

        if (pcloudAccount.status !== 'ACTIVE') {
          throw new Error(`pCloud account ${pcloudAccount.accountEmail} is not ACTIVE (status: ${pcloudAccount.status})`);
        }

        // Decrypt credential
        let accessToken: string;
        if (pcloudAccount.provider === 'mock_pcloud') {
          accessToken = pcloudAccount.credentials;
        } else {
          accessToken = decryptPCloudCredential(pcloudAccount.credentials);
        }

        const apiHost = pcloudAccount.apiHost || 'https://api.pcloud.com';
        const adapter = PCloudAdapterFactory.getAdapter(pcloudAccount.provider);

        // Retrieve campaign and configuration
        const campaign = await prisma.campaign.findFirst({
          where: { id: data.campaignId },
        });

        let campaignCfg: any = {};
        try {
          campaignCfg = campaign?.config ? JSON.parse(campaign.config) : {};
        } catch {}

        const filesSnapshot: any[] = campaignCfg.filesSnapshot || [];

        // Resolve all files belonging to this campaign
        const allCampaignFileIds: string[] = Array.from(new Set([
          ...(campaignCfg.fileIds || []),
          ...filesSnapshot.map((f: any) => f.id),
          data.pcloudFileId,
        ].filter(Boolean)));

        const dbFiles = await prisma.pCloudFile.findMany({
          where: { id: { in: allCampaignFileIds }, organizationId: data.organizationId },
        });

        // Unified File Map (DB record takes precedence, falls back to persistent snapshot)
        const fileMap = new Map<string, any>();
        for (const sf of filesSnapshot) {
          fileMap.set(sf.id, sf);
        }
        for (const df of dbFiles) {
          fileMap.set(df.id, df);
        }

        // Primary pCloud file fallback
        const pcloudFile = fileMap.get(data.pcloudFileId) || dbFiles[0] || filesSnapshot[0];
        if (!pcloudFile) {
          throw new Error(`pCloud file ${data.pcloudFileId} not found`);
        }

        // Cache for file buffers and public links
        const bufferCache = new Map<string, { buffer: Buffer; name: string; mimeType: string }>();
        const pubLinkCache = new Map<string, string>();

        const resolveFileTokenAndHost = async (targetFile: any) => {
          let token = accessToken;
          let host = apiHost;
          if (targetFile.pcloudAccountId && targetFile.pcloudAccountId !== pcloudAccount.id) {
            const owner = await prisma.pCloudAccount.findFirst({ where: { id: targetFile.pcloudAccountId } });
            if (owner && owner.credentials && owner.status === 'ACTIVE') {
              token = owner.provider === 'mock_pcloud' ? owner.credentials : decryptPCloudCredential(owner.credentials);
              host = owner.apiHost || apiHost;
            }
          }
          return { token, host };
        };

        const getFileBuffer = async (targetFile: any) => {
          if (bufferCache.has(targetFile.id)) return bufferCache.get(targetFile.id)!;
          try {
            const { token, host } = await resolveFileTokenAndHost(targetFile);
            const downloaded = await adapter.downloadFileBuffer(targetFile.fileId, token, host);
            bufferCache.set(targetFile.id, downloaded);
            return downloaded;
          } catch (e: any) {
            logger.warn(`Could not download file buffer for ${targetFile.name}: ${e.message}`);
            return null;
          }
        };

        const getFilePubLink = async (targetFile: any) => {
          if (pubLinkCache.has(targetFile.id)) return pubLinkCache.get(targetFile.id)!;
          try {
            const { token, host } = await resolveFileTokenAndHost(targetFile);
            const hosts = [host, host.includes('eapi') ? 'https://api.pcloud.com' : 'https://eapi.pcloud.com'];
            for (const h of hosts) {
              const pubRes = await fetch(`${h}/getfilepublink?fileid=${targetFile.fileId}&auth=${encodeURIComponent(token)}`);
              const pubData = await pubRes.json();
              if (pubData?.result === 0 && pubData.link) {
                pubLinkCache.set(targetFile.id, pubData.link);
                return pubData.link;
              }
            }
          } catch {}
          return 'https://my.pcloud.com';
        };

        // Get template
        const template = await prisma.template.findFirst({
          where: { id: data.templateId, organizationId: data.organizationId },
        });

        // Get all pending/queued recipients
        const recipients = await prisma.campaignRecipient.findMany({
          where: {
            campaignId: data.campaignId,
            status: { in: ['PENDING', 'QUEUED'] },
          },
        });

        if (recipients.length === 0) {
          logger.warn(`Campaign ${data.campaignId} has no pending recipients`);
          await prisma.campaign.update({
            where: { id: data.campaignId },
            data: { status: 'COMPLETED' },
          });
          return;
        }

        logger.log(`📨 Delivering to ${recipients.length} recipients for campaign ${data.campaignId}`);

        // Resolve verified email sender with valid SMTP configuration
        const candidateAccounts = data.emailAccountId
          ? await prisma.emailAccount.findMany({
              where: { id: data.emailAccountId, organizationId: data.organizationId, status: 'VERIFIED' },
            })
          : await prisma.emailAccount.findMany({
              where: { organizationId: data.organizationId, status: 'VERIFIED' },
              orderBy: { createdAt: 'desc' },
            });

        let emailTransporter: nodemailer.Transporter | null = null;
        let emailSenderFrom = `"${pcloudAccount.name || 'AutoWork pCloud'}" <${pcloudAccount.accountEmail}>`;

        for (const candidate of candidateAccounts) {
          if (!candidate.credentials) continue;
          try {
            const rawCreds = JSON.parse(decryptProviderCredentials(candidate.credentials));
            if (rawCreds.host && rawCreds.user && rawCreds.pass) {
              emailTransporter = nodemailer.createTransport({
                host: rawCreds.host,
                port: Number(rawCreds.port) || 587,
                secure: Boolean(rawCreds.secure),
                auth: { user: rawCreds.user, pass: rawCreds.pass },
              });
              emailSenderFrom = `"${pcloudAccount.name || 'AutoWork pCloud'}" <${rawCreds.accountEmail || rawCreds.user || candidate.accountEmail}>`;
              break;
            }
          } catch (e: any) {
            logger.warn(`Failed to inspect email account ${candidate.accountEmail}: ${e.message}`);
          }
        }

        if (emailTransporter) {
          try {
            await emailTransporter.verify();
            logger.log(`✅ SMTP connection verified successfully for ${emailSenderFrom}`);
          } catch (verifyErr: any) {
            logger.warn(`⚠️ SMTP verify warning: ${verifyErr.message}`);
          }
        }

        let successCount = 0;
        let failCount = 0;

        for (const recipient of recipients) {
          try {
            // Update recipient to PROCESSING
            await prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: 'PROCESSING' },
            });

            // Resolve specific files assigned to this recipient (multi-file / multi-task)
            const assignedFileIds: string[] = recipient.randomCode
              ? recipient.randomCode.split(',').map((s) => s.trim()).filter(Boolean)
              : (campaignCfg.fileIds?.length ? campaignCfg.fileIds : [data.pcloudFileId]);

            let assignedFiles = assignedFileIds.map((fid) => fileMap.get(fid)).filter(Boolean);
            if (assignedFiles.length === 0) {
              assignedFiles = [pcloudFile];
            }

            // Identify matching task for this recipient (if multi-task matrix mode)
            const matchingTask = campaignCfg.tasks?.find((t: any) =>
              (t.contactIds && recipient.contactId && t.contactIds.includes(recipient.contactId)) ||
              (t.fileIds && recipient.randomCode && t.fileIds.join(',') === recipient.randomCode)
            );

            // Resolve template for this recipient/task
            let taskTemplate = template;
            if (matchingTask?.templateId && matchingTask.templateId !== data.templateId) {
              try {
                const customTpl = await prisma.template.findFirst({ where: { id: matchingTask.templateId } });
                if (customTpl) taskTemplate = customTpl;
              } catch {}
            }

            const rawSubject = matchingTask?.subjectOverride || campaignCfg.subject || data.subject || 'Documents Shared with You';
            const rawContent = recipient.resolvedDescription || matchingTask?.messageOverride || taskTemplate?.content || taskTemplate?.description || rawSubject;

            // Fetch recipient contact details for variable token resolution (#NAME#, #EMAIL#, etc.)
            let contactRecord: any = null;
            if (recipient.contactId) {
              contactRecord = await prisma.contact.findFirst({ where: { id: recipient.contactId } });
            }
            const recipientCtx = {
              email: recipient.recipientEmail,
              firstName: contactRecord?.firstName || '',
              lastName: contactRecord?.lastName || '',
              fullName: contactRecord
                ? `${contactRecord.firstName || ''} ${contactRecord.lastName || ''}`.trim()
                : recipient.recipientEmail.split('@')[0],
              company: contactRecord?.company || '',
              phone: contactRecord?.phone || '',
            };

            const resolvedSubject = TemplateVariableResolver.resolve(rawSubject, recipientCtx).resolvedText;
            const description = TemplateVariableResolver.resolve(rawContent, recipientCtx).resolvedText;

            let isGenuineDelivery = false;
            let deliveryReferenceId: string | null = null;
            let deliveryError = '';

            if (data.deliveryMode === 'PCLOUD_NATIVE') {
              // pCloud Native Mode: Deliver all assigned files
              let allNativeSuccess = true;
              const refIds: string[] = [];

              for (const targetFile of assignedFiles) {
                const { token: fToken, host: fHost } = await resolveFileTokenAndHost(targetFile);
                let shareResult;

                if (data.operationType === 'sharefolder') {
                  const shareOptions: PCloudShareOptions = {
                    fileId: targetFile.fileId,
                    folderId: targetFile.folderId || '0',
                    recipientEmail: recipient.recipientEmail,
                    message: description,
                    permissions: 0,
                    pcloudAccountId: pcloudAccount.id,
                    organizationId: data.organizationId,
                    campaignId: data.campaignId,
                  };
                  shareResult = await adapter.shareFolder(shareOptions, fToken, fHost);
                } else {
                  const targetBuf = await getFileBuffer(targetFile);
                  const transferOptions: PCloudTransferOptions = {
                    fileId: targetFile.fileId,
                    folderId: targetFile.folderId || '0',
                    filename: targetFile.name,
                    mimeType: targetFile.mimeType || 'application/octet-stream',
                    senderEmail: pcloudAccount.accountEmail,
                    recipientEmails: [recipient.recipientEmail],
                    message: description,
                    pcloudAccountId: pcloudAccount.id,
                    organizationId: data.organizationId,
                    campaignId: data.campaignId,
                  };
                  shareResult = await adapter.createTransfer(transferOptions, fToken, fHost, targetBuf || undefined);
                }

                if (shareResult.success && shareResult.pcloudReferenceId) {
                  refIds.push(String(shareResult.pcloudReferenceId));
                } else {
                  allNativeSuccess = false;
                  deliveryError = shareResult.error?.message || `pCloud rejected delivery for ${targetFile.name}`;
                  break;
                }
              }

              if (allNativeSuccess && refIds.length > 0) {
                isGenuineDelivery = true;
                deliveryReferenceId = refIds.join(',');
              } else if (emailTransporter) {
                // Smart Delivery Guarantee: pCloud native encountered an issue (e.g. rate limit, already access 2024, or privacy policy 2303).
                // Engage verified SMTP fallback so the recipient genuinely receives their documents!
                logger.warn(`pCloud Native delivery blocked (${deliveryError}). Engaging Smart SMTP Fallback for ${recipient.recipientEmail}...`);
                try {
                  const fileDownloadItems: Array<{ name: string; size: number; link: string; buffer?: Buffer }> = [];
                  for (const targetFile of assignedFiles) {
                    const link = await getFilePubLink(targetFile);
                    const bufObj = await getFileBuffer(targetFile);
                    fileDownloadItems.push({
                      name: targetFile.name,
                      size: targetFile.fileSize || 0,
                      link,
                      buffer: bufObj?.buffer,
                    });
                  }

                  const filesCardsHtml = fileDownloadItems
                    .map(
                      (f) => `
                      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                          <div style="font-weight: 600; color: #0f172a; font-size: 14px;">📄 ${f.name}</div>
                          <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Size: ${(f.size / 1024).toFixed(1)} KB &bull; Source: ${pcloudAccount.accountEmail}</div>
                        </div>
                        <a href="${f.link}" style="background: #0284c7; color: #ffffff; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-block;">
                          Download
                        </a>
                      </div>
                    `
                    )
                    .join('');

                  const mailHtml = `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                      <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">${resolvedSubject}</h1>
                        <p style="margin: 8px 0 0; font-size: 13px; opacity: 0.9;">Secure document distribution via AutoWork &amp; pCloud</p>
                      </div>
                      <div style="padding: 28px 24px;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
                          <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${description}</p>
                        </div>
                        <div style="margin-bottom: 20px;">
                          <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">
                            Shared Documents (${fileDownloadItems.length})
                          </div>
                          ${filesCardsHtml}
                        </div>
                      </div>
                      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b;">
                        Delivered to <strong>${recipient.recipientEmail}</strong> via AutoWork Guaranteed Delivery Engine
                      </div>
                    </div>
                  `;

                  const mailAttachments: any[] = [];
                  for (const f of fileDownloadItems) {
                    if (f.buffer) {
                      mailAttachments.push({ filename: f.name, content: f.buffer });
                    }
                  }

                  const mailInfo = await emailTransporter.sendMail({
                    from: emailSenderFrom,
                    to: recipient.recipientEmail,
                    subject: resolvedSubject,
                    html: mailHtml,
                    attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
                  });

                  if (mailInfo.accepted && mailInfo.accepted.length > 0) {
                    isGenuineDelivery = true;
                    deliveryReferenceId = `SMTP_FALLBACK:${mailInfo.messageId || Date.now()}`;
                    logger.log(`✅ Smart SMTP Fallback delivered to ${recipient.recipientEmail} (ID: ${mailInfo.messageId})`);
                  } else {
                    deliveryError = `pCloud Native rejected share (${deliveryError}) and SMTP server did not accept recipient.`;
                  }
                } catch (fallbackErr: any) {
                  deliveryError = `pCloud Native rejected share (${deliveryError}) and SMTP fallback failed: ${fallbackErr.message}`;
                }
              }
            } else {
              // EMAIL delivery mode (with multi-file download cards & attachments)
              if (emailTransporter) {
                const fileDownloadItems: Array<{ name: string; size: number; link: string; buffer?: Buffer }> = [];

                for (const targetFile of assignedFiles) {
                  const link = await getFilePubLink(targetFile);
                  const bufObj = await getFileBuffer(targetFile);
                  fileDownloadItems.push({
                    name: targetFile.name,
                    size: targetFile.fileSize || 0,
                    link,
                    buffer: bufObj?.buffer,
                  });
                }

                const filesCardsHtml = fileDownloadItems
                  .map(
                    (f) => `
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                      <div>
                        <div style="font-weight: 600; color: #0f172a; font-size: 14px;">📄 ${f.name}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Size: ${(f.size / 1024).toFixed(1)} KB &bull; Source: ${pcloudAccount.accountEmail}</div>
                      </div>
                      <a href="${f.link}" style="background: #0284c7; color: #ffffff; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-block;">
                        Download
                      </a>
                    </div>
                  `
                  )
                  .join('');

                const mailHtml = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
                      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">${resolvedSubject}</h1>
                      <p style="margin: 8px 0 0; font-size: 13px; opacity: 0.9;">Secure multi-file transfer via AutoWork &amp; pCloud</p>
                    </div>
                    <div style="padding: 28px 24px;">
                      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
                        <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${description}</p>
                      </div>

                      <div style="margin-bottom: 20px;">
                        <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">
                          Shared Documents (${fileDownloadItems.length})
                        </div>
                        ${filesCardsHtml}
                      </div>
                    </div>
                    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b;">
                      Delivered to <strong>${recipient.recipientEmail}</strong> via AutoWork Distribution Engine
                    </div>
                  </div>
                `;

                // Build mail attachments if attachment mode includes MIME attachment
                const mailAttachments: any[] = [];
                if (data.attachmentMode === 'ATTACHMENT' || data.attachmentMode === 'BOTH') {
                  for (const f of fileDownloadItems) {
                    if (f.buffer) {
                      mailAttachments.push({ filename: f.name, content: f.buffer });
                    }
                  }
                }

                try {
                  const mailInfo = await emailTransporter.sendMail({
                    from: emailSenderFrom,
                    to: recipient.recipientEmail,
                    subject: resolvedSubject,
                    html: mailHtml,
                    attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
                  });

                  if (mailInfo.accepted && mailInfo.accepted.length > 0) {
                    logger.log(`📬 Multi-file email delivered to ${recipient.recipientEmail} (ID: ${mailInfo.messageId})`);
                    isGenuineDelivery = true;
                    deliveryReferenceId = mailInfo.messageId || 'DELIVERED_EMAIL';
                  } else {
                    deliveryError = `Email delivery rejected by mail server for ${recipient.recipientEmail}`;
                  }
                } catch (sendErr: any) {
                  deliveryError = `Email delivery failed: ${sendErr.message}`;
                  logger.error(`❌ Email send failed for ${recipient.recipientEmail}: ${sendErr.message}`);
                }
              } else {
                deliveryError = 'No verified email sender account available';
              }
            }

            if (isGenuineDelivery) {
              // Truly Delivered!
              await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: {
                  status: 'DELIVERED',
                  pcloudShareExecutionId: deliveryReferenceId,
                  errorCode: null,
                  errorMessage: null,
                },
              });

              // Record execution
              const fileListSummary = assignedFiles.map((f: any) => f.name).join(', ');
              await prisma.pCloudShareExecution.create({
                data: {
                  organizationId: data.organizationId,
                  campaignId: data.campaignId,
                  recipientId: recipient.id,
                  pcloudAccountId: pcloudAccount.id,
                  pcloudFileId: assignedFiles[0]?.id || data.pcloudFileId,
                  recipientEmail: recipient.recipientEmail,
                  descriptionSnapshot: `${description || ''}\n[Files: ${fileListSummary}]`,
                  operationType: data.deliveryMode === 'EMAIL' ? 'email' : data.operationType,
                  status: 'SUCCESS',
                  pcloudReferenceId: deliveryReferenceId,
                  completedAt: new Date(),
                },
              });

              successCount++;
              logger.log(`✅ Genuine delivery confirmed for ${recipient.recipientEmail} (${successCount}/${recipients.length})`);

              // Real-time progress: update campaign counts after each recipient
              await prisma.campaign.update({
                where: { id: data.campaignId },
                data: { sharedCount: successCount, failedCount: failCount, status: 'PROCESSING' },
              });
            } else {
              // Truly Failed!
              const errorCode = 'DELIVERY_FAILED';
              const errorMessage = deliveryError ||
                'Delivery failed: pCloud native transfer was rejected, or no active Email Account could dispatch to the inbox.';

              await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: {
                  status: 'FAILED',
                  errorCode,
                  errorMessage,
                },
              });

              const fileListSummary = assignedFiles.map((f: any) => f.name).join(', ');
              await prisma.pCloudShareExecution.create({
                data: {
                  organizationId: data.organizationId,
                  campaignId: data.campaignId,
                  recipientId: recipient.id,
                  pcloudAccountId: pcloudAccount.id,
                  pcloudFileId: assignedFiles[0]?.id || data.pcloudFileId,
                  recipientEmail: recipient.recipientEmail,
                  descriptionSnapshot: `${description || ''}\n[Files: ${fileListSummary}]`,
                  operationType: data.deliveryMode === 'EMAIL' ? 'email' : data.operationType,
                  status: 'FAILED',
                  errorCode,
                  errorMessage,
                  completedAt: new Date(),
                },
              });

              failCount++;
              logger.warn(`❌ Failed for ${recipient.recipientEmail}: ${errorMessage}`);

              // Real-time progress: update campaign counts after each failure
              await prisma.campaign.update({
                where: { id: data.campaignId },
                data: { sharedCount: successCount, failedCount: failCount, status: 'PROCESSING' },
              });
            }
          } catch (recipientError: any) {
            failCount++;
            const errMsg = recipientError.message || 'Unexpected error during delivery';
            logger.error(`❌ Error for ${recipient.recipientEmail}: ${errMsg}`);

            await prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: {
                status: 'FAILED',
                errorCode: 'WORKER_ERROR',
                errorMessage: errMsg,
              },
            });
          }

          // Small delay between recipients to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Update campaign final status
        const finalStatus = failCount === recipients.length
          ? 'FAILED'
          : failCount > 0
            ? 'COMPLETED'  // partial success
            : 'COMPLETED';
        await prisma.campaign.update({
          where: { id: data.campaignId },
          data: {
            status: finalStatus,
            sharedCount: successCount,
            failedCount: failCount,
          },
        });

        logger.log(`📊 Campaign ${data.campaignId} finished: ${successCount} delivered, ${failCount} failed`);
      } catch (campaignError: any) {
        logger.error(`🔥 Campaign ${data.campaignId} failed globally: ${campaignError.message}`);

        // Mark entire campaign as FAILED
        try {
          await prisma.campaign.update({
            where: { id: data.campaignId },
            data: { status: 'FAILED' },
          });

          // Mark all remaining recipients as FAILED
          await prisma.campaignRecipient.updateMany({
            where: {
              campaignId: data.campaignId,
              status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] },
            },
            data: {
              status: 'FAILED',
              errorCode: 'CAMPAIGN_ERROR',
              errorMessage: campaignError.message || 'Campaign processing failed',
            },
          });
        } catch {
          logger.error(`Failed to update campaign ${data.campaignId} status after error`);
        }

        throw campaignError;
      }
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    logger.log(`✅ Campaign job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`❌ Campaign job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`Campaign worker error: ${err.message}`);
  });

  logger.log('🏭 Campaign Worker started and listening on campaign-queue');
  return worker;
}
