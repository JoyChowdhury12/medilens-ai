'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import Icon, { Logo } from './Icon';
import GoogleButton from './GoogleButton';
import { LangSwitch } from './Shell';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useT();
  const { signIn, user, ready } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => { if (ready && user) router.replace('/'); }, [ready, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await signIn(mode, mode === 'login' ? { email: f.email, password: f.password } : f);
    } catch (x: any) { setErr(x.message || t('genericError')); setBusy(false); }
  }

  const reg = mode === 'register';
  const field = 'h-12 w-full rounded-lg border-line px-4 text-[17px] transition-shadow focus:border-brand focus:shadow-[0_0_0_4px_rgba(14,110,140,0.12)]';
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Left: what the app does, with a preview of a result */}
      <aside className="relative hidden overflow-hidden bg-brand-dark text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/5" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative flex items-center gap-3 px-12 pt-10"><Logo size={40} /><span className="text-2xl font-semibold">MediLens</span></div>

        <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-12 py-12">
          <h2 className="text-[2.6rem] font-bold leading-tight">{t('heroTitle')}</h2>
          <ul className="mt-8 space-y-4 text-lg">
            {[['camera', 'hero1'], ['sparkle', 'hero2'], ['users', 'hero3']].map(([icon, k]) => (
              <li key={k} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><Icon name={icon} size={20} /></span>
                <span className="pt-1.5 text-white/90">{t(k)}</span>
              </li>
            ))}
          </ul>

          {/* preview card: what a result looks like */}
          <div className="mt-10 rounded-2xl bg-white p-5 text-ink shadow-2xl shadow-black/20">
            <p className="text-sm font-medium text-muted">{t('previewTitle')}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-lg font-semibold">{t('previewTest')}</span>
              <span className="flex items-center gap-2">
                <span className="text-xl font-semibold tabular-nums">9.1 <span className="text-sm font-normal text-muted">g/dL</span></span>
                <span className="inline-flex items-center gap-1 rounded-md bg-bad-tint px-2 py-0.5 text-sm font-medium text-bad"><Icon name="arrowDown" size={14} />{t('previewLow')}</span>
              </span>
            </div>
            <div className="relative mt-3 h-2 rounded-full bg-line" aria-hidden="true">
              <div className="absolute inset-y-0 left-[40%] right-[22%] rounded-full bg-ok/30" />
              <div className="absolute -top-1 left-[24%] h-4 w-1 rounded bg-bad" />
            </div>
            <p className="mt-3 border-l-2 border-brand/30 pl-3 text-[15px] leading-relaxed">{t('previewText')}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Icon name="user" size={16} />{t('previewDoctor')}</p>
          </div>
        </div>

        <p className="relative flex gap-3 px-12 pb-10 text-sm text-white/75"><Icon name="shield" className="shrink-0" size={20} />{t('privacyNote')}</p>
      </aside>

      {/* Right: the form, in a card */}
      <main className="flex min-h-screen flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center lg:hidden">
          <span className="flex items-center gap-2.5"><Logo size={34} /><span className="text-xl font-semibold">MediLens</span></span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-8">
          {/* language choice right above the card, where people look first */}
          <div className="mb-4 flex w-full max-w-[480px] justify-end"><LangSwitch /></div>
          <div className="w-full max-w-[480px] rounded-2xl border border-line bg-white p-6 shadow-[0_8px_30px_rgba(22,32,43,0.08)] sm:p-10">
            <h1 className="text-3xl font-bold sm:text-[2rem]">{reg ? t('createTitle') : t('welcomeBack')}</h1>
            <p className="mt-2 text-[17px] text-muted">{reg ? t('registerIntro') : t('loginIntro')}</p>

            <GoogleButton onError={setErr} />

            <form onSubmit={submit} className="mt-6 space-y-5">
              {reg && (
                <div><label htmlFor="name" className="mb-1.5 text-[15px] text-ink">{t('yourName')}</label>
                  <input id="name" className={field} required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
              )}
              <div><label htmlFor="email" className="mb-1.5 text-[15px] text-ink">{t('email')}</label>
                <input id="email" type="email" className={field} required value={f.email} placeholder="name@example.com"
                  onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></div>
              <div><label htmlFor="pw" className="mb-1.5 text-[15px] text-ink">{t('password')}</label>
                <div className="relative">
                  <input id="pw" type={showPw ? 'text' : 'password'} className={`${field} pr-12`} required minLength={reg ? 8 : 1} value={f.password}
                    onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={reg ? 'new-password' : 'current-password'} />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? t('hidePw') : t('showPw')} title={showPw ? t('hidePw') : t('showPw')}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted hover:text-ink">
                    <Icon name={showPw ? 'eyeOff' : 'eye'} size={20} />
                  </button>
                </div>
                {reg && <p className="mt-1.5 text-sm text-muted">{t('passwordHint')}</p>}</div>
              {err && <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad-tint px-3.5 py-2.5 text-bad"><Icon name="alert" size={18} className="mt-1 shrink-0" />{err}</p>}
              <button className="btn h-12 w-full gap-2 rounded-lg text-[17px]" disabled={busy}>
                {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {busy ? t('working') : reg ? t('register') : t('login')}
              </button>
            </form>

            <p className="mt-6 text-center text-muted">
              {reg ? t('haveAccount') : t('noAccount')}{' '}
              <Link className="link font-medium" href={reg ? '/login' : '/register'}>{reg ? t('login') : t('register')}</Link>
            </p>
          </div>
        </div>
        <p className="mx-auto flex max-w-[480px] gap-2 text-sm text-muted lg:hidden"><Icon name="shield" className="mt-0.5 shrink-0" size={18} />{t('privacyNote')}</p>
      </main>
    </div>
  );
}
