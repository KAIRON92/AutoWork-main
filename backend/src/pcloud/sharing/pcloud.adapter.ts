import {
  IPCloudAdapter,
  PCloudUserInfo,
  PCloudItemMetadata,
  PCloudShareOptions,
  PCloudTransferOptions,
  PCloudShareResult,
} from '../pcloud.interface';
import { PCloudClient } from '../pcloud-client/pcloud.client';

export class PCloudRealAdapter implements IPCloudAdapter {
  readonly providerName = 'pcloud';
  private client: PCloudClient;

  constructor(defaultApiHost?: string) {
    this.client = new PCloudClient(defaultApiHost || process.env.PCLOUD_API_HOST || 'https://api.pcloud.com');
  }

  async verifyConnection(
    accessToken: string,
    apiHost?: string
  ): Promise<{ connected: boolean; userInfo?: PCloudUserInfo; message: string }> {
    try {
      const userInfo = await this.client.getUserInfo(accessToken, apiHost);
      return {
        connected: true,
        userInfo,
        message: `Successfully connected to pCloud (${userInfo.email})`,
      };
    } catch (err: any) {
      return {
        connected: false,
        message: err.message || 'Failed to authenticate with pCloud',
      };
    }
  }

  async listContents(folderId: string = '0', accessToken: string, apiHost?: string): Promise<PCloudItemMetadata[]> {
    return await this.client.listFolder(folderId, accessToken, apiHost);
  }

  async getFileMetadata(fileId: string, accessToken: string, apiHost?: string): Promise<PCloudItemMetadata> {
    return await this.client.getFileMetadata(fileId, accessToken, apiHost);
  }

  async downloadFileBuffer(fileId: string, accessToken: string, apiHost?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    return await this.client.downloadFileBuffer(fileId, accessToken, apiHost);
  }

  async uploadFile(options: {
    filename: string;
    buffer: Buffer;
    mimeType: string;
    folderId?: string;
    accessToken: string;
    apiHost?: string;
  }): Promise<PCloudItemMetadata> {
    return await this.client.uploadFile(
      options.filename,
      options.buffer,
      options.mimeType,
      options.folderId,
      options.accessToken,
      options.apiHost
    );
  }

  async shareFolder(options: PCloudShareOptions, accessToken: string, apiHost?: string): Promise<PCloudShareResult> {
    return await this.client.shareFolder(options, accessToken, apiHost);
  }

  async createTransfer(
    options: PCloudTransferOptions,
    accessToken: string,
    apiHost?: string,
    preloadedFile?: { buffer: Buffer; name: string; mimeType: string }
  ): Promise<PCloudShareResult> {
    return await this.client.uploadTransfer(options, accessToken, apiHost, preloadedFile);
  }

  async deleteFile(fileId: string, accessToken: string, apiHost?: string): Promise<boolean> {
    return await this.client.deleteFile(fileId, accessToken, apiHost);
  }
}
