import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: { panel: '0 1px 2px rgba(22,32,43,0.05)' },
      fontFamily: { sans: ['"Hind Siliguri"', '"Nirmala UI"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#1b2430',
        muted: '#5b6673',
        line: '#dde2e8',
        wash: '#f5f7f9',
        canvas: '#f3f6f8',
        brand: { DEFAULT: '#0e6e8c', dark: '#0a566e', tint: '#e6f2f6' },
        ok: { DEFAULT: '#2b7a4b', tint: '#e8f4ec' },
        warn: { DEFAULT: '#a86a00', tint: '#fdf3e0' },
        bad: { DEFAULT: '#b42318', tint: '#fdecea' },
        crit: { DEFAULT: '#7a0e0e', tint: '#f9dede' },
      },
    },
  },
  plugins: [],
};
export default config;
