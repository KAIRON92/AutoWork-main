export type Organization = {
  id: string;
  name: string;
  slug: string;
};

export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  role: UserRole;
};

export type AccountStatus = 'ACTIVE' | 'PAUSED' | 'INVALID' | 'ERROR';

export type PCloudAccount = {
  id: string;
  organizationId?: string;
  name: string;
  accountEmail: string;
  provider: 'pcloud' | 'mock_pcloud';
  status: AccountStatus;
  dailyLimit: number;
  sentToday: number;
  pcloudUserId?: string;
  folderId?: string;
  hasCredentials?: boolean;
  lastUsedAt?: string;
  createdAt: string;
};

export type PCloudFile = {
  id: string;
  organizationId?: string;
  pcloudAccountId?: string;
  name: string;
  fileId: string;
  folderId?: string;
  fileSize: number;
  mimeType: string;
  pcloudPath?: string;
  metadata?: string;
  pcloudAccount?: {
    id: string;
    name: string;
    accountEmail: string;
  };
  createdAt: string;
};

export type Attachment = PCloudFile;

export type Contact = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  company?: string;
  target?: string;
  tags?: string;
  customFields?: string;
  source?: string;
  status: string;
  memberships?: {
    contactList: {
      id: string;
      name: string;
    };
  }[];
  createdAt: string;
};

export type ContactList = {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
};

export type ImportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type ImportJob = {
  id: string;
  filename: string;
  status: ImportJobStatus;
  totalRows: number;
  importedCount: number;
  failedCount: number;
  duplicateCount?: number;
  errors?: string;
  createdAt: string;
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  content: string;
  variables?: string | string[];
  createdAt: string;
  updatedAt: string;
};

export type CampaignStatus = 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED';

export type CampaignRecipient = {
  id: string;
  campaignId: string;
  recipientEmail: string;
  randomCode?: string | null;
  status: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'SHARED' | 'DELIVERED' | 'FAILED';
  errorCode?: string | null;
  errorMessage?: string | null;
  pcloudShareExecutionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CampaignTask = {
  id: string;
  name: string;
  fileIds: string[];
  contactIds?: string[];
  contactListId?: string;
  templateId?: string;
  subjectOverride?: string;
  messageOverride?: string;
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  pcloudAccountId: string;
  pcloudFileId: string;
  templateId: string;
  emailAccountId?: string;
  contactListId?: string;
  totalCount: number;
  sharedCount: number;
  failedCount: number;
  retryingCount: number;
  config?: string;
  emailAccount?: {
    id: string;
    displayName: string;
    accountEmail: string;
    provider: string;
    status: string;
  };
  pcloudAccount?: {
    id: string;
    name: string;
    accountEmail: string;
    provider: string;
  };
  pcloudFile?: {
    id: string;
    name: string;
    fileId?: string;
    pcloudPath?: string;
    fileSize?: number;
    size?: number;
    mimeType?: string;
    metadata?: any;
  };
  files?: Array<{
    id: string;
    name: string;
    fileId?: string;
    pcloudPath?: string;
    fileSize?: number;
    size?: number;
    mimeType?: string;
    metadata?: any;
  }>;
  distributionMode?: 'UNIFORM' | 'MULTI_TASK';
  tasks?: CampaignTask[];
  template?: {
    id: string;
    name: string;
  };
  contactList?: {
    id: string;
    name: string;
  };
  recipients?: CampaignRecipient[];
  executions?: PCloudShareExecution[];
  createdAt: string;
};

export type PCloudShareExecution = {
  id: string;
  campaignId: string;
  campaign?: {
    id: string;
    name: string;
  };
  pcloudAccountId: string;
  pcloudAccount?: {
    id: string;
    name: string;
    accountEmail: string;
  };
  pcloudFileId: string;
  pcloudFile?: {
    id: string;
    name: string;
    fileId: string;
  };
  recipientEmail: string;
  descriptionSnapshot: string;
  operationType: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRYING' | 'PROCESSING' | 'UNKNOWN' | 'MANUAL_REVIEW' | string;
  pcloudReferenceId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryCount?: number;
  startedAt: string;
  completedAt?: string;
};

export type ErrorLog = {
  id: string;
  code: string;
  message: string;
  stackTrace?: string;
  context?: string;
  createdAt: string;
};

export type DashboardMetrics = {
  totalContacts: number;
  connectedPCloudAccounts: number;
  availableFiles: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalShareTransferJobs: number;
  successfulJobs: number;
  failedJobs: number;
  successRate: string;
  recentCampaigns: Campaign[];
};
