import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { ToastProvider } from '@/components/Toast';
import { LangProvider } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediLens',
  description: 'Blood test reports explained in Bangla',
  appleWebApp: { capable: true, title: 'MediLens', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e6e8c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body>
        <LangProvider>
          <AuthProvider><ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider></AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
