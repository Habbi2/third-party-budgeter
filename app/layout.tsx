import type { ReactNode } from 'react';
export const metadata = {
  title: 'Third-Party Script Budgeter',
  description: 'Find, measure, and control third-party scripts and styles on your site.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Ubuntu, Cantarell, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        background: '#0b0f17', color: '#e5e7eb'
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <a href="/" style={{ color: '#e5e7eb', textDecoration: 'none', fontWeight: 600 }}>Budgeter</a>
              <a href="/about" style={{ color: '#9ca3af', textDecoration: 'none' }}>About</a>
            </nav>
            <a href="https://habbiwebdesign.site" target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', textDecoration: 'none' }}>habbiwebdesign.site ↗</a>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
