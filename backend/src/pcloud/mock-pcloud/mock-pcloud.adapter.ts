import {
  IPCloudAdapter,
  PCloudUserInfo,
  PCloudItemMetadata,
  PCloudShareOptions,
  PCloudTransferOptions,
  PCloudShareResult,
  PCloudErrorCode,
} from '../pcloud.interface';
import { PCloudErrorMapper } from '../pcloud-client/pcloud.errors';

export interface MockExecutionRecord {
  operation: 'sharefolder' | 'uploadtransfer' | 'uploadfile' | 'listcontents' | 'verify';
  accountEmail?: string;
  pcloudAccountId?: string;
  pcloudFileId?: string;
  recipientEmail?: string;
  description?: string;
  options?: any;
  result: any;
  timestamp: string;
}

export class MockPCloudAdapter implements IPCloudAdapter {
  readonly providerName = 'mock_pcloud';

  // Configurable simulation hooks
  public simulatedLatencyMs: number = 20;
  public simulatedFailureRate: number = 0; // 0 to 1
  public failureRate: number = 0;
  public failureMode?: PCloudErrorCode;
  public forcedErrorCode?: PCloudErrorCode;
  public executionHistory: MockExecutionRecord[] = [];

  private mockFiles: PCloudItemMetadata[] = [
    {
      fileId: 'mock-file-101',
      folderId: '0',
      name: 'Product_Catalog_2026.pdf',
      isFolder: false,
      size: 2450800,
      mimeType: 'application/pdf',
      path: '/Product_Catalog_2026.pdf',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
    {
      fileId: 'mock-file-102',
      folderId: '0',
      name: 'Enterprise_Solution_Brief.pdf',
      isFolder: false,
      size: 1150400,
      mimeType: 'application/pdf',
      path: '/Enterprise_Solution_Brief.pdf',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
    {
      folderId: 'mock-folder-10',
      name: 'Marketing Assets',
      isFolder: true,
      size: 0,
      mimeType: 'folder',
      path: '/Marketing Assets',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
  ];

  private async delay(): Promise<void> {
    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }
  }

  clearHistory() {
    this.executionHistory = [];
  }

  async verifyConnection(
    accessToken: string,
    apiHost?: string
  ): Promise<{ connected: boolean; userInfo?: PCloudUserInfo; message: string }> {
    await this.delay();

    if (accessToken === 'invalid_token' || this.failureMode === PCloudErrorCode.PCLOUD_AUTH_FAILED) {
      const error = PCloudErrorMapper.mapRawError(1000, 'Invalid mock access token');
      this.executionHistory.push({
        operation: 'verify',
        result: { connected: false, error },
        timestamp: new Date().toISOString(),
      });
      return { connected: false, message: error.message };
    }

    const userInfo: PCloudUserInfo = {
      userId: 'mock-usr-999',
      email: 'mock-pcloud-user@autowork.com',
      quota: 10737418240, // 10 GB
      usedQuota: 104857600, // 100 MB
      freeQuota: 10632560640,
      emailVerified: true,
      registered: new Date('2026-01-01').toISOString(),
    };

    this.executionHistory.push({
      operation: 'verify',
      accountEmail: userInfo.email,
      result: { connected: true, userInfo },
      timestamp: new Date().toISOString(),
    });

    return {
      connected: true,
      userInfo,
      message: `Connected to Mock pCloud (${userInfo.email})`,
    };
  }

  async listContents(folderId: string = '0', accessToken: string, apiHost?: string): Promise<PCloudItemMetadata[]> {
    await this.delay();
    this.executionHistory.push({
      operation: 'listcontents',
      options: { folderId },
      result: this.mockFiles,
      timestamp: new Date().toISOString(),
    });
    return this.mockFiles;
  }

  async getFileMetadata(fileId: string, accessToken: string, apiHost?: string): Promise<PCloudItemMetadata> {
    await this.delay();
    const found = this.mockFiles.find((f) => f.fileId === fileId);
    if (!found) {
      const mockNew: PCloudItemMetadata = {
        fileId,
        folderId: '0',
        name: `File_${fileId}.pdf`,
        isFolder: false,
        size: 512000,
        mimeType: 'application/pdf',
        path: `/File_${fileId}.pdf`,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      };
      return mockNew;
    }
    return found;
  }

  async downloadFileBuffer(fileId: string, accessToken: string, apiHost?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    await this.delay();
    const meta = await this.getFileMetadata(fileId, accessToken, apiHost);
    return {
      buffer: Buffer.from(`%PDF-1.4 Mock PDF content for file ${fileId}`),
      name: meta.name,
      mimeType: meta.mimeType,
    };
  }

  async uploadFile(options: {
    filename: string;
    buffer: Buffer;
    mimeType: string;
    folderId?: string;
    accessToken: string;
    apiHost?: string;
  }): Promise<PCloudItemMetadata> {
    await this.delay();
    const fileId = `mock-file-${Date.now()}`;
    const newFile: PCloudItemMetadata = {
      fileId,
      folderId: options.folderId || '0',
      name: options.filename,
      isFolder: false,
      size: options.buffer.length,
      mimeType: options.mimeType,
      path: `/${options.filename}`,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };
    this.mockFiles.push(newFile);

    this.executionHistory.push({
      operation: 'uploadfile',
      pcloudFileId: fileId,
      result: newFile,
      timestamp: new Date().toISOString(),
    });

    return newFile;
  }

  async shareFolder(options: PCloudShareOptions, accessToken: string, apiHost?: string): Promise<PCloudShareResult> {
    await this.delay();

    // Check custom failure conditions
    if (this.failureMode) {
      const error = PCloudErrorMapper.mapRawError(
        this.failureMode === PCloudErrorCode.PCLOUD_RATE_LIMITED ? 4000 : 2000,
        `Simulated ${this.failureMode}`
      );
      error.code = this.failureMode;
      const failResult: PCloudShareResult = {
        success: false,
        operationType: 'sharefolder',
        recipientEmail: options.recipientEmail,
        descriptionSnapshot: options.message,
        pcloudAccountId: options.pcloudAccountId || 'mock-acc',
        pcloudFileId: options.fileId || options.folderId || '0',
        error,
        timestamp: new Date().toISOString(),
      };
      this.executionHistory.push({
        operation: 'sharefolder',
        pcloudAccountId: options.pcloudAccountId,
        pcloudFileId: options.fileId,
        recipientEmail: options.recipientEmail,
        description: options.message,
        result: failResult,
        timestamp: new Date().toISOString(),
      });
      return failResult;
    }

    if (!options.recipientEmail || !options.recipientEmail.includes('@')) {
      const error = PCloudErrorMapper.mapRawError(2010, 'Invalid recipient email format');
      const failResult: PCloudShareResult = {
        success: false,
        operationType: 'sharefolder',
        recipientEmail: options.recipientEmail,
        descriptionSnapshot: options.message,
        pcloudAccountId: options.pcloudAccountId || 'mock-acc',
        pcloudFileId: options.fileId || '0',
        error,
        timestamp: new Date().toISOString(),
      };
      this.executionHistory.push({
        operation: 'sharefolder',
        pcloudAccountId: options.pcloudAccountId,
        pcloudFileId: options.fileId,
        recipientEmail: options.recipientEmail,
        description: options.message,
        result: failResult,
        timestamp: new Date().toISOString(),
      });
      return failResult;
    }

    const shareRef = `mock-share-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const successResult: PCloudShareResult = {
      success: true,
      operationType: 'sharefolder',
      pcloudReferenceId: shareRef,
      recipientEmail: options.recipientEmail,
      descriptionSnapshot: options.message,
      pcloudAccountId: options.pcloudAccountId || 'mock-acc',
      pcloudFileId: options.fileId || options.folderId || 'mock-file-101',
      timestamp: new Date().toISOString(),
    };

    this.executionHistory.push({
      operation: 'sharefolder',
      pcloudAccountId: options.pcloudAccountId,
      pcloudFileId: options.fileId,
      recipientEmail: options.recipientEmail,
      description: options.message,
      result: successResult,
      timestamp: new Date().toISOString(),
    });

    return successResult;
  }

  async createTransfer(options: PCloudTransferOptions, accessToken: string, apiHost?: string, preloadedFile?: { buffer: Buffer; name: string; mimeType: string }): Promise<PCloudShareResult> {
    await this.delay();
    const recipient = options.recipientEmails[0] || 'unknown@domain.com';
    const transferRef = `mock-transfer-hash-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const successResult: PCloudShareResult = {
      success: true,
      operationType: 'uploadtransfer',
      pcloudReferenceId: transferRef,
      recipientEmail: recipient,
      descriptionSnapshot: options.message,
      pcloudAccountId: options.pcloudAccountId || 'mock-acc',
      pcloudFileId: options.fileId || 'mock-file-101',
      timestamp: new Date().toISOString(),
    };

    this.executionHistory.push({
      operation: 'uploadtransfer',
      pcloudAccountId: options.pcloudAccountId,
      pcloudFileId: options.fileId,
      recipientEmail: recipient,
      description: options.message,
      result: successResult,
      timestamp: new Date().toISOString(),
    });

    return successResult;
  }

  async deleteFile(fileId: string, accessToken: string, apiHost?: string): Promise<boolean> {
    await this.delay();
    this.mockFiles = this.mockFiles.filter((f) => f.fileId !== fileId);
    return true;
  }
}
