import { apiClient } from './apiClient';

export interface EmailAccount {
  id: string;
  provider: string;
  accountEmail: string;
  displayName?: string | null;
  status: string;
  hasCredentials?: boolean;
  lastVerifiedAt?: string;
  createdAt?: string;
}

export interface CreateCustomSmtpPayload {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  accountEmail: string;
  fromName?: string;
}

export const emailAccountsService = {
  async getAll(): Promise<EmailAccount[]> {
    const response = await apiClient.get('/v1/email/accounts');
    return response.data;
  },

  async getGmailOAuthUrl(): Promise<{ url: string }> {
    const response = await apiClient.get('/v1/email/accounts/gmail/oauth-url');
    return response.data;
  },

  async createCustomSmtp(payload: CreateCustomSmtpPayload): Promise<EmailAccount> {
    const response = await apiClient.post('/v1/email/accounts/smtp', payload);
    return response.data;
  },

  async sendTestEmail(id: string, to: string, subject?: string, body?: string) {
    const response = await apiClient.post(`/v1/email/accounts/${id}/test`, { to, subject, body });
    return response.data;
  },

  async getGmailStatus(): Promise<{ configured: boolean; clientId: string | null; redirectUri: string }> {
    const response = await apiClient.get('/v1/email/accounts/gmail/status');
    return response.data;
  },

  async saveGmailConfig(clientId: string, clientSecret: string, redirectUri?: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/v1/email/accounts/gmail/config', { clientId, clientSecret, redirectUri });
    return response.data;
  },

  async remove(id: string) {
    const response = await apiClient.delete(`/v1/email/accounts/${id}`);
    return response.data;
  },
};
