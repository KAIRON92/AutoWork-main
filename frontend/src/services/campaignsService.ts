import { apiClient } from './apiClient';
import { Campaign } from '../types';

export const campaignsService = {
  async getAll(): Promise<Campaign[]> {
    const res = await apiClient.get('/v1/campaigns');
    return res.data;
  },

  async getById(id: string): Promise<Campaign> {
    const res = await apiClient.get(`/v1/campaigns/${id}`);
    return res.data;
  },

  async create(data: {
    name: string;
    pcloudAccountId: string;
    pcloudFileId?: string;
    pcloudFileIds?: string[];
    tasks?: Array<{
      id?: string;
      name?: string;
      fileIds: string[];
      contactIds?: string[];
      contactListId?: string;
      messageOverride?: string;
    }>;
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
      tasks?: any[];
    };
  }): Promise<Campaign> {
    const res = await apiClient.post('/v1/campaigns', data);
    return res.data;
  },

  async launch(id: string): Promise<any> {
    const res = await apiClient.post(`/v1/campaigns/${id}/launch`);
    return res.data;
  },

  async pause(id: string): Promise<any> {
    const res = await apiClient.post(`/v1/campaigns/${id}/pause`);
    return res.data;
  },

  async delete(id: string): Promise<boolean> {
    await apiClient.delete(`/v1/campaigns/${id}`);
    return true;
  },

  async retryRecipient(campaignId: string, recipientId: string): Promise<any> {
    const res = await apiClient.post(`/v1/campaigns/${campaignId}/recipients/${recipientId}/retry`);
    return res.data;
  },
};
