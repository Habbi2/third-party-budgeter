'use client';
import React from 'react';

type Summary = any;

export default function Page() {
  const [url, setUrl] = React.useState('https://example.com');
  const [budgetReq, setBudgetReq] = React.useState<number | ''>('');
  const [budgetBytes, setBudgetBytes] = React.useState<number | ''>('');
  const [allow, setAllow] = React.useState('');
  const [deny, setDeny] = React.useState('');
  const [subsFirst, setSubsFirst] = React.useState(true);
  const [onlyThird, setOnlyThird] = React.useState(false);
  const [onlyBlocking, setOnlyBlocking] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Summary | null>(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      const params = new URLSearchParams({ url });
      if (budgetReq !== '') params.set('budgetReq', String(budgetReq));
      if (budgetBytes !== '') params.set('budgetBytes', String(budgetBytes));
  if (allow.trim()) params.set('allow', allow.trim());
  if (deny.trim()) params.set('deny', deny.trim());
  if (subsFirst) params.set('subsFirst', '1');
      const res = await fetch(`/api/budget?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.error || 'Request failed');
      setData(json);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  }

  function downloadCsv(filename: string, rows: Array<Record<string, any>>) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => safeCsv(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function exportDomains() {
    if (!data) return;
    const rows = data.domains.map((d: any) => ({ domain: d.domain, requests: d.requests, bytes: d.bytes ?? '' }));
    downloadCsv('domains.csv', rows);
  }
  function exportResources() {
    if (!data) return;
    const rows = data.resources.map((r: any) => ({ type: r.type, origin: r.origin, blocking: r.blocking, sizeBytes: r.sizeBytes ?? '', url: r.url }));
    downloadCsv('resources.csv', rows);
  }

  return (
    <main>
      <h1 style={{ fontSize: 28, margin: '8px 0 16px' }}>Third‑Party Script Budgeter</h1>
      <p style={{ color: '#9ca3af', marginBottom: 16 }}>Audit a URL to list third‑party JS/CSS, sizes, and blocking risks. Add budgets, allow/deny lists, and export CSV.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#111827', color: '#e5e7eb' }}
        />
        <button onClick={run} disabled={loading} style={{ padding: '10px 14px', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none' }}>
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
        <LabeledInput label="Budget: 3P Requests" placeholder="e.g. 10" value={budgetReq}
          onChange={(v) => setBudgetReq(v === '' ? '' : Number(v))} type="number" />
        <LabeledInput label="Budget: 3P Bytes (kB)" placeholder="e.g. 300" value={budgetBytes}
          onChange={(v) => setBudgetBytes(v === '' ? '' : Number(v))} type="number" />
        <LabeledInput label="Allowlist domains (comma)" placeholder="cdn.example.com,foo"
          value={allow} onChange={(v) => setAllow(v)} />
        <LabeledInput label="Denylist domains (comma)" placeholder="ads.example.com,tracker"
          value={deny} onChange={(v) => setDeny(v)} />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={subsFirst} onChange={(e) => setSubsFirst(e.target.checked)} />
          <span style={{ color: '#9ca3af' }}>Treat subdomains as first‑party</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyThird} onChange={(e) => setOnlyThird(e.target.checked)} />
          <span style={{ color: '#9ca3af' }}>Only third‑party</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyBlocking} onChange={(e) => setOnlyBlocking(e.target.checked)} />
          <span style={{ color: '#9ca3af' }}>Only blocking</span>
        </label>
      </div>

      {error && <div style={{ color: '#fca5a5', marginBottom: 12 }}>Error: {error}</div>}

      {data && (
        <section>
          <h2 style={{ fontSize: 20 }}>Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, margin: '8px 0 20px' }}>
            <Stat label="Requests" value={data.totals.requests} />
            <Stat label="Third‑party reqs" value={data.totals.thirdPartyRequests} />
            <Stat label="JS reqs" value={data.totals.jsRequests} />
            <Stat label="Blocking scripts" value={data.totals.blockingScripts} warn />
          </div>

          {data.budgetReport && (
            <div style={{ margin: '8px 0 16px', padding: 12, borderRadius: 8, border: '1px solid #1f2937', background: '#0f172a' }}>
              <strong>Budget</strong>: Status {badge(data.budgetReport.status)} · 3P req: {data.budgetReport.actuals.thirdPartyRequests}
              {typeof data.budgetReport.thresholds.thirdPartyRequests === 'number' ? ` / ${data.budgetReport.thresholds.thirdPartyRequests}` : ''}
              {' · '}3P bytes: {fmtBytes(data.budgetReport.actuals.thirdPartyBytes)}
              {typeof data.budgetReport.thresholds.thirdPartyBytes === 'number' ? ` / ${fmtBytesKB(data.budgetReport.thresholds.thirdPartyBytes)}` : ''}
              {data.budgetReport.violations?.length ? (
                <ul style={{ marginTop: 8, color: '#fca5a5' }}>
                  {data.budgetReport.violations.map((v: string, i: number) => <li key={i}>{v}</li>)}
                </ul>
              ) : null}
            </div>
          )}

          <h3 style={{ fontSize: 18, marginTop: 12 }}>Top domains</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={exportDomains} style={{ padding: '8px 10px', borderRadius: 6, background: '#1f2937', color: '#e5e7eb', border: '1px solid #334155' }}>Export domains CSV</button>
            <button onClick={exportResources} style={{ padding: '8px 10px', borderRadius: 6, background: '#1f2937', color: '#e5e7eb', border: '1px solid #334155' }}>Export resources CSV</button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
            {data.domains.slice(0, 8).map((d: any) => (
              <li key={d.domain} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 8 }}>
                <span>{d.domain}</span>
                <span style={{ color: '#9ca3af' }}>{d.requests} req · {fmtBytes(d.bytes)}</span>
              </li>
            ))}
          </ul>

          {data.removalCandidates?.length ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 18 }}>Removal candidates</h3>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                {data.removalCandidates.map((c: any, i: number) => (
                  <li key={i} style={{ padding: '8px 10px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ color: '#fca5a5' }}>{c.reason}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.details || ''}</div>
                    <div style={{ wordBreak: 'break-all' }}>{c.url}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.duplicates?.length ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 18 }}>Duplicate libraries</h3>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                {data.duplicates.map((d: any, i: number) => (
                  <li key={i} style={{ padding: '8px 10px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 8 }}>
                    <strong>{d.name}</strong>: {d.versions.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer' }}>All resources</summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                  <th>Type</th>
                  <th>Origin</th>
                  <th>Blocking</th>
                  <th>Size</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {data.resources
                  .filter((r: any) => (onlyThird ? r.origin === 'third' : true))
                  .filter((r: any) => (onlyBlocking ? (r.type === 'script' && r.blocking) : true))
                  .map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                    <td>{r.type}</td>
                    <td>{r.origin}</td>
                    <td style={{ color: r.blocking ? '#fca5a5' : '#9ca3af' }}>{r.blocking ? 'yes' : 'no'}</td>
                    <td>{fmtBytes(r.sizeBytes)}</td>
                    <td style={{ maxWidth: 560, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <div style={{ marginTop: 16 }}>
            <button onClick={() => copyPlan(data)} style={{ padding: '8px 10px', borderRadius: 6, background: '#2563eb', color: 'white', border: 'none' }}>Copy remediation plan</button>
          </div>
        </section>
      )}
    </main>
  );
}

function LabeledInput({ label, placeholder, value, onChange, type = 'text' }: { label: string; placeholder?: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ color: '#9ca3af', fontSize: 12 }}>{label}</span>
      <input
        type={type}
        value={String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #334155', background: '#111827', color: '#e5e7eb' }}
      />
    </label>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8, padding: 12 }}>
      <div style={{ color: '#9ca3af', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, color: warn ? '#fca5a5' : '#e5e7eb' }}>{value}</div>
    </div>
  );
}

function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} kB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function fmtBytesKB(n: number): string {
  return `${n} kB`;
}

function badge(status: 'pass' | 'warn' | 'fail' | 'unknown') {
  const c = status === 'pass' ? '#22c55e' : status === 'warn' ? '#f59e0b' : status === 'fail' ? '#ef4444' : '#64748b';
  return <span style={{ padding: '2px 8px', borderRadius: 999, background: c, color: '#0b0f17', marginLeft: 6 }}>{status}</span>;
}

function safeCsv(v: any) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function copyPlan(data: any) {
  const lines: string[] = [];
  lines.push('Third‑Party Script Budgeter – Remediation Plan');
  lines.push(`URL: ${data.finalUrl || data.inputUrl}`);
  if (data.budgetReport) {
    lines.push(`Budget status: ${data.budgetReport.status}`);
    if (data.budgetReport.thresholds.thirdPartyRequests)
      lines.push(`  3P Requests: ${data.budgetReport.actuals.thirdPartyRequests}/${data.budgetReport.thresholds.thirdPartyRequests}`);
    if (data.budgetReport.thresholds.thirdPartyBytes)
      lines.push(`  3P Bytes: ${fmtBytes(data.budgetReport.actuals.thirdPartyBytes)} / ${fmtBytes(data.budgetReport.thresholds.thirdPartyBytes)}`);
    if (data.budgetReport.violations?.length) {
      lines.push('  Violations:');
      for (const v of data.budgetReport.violations) lines.push(`   - ${v}`);
    }
  }
  // Top 5 heavy domains
  const domains = (data.domains || []).slice().sort((a: any, b: any) => (b.bytes ?? 0) - (a.bytes ?? 0)).slice(0, 5);
  if (domains.length) {
    lines.push('Top domains by bytes:');
    for (const d of domains) lines.push(` - ${d.domain}: ${fmtBytes(d.bytes)} (${d.requests} req)`);
  }
  // Blocking third-party scripts
  const blockers = (data.resources || []).filter((r: any) => r.type === 'script' && r.origin === 'third' && r.blocking).slice(0, 20);
  if (blockers.length) {
    lines.push('Blocking third‑party scripts (convert to async/defer/module or lazy-load):');
    for (const r of blockers) lines.push(` - ${r.url}`);
  }
  // Duplicates
  if (data.duplicates?.length) {
    lines.push('Duplicate libraries (consolidate to a single version):');
    for (const d of data.duplicates) lines.push(` - ${d.name}: ${d.versions.join(', ')}`);
  }
  // Removal candidates
  if (data.removalCandidates?.length) {
    lines.push('Removal candidates:');
    for (const c of data.removalCandidates) lines.push(` - [${c.reason}] ${c.url}${c.details ? ` (${c.details})` : ''}`);
  }
  const text = lines.join('\n');
  navigator.clipboard.writeText(text).catch(() => {});
}
