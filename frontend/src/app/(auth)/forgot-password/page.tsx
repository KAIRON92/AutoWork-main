"use client";

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/services/apiClient';
import { Cloud, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      setLoading(true);
      await apiClient.post('/v1/auth/forgot-password', { email });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // Always display success confirmation for security
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="h-12 w-12 rounded-2xl bg-linear-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mx-auto">
          <Cloud className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Reset Your Password</h2>
        <p className="text-xs text-slate-400">Enter your email to receive recovery instructions.</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 space-y-6">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-white">Check Your Inbox</p>
              <p className="text-xs text-slate-400">
                If an account exists for <strong className="text-slate-200">{email}</strong>, we have sent instructions to reset your password.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 pt-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs text-white bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-linear-to-r from-blue-600 to-cyan-600 hover:opacity-95 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-600/30 transition-all"
              >
                {loading ? 'Sending instructions...' : 'Send Reset Instructions'}
              </button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
