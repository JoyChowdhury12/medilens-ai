'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

declare global { interface Window { google?: any } }

/** "Continue with Google". Shows nothing unless the server has GOOGLE_CLIENT_ID set. */
export default function GoogleButton({ onError }: { onError: (m: string) => void }) {
  const { googleSignIn } = useAuth();
  const { lang, t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    api<{ googleClientId: string | null }>('/auth/config').then((c) => setClientId(c.googleClientId)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const draw = () => {
      if (!window.google || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r: any) => googleSignIn(r.credential).catch((e: any) => onError(e.message)),
      });
      box.current.innerHTML = '';
      window.google.accounts.id.renderButton(box.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(box.current.clientWidth || 360, 400),
        locale: lang === 'bn' ? 'bn' : 'en',
      });
    };
    if (window.google) { draw(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.onload = draw;
    document.head.appendChild(s);
  }, [clientId, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!clientId) return null;
  return (
    <div className="mt-6">
      <div ref={box} className="flex min-h-[44px] w-full justify-center" />
      <div className="mt-5 flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />{t('orEmail')}<span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}
