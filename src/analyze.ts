import cheerio from 'cheerio';
import type { Element } from 'cheerio';

export type ResourceType = 'script' | 'style';
export type OriginType = 'first' | 'third';

export interface ResourceItem {
  url: string;
  type: ResourceType;
  origin: OriginType;
  blocking: boolean; // script without async/defer/module
  sizeBytes: number | null; // from HEAD content-length when available
}

export interface DomainAggregate {
  domain: string;
  requests: number;
  bytes: number | null; // null if any unknown; prefer sum where known
  byType: Record<ResourceType, { requests: number; bytes: number | null }>;
}

export interface BudgetSummary {
  inputUrl: string;
  finalUrl: string;
  firstPartyDomain: string;
  resources: ResourceItem[];
  totals: {
    requests: number;
    jsRequests: number;
    cssRequests: number;
    thirdPartyRequests: number;
    totalBytes: number | null;
    jsBytes: number | null;
    cssBytes: number | null;
    thirdPartyBytes: number | null;
    blockingScripts: number;
  };
  domains: DomainAggregate[];
  libraries?: LibraryItem[];
  duplicates?: DuplicateReport[];
  removalCandidates?: RemovalCandidate[];
  budgetReport?: BudgetReport;
}

export interface AnalyzeOptions {
  budget?: { thirdPartyRequests?: number; thirdPartyBytes?: number };
  allow?: string[]; // domain substrings to treat as allowed
  deny?: string[];  // domain substrings to flag for removal
  treatSubdomainsAsFirstParty?: boolean; // if true, subdomains of first-party count as first-party
}

export interface LibraryItem {
  name: string;
  version: string | null;
  url: string;
  domain: string;
  type: ResourceType;
}

export interface DuplicateReport {
  name: string;
  versions: string[];
  count: number;
}

export interface RemovalCandidate {
  url: string;
  reason: 'denied-domain' | 'blocking-third-party' | 'duplicate-library-old-version';
  details?: string;
}

export interface BudgetReport {
  thresholds: { thirdPartyRequests?: number; thirdPartyBytes?: number };
  actuals: { thirdPartyRequests: number; thirdPartyBytes: number | null };
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  violations: string[];
}

function isThirdParty(resourceUrl: URL, firstPartyHost: string, options: AnalyzeOptions): boolean {
  const host = resourceUrl.hostname;
  if (host === firstPartyHost) return false;
  if (options.treatSubdomainsAsFirstParty) {
    const a = registrable(firstPartyHost);
    const b = registrable(host);
    if (a && b && a === b) return false;
  }
  return true;
}

function getDomain(u: URL): string { return u.hostname; }

