import './globals.css';
import Navigation from '@/components/Navigation';

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
    <html lang="en">
      <body>
        <Navigation />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
