import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KPI Calendar — розклад КПІ у Google Calendar',
  description: 'Безкоштовний імпорт актуального розкладу з schedule.kpi.ua в окремий Google Calendar.',
  metadataBase: new URL('https://kpi-google-calendar.github.io/'),
  openGraph: {
    title: 'KPI Calendar',
    description: 'Розклад КПІ у Google Calendar — безкоштовно й без окремої реєстрації.',
    url: 'https://kpi-google-calendar.github.io/',
    siteName: 'KPI Calendar',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'KPI Calendar — розклад КПІ у Google Calendar' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KPI Calendar',
    description: 'Розклад КПІ у Google Calendar — безкоштовно й без окремої реєстрації.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
