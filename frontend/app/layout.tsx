import type { Metadata } from 'next';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Agency OS | Client Hub',
  description: 'Client operations, communication and requirement management',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
