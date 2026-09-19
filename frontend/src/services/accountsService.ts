import { apiClient } from './apiClient';
import { PCloudAccount } from '../types';

export const accountsService = {
  async getAll(): Promise<PCloudAccount[]> {
    const res = await apiClient.get('/v1/pcloud/accounts');
    return res.data;
  },

  async create(data: {
    name: string;
    accountEmail: string;
    provider?: 'pcloud' | 'mock_pcloud';
    accessToken?: string;
    otpCode?: string;
    dailyLimit?: number;
  }): Promise<PCloudAccount> {
    const res = await apiClient.post('/v1/pcloud/accounts', data);
    return res.data;
  },

  async testConnection(id: string): Promise<{ connected: boolean; message: string }> {
    const res = await apiClient.post(`/v1/pcloud/accounts/${id}/test`);
    return res.data;
  },

  async toggleStatus(id: string): Promise<PCloudAccount> {
    const res = await apiClient.patch(`/v1/pcloud/accounts/${id}/status`);
    return res.data;
  },

  async delete(id: string): Promise<boolean> {
    await apiClient.delete(`/v1/pcloud/accounts/${id}`);
    return true;
  },

  async getOAuthUrl(origin?: string): Promise<{ url: string; euUrl?: string }> {
    const res = await apiClient.get('/v1/pcloud/accounts/oauth/url', { params: { origin } });
    return res.data;
  },

  async exchangeOAuthCode(data: {
    code: string;
    name?: string;
    dailyLimit?: number;
  }): Promise<PCloudAccount> {
    const res = await apiClient.post('/v1/pcloud/accounts/oauth/exchange', data);
    return res.data;
  },
};
