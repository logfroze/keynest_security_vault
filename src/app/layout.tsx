import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaProvider } from '@/components/providers/PwaProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { VaultProvider } from '@/components/providers/VaultProvider';

export const metadata: Metadata = {
  title: 'KeyNest — Zero-Knowledge Personal Vault',
  description:
    'Private, zero-knowledge, AI-assisted password, developer secret, and financial information vault.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KeyNest',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0D9488',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[#F4F7FA] text-slate-900 antialiased selection:bg-teal-500/20 selection:text-teal-900 dark:bg-[#0F141A] dark:text-slate-100 dark:selection:bg-teal-500/30 dark:selection:text-teal-100">
        <ThemeProvider>
          <PwaProvider>
            <VaultProvider>{children}</VaultProvider>
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
