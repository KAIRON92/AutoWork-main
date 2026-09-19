import { apiClient } from './apiClient';
import { User, Organization } from '../types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface AuthResponse {
  user: User;
  organization: Organization;
  token?: string;
}

import { useAuthStore } from '../stores/useAuthStore';

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await apiClient.post('/v1/auth/login', payload);
    const data = response.data;
    if (typeof window !== 'undefined' && data?.token) {
      localStorage.setItem('autowork_jwt_token', data.token);
      document.cookie = `autowork_jwt_token=${encodeURIComponent(data.token)}; Path=/; Max-Age=604800; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    }
    if (data?.user && data?.organization) {
      useAuthStore.getState().setAuth(data.user, data.organization, data.token || '');
    }
    return data;
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const response = await apiClient.post('/v1/auth/register', payload);
    const data = response.data;
    if (typeof window !== 'undefined' && data?.token) {
      localStorage.setItem('autowork_jwt_token', data.token);
      document.cookie = `autowork_jwt_token=${encodeURIComponent(data.token)}; Path=/; Max-Age=604800; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    }
    if (data?.user && data?.organization) {
      useAuthStore.getState().setAuth(data.user, data.organization, data.token || '');
    }
    return data;
  },

  async demoLogin(): Promise<AuthResponse> {
    const response = await apiClient.post('/v1/auth/demo-login');
    const data = response.data;
    if (typeof window !== 'undefined' && data?.token) {
      localStorage.setItem('autowork_jwt_token', data.token);
      document.cookie = `autowork_jwt_token=${encodeURIComponent(data.token)}; Path=/; Max-Age=604800; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    }
    if (data?.user && data?.organization) {
      useAuthStore.getState().setAuth(data.user, data.organization, data.token || '');
    }
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/v1/auth/logout');
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('autowork_jwt_token');
        document.cookie = 'autowork_jwt_token=; Path=/; Max-Age=0; SameSite=Lax';
      }
      useAuthStore.getState().clearAuth();
    }
  },

  async getCurrentUser(): Promise<{ user: User; organization?: Organization } | null> {
    try {
      const response = await apiClient.get('/v1/auth/me');
      if (response.data?.user && response.data?.organization) {
        useAuthStore.getState().setAuth(response.data.user, response.data.organization, localStorage.getItem('autowork_jwt_token') || '');
      }
      return response.data;
    } catch {
      return null;
    }
  },
};