async function headSize(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    const len = r.headers.get('content-length');
    if (len) {
      const n = Number(len);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function analyzeHtml(inputUrl: string, html: string, finalUrl: string, options: AnalyzeOptions = {}): Promise<BudgetSummary> {
  const base = new URL(finalUrl || inputUrl);
  const firstPartyHost = base.hostname;
  const $ = cheerio.load(html);

  const resources: ResourceItem[] = [];

  $('script[src]').each((_: number, el: Element) => {
    const src = $(el).attr('src');
    if (!src) return;
    let abs: URL;
    try { abs = new URL(src, base); } catch { return; }
    const type: ResourceType = 'script';
    const origin: OriginType = isThirdParty(abs, firstPartyHost, options) ? 'third' : 'first';
    const hasAsync = $(el).is('[async]');
    const hasDefer = $(el).is('[defer]');
    const isModule = ($(el).attr('type') || '').toLowerCase() === 'module';
    const blocking = !(hasAsync || hasDefer || isModule);
    resources.push({ url: abs.toString(), type, origin, blocking, sizeBytes: null });
  });

  $('link[rel="stylesheet"][href]').each((_: number, el: Element) => {
    const href = $(el).attr('href');
    if (!href) return;
    let abs: URL;
    try { abs = new URL(href, base); } catch { return; }
    const type: ResourceType = 'style';
    const origin: OriginType = isThirdParty(abs, firstPartyHost, options) ? 'third' : 'first';
    resources.push({ url: abs.toString(), type, origin, blocking: false, sizeBytes: null });
  });

  // Fetch sizes (best-effort)
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    r.sizeBytes = await headSize(r.url);
  }

  // Totals
  const totals = resources.reduce((acc, r) => {
    acc.requests++;
    if (r.type === 'script') acc.jsRequests++;
    if (r.type === 'style') acc.cssRequests++;
    if (r.origin === 'third') acc.thirdPartyRequests++;
    if (r.sizeBytes != null) {
      acc.totalBytes = (acc.totalBytes ?? 0) + r.sizeBytes;
      if (r.type === 'script') acc.jsBytes = (acc.jsBytes ?? 0) + r.sizeBytes;
      if (r.type === 'style') acc.cssBytes = (acc.cssBytes ?? 0) + r.sizeBytes;
      if (r.origin === 'third') acc.thirdPartyBytes = (acc.thirdPartyBytes ?? 0) + r.sizeBytes;
    } else {
      // leave as null to indicate unknown
    }
    if (r.type === 'script' && r.blocking) acc.blockingScripts++;
    return acc;
  }, {
    requests: 0,
    jsRequests: 0,
    cssRequests: 0,
    thirdPartyRequests: 0,
    totalBytes: null as number | null,
    jsBytes: null as number | null,
    cssBytes: null as number | null,
    thirdPartyBytes: null as number | null,
    blockingScripts: 0
  });

  // Domain aggregates
  const byDomain = new Map<string, DomainAggregate>();
  for (const r of resources) {
    const d = getDomain(new URL(r.url));
    const agg = byDomain.get(d) || {
      domain: d,
      requests: 0,
      bytes: 0,
      byType: { script: { requests: 0, bytes: 0 }, style: { requests: 0, bytes: 0 } }
    };
    agg.requests += 1;
    if (r.sizeBytes == null) {
      agg.bytes = null; // unknown
    } else if (agg.bytes != null) {
      agg.bytes += r.sizeBytes;
    }
    const bucket = agg.byType[r.type];
    bucket.requests += 1;
    if (r.sizeBytes == null) {
      bucket.bytes = null;
    } else if (bucket.bytes != null) {
      bucket.bytes += r.sizeBytes;
    }
    byDomain.set(d, agg);
  }

  const domains = Array.from(byDomain.values()).sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));

  // Library detection (heuristic)
  const libraries: LibraryItem[] = [];
  for (const r of resources) {
    if (r.type !== 'script' && r.type !== 'style') continue;
    const info = detectLibrary(r.url);
    if (info) {
      libraries.push({ name: info.name, version: info.version, url: r.url, domain: new URL(r.url).hostname, type: r.type });
    }
  }

  const duplicateMap = new Map<string, Set<string>>();
  for (const lib of libraries) {
    const set = duplicateMap.get(lib.name) || new Set<string>();
    if (lib.version) set.add(lib.version);
    else set.add('unknown');
    duplicateMap.set(lib.name, set);
  }
  const duplicates: DuplicateReport[] = Array.from(duplicateMap.entries())
    .filter(([, vers]) => vers.size > 1)
    .map(([name, vers]) => ({ name, versions: Array.from(vers), count: vers.size }));

  // Removal candidates
  const allow = (options.allow || []).map(s => s.toLowerCase());
  const deny = (options.deny || []).map(s => s.toLowerCase());
  const removalCandidates: RemovalCandidate[] = [];
  for (const r of resources) {
    const domain = new URL(r.url).hostname.toLowerCase();
    const isDenied = deny.some(p => domain.includes(p));
    const isAllowed = allow.some(p => domain.includes(p));
    if (isDenied) {
      removalCandidates.push({ url: r.url, reason: 'denied-domain', details: domain });
      continue;
    }
    if (r.origin === 'third' && r.type === 'script' && r.blocking && !isAllowed) {
      removalCandidates.push({ url: r.url, reason: 'blocking-third-party' });
    }
  }

  // If duplicate libraries with semantic versions, mark older versions as candidates
  for (const group of groupLibrariesByName(libraries)) {
    if (group.length <= 1) continue;
    // pick highest semantic version if possible
    const parsed = group.map(x => ({ item: x, sem: parseSemver(x.version) }));
    const known = parsed.filter(p => p.sem);
    if (known.length >= 2) {
      const max = known.reduce((a, b) => (cmpSemver(a.sem!, b.sem!) >= 0 ? a : b));
      for (const p of known) {
        if (p.item.url !== max.item.url) {
          removalCandidates.push({ url: p.item.url, reason: 'duplicate-library-old-version', details: `${p.item.name}@${p.item.version}` });
        }
      }
    }
  }

  // Budget report
  const thresholds = options.budget || {};
  const actuals = { thirdPartyRequests: totals.thirdPartyRequests, thirdPartyBytes: totals.thirdPartyBytes };
  let status: BudgetReport['status'] = 'pass';
  const violations: string[] = [];
  if (thresholds.thirdPartyRequests && actuals.thirdPartyRequests > thresholds.thirdPartyRequests) {
    status = 'fail';
    violations.push(`Third‑party requests ${actuals.thirdPartyRequests} > ${thresholds.thirdPartyRequests}`);
  }
  if (thresholds.thirdPartyBytes && actuals.thirdPartyBytes != null) {
    if (actuals.thirdPartyBytes > thresholds.thirdPartyBytes) {
      status = 'fail';
      violations.push(`Third‑party bytes ${actuals.thirdPartyBytes} > ${thresholds.thirdPartyBytes}`);
    } else if (status !== 'fail' && actuals.thirdPartyBytes > 0.9 * thresholds.thirdPartyBytes) {
      status = 'warn';
    }
  }
  if (thresholds.thirdPartyBytes && actuals.thirdPartyBytes == null) {
    status = status === 'fail' ? 'fail' : 'unknown';
    violations.push('Third‑party bytes unknown (no content-length)');
  }

  const budgetReport: BudgetReport = { thresholds, actuals, status, violations };

  return {
    inputUrl: inputUrl,
    finalUrl,
    firstPartyDomain: firstPartyHost,
    resources,
    totals,
    domains,
    libraries,
    duplicates,
    removalCandidates,
    budgetReport
  };
}

