import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';

export interface DistributionTaskDto {
  id?: string;
  name?: string;
  fileIds: string[];
  contactIds?: string[];
  contactListId?: string;
  templateId?: string;
  subjectOverride?: string;
  messageOverride?: string;
}

export interface CreateCampaignDto {
  name: string;
  pcloudAccountId: string;
  pcloudFileId?: string;
  pcloudFileIds?: string[];
  tasks?: DistributionTaskDto[];
  templateId: string;
  emailAccountId?: string;
  contactListId?: string;
  recipientContactIds?: string[];
  recipientOverrides?: Record<string, string>;
  config?: {
    deliveryMode?: 'EMAIL' | 'PCLOUD_NATIVE';
    attachmentMode?: 'ATTACHMENT' | 'DIRECT_LINK' | 'BOTH';
    subject?: string;
    shareType?: 'sharefolder' | 'uploadtransfer';
    rateLimitPerMinute?: number;
    retryCount?: number;
    distributionMode?: 'UNIFORM' | 'MULTI_TASK';
    tasks?: DistributionTaskDto[];
    filesSnapshot?: any[];
  };
}

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService, @Optional() private jobsService?: JobsService) {}

  private enrichCampaignWithFiles(cmp: any) {
    let cfg: any = {};
    try {
      cfg = cmp.config ? JSON.parse(cmp.config) : {};
    } catch {}

    const snapshotFiles = cfg.filesSnapshot || [];
    const files = snapshotFiles.length > 0 ? snapshotFiles : (cmp.pcloudFile ? [cmp.pcloudFile] : []);

    return {
      ...cmp,
      files,
      pcloudFile: cmp.pcloudFile || (snapshotFiles.length > 0 ? snapshotFiles[0] : null),
      distributionMode: cfg.distributionMode || (cfg.tasks?.length ? 'MULTI_TASK' : 'UNIFORM'),
      tasks: cfg.tasks || [],
    };
  }

  async findAll(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      include: {
        emailAccount: { select: { id: true, displayName: true, accountEmail: true, provider: true, status: true } },
        pcloudAccount: { select: { id: true, name: true, accountEmail: true, provider: true, status: true } },
        pcloudFile: { select: { id: true, name: true, fileId: true, pcloudPath: true, fileSize: true, mimeType: true } },
        template: { select: { id: true, name: true } },
        contactList: { select: { id: true, name: true } },
        recipients: {
          select: { id: true, recipientEmail: true, status: true, errorCode: true, errorMessage: true, pcloudShareExecutionId: true, randomCode: true, resolvedDescription: true, updatedAt: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { recipients: true, executions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return campaigns.map((cmp) => this.enrichCampaignWithFiles(cmp));
  }

  async findOne(id: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: {
        emailAccount: true,
        pcloudAccount: true,
        pcloudFile: true,
        template: true,
        contactList: true,
        recipients: { take: 200, orderBy: { createdAt: 'asc' } },
        executions: { take: 100, orderBy: { startedAt: 'desc' } },
      },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return this.enrichCampaignWithFiles(campaign);
  }

  async create(organizationId: string, dto: CreateCampaignDto) {
    const deliveryMode: 'EMAIL' | 'PCLOUD_NATIVE' = dto.config?.deliveryMode || (dto.emailAccountId ? 'EMAIL' : 'EMAIL');

    // Collect all requested file IDs across multi-file or multi-task payloads
    let rawFileIds: string[] = [];
    if (dto.tasks && dto.tasks.length > 0) {
      for (const t of dto.tasks) {
        if (Array.isArray(t.fileIds)) rawFileIds.push(...t.fileIds);
      }
    }
    if (dto.pcloudFileIds && dto.pcloudFileIds.length > 0) {
      rawFileIds.push(...dto.pcloudFileIds);
    }
    if (dto.pcloudFileId) {
      rawFileIds.push(dto.pcloudFileId);
    }
    const uniqueFileIds = Array.from(new Set(rawFileIds.filter(Boolean)));

    if (uniqueFileIds.length === 0) {
      throw new BadRequestException('At least one pCloud file must be selected for the campaign.');
    }

    const filesPromise = typeof this.prisma.pCloudFile?.findMany === 'function'
      ? this.prisma.pCloudFile.findMany({ where: { id: { in: uniqueFileIds }, organizationId } })
      : Promise.all(uniqueFileIds.map((id) => this.prisma.pCloudFile?.findFirst({ where: { id, organizationId } }))).then((r) => r.filter(Boolean));

    const [pcloudAccount, files, template] = await Promise.all([
      this.prisma.pCloudAccount.findFirst({ where: { id: dto.pcloudAccountId, organizationId } }),
      filesPromise,
      this.prisma.template.findFirst({ where: { id: dto.templateId, organizationId } }),
    ]);

    if (!pcloudAccount) throw new BadRequestException(`Invalid pCloud Account ${dto.pcloudAccountId}`);
    if (files.length === 0) throw new BadRequestException(`None of the selected pCloud files were found.`);
    if (!template) throw new BadRequestException(`Invalid Template ${dto.templateId}`);

    let emailAccount = null;
    if (deliveryMode === 'EMAIL') {
      if (!dto.emailAccountId) {
        throw new BadRequestException('A verified Email sender account is required for Email delivery mode.');
      }
      emailAccount = await this.prisma.emailAccount.findFirst({
        where: { id: dto.emailAccountId, organizationId, status: 'VERIFIED' },
      });
      if (!emailAccount) {
        throw new BadRequestException(`Invalid or unverified Email sender account ${dto.emailAccountId}`);
      }
    }

    // Build persistent snapshot of all files
    const filesSnapshot = files.map((f) => ({
      id: f.id,
      fileId: f.fileId,
      name: f.name,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
      pcloudPath: f.pcloudPath,
      pcloudAccountId: f.pcloudAccountId,
    }));

    // Primary file for relational compatibility
    const primaryFile = files[0];

    // Build recipients list
    interface RecipientPayload {
      contactId: string;
      recipientEmail: string;
      resolvedDescription: string | null;
      randomCode: string; // Comma-separated file IDs assigned to this recipient
    }

    let recipientsToCreate: RecipientPayload[] = [];

    if (dto.tasks && dto.tasks.length > 0) {
      // MULTI-TASK MATRIX MODE: Different recipients get specific assigned files
      for (const task of dto.tasks) {
        let taskContactIds: { id: string; email: string }[] = [];
        if (task.contactListId) {
          const members = await this.prisma.contactListMember.findMany({
            where: { contactListId: task.contactListId, contactList: { organizationId } },
            include: { contact: { select: { id: true, email: true } } },
          });
          taskContactIds = members.map((m) => m.contact);
        } else if (task.contactIds?.length) {
          taskContactIds = await this.prisma.contact.findMany({
            where: { id: { in: task.contactIds }, organizationId },
            select: { id: true, email: true },
          });
        }

        let taskTemplateContent: string | null = null;
        if (task.templateId) {
          const t = await this.prisma.template.findFirst({
            where: { id: task.templateId, organizationId },
          });
          if (t) {
            taskTemplateContent = t.content || t.description;
          }
        }

        const taskFiles = task.fileIds?.length ? task.fileIds : files.map((f) => f.id);
        for (const c of taskContactIds) {
          recipientsToCreate.push({
            contactId: c.id,
            recipientEmail: c.email,
            resolvedDescription: task.messageOverride || taskTemplateContent || dto.recipientOverrides?.[c.id] || null,
            randomCode: taskFiles.join(','),
          });
        }
      }
    } else {
      // UNIFORM MULTI-FILE MODE: All selected recipients get all files
      let contactIds: { id: string; email: string }[] = [];
      if (dto.contactListId) {
        const members = await this.prisma.contactListMember.findMany({
          where: { contactListId: dto.contactListId, contactList: { organizationId } },
          include: { contact: { select: { id: true, email: true } } },
        });
        contactIds = members.map((m) => m.contact);
      } else if (dto.recipientContactIds?.length) {
        contactIds = await this.prisma.contact.findMany({
          where: { id: { in: dto.recipientContactIds }, organizationId },
          select: { id: true, email: true },
        });
      }

      const allFileIdsStr = files.map((f) => f.id).join(',');
      recipientsToCreate = contactIds.map((c) => ({
        contactId: c.id,
        recipientEmail: c.email,
        resolvedDescription: dto.recipientOverrides?.[c.id] || null,
        randomCode: allFileIdsStr,
      }));
    }

    const config = {
      deliveryMode,
      attachmentMode: dto.config?.attachmentMode || 'ATTACHMENT',
      subject: dto.config?.subject || dto.name,
      shareType: dto.config?.shareType || 'uploadtransfer',
      rateLimitPerMinute: dto.config?.rateLimitPerMinute || 60,
      retryCount: dto.config?.retryCount || 3,
      distributionMode: dto.tasks?.length ? 'MULTI_TASK' : 'UNIFORM',
      tasks: dto.tasks || [],
      filesSnapshot,
      fileIds: files.map((f) => f.id),
    };

    const campaign = await this.prisma.campaign.create({
      data: {
        organizationId,
        name: dto.name,
        emailAccountId: emailAccount ? emailAccount.id : null,
        pcloudAccountId: dto.pcloudAccountId,
        pcloudFileId: primaryFile.id,
        templateId: dto.templateId,
        contactListId: dto.contactListId || null,
        totalCount: recipientsToCreate.length,
        sharedCount: 0,
        failedCount: 0,
        retryingCount: 0,
        status: 'DRAFT',
        config: JSON.stringify(config),
      },
    });

    if (recipientsToCreate.length > 0) {
      await this.prisma.campaignRecipient.createMany({
        data: recipientsToCreate.map((r) => ({
          campaignId: campaign.id,
          contactId: r.contactId,
          recipientEmail: r.recipientEmail,
          resolvedDescription: r.resolvedDescription,
          randomCode: r.randomCode,
          status: 'PENDING',
        })),
      });
    }

    return this.findOne(campaign.id, organizationId);
  }

  async launch(id: string, organizationId: string) {
    if (!this.jobsService) throw new BadRequestException('Queue service is not available');

    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { emailAccount: true, pcloudAccount: true, pcloudFile: true, template: true, recipients: true },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    if (!['DRAFT', 'PAUSED', 'FAILED'].includes(campaign.status)) {
      throw new BadRequestException(`Campaign cannot be launched from ${campaign.status} state`);
    }
    if (campaign.recipients.length === 0) throw new BadRequestException('Cannot launch campaign with 0 recipients');

    if (campaign.status === 'FAILED') {
      await this.prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: 'FAILED' },
        data: { status: 'PENDING', errorCode: null, errorMessage: null },
      });
      await this.prisma.campaign.update({
        where: { id },
        data: { failedCount: 0 },
      });
    }

    const config = campaign.config ? JSON.parse(campaign.config) : {};
    const deliveryMode = config.deliveryMode || (campaign.emailAccountId ? 'EMAIL' : 'PCLOUD_NATIVE');

    if (deliveryMode === 'EMAIL') {
      if (!campaign.emailAccount || campaign.emailAccount.status !== 'VERIFIED') {
        throw new BadRequestException('Campaign sender email account is not verified or inactive.');
      }
    } else {
      if (campaign.pcloudAccount.status !== 'ACTIVE') {
        throw new BadRequestException('Selected pCloud account is not active.');
      }
      if (config.shareType && config.shareType !== 'uploadtransfer' && config.shareType !== 'sharefolder') {
        throw new BadRequestException(`Unsupported pCloud operation: ${config.shareType}`);
      }
    }

    try {
      await this.jobsService.enqueueCampaignJob({
        campaignId: campaign.id,
        organizationId,
        pcloudAccountId: campaign.pcloudAccountId,
        pcloudFileId: campaign.pcloudFileId,
        templateId: campaign.templateId,
        emailAccountId: campaign.emailAccountId || undefined,
        deliveryMode,
        attachmentMode: config.attachmentMode || 'ATTACHMENT',
        subject: config.subject || campaign.name,
        operationType: config.shareType || 'uploadtransfer',
        retryCount: config.retryCount || 3,
      });

      await this.prisma.campaign.update({ where: { id }, data: { status: 'QUEUED' } });
      await this.prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: 'PENDING' }, data: { status: 'QUEUED' } });
    } catch (error: any) {
      await this.prisma.campaign.update({ where: { id }, data: { status: campaign.status } });
      throw new BadRequestException(error?.message || 'Unable to queue campaign');
    }

    return {
      message: `Campaign queued for ${deliveryMode === 'EMAIL' ? 'Email distribution' : 'pCloud Native'} processing`,
      campaignId: campaign.id,
      deliveryMode,
      status: 'QUEUED',
      totalRecipients: campaign.recipients.length,
    };
  }

  async pause(id: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return this.prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async retryRecipient(campaignId: string, recipientId: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: { emailAccount: true, pcloudAccount: true, pcloudFile: true, template: true },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${campaignId} not found`);

    const recipient = await this.prisma.campaignRecipient.findFirst({
      where: { id: recipientId, campaignId },
    });
    if (!recipient) throw new NotFoundException(`Recipient ${recipientId} not found in this campaign`);

    // Reset this specific recipient to QUEUED
    await this.prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'QUEUED', errorCode: null, errorMessage: null },
    });

    const config = campaign.config ? JSON.parse(campaign.config) : {};
    const deliveryMode = config.deliveryMode || (campaign.emailAccountId ? 'EMAIL' : 'PCLOUD_NATIVE');

    if (this.jobsService) {
      await this.jobsService.enqueueCampaignJob({
        campaignId: campaign.id,
        organizationId,
        pcloudAccountId: campaign.pcloudAccountId,
        pcloudFileId: campaign.pcloudFileId,
        templateId: campaign.templateId,
        emailAccountId: campaign.emailAccountId || undefined,
        deliveryMode,
        attachmentMode: config.attachmentMode || 'ATTACHMENT',
        subject: config.subject || campaign.name,
        operationType: config.shareType || 'uploadtransfer',
        retryCount: config.retryCount || 3,
      });
      await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PROCESSING' } });
    }

    return {
      success: true,
      message: `Retrying delivery for ${recipient.recipientEmail}`,
      recipientId: recipient.id,
      status: 'QUEUED',
    };
  }

  async remove(id: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    await this.prisma.campaign.delete({ where: { id } });
    return { success: true, message: `Campaign ${id} removed` };
  }
}
