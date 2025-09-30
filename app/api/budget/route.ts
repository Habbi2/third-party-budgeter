import { NextRequest, NextResponse } from 'next/server';
import { analyzeHtml } from '../../../src/analyze';

function isValidHttps(u: string) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname;
    // simple private range blocks
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
    return true;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url') || '';
  if (!isValidHttps(url)) {
    return NextResponse.json({ error: 'Provide a valid https URL (public).' }, { status: 400 });
  }

  // Optional query params
  const budgetReq = Number(searchParams.get('budgetReq') || '0') || 0; // third-party requests threshold
  // Accept kB input from UI and convert to bytes if provided
  const budgetBytesKB = Number(searchParams.get('budgetBytes') || '0') || 0;
  const budgetBytes = budgetBytesKB ? Math.round(budgetBytesKB * 1024) : 0;
  const allow = (searchParams.get('allow') || '').split(',').map(s => s.trim()).filter(Boolean);
  const deny = (searchParams.get('deny') || '').split(',').map(s => s.trim()).filter(Boolean);
  const subsFirst = (searchParams.get('subsFirst') || '0') === '1';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const finalUrl = res.url || url;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      return NextResponse.json({ error: 'NON_HTML', message: 'URL did not return HTML.' }, { status: 400 });
    }
    const html = await res.text();
    const summary = await analyzeHtml(url, html, finalUrl, {
      budget: { thirdPartyRequests: budgetReq || undefined, thirdPartyBytes: budgetBytes || undefined },
      allow, deny,
      treatSubdomainsAsFirstParty: subsFirst
    });
    return NextResponse.json(summary, { status: 200 });
  } catch (e: any) {
    const message = e?.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_ERROR';
    return NextResponse.json({ error: message, message: String(e?.message || message) }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