// Helpers
function detectLibrary(url: string): { name: string; version: string | null } | null {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const file = path.split('/').pop() || '';
    const host = u.hostname;

    // jsDelivr/npm/unpkg patterns
    let m = path.match(/\/npm\/([^@\/]+)@([^\/]+)/);
    if (m) return { name: m[1].toLowerCase(), version: sanitizeVersion(m[2]) };
    m = path.match(/\/([^\/]+)@([0-9][^\/]+)\//);
    if (m) return { name: m[1].toLowerCase(), version: sanitizeVersion(m[2]) };

    // filename lib-x.y.z(.min).js
    m = file.match(/^([A-Za-z0-9_.-]+?)[-_.]v?(\d+\.\d+\.\d+)(?:[^\/]*?)\.(?:js|css)$/);
    if (m) return { name: m[1].toLowerCase(), version: sanitizeVersion(m[2]) };

    // CDN folder pattern: /jquery/3.6.0/jquery.min.js
    m = path.match(/\/([A-Za-z0-9_.-]+)\/(\d+\.\d+\.\d+)\//);
    if (m) return { name: m[1].toLowerCase(), version: sanitizeVersion(m[2]) };

    // query param v or version
    const qp = u.searchParams.get('v') || u.searchParams.get('version');
    if (qp) {
      const base = file.replace(/\.(min\.)?(js|css)$/i, '').toLowerCase();
      if (base) return { name: base, version: sanitizeVersion(qp) };
    }

    // Known libs without versions → return name hint based on filename
    const known = ['react', 'vue', 'jquery', 'lodash', 'moment', 'three', 'gsap', 'bootstrap', 'tailwind', 'axios', 'swr'];
    for (const k of known) {
      if (file.toLowerCase().includes(k)) return { name: k, version: null };
    }

    // Host hint (e.g., googletagmanager)
    const hostHint = ['googletagmanager', 'google-analytics', 'clarity', 'hotjar', 'segment', 'mixpanel'];
    for (const h of hostHint) {
      if (host.includes(h)) return { name: h, version: null };
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeVersion(v: string): string { return v.replace(/[^0-9a-zA-Z.+-]/g, ''); }

function groupLibrariesByName(list: LibraryItem[]): LibraryItem[][] {
  const map = new Map<string, LibraryItem[]>();
  for (const it of list) {
    const arr = map.get(it.name) || [];
    arr.push(it);
    map.set(it.name, arr);
  }
  return Array.from(map.values());
}

function parseSemver(v: string | null): [number, number, number] | null {
  if (!v) return null;
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

// naive registrable domain (eTLD+1) heuristic: last two labels
function registrable(host: string): string | null {
  if (!host || host === 'localhost' || /^(\d+\.){3}\d+$/.test(host)) return host;
  const parts = host.split('.');
  if (parts.length < 2) return host;
  return parts.slice(-2).join('.');
}
