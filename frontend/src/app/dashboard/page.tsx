"use client";

import { useEffect, useState } from 'react';
import { Shell } from '@/components/layout/shell';
import { dashboardService } from '@/services/dashboardService';
import { accountsService } from '@/services/accountsService';
import { DashboardMetrics, PCloudAccount } from '@/types';
import {
  Cloud,
  FolderSync,
  Share2,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Clock,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalContacts: 0,
    connectedPCloudAccounts: 0,
    availableFiles: 0,
    activeCampaigns: 0,
    completedCampaigns: 0,
    totalShareTransferJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    successRate: '100.0',
    recentCampaigns: [],
  });
  const [accounts, setAccounts] = useState<PCloudAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [m, accs] = await Promise.all([
        dashboardService.getMetrics(),
        accountsService.getAll(),
      ]);
      setMetrics(m);
      setAccounts(accs);
    } catch (e: any) {
      if (e?.response?.status !== 401) {
        console.warn('Dashboard data sync notice:', e?.message || e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('autowork_jwt_token') : null;
    if (!token) {
      return;
    }
    loadData();
  }, []);

  return (
    <Shell>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">pCloud Orchestrator Command Center</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                <Sparkles className="h-3 w-3" /> Live Engine
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Multi-tenant pCloud document sharing, recipient transfers & automated campaign queue orchestrator.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/imports"
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Import Contacts
            </Link>
            <Link
              href="/campaigns/new"
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold hover:opacity-95 transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New pCloud Campaign
            </Link>
          </div>
        </div>

        {/* Key Performance Indicators Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Active Campaigns */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Campaigns
              </span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Share2 className="h-5 w-5" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{metrics.activeCampaigns}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>{metrics.completedCampaigns} completed campaigns</span>
            </p>
          </div>

          {/* Connected pCloud Accounts */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Connected pCloud Accounts
              </span>
              <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600">
                <Cloud className="h-5 w-5" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{metrics.connectedPCloudAccounts}</p>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Multi-account pool active
            </p>
          </div>

          {/* Available Documents */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Available pCloud Files
              </span>
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <FolderSync className="h-5 w-5" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{metrics.availableFiles}</p>
            <p className="text-xs text-indigo-600 font-medium mt-1">Ready for campaign dispatch</p>
          </div>

          {/* Shares/Transfers Success Rate */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Share Success Rate
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{metrics.successRate}%</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              {metrics.successfulJobs} successful / {metrics.totalShareTransferJobs} total operations
            </p>
          </div>
        </div>

        {/* Live Active Campaigns Tracker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Live pCloud Campaign Queue</h2>
              <p className="text-xs text-slate-500">Realtime progress tracking across BullMQ worker queues</p>
            </div>
            <Link href="/campaigns" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all campaigns &rarr;
            </Link>
          </div>

          <div className="space-y-4">
            {metrics.recentCampaigns && metrics.recentCampaigns.length > 0 ? (
              metrics.recentCampaigns.map((cmp) => {
                const total = cmp.totalCount || 1;
                const shared = cmp.sharedCount || 0;
                const failed = cmp.failedCount || 0;
                const progressPct = Math.round((shared / total) * 100);

                return (
                  <div
                    key={cmp.id}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{cmp.name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            cmp.status === 'PROCESSING'
                              ? 'bg-blue-100 text-blue-700 animate-pulse'
                              : cmp.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : cmp.status === 'PAUSED'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {cmp.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Account: <strong className="text-slate-700">{cmp.pcloudAccount?.name || 'Default Account'}</strong> &bull; File: <strong className="text-slate-700">{cmp.pcloudFile?.name || 'Document'}</strong> &bull; {cmp.totalCount} Recipients
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full md:w-72 space-y-1.5">
                      <div className="flex justify-between text-xs font-medium text-slate-600">
                        <span>{progressPct}% shared</span>
                        <span>
                          <strong className="text-emerald-600">{shared}</strong> shared, <strong className="text-red-500">{failed}</strong> failed / {total}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-linear-to-r from-blue-600 to-cyan-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Share2 className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium">No campaigns have been launched yet.</p>
                <Link href="/campaigns/new" className="text-xs text-blue-600 font-semibold hover:underline mt-1 inline-block">
                  Create your first 8-step pCloud campaign &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Connected pCloud Accounts Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Connected pCloud Accounts</h2>
              <p className="text-xs text-slate-500">
                Multi-account pool for load-balanced file sharing and transfers.
              </p>
            </div>
            <Link href="/accounts" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Manage pCloud Accounts &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/30 space-y-2 hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-cyan-600" />
                    <span className="font-semibold text-slate-900 text-sm">{acc.name}</span>
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      acc.status === 'ACTIVE' ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-amber-500'
                    }`}
                  ></span>
                </div>
                <p className="text-xs text-slate-500 font-mono truncate">{acc.accountEmail}</p>
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span>Provider: <strong className="uppercase text-slate-800">{acc.provider}</strong></span>
                  <span>Shares Today: <strong>{acc.sentToday}</strong> / {acc.dailyLimit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
