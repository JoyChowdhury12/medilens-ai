'use client';
import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { Profile, User } from './types';

interface Ctx {
  ready: boolean;
  user: User | null;
  setUser: (u: User | null) => void;
  googleSignIn: (credential: string) => Promise<void>;
  profiles: Profile[];
  current: Profile | null;
  setCurrentId: (id: string) => void;
  reloadProfiles: () => Promise<void>;
  signIn: (path: 'login' | 'register', body: any) => Promise<void>;
  signOut: () => void;
}
const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentId, setId] = useState<string | null>(null);

  const reloadProfiles = useCallback(async () => {
    const list = await api<Profile[]>('/profiles');
    setProfiles(list);
    setId((cur) => {
      let saved: string | null = cur;
      try { saved = saved || localStorage.getItem('ml_profile'); } catch {}
      return list.find((p) => p.id === saved) ? saved : list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { setUser(await api('/auth/me')); await reloadProfiles(); } catch { setToken(null); }
      }
      setReady(true);
    })();
  }, [reloadProfiles]);

  const setCurrentId = (id: string) => { setId(id); try { localStorage.setItem('ml_profile', id); } catch {} };

  const signIn: Ctx['signIn'] = async (path, body) => {
    const r = await api(`/auth/${path}`, { body });
    setToken(r.token);
    setUser(r.user);
    await reloadProfiles();
    router.push('/');
  };
  const googleSignIn = async (credential: string) => {
    const r = await api('/auth/google', { body: { credential } });
    setToken(r.token);
    setUser(r.user);
    await reloadProfiles();
    router.push('/');
  };
  const signOut = () => { setToken(null); setUser(null); setProfiles([]); router.push('/login'); };

  const current = profiles.find((p) => p.id === currentId) ?? null;
  return (
    <AuthCtx.Provider value={{ ready, user, setUser, googleSignIn, profiles, current, setCurrentId, reloadProfiles, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
