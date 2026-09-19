"use client";

import { useEffect, useState } from 'react';
import { Shell } from '@/components/layout/shell';
import { emailAccountsService, EmailAccount } from '@/services/emailAccountsService';
import { accountsService } from '@/services/accountsService';
import { PCloudAccount } from '@/types';
import {
  Mail,
  ShieldCheck,
  Trash2,
  Send,
  RefreshCw,
  Server,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Cloud,
} from 'lucide-react';

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [pcloudAccounts, setPCloudAccounts] = useState<PCloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modal States
  const [showCustomSmtpModal, setShowCustomSmtpModal] = useState(false);
  const [showGoogleConfigModal, setShowGoogleConfigModal] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [savingGoogleConfig, setSavingGoogleConfig] = useState(false);

  // Advanced Custom SMTP Form State
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    accountEmail: '',
    fromName: '',
  });
  const [smtpError, setSmtpError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [emailData, pcloudData] = await Promise.all([
        emailAccountsService.getAll(),
        accountsService.getAll().catch(() => [] as PCloudAccount[]),
      ]);
      setAccounts(emailData);
      setPCloudAccounts(pcloudData);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error?.response?.data?.message || 'Unable to load sender accounts',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();

    // Check for query parameters on callback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'gmail') {
        setMessage({
          type: 'success',
          text: 'Google/Gmail account connected and verified successfully!',
        });
        window.history.replaceState({}, '', window.location.pathname);
      } else if (params.get('error')) {
        setMessage({
          type: 'error',
          text: decodeURIComponent(params.get('error') || 'Gmail connection failed'),
        });
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // 1-Click Official Google OAuth (No 16-character App Password needed)
  const connectGoogleOAuth = async () => {
    setBusy('gmail_oauth');
    setMessage(null);
    try {
      const { url } = await emailAccountsService.getGmailOAuthUrl();
      window.location.href = url;
    } catch (error: any) {
      const msg = error?.response?.data?.message || '';
      // If OAuth credentials aren't set in backend, open the friendly Google Client ID setup modal
      if (msg.includes('not configured') || msg.includes('GMAIL_CLIENT_ID')) {
        setShowGoogleConfigModal(true);
      } else {
        setMessage({ type: 'error', text: msg || 'Failed to start Google sign-in' });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleSaveGoogleConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = googleClientId.trim();
    const trimmedSecret = googleClientSecret.trim();

    if (!trimmedId || !trimmedSecret) {
      setMessage({ type: 'error', text: 'Please enter both Google Client ID and Client Secret.' });
      return;
    }

    if (trimmedId.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Invalid Client ID! Do NOT enter your email address here. A Google OAuth Client ID comes from Google Cloud Console and ends with .apps.googleusercontent.com',
      });
      return;
    }

    if (!trimmedId.endsWith('.apps.googleusercontent.com')) {
      setMessage({
        type: 'error',
        text: 'Google Client ID must end with .apps.googleusercontent.com (from Google Cloud Console).',
      });
      return;
    }

    try {
      setSavingGoogleConfig(true);
      await emailAccountsService.saveGmailConfig(trimmedId, trimmedSecret);
      setShowGoogleConfigModal(false);
      setMessage({
        type: 'success',
        text: 'Google Sign-In activated! Redirecting to Google...',
      });
      const { url } = await emailAccountsService.getGmailOAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Failed to save Google configuration.',
      });
    } finally {
      setSavingGoogleConfig(false);
    }
  };

  // Advanced Custom SMTP Form Submission
  const handleCreateSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpError('');

    const cleanEmail = smtpForm.accountEmail.trim().toLowerCase();
    const existing = accounts.find((a) => a.accountEmail.toLowerCase() === cleanEmail);
    if (existing) {
      setSmtpError(`The account "${cleanEmail}" is already added to your pool.`);
      return;
    }

    setBusy('smtp_create');
    try {
      await emailAccountsService.createCustomSmtp({
        ...smtpForm,
        accountEmail: cleanEmail,
        port: Number(smtpForm.port) || 587,
      });
      setShowCustomSmtpModal(false);
      setSmtpForm({ host: '', port: 587, secure: false, user: '', pass: '', accountEmail: '', fromName: '' });
      setMessage({
        type: 'success',
        text: `Custom SMTP sender "${cleanEmail}" verified and added successfully.`,
      });
      await load();
    } catch (err: any) {
      setSmtpError(err?.response?.data?.message || 'Failed to verify SMTP connection. Check host, port, and credentials.');
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async (account: EmailAccount) => {
    const to = window.prompt(`Send test email from ${account.accountEmail} to:`);
    if (!to || !to.trim()) return;
    setBusy(account.id);
    setMessage(null);
    try {
      const response = await emailAccountsService.sendTestEmail(account.id, to.trim());
      setMessage({
        type: 'success',
        text: `Test email sent successfully to ${to.trim()}! Provider ID: ${response.messageId || 'OK'}`,
      });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error?.response?.data?.message || 'Failed to send test email.',
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (account: EmailAccount) => {
    if (!window.confirm(`Disconnect "${account.accountEmail}" from AutoWork?`)) return;
    setBusy(account.id);
    try {
      await emailAccountsService.remove(account.id);
      setMessage({
        type: 'info',
        text: `Account "${account.accountEmail}" has been removed.`,
      });
      await load();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error?.response?.data?.message || 'Unable to remove sender account.',
      });
    } finally {
      setBusy(null);
    }
  };

  const uniqueAccounts = accounts.filter(
    (acc, idx, self) => idx === self.findIndex((a) => a.accountEmail.toLowerCase() === acc.accountEmail.toLowerCase())
  );

  return (
    <Shell>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Email Sender Mailboxes</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <Mail className="h-3 w-3" /> Multi-Account Verified Pool
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Add your Google / Gmail accounts via 1-Click Sign-In to distribute outreach emails and document notifications.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary: 1-Click Google OAuth */}
            <button
              onClick={connectGoogleOAuth}
              disabled={busy === 'gmail_oauth'}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-2 shadow-xs transition-all hover:border-slate-400"
              title="Connect via official Google sign-in (1-Click)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {busy === 'gmail_oauth' ? 'Connecting Google...' : 'Sign in with Google'}
            </button>

          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150 ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : message.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-xs font-bold hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* pCloud Auto-Sync Banner */}
        <div className="p-4 bg-gradient-to-r from-blue-50 via-cyan-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs shrink-0">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900">Automatic pCloud Mailbox Integration</h4>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Every pCloud storage account you add automatically configures its email here as a verified sender mailbox. Recipients get authentic delivery directly from your linked accounts!
              </p>
            </div>
          </div>
          <a
            href="/accounts"
            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-xl shrink-0 transition-colors shadow-xs text-center"
          >
            Manage pCloud Accounts &rarr;
          </a>
        </div>

        {/* Accounts Pool Card */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Connected Sender Mailboxes ({uniqueAccounts.length})
            </div>
            <div className="text-xs text-slate-400 font-medium">
              Round-robin rotation pool
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              Loading connected sender mailboxes...
            </div>
          ) : uniqueAccounts.length === 0 ? (
            <div className="p-12 text-center space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">No Email Sender Accounts Added Yet</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Add your Google / Gmail accounts or connect your pCloud account to start distributing emails and document links to your campaigns.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={connectGoogleOAuth}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs"
                >
                  <Sparkles className="h-4 w-4" />
                  Sign in with Google (1-Click)
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {uniqueAccounts.map((account) => {
                const isLinkedToPCloud = pcloudAccounts.some(
                  (p) => p.accountEmail.toLowerCase() === account.accountEmail.toLowerCase()
                );

                return (
                  <div key={account.id} className="p-5 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm uppercase">
                        {account.accountEmail.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">
                            {account.displayName || account.accountEmail}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                            account.provider === 'gmail'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {account.provider === 'gmail' ? 'Google / Gmail' : account.provider}
                          </span>
                          {isLinkedToPCloud && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 flex items-center gap-1">
                              <Cloud className="h-3 w-3 text-cyan-600" /> Linked to pCloud
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            READY
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{account.accountEmail}</div>
                      </div>
                    </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void sendTest(account)}
                      disabled={busy === account.id}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-xs"
                    >
                      <Send className="h-3.5 w-3.5 text-blue-600" />
                      Test Send
                    </button>
                    <button
                      onClick={() => void remove(account)}
                      disabled={busy === account.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                      title="Disconnect sender"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>

        {/* Collapsible: Advanced Custom Corporate SMTP */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-700">Need a Custom Corporate SMTP Relay?</span>
              <span className="text-[10px] text-slate-400 font-normal">(SendGrid, Mailgun, AWS SES, or private mail server)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomSmtpModal(true)}
              className="text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1"
            >
              Configure Custom SMTP <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Modal 2: Advanced Custom Corporate SMTP */}
        {showCustomSmtpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-blue-600" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Custom Corporate SMTP Server</h3>
                    <p className="text-xs text-slate-500">For private mail servers, SendGrid, Mailgun, or AWS SES</p>
                  </div>
                </div>
                <button onClick={() => setShowCustomSmtpModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1">
                  &times;
                </button>
              </div>

              {smtpError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{smtpError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSmtp} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">From Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="outreach@company.com"
                      value={smtpForm.accountEmail}
                      onChange={(e) => setSmtpForm({ ...smtpForm, accountEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Display Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="Alex Morgan"
                      value={smtpForm.fromName || ''}
                      onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">SMTP Server Host *</label>
                    <input
                      type="text"
                      required
                      placeholder="smtp.sendgrid.net / mail.company.com"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Port *</label>
                    <input
                      type="number"
                      required
                      placeholder="587"
                      value={smtpForm.port}
                      onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">SMTP Username *</label>
                    <input
                      type="text"
                      required
                      placeholder="apikey or user@company.com"
                      value={smtpForm.user}
                      onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">SMTP Password / API Key *</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={smtpForm.pass}
                      onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowCustomSmtpModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy === 'smtp_create'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {busy === 'smtp_create' ? 'Verifying Handshake...' : 'Verify & Connect Sender'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal 3: Setup Google 1-Click Sign-In */}
        {showGoogleConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Enable Google 1-Click Sign-In</h3>
                    <p className="text-xs text-slate-500">Pure Google Sign-In &bull; No 16-character passwords</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGoogleConfigModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
                >
                  &times;
                </button>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Do NOT enter your personal Gmail address or password here!
                </p>
                <p className="text-[10px] text-amber-700 leading-normal">
                  Google requires a <strong>Google Cloud OAuth Client ID</strong> (e.g. <code>123456...apps.googleusercontent.com</code>). Once configured once, all users can click &ldquo;Sign in with Google&rdquo; directly.
                </p>
              </div>

              <form onSubmit={handleSaveGoogleConfig} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Google OAuth Client ID *
                    <span className="text-[10px] text-slate-400 font-normal ml-1">(ends with .apps.googleusercontent.com)</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 742189345-abcdefg12345.apps.googleusercontent.com"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={savingGoogleConfig}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Google OAuth Client Secret *
                    <span className="text-[10px] text-slate-400 font-normal ml-1">(starts with GOCSPX-)</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="GOCSPX-••••••••••••"
                    value={googleClientSecret}
                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={savingGoogleConfig}
                  />
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
                  <p className="font-semibold">Authorized Redirect URI to set in Google Cloud Console:</p>
                  <code className="block p-1.5 bg-white border border-blue-200 rounded-md font-mono text-[10px] select-all break-all">
                    http://localhost:4000/api/v1/email/accounts/gmail/callback
                  </code>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowGoogleConfigModal(false)}
                    className="text-slate-500 hover:text-slate-700 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingGoogleConfig}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {savingGoogleConfig ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Saving &amp; Connecting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Save &amp; Connect with Google
                      </>
                    )}
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
