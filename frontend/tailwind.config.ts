import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      boxShadow: { panel: '0 1px 2px rgba(22,32,43,0.05)' },
      fontFamily: { sans: ['Inter', '"Noto Sans Bengali"', '"Nirmala UI"', 'system-ui', 'sans-serif'] },
      // Colours are CSS variables (see globals.css) so the dark theme only has to change the values.
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        wash: 'rgb(var(--wash) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        brand: { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', dark: 'rgb(var(--brand-dark) / <alpha-value>)', tint: 'rgb(var(--brand-tint) / <alpha-value>)' },
        ok: { DEFAULT: 'rgb(var(--ok) / <alpha-value>)', tint: 'rgb(var(--ok-tint) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)', tint: 'rgb(var(--warn-tint) / <alpha-value>)' },
        bad: { DEFAULT: 'rgb(var(--bad) / <alpha-value>)', tint: 'rgb(var(--bad-tint) / <alpha-value>)' },
        crit: { DEFAULT: 'rgb(var(--crit) / <alpha-value>)', tint: 'rgb(var(--crit-tint) / <alpha-value>)' },
      },
    },
  },
  plugins: [],
};
export default config;
