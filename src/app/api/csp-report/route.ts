// Drain for browser CSP violation reports. Browsers POST either the
// classic `application/csp-report` shape or the newer Reporting API
// batch. We log a compact line per violation and always return 204 —
// retries and queuing are the browser's problem, not ours.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface ClassicReport {
  'csp-report'?: {
    'document-uri'?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'blocked-uri'?: string;
    'source-file'?: string;
    'line-number'?: number;
    disposition?: string;
  };
}

interface ReportingApiEntry {
  type?: string;
  body?: {
    documentURL?: string;
    effectiveDirective?: string;
    blockedURL?: string;
    sourceFile?: string;
    lineNumber?: number;
    disposition?: string;
  };
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/reports+json')) {
      const entries = (await req.json()) as ReportingApiEntry[];
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry.type && entry.type !== 'csp-violation') continue;
        const b = entry.body ?? {};
        console.warn('[csp]', {
          doc: b.documentURL,
          directive: b.effectiveDirective,
          blocked: b.blockedURL,
          source: b.sourceFile,
          line: b.lineNumber,
          disposition: b.disposition,
        });
      }
    } else {
      const body = (await req.json()) as ClassicReport;
      const r = body['csp-report'] ?? {};
      console.warn('[csp]', {
        doc: r['document-uri'],
        directive: r['violated-directive'] ?? r['effective-directive'],
        blocked: r['blocked-uri'],
        source: r['source-file'],
        line: r['line-number'],
        disposition: r.disposition,
      });
    }
  } catch (err) {
    // Swallow parse errors — we'd rather accept a malformed report than
    // bounce a retry storm back at browsers.
    console.warn('[csp] malformed report', err);
  }
  return new NextResponse(null, { status: 204 });
}
