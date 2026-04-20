import './globals.css';
import Navigation from '@/components/Navigation';
import { Fira_Code } from 'next/font/google';

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'ULTIMATE SCREENER // TERMINAL',
  description: 'Bloomberg-style financial dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={firaCode.className}>
      <body>
        <Navigation />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
