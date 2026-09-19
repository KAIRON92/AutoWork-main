"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { Zap, Mail, Lock, Building2, User, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Please provide your email address and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      const cleanEmail = email.trim().toLowerCase();
      const cleanFirst = firstName.trim() || 'Admin';
      const cleanLast = lastName.trim() || 'User';
      const cleanOrg = orgName.trim() || `${cleanFirst}'s Workspace`;

      await authService.register({
        organizationName: cleanOrg,
        firstName: cleanFirst,
        lastName: cleanLast,
        email: cleanEmail,
        password,
      });

      setSuccessMsg('Account registered successfully! Redirecting to Sign In...');
      setTimeout(() => {
        window.location.href = `/login?registered=true&email=${encodeURIComponent(cleanEmail)}`;
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
      setErrorMsg(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-linear-to-tr from-blue-600 to-indigo-500 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Create Your Account</h1>
          <p className="text-xs text-slate-400">Initialize a dedicated workspace & start testing AutoWork</p>
        </div>

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-300 text-xs font-medium flex items-center gap-2.5" role="status">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs text-center space-y-1.5" role="alert">
            <div>{errorMsg}</div>
            {errorMsg.toLowerCase().includes('already exists') && (
              <div>
                <Link href={`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`} className="text-cyan-400 underline font-semibold">
                  Click here to Sign In with this email &rarr;
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold uppercase mb-1">Organization / Company Name</label>
            <div className="relative">
              <Building2 className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="My Company (Optional)"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-300 font-semibold uppercase mb-1">First Name</label>
              <div className="relative">
                <User className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Alex"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold uppercase mb-1">Last Name</label>
              <input
                type="text"
                placeholder="Morgan"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold uppercase mb-1">Email Address *</label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold uppercase mb-1">Password *</label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="register-password"
                name="new-password"
                autoComplete="new-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="Unique password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-10 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 mt-4 cursor-pointer"
          >
            <span>{isLoading ? 'Registering Account...' : 'Register Account & Go to Sign In'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-800">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-400 font-semibold hover:underline">
            Sign In &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
