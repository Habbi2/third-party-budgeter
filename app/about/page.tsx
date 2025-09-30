export const metadata = { title: 'About · Third-Party Script Budgeter' };

export default function AboutPage() {
  return (
    <main>
      <h1 style={{ fontSize: 28, margin: '8px 0 16px' }}>About</h1>
      <p style={{ color: '#9ca3af', lineHeight: 1.6 }}>
        Third‑Party Script Budgeter helps you spot and cut JS/CSS bloat by listing external resources, grouping by domain, flagging blocking scripts, and highlighting duplicates.
        Set budgets, export CSV, and copy a remediation plan in seconds.
      </p>
      <p style={{ color: '#9ca3af', marginTop: 12 }}>
        Built by <a href="https://habbiwebdesign.site" target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd' }}>habbiwebdesign.site</a>.
      </p>
    </main>
  );
}
