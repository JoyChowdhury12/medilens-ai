'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useConfirm } from './ConfirmDialog';
import { useT } from '@/lib/i18n';
import Avatar from './Avatar';
import Icon, { Logo } from './Icon';

const NAV = [
  { href: '/', key: 'navHome', icon: 'home' },
  { href: '/trends', key: 'navTrends', icon: 'chart' },
  { href: '/reminders', key: 'navReminders', icon: 'bell' },
  { href: '/family', key: 'navFamily', icon: 'users' },
  { href: '/account', key: 'navAccount', icon: 'user' },
];

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} aria-label="Change language"
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm text-muted hover:bg-wash ${className}`}>
      <Icon name="globe" size={16} />{lang === 'bn' ? 'English' : 'বাংলা'}
    </button>
  );
}

/** Both languages side by side; the chosen one is highlighted. Used on the login and register pages. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div role="radiogroup" aria-label="Language / ভাষা" className={`inline-flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-sm ${className}`}>
      <Icon name="globe" size={18} className="ml-2 mr-1 text-muted" />
      {([['bn', 'বাংলা'], ['en', 'English']] as const).map(([code, label]) => (
        <button key={code} type="button" role="radio" aria-checked={lang === code} onClick={() => setLang(code)}
          className={`min-h-[36px] rounded-full px-4 text-[15px] font-medium transition-colors ${lang === code ? 'bg-brand text-white shadow' : 'text-muted hover:bg-wash hover:text-ink'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Disclaimer() {
  const { t } = useT();
  return <p className="no-print mt-10 border-t border-line pt-4 text-sm text-muted">{t('disclaimer')}</p>;
}

function ProfileSwitcher({ uid }: { uid: string }) {
  const { profiles, current, setCurrentId } = useAuth();
  const { t, lang } = useT();
  if (!current) return null;
  const rel = (r: string) => (t(`rel_${r}`) === `rel_${r}` ? r : t(`rel_${r}`));
  return (
    <div className="relative">
      <label htmlFor={uid} className="sr-only">{t('forWhom')}</label>
      <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"><Avatar name={current.name} size={28} /></div>
      <select id={uid} value={current.id} onChange={(e) => setCurrentId(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pl-11 pr-8 text-base font-medium">
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {rel(p.relation)}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-muted"><Icon name="chevron" size={16} /></span>
      <span className="sr-only">{lang}</span>
    </div>
  );
}

/** Page frame for logged-in pages: sidebar on desktop, top bar and bottom tabs on phones. */
export default function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { ready, user, signOut } = useAuth();
  const { t } = useT();
  const confirm = useConfirm();
  const logout = async () => {
    if (await confirm({ title: t('logoutTitle'), message: t('logoutText'), confirmLabel: t('logoutYes'), icon: 'logout' })) signOut();
  };
  const path = usePathname();
  const router = useRouter();

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  if (!ready || !user) {
    return <div className="p-6"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-40 w-full max-w-3xl" /></div>;
  }
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-white p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
          <Logo /><span className="text-xl font-semibold text-ink">MediLens</span>
        </Link>
        <ProfileSwitcher uid="who-side" />
        <nav className="mt-5 flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base ${active(n.href) ? 'bg-brand-tint font-medium text-brand-dark' : 'text-muted hover:bg-wash hover:text-ink'}`}>
              <Icon name={n.icon} />{t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-line pt-4">
          <Link href="/account" aria-current={path.startsWith('/account') ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-wash ${path.startsWith('/account') ? 'bg-brand-tint' : ''}`}>
            <Avatar name={user.name} src={user.avatar} size={36} />
            <span className="min-w-0 text-sm"><span className="block truncate font-medium">{user.name}</span><span className="block truncate text-muted">{t('navAccount')}</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <button onClick={logout} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-wash">
              <Icon name="logout" size={16} />{t('logout')}
            </button>
          </div>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-2.5 lg:hidden">
        <Link href="/" aria-label="MediLens"><Logo size={30} /></Link>
        <div className="min-w-0 flex-1"><ProfileSwitcher uid="who-top" /></div>
        <Link href="/account" aria-label={t('navAccount')}><Avatar name={user.name} src={user.avatar} size={34} /></Link>
      </header>

      <main className={`mx-auto w-full px-4 py-6 pb-28 lg:px-10 lg:py-9 lg:pb-10 max-w-7xl`}>
        {children}
        <Disclaimer />
      </main>

      {/* Phone bottom tabs */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active(n.href) ? 'font-medium text-brand' : 'text-muted'}`}>
            <Icon name={n.icon} size={22} />{t(n.key)}
          </Link>
        ))}
      </nav>
      <button onClick={logout} className="sr-only">{t('logout')}</button>
    </div>
  );
}
