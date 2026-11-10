'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'medilens-theme';

/** Applies or removes the dark class on <html>. */
function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new Event('medilens-theme'));
}

/** Dark mode switch: remembers the choice on this device and otherwise follows the device setting. */
export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains('dark'));
    read();
    window.addEventListener('medilens-theme', read);
    return () => window.removeEventListener('medilens-theme', read);
  }, []);
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    apply(next);
    try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch { /* private mode: still works for this visit */ }
  }, []);
  return { dark, toggle };
}

const SIZE_KEY = 'medilens-size';
const SIZES = [100, 115, 130];

/** Text size switch (normal / large / extra large): helps older readers. Remembered on this device. */
export function useTextSize() {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const cur = parseInt(document.documentElement.style.fontSize || '100', 10);
    setLevel(Math.max(0, SIZES.indexOf(cur)));
  }, []);
  const next = useCallback(() => {
    setLevel((l) => {
      const n = (l + 1) % SIZES.length;
      document.documentElement.style.fontSize = SIZES[n] + '%';
      try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* ignore */ }
      return n;
    });
  }, []);
  return { level, next };
}

/** Script run before the page paints, so there is no white flash when dark mode is on. */
export const THEME_INIT = `try{var s=localStorage.getItem('${KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');var z=localStorage.getItem('${SIZE_KEY}');if(z)document.documentElement.style.fontSize=[100,115,130][+z]+'%'}catch(e){}`;

/** Colours for SVG charts (CSS variables do not work inside SVG attributes). */
export function useChartColors() {
  const { dark } = useTheme();
  return dark
    ? { ok: '#5ec887', warn: '#f0b750', bad: '#fa8276', crit: '#ff9696', ink: '#e6ecf2', muted: '#9ba8b5', line: '#34414f', okTint: '#123424', surface: '#161e27', brand: '#4fb3d0', amber: '#f0b750' }
    : { ok: '#2b7a4b', warn: '#a86a00', bad: '#b42318', crit: '#7a0e0e', ink: '#1b2430', muted: '#5b6673', line: '#dde2e8', okTint: '#e8f4ec', surface: '#ffffff', brand: '#0e6e8c', amber: '#d9a441' };
}
