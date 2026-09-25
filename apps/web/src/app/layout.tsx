import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = { title: { default: 'Procurações', template: '%s · Procurações' }, robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        {/* Em produção, servir estas fontes a partir de /public (redes institucionais podem bloquear o Google Fonts). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Merriweather:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
