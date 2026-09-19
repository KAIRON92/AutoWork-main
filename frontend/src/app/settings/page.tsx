"use client";

import { useEffect, useState } from 'react';
import { Shell } from '@/components/layout/shell';
import { authService } from '@/services/authService';
import { apiClient } from '@/services/apiClient';
import { Building2, User } from 'lucide-react';
import { Organization, User as AppUser } from '@/types';

export default function SettingsPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      authService.getCurrentUser(),
      apiClient.get('/v1/organizations/me'),
    ])
      .then(([session, orgResponse]) => {
        if (!active) return;
        setUser(session?.user || null);
        setOrganization(orgResponse.data || session?.organization || null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <Shell><div className="max-w-4xl mx-auto"><div className="bg-white p-6 rounded-2xl border border-slate-200">Loading settings…</div></div></Shell>;
  }

  return (
    <Shell>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organization & User Settings</h1>
          <p className="text-sm text-slate-500 mt-1">View your authenticated profile and tenant configuration.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Organization</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">Organization Name</label>
              <input type="text" readOnly value={organization?.name || 'Unavailable'} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">Organization Slug</label>
              <input type="text" readOnly value={organization?.slug || 'Unavailable'} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Authenticated User</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">Full Name</label>
              <input type="text" readOnly value={user ? `${user.firstName} ${user.lastName}` : 'Unavailable'} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">Email Address</label>
              <input type="text" readOnly value={user?.email || 'Unavailable'} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">Role</label>
              <input type="text" readOnly value={user?.role || 'Unavailable'} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-semibold text-slate-800" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-rose-200/70 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Session & Security</h2>
              <p className="text-xs text-slate-500 mt-0.5">End your current session across this device.</p>
            </div>
            <button
              onClick={async () => {
                await authService.logout();
                window.location.href = '/login';
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              Log Out Now
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
