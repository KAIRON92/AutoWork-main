"use client";

import { useEffect, useState } from 'react';
import { Shell } from '@/components/layout/shell';
import { apiClient } from '@/services/apiClient';
import { Server, Database, Cloud, Zap, RefreshCw, AlertTriangle } from 'lucide-react';

export default function AdminPage() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.get('/health');
      setHealth(res.data);
    } catch (err: any) {
      setHealth(null);
      setError(err?.response?.data?.message || err?.message || 'Health check failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const status = health?.status || (error ? 'UNAVAILABLE' : 'LOADING');
  const subsystems = health?.subsystems || {};

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin System Console</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${status === 'OK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Live infrastructure health reported by the backend. No synthetic healthy fallback is used.
            </p>
          </div>
          <button
            onClick={fetchHealth}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Health
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase">Queue / Workers</span>
              <Server className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{subsystems.redisQueue || 'UNKNOWN'}</p>
            <p className="text-xs text-slate-500">Reported by backend health check</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase">Redis</span>
              <Database className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{subsystems.redisQueue || 'UNKNOWN'}</p>
            <p className="text-xs text-slate-500">Queue subsystem health</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase">pCloud Worker</span>
              <Cloud className="h-4 w-4 text-cyan-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{subsystems.pcloudWorker || 'UNKNOWN'}</p>
            <p className="text-xs text-slate-500">Worker heartbeat/health signal</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase">Database</span>
              <Zap className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{subsystems.database || 'UNKNOWN'}</p>
            <p className="text-xs text-slate-500">PostgreSQL / Prisma health</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">Operational Status</h2>
          <p className="text-sm text-slate-600">
            This page intentionally reports only data returned by the backend health endpoint. It does not claim that pCloud or workers are healthy when the backend cannot verify them.
          </p>
        </div>
      </div>
    </Shell>
  );
}
