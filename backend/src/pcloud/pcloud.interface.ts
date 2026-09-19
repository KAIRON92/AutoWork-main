export enum PCloudErrorCode {
  PCLOUD_AUTH_FAILED = 'PCLOUD_AUTH_FAILED',
  PCLOUD_PERMISSION_DENIED = 'PCLOUD_PERMISSION_DENIED',
  PCLOUD_FILE_NOT_FOUND = 'PCLOUD_FILE_NOT_FOUND',
  PCLOUD_INVALID_RECIPIENT = 'PCLOUD_INVALID_RECIPIENT',
  PCLOUD_RATE_LIMITED = 'PCLOUD_RATE_LIMITED',
  PCLOUD_QUOTA_EXCEEDED = 'PCLOUD_QUOTA_EXCEEDED',
  PCLOUD_SHARE_EXISTS = 'PCLOUD_SHARE_EXISTS',
  PCLOUD_VERIFICATION_REQUIRED = 'PCLOUD_VERIFICATION_REQUIRED',
  PCLOUD_FILE_SHARE_UNSUPPORTED = 'PCLOUD_FILE_SHARE_UNSUPPORTED',
  PCLOUD_WRONG_REGION = 'PCLOUD_WRONG_REGION',
  PCLOUD_TEMPORARY_ERROR = 'PCLOUD_TEMPORARY_ERROR',
  PCLOUD_UNKNOWN_ERROR = 'PCLOUD_UNKNOWN_ERROR',
}

export interface PCloudError {
  code: PCloudErrorCode;
  rawCode?: number;
  message: string;
  isTransient: boolean;
  timestamp: string;
}

export interface PCloudUserInfo {
  userId: string;
  email: string;
  quota: number;
  usedQuota: number;
  freeQuota: number;
  emailVerified: boolean;
  registered: string;
  resolvedApiHost?: string;
}

export interface PCloudItemMetadata {
  fileId?: string;
  folderId?: string;
  name: string;
  isFolder: boolean;
  size: number;
  mimeType: string;
  path: string;
  created: string;
  modified: string;
  pcloudAccountId?: string;
  metadata?: Record<string, any>;
}

export interface PCloudShareOptions {
  folderId?: string | null;
  fileId?: string | null;
  recipientEmail: string;
  message?: string | null;
  permissions?: number;
  pcloudAccountId?: string;
  organizationId?: string;
  campaignId?: string;
  jobId?: string | null;
}

export interface PCloudTransferOptions {
  fileId?: string | null;
  folderId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  senderEmail: string;
  recipientEmails: string[];
  message?: string | null;
  pcloudAccountId?: string;
  organizationId?: string;
  campaignId?: string;
  jobId?: string | null;
}

export interface PCloudShareResult {
  success: boolean;
  operationType: 'sharefolder' | 'uploadtransfer' | 'publink';
  pcloudReferenceId?: string;
  recipientEmail: string;
  descriptionSnapshot?: string;
  pcloudAccountId: string;
  pcloudFileId: string;
  error?: PCloudError;
  timestamp: string;
}

export interface IPCloudAdapter {
  readonly providerName: string;
  verifyConnection(accessToken: string, apiHost?: string): Promise<{ connected: boolean; userInfo?: PCloudUserInfo; message: string }>;
  listContents(folderId: string, accessToken: string, apiHost?: string): Promise<PCloudItemMetadata[]>;
  getFileMetadata(fileId: string, accessToken: string, apiHost?: string): Promise<PCloudItemMetadata>;
  downloadFileBuffer(fileId: string, accessToken: string, apiHost?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }>;
  uploadFile(options: { filename: string; buffer: Buffer; mimeType: string; folderId?: string; accessToken: string; apiHost?: string }): Promise<PCloudItemMetadata>;
  shareFolder(options: PCloudShareOptions, accessToken: string, apiHost?: string): Promise<PCloudShareResult>;
  createTransfer(options: PCloudTransferOptions, accessToken: string, apiHost?: string, preloadedFile?: { buffer: Buffer; name: string; mimeType: string }): Promise<PCloudShareResult>;
  deleteFile(fileId: string, accessToken: string, apiHost?: string): Promise<boolean>;
}
