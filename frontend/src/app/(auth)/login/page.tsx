"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { Cloud, Mail, Lock, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('registered') === 'true') {
        const regEmail = searchParams.get('email');
        if (regEmail) {
          setEmail(decodeURIComponent(regEmail));
        }
        setSuccessMsg('Account registered successfully! Enter your password to sign in.');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Enter your email address and password.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      await authService.login({ email: email.trim(), password });
      const searchParams = new URLSearchParams(window.location.search);
      let target = searchParams.get('redirect') || '/dashboard';
      if (
        !target ||
        target.startsWith('/login') ||
        target.startsWith('/register') ||
        target.startsWith('/logout') ||
        target.startsWith('/forgot-password')
      ) {
        target = '/dashboard';
      }
      window.location.href = target;
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
        err.message ||
        'Invalid email or password. Please verify your credentials and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-linear-to-tr from-blue-600 to-cyan-500 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
            <Cloud className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Welcome to Autowork.com</h1>
          <p className="text-xs text-slate-400">pCloud Document Sharing & Campaign Orchestrator</p>
        </div>

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-300 text-xs font-medium flex items-center gap-2.5" role="status">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs text-center" role="alert">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="login-email" className="block text-slate-300 font-semibold uppercase mb-1">Email Address</label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-password" className="block text-slate-300 font-semibold uppercase">Password</label>
              <Link href="/forgot-password" className="text-[11px] text-cyan-400 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-11 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-linear-to-r from-blue-600 to-cyan-600 hover:opacity-95 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 mt-4 cursor-pointer"
          >
            <span>{isLoading ? 'Signing in...' : 'Sign In to Command Center'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-400 pt-3 border-t border-slate-800 space-y-2">
          <div>Don't have an account yet?</div>
          <Link
            href="/register"
            className="block w-full py-2.5 px-4 bg-slate-800/90 hover:bg-slate-800 text-cyan-400 font-bold rounded-xl text-xs border border-slate-700 transition-colors"
          >
            Register New Custom Workspace &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

