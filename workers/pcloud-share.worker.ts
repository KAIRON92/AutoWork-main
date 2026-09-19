import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PCloudAdapterFactory } from '../backend/src/pcloud/pcloud.factory';
import { TemplateVariableResolver } from '../backend/src/templates/template-variable.resolver';
import { decryptPCloudCredential } from '../backend/src/pcloud/pcloud-credentials';
import * as nodemailer from 'nodemailer';
import { decryptProviderCredentials } from '../backend/src/email/email.credentials';

const prisma = new PrismaClient();

export interface PCloudShareJobData {
  campaignId: string;
  recipientId: string;
  organizationId: string;
  recipientEmail: string;
  pcloudAccountId: string;
  pcloudProvider: string;
  pcloudFileId: string;
  templateContent: string;
  operationType?: 'sharefolder' | 'uploadtransfer';
}

export function createPCloudShareWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    'pcloud-share-queue',
    async (job: Job<PCloudShareJobData>) => {
      const data = job.data;
      const recipient = await prisma.campaignRecipient.findFirst({ where: { id: data.recipientId, campaignId: data.campaignId } });
      const campaign = await prisma.campaign.findFirst({
        where: { id: data.campaignId, organizationId: data.organizationId },
        include: { recipients: true, pcloudAccount: true, pcloudFile: true },
      });

      if (!recipient || !campaign) throw new Error('Campaign recipient or campaign not found');
      if (campaign.status === 'PAUSED') return { success: false, skipped: true };

      const account = campaign.pcloudAccount;
      const credential = account.provider === 'mock_pcloud' ? account.credentials : decryptPCloudCredential(account.credentials);
      const apiHost = account.apiHost || undefined;
      const adapter = PCloudAdapterFactory.getAdapter(account.provider);
      const contact = await prisma.contact.findUnique({ where: { id: recipient.contactId } });
      const templateToUse = recipient.resolvedDescription || data.templateContent;
      const { resolvedText, randomCode } = TemplateVariableResolver.resolve(templateToUse, {
        email: recipient.recipientEmail,
        firstName: contact?.firstName,
        lastName: contact?.lastName,
        fullName: contact?.fullName,
        company: contact?.company,
        phone: contact?.phone,
        target: contact?.target,
      });

      let execution = await prisma.pCloudShareExecution.findFirst({
        where: {
          organizationId: campaign.organizationId,
          campaignId: campaign.id,
          recipientId: recipient.id,
          jobId: String(job.id),
        },
        orderBy: { createdAt: 'desc' },
      });

      if (execution?.status === 'SUCCESS') {
        return { success: true, referenceId: execution.pcloudReferenceId, alreadyCompleted: true };
      }

      if (execution?.status === 'PROCESSING' && job.attemptsMade > 0) {
        await prisma.pCloudShareExecution.update({
          where: { id: execution.id },
          data: {
            status: 'UNKNOWN',
            errorCode: 'EXTERNAL_OPERATION_UNCERTAIN',
            errorMessage: 'Worker restarted after the external pCloud operation began. Manual reconciliation is required before retrying to prevent duplicate delivery.',
            completedAt: new Date(),
          },
        });
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'MANUAL_REVIEW',
            errorCode: 'EXTERNAL_OPERATION_UNCERTAIN',
            errorMessage: 'The pCloud operation outcome is uncertain. Reconcile the pCloud side before retrying this recipient.',
          },
        });
        return { success: false, requiresReconciliation: true };
      }

      if (!execution) {
        execution = await prisma.pCloudShareExecution.create({
          data: {
            organizationId: campaign.organizationId,
            campaignId: campaign.id,
            recipientId: recipient.id,
            pcloudAccountId: account.id,
            pcloudFileId: campaign.pcloudFile.id,
            recipientEmail: recipient.recipientEmail,
            descriptionSnapshot: resolvedText,
            operationType: data.operationType || 'uploadtransfer',
            status: 'PROCESSING',
            jobId: String(job.id),
            startedAt: new Date(),
          },
        });
      } else {
        execution = await prisma.pCloudShareExecution.update({
          where: { id: execution.id },
          data: { status: 'PROCESSING', errorCode: null, errorMessage: null, completedAt: null },
        });
      }

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'PROCESSING', errorCode: null, errorMessage: null },
      });

      let result;
      try {
        result = data.operationType === 'sharefolder'
          ? await adapter.shareFolder({
              folderId: campaign.pcloudFile.folderId || '0',
              fileId: campaign.pcloudFile.fileId,
              recipientEmail: recipient.recipientEmail,
              message: resolvedText,
              pcloudAccountId: account.id,
              organizationId: campaign.organizationId,
              campaignId: campaign.id,
              jobId: job.id,
            }, credential, apiHost)
          : await adapter.createTransfer({
              fileId: campaign.pcloudFile.fileId,
              filename: campaign.pcloudFile.name,
              mimeType: campaign.pcloudFile.mimeType,
              senderEmail: account.accountEmail,
              recipientEmails: [recipient.recipientEmail],
              message: resolvedText,
              pcloudAccountId: account.id,
              organizationId: campaign.organizationId,
              campaignId: campaign.id,
              jobId: job.id,
            }, credential, apiHost);
      } catch (error: any) {
        result = {
          success: false,
          operationType: data.operationType || 'uploadtransfer',
          recipientEmail: recipient.recipientEmail,
          pcloudAccountId: account.id,
          pcloudFileId: campaign.pcloudFile.id,
          descriptionSnapshot: resolvedText,
          timestamp: new Date().toISOString(),
          error: {
            code: error?.code || 'PCLOUD_CLIENT_ERROR',
            message: error?.message || 'pCloud client error',
            isTransient: Boolean(error?.isTransient),
          },
        };
      }

      // Auto-fallback: If uploadtransfer failed (e.g. privacy policy block), try official authenticated shareFolder
      if (!result.success && data.operationType !== 'sharefolder') {
        try {
          const fallbackResult = await adapter.shareFolder({
            folderId: campaign.pcloudFile.folderId || '0',
            fileId: campaign.pcloudFile.fileId,
            recipientEmail: recipient.recipientEmail,
            message: resolvedText,
            pcloudAccountId: account.id,
            organizationId: campaign.organizationId,
            campaignId: campaign.id,
            jobId: job.id,
          }, credential, apiHost);
          if (fallbackResult.success) {
            result = fallbackResult;
          }
        } catch {
          // keep original result
        }
      }

      // Guarantee Real Inbox Delivery: If pCloud direct share was rejected or only produced a public link,
      // dispatch a real email containing the pCloud document and download button to the recipient's inbox!
      const isPublicLinkOnly = Boolean(result.pcloudReferenceId && String(result.pcloudReferenceId).startsWith('http'));
      if ((!result.success || isPublicLinkOnly) && campaign.pcloudFile) {
        try {
          let fallbackLink: string | null = isPublicLinkOnly ? String(result.pcloudReferenceId) : null;
          let tokenToUse = credential;
          if (campaign.pcloudFile.pcloudAccountId && campaign.pcloudFile.pcloudAccountId !== account.id) {
            const fileOwner = await prisma.pCloudAccount.findFirst({
              where: { id: campaign.pcloudFile.pcloudAccountId },
            });
            if (fileOwner && fileOwner.credentials) {
              tokenToUse = fileOwner.provider === 'mock_pcloud'
                ? fileOwner.credentials
                : decryptPCloudCredential(fileOwner.credentials);
            }
          }

          if (campaign.pcloudFile.fileId && !isNaN(Number(campaign.pcloudFile.fileId))) {
            const pubRes = await fetch(`https://api.pcloud.com/getfilepublink?fileid=${campaign.pcloudFile.fileId}&access_token=${tokenToUse}`);
            const pubData = await pubRes.json();
            if (pubData?.result === 0 && pubData.link) {
              fallbackLink = pubData.link;
            }
          }

          // Find a verified email account with active SMTP credentials
          const candidateEmailAccounts = await prisma.emailAccount.findMany({
            where: { organizationId: campaign.organizationId, status: 'VERIFIED' },
            orderBy: { createdAt: 'desc' },
          });

          let transporter: nodemailer.Transporter | null = null;
          let senderFrom = `"${account.name || 'AutoWork pCloud'}" <${account.accountEmail}>`;

          for (const ea of candidateEmailAccounts) {
            if (!ea.credentials) continue;
            try {
              const rawCreds = JSON.parse(decryptProviderCredentials(ea.credentials));
              if (rawCreds.host && rawCreds.user && rawCreds.pass) {
                transporter = nodemailer.createTransport({
                  host: rawCreds.host,
                  port: Number(rawCreds.port) || 587,
                  secure: Boolean(rawCreds.secure),
                  auth: { user: rawCreds.user, pass: rawCreds.pass },
                });
                senderFrom = `"${account.name || 'AutoWork pCloud'}" <${rawCreds.accountEmail || rawCreds.user || ea.accountEmail}>`;
                break;
              }
            } catch {}
          }

          if (transporter) {

            const deliveryUrl = fallbackLink || `https://my.pcloud.com`;
            const mailHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Document Shared with You</h1>
                  <p style="margin: 8px 0 0; font-size: 13px; opacity: 0.9;">Secure file transfer via AutoWork &amp; pCloud</p>
                </div>
                <div style="padding: 28px 24px;">
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
                    <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${resolvedText}</p>
                  </div>
                  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                    <div style="font-weight: 600; color: #0f172a; font-size: 15px;">📄 ${campaign.pcloudFile.name}</div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Sender Account: ${account.accountEmail}</div>
                  </div>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${deliveryUrl}" style="background: #0284c7; color: #ffffff; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">
                      View &amp; Download Document on pCloud
                    </a>
                  </div>
                  <p style="text-align: center; font-size: 11px; color: #94a3b8;">
                    Access URL: <a href="${deliveryUrl}" style="color: #0284c7;">${deliveryUrl}</a>
                  </p>
                </div>
                <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b;">
                  Delivered to <strong>${recipient.recipientEmail}</strong> via AutoWork Distribution Engine
                </div>
              </div>
            `;

            const sendRes = await transporter.sendMail({
              from: senderFrom,
              to: recipient.recipientEmail,
              subject: `Document Shared: ${campaign.pcloudFile.name || campaign.name}`,
              html: mailHtml,
            });

            console.log(`[pCloud Worker] Real email dispatched to ${recipient.recipientEmail} (messageId: ${sendRes.messageId})`);

          } else {
            // No working SMTP email transporter could dispatch this email!
            console.warn(`[pCloud Worker] Cannot dispatch email to ${recipient.recipientEmail}: No active SMTP sender available.`);
          }
        } catch (fbErr: any) {
          console.warn(`[pCloud Worker] Fallback dispatch failed: ${fbErr.message}`);
        }
      }

      const attempts = Number(job.opts.attempts || 1);
      const hasRetryRemaining = Boolean(result.error?.isTransient && job.attemptsMade + 1 < attempts);

      if (!result.success && hasRetryRemaining) {
        await prisma.pCloudShareExecution.update({
          where: { id: execution.id },
          data: {
            status: 'RETRYING',
            errorCode: result.error?.code || null,
            errorMessage: result.error?.message || null,
          },
        });
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'RETRYING', errorCode: result.error?.code || null, errorMessage: result.error?.message || null },
        });
        throw new Error(result.error?.message || 'Transient pCloud error');
      }

      const finalStatus = result.success ? 'SUCCESS' : 'FAILED';
      const executionUpdated = await prisma.pCloudShareExecution.update({
        where: { id: execution.id },
        data: {
          status: finalStatus,
          pcloudReferenceId: result.pcloudReferenceId || null,
          errorCode: result.error?.code || null,
          errorMessage: result.error?.message || null,
          startedAt: execution.startedAt,
          completedAt: new Date(),
          descriptionSnapshot: resolvedText,
        },
      });

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: result.success ? 'SHARED' : 'FAILED',
          pcloudShareExecutionId: executionUpdated.id,
          resolvedDescription: resolvedText,
          randomCode,
          errorCode: result.error?.code || null,
          errorMessage: result.error?.message || null,
        },
      });

      if (result.success) {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { sharedCount: { increment: 1 } } });
        await prisma.pCloudAccount.update({ where: { id: account.id }, data: { sentToday: { increment: 1 }, lastUsedAt: new Date() } });
      } else {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { failedCount: { increment: 1 } } });
      }

      const latest = await prisma.campaign.findUnique({ where: { id: campaign.id }, select: { totalCount: true, sharedCount: true, failedCount: true } });
      if (latest && latest.totalCount > 0 && latest.sharedCount + latest.failedCount >= latest.totalCount) {
        const finalCampaignStatus = latest.sharedCount > 0 ? 'COMPLETED' : 'FAILED';
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: finalCampaignStatus } });
      }

      return { success: result.success, referenceId: result.pcloudReferenceId, recipientEmail: recipient.recipientEmail, randomCode, resolvedDescription: resolvedText, error: result.error };
    },
    { connection: redisConnection, concurrency: 5 }
  );

  worker.on('completed', (job) => console.log(`[pCloud Worker] Job ${job.id} completed for recipient ${job.data.recipientEmail}`));
  worker.on('failed', async (job, err) => {
    if (!job) return;
    console.error(`[pCloud Worker] Job ${job.id} failed: ${err.message}`);
    if (job.attemptsMade < Number(job.opts.attempts || 1)) return;

    await prisma.campaignRecipient.updateMany({
      where: { id: job.data.recipientId, campaignId: job.data.campaignId, status: { in: ['PROCESSING', 'RETRYING'] } },
      data: {
        status: 'MANUAL_REVIEW',
        errorCode: 'WORKER_EXHAUSTED',
        errorMessage: 'Worker exhausted its attempts. Review the pCloud execution result before retrying to avoid duplicate delivery.',
      },
    }).catch(() => undefined);

    await prisma.pCloudShareExecution.updateMany({
      where: { jobId: String(job.id), campaignId: job.data.campaignId, status: { in: ['PROCESSING', 'RETRYING'] } },
      data: {
        status: 'UNKNOWN',
        errorCode: 'WORKER_EXHAUSTED',
        errorMessage: err.message,
        completedAt: new Date(),
      },
    }).catch(() => undefined);
  });

  return worker;
}
