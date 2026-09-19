"use client";

import { useEffect, useState, useRef } from 'react';
import { Bell, Search, Building2, ChevronDown, LogOut, Settings, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { User, Organization } from '@/types';

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    authService.getCurrentUser().then((result) => {
      if (!active || !result) return;
      setUser(result.user);
      if (result.organization) setOrganization(result.organization);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await authService.logout();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'AU';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      <div className="flex items-center gap-3 w-96">
        <div className="relative w-full">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search campaigns, contacts, templates..."
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
          <Building2 className="h-4 w-4 text-blue-600" />
          <span>{organization?.name || 'Loading organization...'}</span>
        </div>

        <button className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 relative transition-colors" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>

        {/* User Menu & Dropdown */}
        <div className="relative pl-2 border-l border-slate-200" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none"
            aria-expanded={dropdownOpen}
          >
            <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-slate-800 leading-none">
                {user ? `${user.firstName} ${user.lastName}` : 'Account'}
              </p>
              <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5 max-w-30 truncate">
                {user?.email || 'Logged In'}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-slate-700 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {user ? `${user.firstName} ${user.lastName}` : 'Logged In User'}
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{user?.email}</p>
                {organization && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">Org: {organization.name}</span>
                  </div>
                )}
              </div>

              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  <span>Account Settings</span>
                </Link>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4 text-rose-500" />
                  <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Instant Log Out button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="Log Out"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5 text-rose-600" />
          <span className="hidden md:inline">Log Out</span>
        </button>
      </div>
    </header>
  );
}
