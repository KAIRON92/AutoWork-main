import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
  withCredentials: true,
});

apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('autowork_jwt_token');
      if (token) {
        if (config.headers && typeof (config.headers as any).set === 'function') {
          (config.headers as any).set('Authorization', `Bearer ${token}`);
        } else {
          config.headers = config.headers || {};
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined') {
      const status = error.response?.status;
      const pathname = window.location.pathname;
      const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password'].some((route) => pathname.startsWith(route));
      if ((status === 401 || status === 502) && !isAuthPage) {
        const token = localStorage.getItem('autowork_jwt_token');
        if (!token || status === 401) {
          window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
        }
      }
    }
    return Promise.reject(error);
  },
);