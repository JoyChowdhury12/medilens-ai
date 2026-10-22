'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import Icon, { Logo } from './Icon';
import GoogleButton from './GoogleButton';
import { LangToggle } from './Shell';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useT();
  const { signIn, user, ready } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && user) router.replace('/'); }, [ready, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await signIn(mode, mode === 'login' ? { email: f.email, password: f.password } : f);
    } catch (x: any) { setErr(x.message || t('genericError')); setBusy(false); }
  }

  const reg = mode === 'register';
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Left: what the app does */}
      <aside className="hidden bg-brand-dark p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><Logo size={36} /><span className="text-2xl font-semibold">MediLens</span></div>
        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">{t('heroTitle')}</h2>
          <ul className="mt-8 space-y-4 text-lg text-white/90">
            {['hero1', 'hero2', 'hero3'].map((k) => (
              <li key={k} className="flex gap-3"><Icon name="check" className="mt-1.5 shrink-0 text-white/70" size={18} />{t(k)}</li>
            ))}
          </ul>
        </div>
        <p className="flex max-w-md gap-3 text-sm text-white/75"><Icon name="shield" className="shrink-0" size={20} />{t('privacyNote')}</p>
      </aside>

      {/* Right: form */}
      <main className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <span className="flex items-center gap-2.5 lg:invisible"><Logo size={32} /><span className="text-xl font-semibold">MediLens</span></span>
          <LangToggle />
        </div>
        <h1 className="text-3xl">{reg ? t('register') : t('login')}</h1>
        <p className="mt-1 text-muted">{t('loginIntro')}</p>
        <GoogleButton onError={setErr} />
        <form onSubmit={submit} className="mt-6 space-y-4">
          {reg && (
            <div><label htmlFor="name">{t('yourName')}</label>
              <input id="name" className="w-full" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
          )}
          <div><label htmlFor="email">{t('email')}</label>
            <input id="email" type="email" className="w-full" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></div>
          <div><label htmlFor="pw">{t('password')}</label>
            <input id="pw" type="password" className="w-full" required minLength={reg ? 8 : 1} value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={reg ? 'new-password' : 'current-password'} />
            {reg && <p className="mt-1 text-sm text-muted">{t('passwordHint')}</p>}</div>
          {err && <p role="alert" className="rounded bg-bad-tint px-3 py-2 text-bad">{err}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? t('working') : reg ? t('register') : t('login')}</button>
        </form>
        <p className="mt-6 text-muted">
          {reg ? t('haveAccount') : t('noAccount')}{' '}
          <Link className="link" href={reg ? '/login' : '/register'}>{reg ? t('login') : t('register')}</Link>
        </p>
        <p className="mt-10 text-sm text-muted lg:hidden">{t('privacyNote')}</p>
      </main>
    </div>
  );
}
