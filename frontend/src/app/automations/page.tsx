"use client";

import { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/shell';
import { automationsService, Automation } from '@/services/automationsService';
import {
  Workflow,
  Plus,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('SCHEDULED_CRON');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAutomations = async () => {
    try {
      setLoading(true);
      const data = await automationsService.getAll();
      setAutomations(data || []);
    } catch (e: any) {
      console.warn('Automations data sync notice:', e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setIsSubmitting(true);
      await automationsService.create({
        name: newName.trim(),
        definition: JSON.stringify({
          trigger: newTrigger,
          actions: ['RESOLVE_TEMPLATE_TOKENS', 'DISPATCH_PCLOUD_TRANSFER'],
        }),
      });
      setNewName('');
      setShowCreateModal(false);
      await fetchAutomations();
    } catch (err: any) {
      alert(`Creation failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (auto: Automation) => {
    const nextStatus = auto.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await automationsService.update(auto.id, { status: nextStatus });
      await fetchAutomations();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation flow?')) return;
    try {
      await automationsService.delete(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Automation Workflows</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                <Sparkles className="h-3 w-3" /> Event Driven
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Automated trigger-and-action pipelines for recurring pCloud shares, scheduled batches & webhook dispatches.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAutomations}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
              title="Refresh Automations"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold hover:opacity-95 transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Automation
            </button>
          </div>
        </div>

        {/* Automations Grid */}
        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-cyan-600" />
            Loading automation workflows...
          </div>
        ) : automations.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto">
              <Workflow className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No automation workflows configured</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Set up automated pipelines to distribute new pCloud files as soon as they are uploaded or on a cron schedule.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-4 py-2 bg-linear-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold rounded-xl hover:opacity-95"
            >
              Create First Automation
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {automations.map((auto) => {
              const isActive = auto.status === 'ACTIVE';
              return (
                <div
                  key={auto.id}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="h-10 w-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                        <Zap className="h-5 w-5" />
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {isActive ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {auto.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{auto.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        Pipeline ID: {auto.id.slice(0, 8)}...
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Trigger:</span>
                        <span className="font-semibold text-slate-900">Scheduled Queue</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Action:</span>
                        <span className="font-semibold text-slate-900">pCloud Transfer</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
                    <button
                      onClick={() => handleToggleStatus(auto)}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                        isActive
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      <span>{isActive ? 'Pause' : 'Activate'}</span>
                    </button>

                    <button
                      onClick={() => handleDelete(auto.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete Automation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-cyan-600" />
                <h3 className="text-lg font-bold text-slate-900">Create Automation Workflow</h3>
              </div>

              <form onSubmit={handleCreate} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Workflow Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Daily Document Transfer Dispatch"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Trigger Event</label>
                  <select
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="SCHEDULED_CRON">Scheduled Queue (Cron / Hourly)</option>
                    <option value="NEW_PCLOUD_FILE">New pCloud File Uploaded</option>
                    <option value="NEW_CONTACT_IMPORTED">New Contact List Imported</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-linear-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:opacity-95 shadow-md shadow-blue-600/20 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Workflow'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
