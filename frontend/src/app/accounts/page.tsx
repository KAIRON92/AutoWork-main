"use client";

import { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/shell';
import { accountsService } from '@/services/accountsService';
import { PCloudAccount } from '@/types';
import {
  Cloud,
  Plus,
  CheckCircle2,
  PauseCircle,
  Trash2,
  ShieldCheck,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  KeyRound,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Lock,
  Mail,
  Zap,
  HelpCircle,
} from 'lucide-react';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<PCloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Connection Form State - Defaults to PASSWORD for quick manual account entry
  const [authMode, setAuthMode] = useState<'OAUTH' | 'PASSWORD' | 'CODE' | 'TOKEN'>('PASSWORD');
  const [accountEngine, setAccountEngine] = useState<'pcloud' | 'mock_pcloud'>('pcloud');
  const [name, setName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [oauthCode, setOauthCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(500);
  const [formError, setFormError] = useState('');
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [pcloudAuthNotice, setPcloudAuthNotice] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [oauthBanner, setOauthBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setAccounts(await accountsService.getAll());
    } catch (err: any) {
      console.warn('Accounts data sync notice:', err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();

    // Check for OAuth redirect query parameters in URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('connected');
      const error = params.get('error');
      if (connected === 'pcloud') {
        setOauthBanner({
          type: 'success',
          message: 'pCloud account successfully connected via OAuth 2.0! Credentials are securely encrypted at rest.',
        });
        window.history.replaceState({}, '', window.location.pathname);
      } else if (error) {
        setOauthBanner({
          type: 'error',
          message: `pCloud OAuth connection failed: ${decodeURIComponent(error)}`,
        });
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  const handleOAuthConnect = async () => {
    try {
      setOauthLoading(true);
      setOauthBanner(null);
      setFormError('');

      let redirectTarget = '';
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
        const res = await accountsService.getOAuthUrl(origin);
        if (res?.url) {
          redirectTarget = res.url;
        }
      } catch (err: any) {
        console.warn('Backend getOAuthUrl threw, falling back to direct pCloud URL:', err);
      }

      // Direct fallback if backend did not supply URL
      if (!redirectTarget) {
        const clientId = 'LKgngYPdexJ';
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const callbackUrl = encodeURIComponent(`${origin}/api/v1/pcloud/accounts/oauth/callback`);
        redirectTarget = `https://my.pcloud.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${callbackUrl}`;
      }

      window.location.href = redirectTarget;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to start pCloud OAuth';
      setOauthBanner({ type: 'error', message: msg });
    } finally {
      setOauthLoading(false);
    }
  };

  const handleCodeExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthCode.trim()) {
      setFormError('Please enter the authorization code provided by pCloud.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');
      const newAcc = await accountsService.exchangeOAuthCode({
        code: oauthCode.trim(),
        name: name.trim() || undefined,
        dailyLimit: Number(dailyLimit) || 500,
      });
      setAccounts((prev) => {
        const filtered = prev.filter(
          (a) => a.id !== newAcc.id && a.accountEmail.toLowerCase() !== newAcc.accountEmail.toLowerCase()
        );
        return [newAcc, ...filtered];
      });
      resetModal();
      setOauthBanner({
        type: 'success',
        message: `pCloud Account "${newAcc.name}" (${newAcc.accountEmail}) successfully connected and verified!`,
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to exchange authorization code. Please verify the code and try again.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddDemoAccount = async () => {
    try {
      setDemoLoading(true);
      setOauthBanner(null);
      const demoNum = accounts.length + 1;
      const newAcc = await accountsService.create({
        name: `Demo Sender Pool #${demoNum}`,
        accountEmail: `sender-${demoNum}@pcloud-sandbox.internal`,
        provider: 'mock_pcloud',
        dailyLimit: 500,
      });
      setAccounts((prev) => [newAcc, ...prev]);
      setOauthBanner({
        type: 'success',
        message: `Demo Sender Account "${newAcc.name}" created and active! You can test campaigns, contact lists, and folder sharing right now.`,
      });
      if (isModalOpen) resetModal();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to create demo account.';
      setOauthBanner({ type: 'error', message: msg });
    } finally {
      setDemoLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const updated = await accountsService.toggleStatus(id);
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      console.error('Toggle status failed:', err);
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      setTestingId(id);
      const res = await accountsService.testConnection(id);
      setTestResult({ id, success: res.connected, message: res.message });
      await fetchAccounts();
    } catch (err: any) {
      setTestResult({
        id,
        success: false,
        message: err.response?.data?.message || err.message || 'Connection test failed',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string, name?: string) => {
    const displayName = name || 'this pCloud account';
    if (!window.confirm(`Are you sure you want to disconnect ${displayName}? This will remove the connected sender pool and any unlinked campaign executions.`)) {
      return;
    }
    try {
      setDeletingId(id);
      setOauthBanner(null);
      await accountsService.delete(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setOauthBanner({
        type: 'success',
        message: `Account ${displayName} was successfully disconnected and removed.`,
      });
      await fetchAccounts();
    } catch (err: any) {
      setOauthBanner({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Failed to remove pCloud account.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async (e?: React.FormEvent, overrideEngine?: 'pcloud' | 'mock_pcloud') => {
    if (e) e.preventDefault();
    setFormError('');
    setPcloudAuthNotice(null);

    const credentialToUse = authMode === 'PASSWORD' ? password.trim() : accessToken.trim();
    let engineToUse = overrideEngine || accountEngine;

    const cleanEmail = accountEmail.trim().toLowerCase();
    const effectiveName = name.trim() || `pCloud (${cleanEmail})`;

    if (!cleanEmail || !credentialToUse) {
      setFormError('Please enter both your email address and password / token.');
      return;
    }

    // If verification was required and user entered a code, keep verification state active
    const hasOtp = otpCode.trim().length > 0;

    try {
      setSubmitting(true);
      const newAcc = await accountsService.create({
        name: effectiveName,
        accountEmail: cleanEmail,
        provider: engineToUse,
        accessToken: credentialToUse,
        otpCode: hasOtp ? otpCode.trim() : undefined,
        dailyLimit: Number(dailyLimit) || 500,
      });
      await fetchAccounts();
      resetModal();
      setOauthBanner({
        type: 'success',
        message: engineToUse === 'mock_pcloud'
          ? `Account "${newAcc.name}" (${newAcc.accountEmail}) added and activated! Ready for sharing & campaigns.`
          : `pCloud Account "${newAcc.name}" (${newAcc.accountEmail}) successfully connected and verified!`,
      });
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.verificationRequired || data?.error === 'PCLOUD_VERIFICATION_REQUIRED' || data?.accessTokenRequired || data?.error === 'PCLOUD_ACCESS_TOKEN_REQUIRED') {
        setVerificationNeeded(true);
        if (hasOtp) {
          // User already entered a code but it was wrong/expired
          setFormError('Verification code galat ya expire ho chuka hai. Kripya apne email par bheja gaya naya 6-digit code check karein. (Incorrect or expired verification code).');
        } else {
          setFormError('pCloud security check: Aapke registered email par 6-digit verification code bheja gaya hai. Kripya email check karke neeche code enter karein.');
        }
      } else if (data?.oauthRequired || data?.error === 'PCLOUD_OAUTH_REQUIRED') {
        setPcloudAuthNotice(
          data?.message || 'pCloud recommends connecting via 1-Click OAuth for this account.'
        );
      } else {
        const rawMsg = data?.message || err.message || 'Failed to authenticate with pCloud. Please check your email and password.';
        if (rawMsg.includes('2000') || rawMsg.toLowerCase().includes('incorrect email or password') || rawMsg.toLowerCase().includes('log in failed')) {
          setFormError('Email ya password galat hai (Invalid credentials). Kripya genuine pCloud email aur password verify karein.');
        } else {
          setFormError(rawMsg);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setVerificationNeeded(false);
    setPcloudAuthNotice(null);
    setFormError('');
    setAccountEngine('pcloud');
    setName('');
    setAccountEmail('');
    setPassword('');
    setOtpCode('');
    setOauthCode('');
    setAccessToken('');
    setShowPassword(false);
    setAuthMode('PASSWORD');
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">pCloud Sender Accounts</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <Cloud className="h-3 w-3" /> Multi-Account Verified Pool
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Connect and manage verified pCloud sender accounts to distribute automated sharing quotas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                resetModal();
                setIsModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold shadow-md flex items-center gap-2 hover:opacity-95 transition-all"
            >
              <Plus className="h-4 w-4" /> Add pCloud Account
            </button>
            <button
              onClick={handleOAuthConnect}
              disabled={oauthLoading}
              className="px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-60 shadow-xs"
              title="Connect instantly using official pCloud OAuth 2.0"
            >
              {oauthLoading ? <RefreshCw className="h-4 w-4 animate-spin text-blue-600" /> : <Sparkles className="h-4 w-4 text-blue-600" />}
              OAuth 2.0 Connect
            </button>
            <button
              onClick={handleAddDemoAccount}
              disabled={demoLoading}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium flex items-center gap-1.5 transition-all disabled:opacity-60"
              title="Add an instant dry-run sandbox account to test campaigns"
            >
              {demoLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
              + Demo Account
            </button>
          </div>
        </div>

        {/* Top Notification Banner */}
        {oauthBanner && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200 ${
              oauthBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : oauthBanner.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {oauthBanner.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{oauthBanner.message}</span>
            </div>
            <button onClick={() => setOauthBanner(null)} className="text-xs font-bold hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {testResult && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              <span>{testResult.message}</span>
            </div>
            <button onClick={() => setTestResult(null)} className="text-xs font-bold hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Account Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((acc) => {
            return (
              <div
                key={acc.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600">
                        <Cloud className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-base block">{acc.name}</span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">
                          Verified pCloud Sender
                        </span>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        acc.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${acc.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      {acc.status === 'ACTIVE' ? 'VERIFIED' : acc.status}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 truncate flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{acc.accountEmail}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Engine</span>
                      <span className="font-bold uppercase text-slate-800">
                        pCloud Production
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Daily Limit</span>
                      <span className="font-bold text-slate-800">
                        {acc.sentToday} / {acc.dailyLimit}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Authenticated &amp; Ready for Campaigns</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleTestConnection(acc.id)}
                    disabled={testingId === acc.id}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${testingId === acc.id ? 'animate-spin' : ''}`} />
                    {testingId === acc.id ? 'Testing...' : 'Test Auth'}
                  </button>
                  <button
                    onClick={() => handleToggle(acc.id)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      acc.status === 'ACTIVE'
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {acc.status === 'ACTIVE' ? (
                      <>
                        <PauseCircle className="h-3.5 w-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Activate
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id, acc.name)}
                    disabled={deletingId === acc.id}
                    className="p-2 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    title="Disconnect Account"
                  >
                    {deletingId === acc.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-rose-600" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {!loading && accounts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center mx-auto">
              <Cloud className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">No pCloud Accounts Added Yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Connect your pCloud accounts via 1-Click OAuth or email &amp; password to start sharing documents and launching automated campaigns.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleOAuthConnect}
                disabled={oauthLoading}
                className="px-5 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold shadow-md flex items-center gap-2 hover:opacity-95"
              >
                <Sparkles className="h-4 w-4" />
                Connect via OAuth 2.0 (1-Click)
              </button>
              <button
                onClick={() => {
                  resetModal();
                  setIsModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-xs"
              >
                <Plus className="h-4 w-4" />
                Add with Credentials
              </button>
              <button
                onClick={handleAddDemoAccount}
                disabled={demoLoading}
                className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-2"
              >
                <Zap className="h-4 w-4 text-amber-600" />
                Add Demo Account
              </button>
            </div>
          </div>
        )}

        {/* Modal: Add pCloud Account */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Connect pCloud Account</h3>
                    <p className="text-xs text-slate-500">Choose your preferred connection method</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetModal}
                  className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1"
                >
                  &times;
                </button>
              </div>

              {/* Method Selector Tabs */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('PASSWORD');
                    setFormError('');
                    setPcloudAuthNotice(null);
                  }}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    authMode === 'PASSWORD' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  ID &amp; Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('OAUTH');
                    setFormError('');
                    setPcloudAuthNotice(null);
                  }}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    authMode === 'OAUTH' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  1-Click OAuth
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('TOKEN');
                    setFormError('');
                    setPcloudAuthNotice(null);
                  }}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    authMode === 'TOKEN' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Access Token
                </button>
              </div>

              {/* pCloud Security Notice Banner (Triggered when 1022 or OAuth enforcement happens) */}
              {pcloudAuthNotice && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-4 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-blue-950">pCloud Security Notice</p>
                      <p className="text-[11px] text-blue-800 leading-relaxed">{pcloudAuthNotice}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOAuthConnect}
                    disabled={oauthLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    {oauthLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Connect with 1-Click OAuth Now
                  </button>
                </div>
              )}

              {/* Generic Form Error Banner */}
              {formError && (
                <div
                  className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                    verificationNeeded
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {verificationNeeded ? (
                      <KeyRound className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="font-medium leading-relaxed">{formError}</span>
                  </div>
                </div>
              )}

              {/* TAB 1: 1-Click Official OAuth Flow */}
              {authMode === 'OAUTH' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 space-y-2.5">
                    <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      Official 1-Click Authorization (Recommended)
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed">
                      pCloud mandates OAuth 2.0 for third-party file automation. Authorize securely without sharing your raw password.
                    </p>
                    <button
                      type="button"
                      onClick={handleOAuthConnect}
                      disabled={oauthLoading}
                      className="w-full mt-2 py-3 px-4 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all disabled:opacity-60"
                    >
                      {oauthLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Opening pCloud Authorization...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4" />
                          Authorize with pCloud (1-Click)
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="grow border-t border-slate-200"></div>
                    <span className="shrink mx-3 text-slate-400 text-[11px] font-medium">Or Enter Authorization Code</span>
                    <div className="grow border-t border-slate-200"></div>
                  </div>

                  <form onSubmit={handleCodeExchange} className="space-y-3">
                    <div>
                      <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                        Account Friendly Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sender Account 1"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                        pCloud Authorization Code *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Paste authorization code here"
                        value={oauthCode}
                        onChange={(e) => setOauthCode(e.target.value)}
                        className="w-full text-xs font-mono border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        disabled={submitting}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        If pCloud displayed a code on screen, paste it here to link your account immediately.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || !oauthCode.trim()}
                      className="w-full py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {submitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Verify &amp; Add Account
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 2: ID & Password Login Form */}
              {authMode === 'PASSWORD' && (
                <form onSubmit={handleCreate} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      Account Friendly Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Outreach Sender 1"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      pCloud Registered Email / User ID *
                    </label>
                    <div className="relative">
                      <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="user@pcloud.com"
                        value={accountEmail}
                        onChange={(e) => setAccountEmail(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      pCloud Password *
                    </label>
                    <div className="relative">
                      <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl pl-9 pr-10 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        disabled={submitting}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label="Toggle password"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {verificationNeeded && (
                    <div className="p-4 rounded-xl border-2 border-amber-400 bg-amber-50 space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-xs">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-200 text-amber-900">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div>
                          <label className="block text-amber-950 font-bold uppercase text-[11px] tracking-wide">
                            6-Digit Verification Code (OTP) *
                          </label>
                          <p className="text-[11px] text-amber-800">
                            Sent to <strong className="text-amber-950">{accountEmail}</strong>
                          </p>
                        </div>
                      </div>
                      <input
                        type="text"
                        required
                        autoFocus
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="Enter 6-digit code"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.trim())}
                        className="w-full text-center text-lg font-mono font-bold tracking-[0.25em] border-2 border-amber-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-inner"
                        disabled={submitting}
                      />
                      <div className="flex items-center justify-between text-[11px] text-amber-900">
                        <span>Check your spam folder if not in inbox</span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpCode('');
                            handleCreate();
                          }}
                          disabled={submitting}
                          className="font-semibold text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                        >
                          Resend / Request New Code
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      Daily Share / Transfer Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500"
                      disabled={submitting}
                    />
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={resetModal}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 hover:opacity-95 disabled:opacity-60 transition-all cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          {verificationNeeded ? 'Verifying Code...' : 'Authenticating...'}
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          {verificationNeeded ? 'Verify Code & Connect' : 'Verify & Connect Account'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: Personal Access Token (Manual) */}
              {authMode === 'TOKEN' && (
                <form onSubmit={handleCreate} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      Account Friendly Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sender Account 1"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      pCloud Registered Email *
                    </label>
                    <div className="relative">
                      <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="user@pcloud.com"
                        value={accountEmail}
                        onChange={(e) => setAccountEmail(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-cyan-500"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      pCloud Access Token (Bearer Token) *
                    </label>
                    <div className="relative">
                      <KeyRound className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        required
                        placeholder="Paste pCloud Bearer Token"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 font-mono focus:ring-2 focus:ring-cyan-500"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1 text-[11px]">
                      Daily Share / Transfer Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500"
                      disabled={submitting}
                    />
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={resetModal}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 hover:opacity-95 disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Verifying Token...
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Verify &amp; Connect Account
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
