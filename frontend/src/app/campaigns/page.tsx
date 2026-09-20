"use client";

import { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/shell';
import { campaignsService } from '@/services/campaignsService';
import { Campaign } from '@/types';
import {
  Share2,
  Plus,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cloud,
  FolderSync,
  Trash2,
  Mail,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Users,
  XCircle,
  Clock,
  Loader2,
  FileText,
  Layers,
  Paperclip,
  Check,
  Archive,
} from 'lucide-react';
import Link from 'next/link';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [retryingRecipientId, setRetryingRecipientId] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const data = await campaignsService.getAll();
      setCampaigns(data);
    } catch (e: any) {
      console.warn('Campaigns data sync notice:', e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    // Adaptive polling: faster during active campaigns, slower when idle
    const hasActive = campaigns.some((c) => c.status === 'PROCESSING' || c.status === 'QUEUED');
    const pollInterval = hasActive ? 2000 : 6000;
    const interval = setInterval(() => {
      fetchCampaigns();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [campaigns.map((c) => `${c.id}-${c.status}`).join(',')]);

  const filtered = campaigns.filter((c) => {
    if (filter === 'ALL') return true;
    return c.status === filter;
  });

  const toggleExpand = (id: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLaunch = async (id: string) => {
    try {
      await campaignsService.launch(id);
      await fetchCampaigns();
    } catch (err: any) {
      alert(`Launch error: ${err.message}`);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await campaignsService.pause(id);
      await fetchCampaigns();
    } catch (err: any) {
      alert(`Pause error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      await campaignsService.delete(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleRetryRecipient = async (campaignId: string, recipientId: string) => {
    try {
      setRetryingRecipientId(recipientId);
      await campaignsService.retryRecipient(campaignId, recipientId);
      await fetchCampaigns();
    } catch (err: any) {
      alert(`Retry failed: ${err?.response?.data?.message || err.message || 'Error retrying recipient'}`);
    } finally {
      setRetryingRecipientId(null);
    }
  };

  // Aggregated Historical Metrics
  const totalCampaigns = campaigns.length;
  const totalRecipients = campaigns.reduce((acc, c) => acc + (c.totalCount || c.recipients?.length || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.sharedCount || 0), 0);
  const overallSuccessRate = totalRecipients > 0 ? Math.round((totalDelivered / totalRecipients) * 100) : 100;

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">pCloud Share Campaigns</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                <Share2 className="h-3 w-3" /> Multi-File &amp; Matrix Engine
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Automate multi-file document distribution, granular recipient targeting matrices, and permanent audit histories.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchCampaigns}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
              title="Refresh Campaigns"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/campaigns/new"
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold hover:opacity-95 transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New 8-Step Campaign
            </Link>
          </div>
        </div>

        {/* Historical Analytics Summary Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Historical Campaigns</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{totalCampaigns}</span>
              <span className="text-xs text-emerald-600 font-semibold">Preserved</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Total Recipients</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{totalRecipients}</span>
              <span className="text-xs text-slate-400 font-normal">Dispatches</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Delivered Successfully</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600">{totalDelivered}</span>
              <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">Active</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Global Delivery Rate</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-600">{overallSuccessRate}%</span>
              <span className="text-xs text-slate-400 font-normal">Success</span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {['ALL', 'PROCESSING', 'QUEUED', 'DRAFT', 'COMPLETED', 'FAILED', 'PAUSED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                filter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Campaign Cards List */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Share2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No campaigns found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No campaigns match the current filter. Create a multi-file distribution campaign to begin sending.
              </p>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Create Campaign
              </Link>
            </div>
          ) : (
            filtered.map((cmp) => {
              const total = cmp.totalCount || 1;
              const shared = cmp.sharedCount || 0;
              const failed = cmp.failedCount || 0;
              const pct = Math.round((shared / total) * 100);

              const isAllFailed = (cmp.status === 'COMPLETED' && shared === 0 && failed > 0) || cmp.status === 'FAILED';
              const isPartial = cmp.status === 'COMPLETED' && shared > 0 && failed > 0;
              const isExpanded = !!expandedCampaigns[cmp.id];

              let deliveryMode = 'PCLOUD_NATIVE';
              let filesSnapshot: any[] = [];
              let distributionMode = cmp.distributionMode || 'UNIFORM';
              let tasks: any[] = cmp.tasks || [];

              try {
                const cfg = JSON.parse(cmp.config || '{}');
                if (cfg.deliveryMode) deliveryMode = cfg.deliveryMode;
                else if (cmp.emailAccountId) deliveryMode = 'EMAIL';

                if (cfg.distributionMode) distributionMode = cfg.distributionMode;
                if (cfg.tasks && Array.isArray(cfg.tasks)) tasks = cfg.tasks;
                if (cfg.filesSnapshot && Array.isArray(cfg.filesSnapshot)) filesSnapshot = cfg.filesSnapshot;
              } catch {
                if (cmp.emailAccountId) deliveryMode = 'EMAIL';
              }
              const isEmail = deliveryMode === 'EMAIL';

              // Resolve list of campaign files
              let campaignFiles: Array<{ id: string; name: string; size?: number }> = [];
              if (cmp.files && cmp.files.length > 0) {
                campaignFiles = cmp.files.map((f: any) => ({
                  id: f.id,
                  name: f.name || f.filename || 'Document',
                  size: f.size,
                }));
              } else if (filesSnapshot.length > 0) {
                campaignFiles = filesSnapshot.map((f: any) => ({
                  id: f.id,
                  name: f.name || f.filename || 'Document',
                  size: f.size,
                }));
              } else if (cmp.pcloudFile) {
                campaignFiles = [{
                  id: cmp.pcloudFile.id,
                  name: cmp.pcloudFile.name || 'Document',
                  size: cmp.pcloudFile.size,
                }];
              }

              const isMultiTask = distributionMode === 'MULTI_TASK' || tasks.length > 0;

              return (
                <div
                  key={cmp.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all overflow-hidden flex flex-col"
                >
                  {/* Main Card Row */}
                  <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-lg">{cmp.name}</h3>

                        {/* Delivery Channel Badge */}
                        {isEmail ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Mail className="h-3.5 w-3.5 text-indigo-600" />
                            Email SMTP
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                            <Cloud className="h-3.5 w-3.5 text-cyan-600" />
                            pCloud Native
                          </span>
                        )}

                        {/* Distribution Strategy Badge */}
                        {isMultiTask ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <Layers className="h-3.5 w-3.5 text-purple-600" />
                            Matrix ({tasks.length || 2} Tasks)
                          </span>
                        ) : campaignFiles.length > 1 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Paperclip className="h-3.5 w-3.5 text-blue-600" />
                            {campaignFiles.length} Files Attached
                          </span>
                        ) : null}

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            cmp.status === 'PROCESSING'
                              ? 'bg-blue-100 text-blue-700 border border-blue-200 animate-pulse'
                              : isAllFailed
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : isPartial
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : cmp.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : cmp.status === 'DRAFT'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : 'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isAllFailed ? 'FAILED (0 DELIVERED)' : isPartial ? 'PARTIAL DELIVERY' : cmp.status}
                        </span>
                      </div>

                      {/* Meta information row */}
                      <p className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1.5">
                          {isEmail ? (
                            <>
                              <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                                <Mail className="h-3 w-3" />
                              </span>
                              Sender: <strong className="text-slate-800">{cmp.emailAccount?.accountEmail || 'SMTP Account'}</strong>
                            </>
                          ) : (
                            <>
                              <span className="p-1 rounded-md bg-cyan-100 text-cyan-700">
                                <Cloud className="h-3 w-3" />
                              </span>
                              pCloud: <strong className="text-slate-800">{cmp.pcloudAccount?.accountEmail || cmp.pcloudAccount?.name || 'pCloud'}</strong>
                            </>
                          )}
                        </span>

                        {/* Document files info */}
                        <span className="flex items-center gap-1.5">
                          <FolderSync className="h-3.5 w-3.5 text-blue-600" />
                          {campaignFiles.length === 0 ? (
                            <span>Document: <strong className="text-slate-800">{cmp.pcloudFile?.name || 'Archived Document'}</strong></span>
                          ) : campaignFiles.length === 1 ? (
                            <span>Document: <strong className="text-slate-800">{campaignFiles[0].name}</strong></span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              Documents: <strong className="text-slate-800">{campaignFiles[0].name}</strong>
                              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                +{campaignFiles.length - 1} more
                              </span>
                            </span>
                          )}
                        </span>

                        <span>Template: <strong className="text-slate-800">{cmp.template?.name || 'Executive Share'}</strong></span>
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span>Created: {new Date(cmp.createdAt).toLocaleString()}</span>
                        {cmp.pcloudFile?.metadata && (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Archive className="h-3 w-3 text-slate-400" />
                            History Retained
                          </span>
                        )}
                      </div>

                      {isAllFailed && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 w-fit">
                            Delivery failed for all recipients. Expand recipient list below to see exact error details.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Progress & Controls */}
                    <div className="flex flex-col md:flex-row md:items-center gap-5">
                      <div className="w-full md:w-56 space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          {cmp.status === 'PROCESSING' ? (
                            <>
                              <span className="text-blue-600 animate-pulse">⚡ Processing...</span>
                              <span>
                                <strong className="text-emerald-600">{shared}</strong>
                                {failed > 0 && <span className="text-rose-500">+{failed}✗</span>}
                                {' '}/ {total} recipients
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{pct}% Shared</span>
                              <span>
                                <strong className="text-emerald-600">{shared}</strong> shared / {total}
                                {failed > 0 && <span className="text-rose-600 ml-1">({failed} failed)</span>}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                          {cmp.status === 'PROCESSING' ? (
                            <div className="h-2.5 rounded-full bg-linear-to-r from-blue-600 via-cyan-400 to-blue-600 bg-size-[200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ width: `${Math.max(pct, 5)}%` }}></div>
                          ) : (
                            <div
                              className={`h-2.5 rounded-full transition-all duration-500 ${
                                isAllFailed ? 'bg-rose-500' : 'bg-linear-to-r from-blue-600 to-cyan-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Recipient Dropdown Toggle */}
                        <button
                          onClick={() => toggleExpand(cmp.id)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                            isExpanded
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                          title="View list of all recipients and status"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>Recipients ({cmp.recipients?.length || total})</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {cmp.status === 'PROCESSING' || cmp.status === 'QUEUED' ? (
                          <button
                            onClick={() => handlePause(cmp.id)}
                            className="px-3.5 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                          >
                            <Pause className="h-3.5 w-3.5" />
                            {cmp.status === 'QUEUED' ? 'Queued (Pause)' : 'Pause'}
                          </button>
                        ) : cmp.status === 'COMPLETED' && !isAllFailed ? (
                          <span className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Done
                          </span>
                        ) : (
                          <button
                            onClick={() => handleLaunch(cmp.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold hover:opacity-95 transition-colors flex items-center gap-1.5 shadow-xs ${
                              isAllFailed
                                ? 'bg-linear-to-r from-rose-600 to-amber-600 text-white'
                                : 'bg-linear-to-r from-emerald-600 to-teal-600 text-white'
                            }`}
                          >
                            <Play className="h-3.5 w-3.5" />
                            {isAllFailed ? 'Retry Campaign' : 'Launch'}
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(cmp.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete Campaign"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Recipient Breakdown Accordion */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50/70 p-5 space-y-4">
                      {/* Attached Campaign Files Chips */}
                      {campaignFiles.length > 0 && (
                        <div className="bg-white p-3 rounded-xl border border-slate-200">
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                            Attached Campaign Documents ({campaignFiles.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {campaignFiles.map((file, idx) => (
                              <span
                                key={file.id || idx}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                              >
                                <FileText className="h-3.5 w-3.5 text-blue-600" />
                                {file.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-cyan-600" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Recipient Breakdown &amp; Live Delivery Status
                          </h4>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          {shared} of {total} shared successfully
                          {failed > 0 && <span className="text-rose-600 ml-1">({failed} failed)</span>}
                        </span>
                      </div>

                      {(!cmp.recipients || cmp.recipients.length === 0) ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          No individual recipient breakdown recorded for this campaign.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase tracking-wider text-[10px]">
                              <tr>
                                <th className="px-4 py-2.5">#</th>
                                <th className="px-4 py-2.5">Recipient Email</th>
                                <th className="px-4 py-2.5">Assigned Documents</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5">Diagnostics / Execution</th>
                                <th className="px-4 py-2.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {cmp.recipients.map((rec, idx) => {
                                const isDelivered = rec.status === 'DELIVERED' || rec.status === 'SHARED';
                                const isFailedRec = rec.status === 'FAILED';
                                const isProcessingRec = rec.status === 'PROCESSING';
                                const isPendingRec = rec.status === 'PENDING' || rec.status === 'QUEUED';
                                const isThisRetrying = retryingRecipientId === rec.id;

                                // Resolve assigned files for this recipient
                                let assignedFileNames: string[] = [];
                                if (rec.randomCode) {
                                  const ids = rec.randomCode.split(',').map((id: string) => id.trim()).filter(Boolean);
                                  assignedFileNames = ids.map((id: string) => {
                                    const match = campaignFiles.find((f) => f.id === id);
                                    return match ? match.name : id;
                                  });
                                }
                                if (assignedFileNames.length === 0 && campaignFiles.length > 0) {
                                  assignedFileNames = campaignFiles.map((f) => f.name);
                                }

                                return (
                                  <tr key={rec.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-800">
                                      <span className="flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                                        {rec.recipientEmail}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {assignedFileNames.length === 0 ? (
                                        <span className="text-slate-400 italic text-[11px]">Default Campaign File</span>
                                      ) : assignedFileNames.length === 1 ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                          <FileText className="h-3 w-3 text-blue-500" />
                                          {assignedFileNames[0]}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                          <Paperclip className="h-3 w-3 text-blue-500" />
                                          {assignedFileNames[0]}
                                          <span className="text-[10px] text-blue-600 font-bold">
                                            +{assignedFileNames.length - 1} more
                                          </span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      {isDelivered && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                          Delivered
                                        </span>
                                      )}
                                      {isProcessingRec && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                                          <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                          Sending...
                                        </span>
                                      )}
                                      {isFailedRec && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                          <XCircle className="h-3 w-3 text-rose-600" />
                                          Failed
                                        </span>
                                      )}
                                      {isPendingRec && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                          <Clock className="h-3 w-3 text-slate-500" />
                                          Pending
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 max-w-sm">
                                      {isFailedRec ? (
                                        <div className="space-y-0.5">
                                          <span className="text-rose-600 font-medium text-[11px] block truncate" title={rec.errorMessage || 'Share rejected'}>
                                            {rec.errorMessage || 'pCloud rejected share'}
                                          </span>
                                          {rec.errorCode && (
                                            <span className="text-[10px] text-rose-500 font-mono">
                                              Code: {rec.errorCode}
                                            </span>
                                          )}
                                        </div>
                                      ) : isDelivered ? (
                                        rec.pcloudShareExecutionId?.startsWith('SMTP_FALLBACK:') ? (
                                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium" title={rec.pcloudShareExecutionId}>
                                            <Mail className="h-3 w-3 text-amber-600" />
                                            SMTP Delivered (pCloud Fallback)
                                          </span>
                                        ) : (
                                          <span className="text-emerald-700 font-medium text-[11px] flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                            {rec.pcloudShareExecutionId ? `Ref: ${rec.pcloudShareExecutionId}` : 'Delivered'}
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-slate-400 text-[11px] italic">Queued for delivery</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <button
                                        onClick={() => handleRetryRecipient(cmp.id, rec.id)}
                                        disabled={isThisRetrying || isProcessingRec}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shadow-2xs ${
                                          isFailedRec
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                                            : isDelivered
                                            ? 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                            : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        title={isDelivered ? 'Resend to this recipient' : 'Retry sending to this recipient'}
                                      >
                                        <RotateCw className={`h-3 w-3 ${isThisRetrying ? 'animate-spin' : ''}`} />
                                        {isThisRetrying ? 'Retrying...' : isDelivered ? 'Resend' : 'Retry'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Shell>
  );
}

