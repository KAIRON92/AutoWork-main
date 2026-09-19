import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PCloudAdapterFactory } from '../pcloud.factory';
import { PCloudAccountsService } from '../accounts/accounts.service';
import { PCloudItemMetadata } from '../pcloud.interface';

@Injectable()
export class PCloudFilesService {
  constructor(
    private prisma: PrismaService,
    private accountsService: PCloudAccountsService,
  ) {}

  private async resolveAccount(organizationId: string, accountId?: string) {
    const account = accountId
      ? await this.prisma.pCloudAccount.findFirst({ where: { id: accountId, organizationId } })
      : await this.prisma.pCloudAccount.findFirst({ where: { organizationId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });

    if (!account) {
      throw new BadRequestException('Connect an active pCloud account before browsing or uploading files.');
    }
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('The selected pCloud account is not active.');
    }
    return account;
  }

  async listFolder(organizationId: string, accountId?: string, folderId: string = '0') {
    const account = await this.resolveAccount(organizationId, accountId);
    try {
      const { credential: token, apiHost } = await this.accountsService.getAccountCredentials(account.id, organizationId);
      const adapter = PCloudAdapterFactory.getAdapter(account.provider);
      return await adapter.listContents(folderId, token, apiHost || undefined);
    } catch (err: any) {
      return [];
    }
  }

  async findAllStoredFiles(organizationId: string) {
    const files = await this.prisma.pCloudFile.findMany({
      where: { organizationId },
      include: { pcloudAccount: { select: { id: true, name: true, accountEmail: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return files.filter((f) => {
      try {
        const meta = f.metadata ? JSON.parse(f.metadata) : {};
        return !meta.unregistered;
      } catch {
        return true;
      }
    });
  }

  async findOneStoredFile(id: string, organizationId: string) {
    const file = await this.prisma.pCloudFile.findFirst({
      where: { id, organizationId },
      include: { pcloudAccount: true },
    });
    if (!file) throw new NotFoundException(`pCloud file ${id} not found`);
    return file;
  }

  async uploadAndRegister(
    organizationId: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
    accountId?: string,
    folderId: string = '0',
  ) {
    const account = await this.resolveAccount(organizationId, accountId);
    const { credential: token, apiHost } = await this.accountsService.getAccountCredentials(account.id, organizationId);
    const adapter = PCloudAdapterFactory.getAdapter(account.provider);

    const uploadedMeta: PCloudItemMetadata = await adapter.uploadFile({
      filename: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
      folderId,
      accessToken: token,
      apiHost: apiHost || undefined,
    });

    return this.prisma.pCloudFile.create({
      data: {
        organizationId,
        pcloudAccountId: account.id,
        name: uploadedMeta.name,
        fileId: uploadedMeta.fileId || `pcloud-file-${Date.now()}`,
        folderId: uploadedMeta.folderId || folderId,
        fileSize: uploadedMeta.size || file.size,
        mimeType: uploadedMeta.mimeType || file.mimetype,
        pcloudPath: uploadedMeta.path,
        metadata: JSON.stringify(uploadedMeta.metadata || {}),
      },
    });
  }

  async registerExistingPCloudFile(
    organizationId: string,
    dto: { name: string; fileId: string; folderId?: string; fileSize?: number; mimeType?: string; pcloudAccountId?: string; pcloudPath?: string },
  ) {
    if (!dto.pcloudAccountId) {
      throw new BadRequestException('pcloudAccountId is required when registering an existing pCloud file.');
    }

    const account = await this.prisma.pCloudAccount.findFirst({
      where: { id: dto.pcloudAccountId, organizationId },
    });
    if (!account) throw new BadRequestException('The selected pCloud account does not belong to your organization.');

    return this.prisma.pCloudFile.create({
      data: {
        organizationId,
        pcloudAccountId: account.id,
        name: dto.name,
        fileId: dto.fileId,
        folderId: dto.folderId || '0',
        fileSize: dto.fileSize || 0,
        mimeType: dto.mimeType || 'application/octet-stream',
        pcloudPath: dto.pcloudPath || `/${dto.name}`,
        metadata: JSON.stringify({ registered: true }),
      },
    });
  }

  async removeStoredFile(id: string, organizationId: string) {
    const file = await this.prisma.pCloudFile.findFirst({ where: { id, organizationId } });
    if (!file) throw new NotFoundException(`pCloud file ${id} not found`);

    // Check if actively being used by a running campaign
    const activeCampaign = await this.prisma.campaign.findFirst({
      where: { pcloudFileId: id, organizationId, status: { in: ['PROCESSING', 'QUEUED'] } },
    });
    if (activeCampaign) {
      throw new BadRequestException(
        `Cannot delete "${file.name}" because campaign "${activeCampaign.name}" is currently ${activeCampaign.status}. Pause or complete the campaign before removing this file.`
      );
    }

    try {
      // Check if file is linked to any campaigns or executions (historical preservation)
      const linkedCampaignCount = await this.prisma.campaign.count({ where: { pcloudFileId: id } });
      const linkedExecCount = await this.prisma.pCloudShareExecution.count({ where: { pcloudFileId: id } });

      if (linkedCampaignCount > 0 || linkedExecCount > 0) {
        // PRESERVE CAMPAIGN HISTORY: Do NOT delete the campaigns or recipients!
        // Mark file as unregistered in metadata so it is removed from active Vault while preserving historical campaigns.
        let existingMeta: Record<string, any> = {};
        try {
          existingMeta = file.metadata ? JSON.parse(file.metadata) : {};
        } catch {}

        await this.prisma.pCloudFile.update({
          where: { id },
          data: {
            metadata: JSON.stringify({
              ...existingMeta,
              unregistered: true,
              unregisteredAt: new Date().toISOString(),
            }),
          },
        });
        return { success: true, message: `File reference "${file.name}" unlinked. Past campaign histories are preserved.` };
      }

      // If no campaigns or executions ever used this file, it is safe to completely delete
      await this.prisma.pCloudFile.delete({ where: { id } });
      return { success: true, message: `File reference "${file.name}" removed successfully.` };
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      throw new BadRequestException(`Unable to remove file "${file.name}": ${err.message || 'database constraint'}`);
    }
  }
}
