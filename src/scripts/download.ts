/**
 * Official-data downloader. Reads `data/sources/sources.json` and downloads each
 * entry into `data/sources/raw/<province>/<year>/`, recording provenance in a
 * manifest.json (source URL, bytes, content-type, fetched-at) so you can verify
 * every file against its origin.
 *
 * Entry `url` may be:
 *   - a DIRECT file (.pdf/.xls/.xlsx)  → downloaded as-is.
 *   - a PAGE (text/html)               → the downloader scans it for embedded
 *                                        .pdf/.xls/.xlsx links and downloads those.
 *
 * Polite by design: sequential, custom UA, per-request timeout, small delay.
 * Uses Node's global fetch — no extra dependency. Downloading the raw files is
 * separate from PARSING them into CSV/domain records (a later step).
 *
 * Usage: pnpm download            (all enabled entries)
 *        pnpm download hebei      (filter by province slug)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface SourceEntry {
  province: string;
  year: number;
  type: string;
  url: string;
  note?: string;
  enabled?: boolean;
}

interface ManifestRow {
  province: string;
  year: number;
  type: string;
  sourceUrl: string;
  savedAs: string;
  bytes: number;
  contentType: string;
  fetchedAt: string;
}

const UA =
  'gaokao-advisor/0.1 (personal, local research; +https://example.local) Node fetch';
const TIMEOUT_MS = 60_000;
const DELAY_MS = 1500;
const FILE_RE = /(?:href|src)\s*=\s*["']([^"'#?]+\.(?:xlsx?|pdf))(?:[?#][^"']*)?["']/gi;

const SOURCES_PATH = path.join(process.cwd(), 'data', 'sources', 'sources.json');
const RAW_DIR = path.join(process.cwd(), 'data', 'sources', 'raw');

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'user-agent': UA, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'file';
}

function extFromContentType(ct: string): string {
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('sheet') || ct.includes('excel')) return 'xlsx';
  if (ct.includes('ms-excel')) return 'xls';
  if (ct.includes('html')) return 'html';
  return 'bin';
}

function filenameFor(entry: SourceEntry, url: string, contentType: string, idx: number): string {
  const base = path.basename(new URL(url).pathname);
  const hasExt = /\.[a-z0-9]{2,4}$/i.test(base);
  if (hasExt) return sanitize(`${entry.type}-${idx}-${base}`);
  return sanitize(`${entry.type}-${idx}.${extFromContentType(contentType)}`);
}

async function saveBinary(dir: string, filename: string, res: Response): Promise<number> {
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buf);
  return buf.length;
}

function discoverFileLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = FILE_RE.exec(html)) !== null) {
    try {
      out.add(new URL(m[1], baseUrl).toString());
    } catch {
      /* skip malformed */
    }
  }
  return [...out];
}

async function main() {
  const provinceFilter = process.argv[2];
  let config: { sources: SourceEntry[] };
  try {
    config = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'));
  } catch {
    console.error(`[download] cannot read ${SOURCES_PATH}. Create it (see the sample).`);
    process.exit(1);
  }

  const entries = config.sources.filter(
    (e) => e.enabled !== false && (!provinceFilter || e.province === provinceFilter),
  );
  if (entries.length === 0) {
    console.log('[download] no enabled entries match. Nothing to do.');
    return;
  }

  const manifest: ManifestRow[] = [];
  let idx = 0;

  for (const entry of entries) {
    idx++;
    const dir = path.join(RAW_DIR, entry.province, String(entry.year));
    console.log(`\n[download] (${idx}/${entries.length}) ${entry.province}/${entry.year} ${entry.type}`);
    console.log(`           ${entry.url}`);
    try {
      const res = await fetchWithTimeout(entry.url);
      if (!res.ok) {
        console.warn(`           ✗ HTTP ${res.status} ${res.statusText} — skipped`);
        await delay();
        continue;
      }
      const contentType = (res.headers.get('content-type') || '').toLowerCase();

      // PAGE → discover embedded file links and download them.
      if (contentType.includes('text/html')) {
        const html = await res.text();
        const links = discoverFileLinks(html, res.url || entry.url);
        if (links.length === 0) {
          console.warn('           ✗ HTML page but no .pdf/.xls/.xlsx links found — skipped');
          await delay();
          continue;
        }
        console.log(`           ↳ discovered ${links.length} file link(s)`);
        let sub = 0;
        for (const link of links) {
          sub++;
          try {
            const fres = await fetchWithTimeout(link);
            if (!fres.ok) {
              console.warn(`             ✗ ${link} → HTTP ${fres.status}`);
              await delay();
              continue;
            }
            const fct = (fres.headers.get('content-type') || '').toLowerCase();
            const fname = filenameFor(entry, link, fct, sub);
            const bytes = await saveBinary(dir, fname, fres);
            manifest.push(row(entry, link, path.relative(process.cwd(), path.join(dir, fname)), bytes, fct));
            console.log(`             ✓ ${fname} (${human(bytes)})`);
            await delay();
          } catch (err: any) {
            console.warn(`             ✗ ${link} → ${err?.message ?? err}`);
          }
        }
        await delay();
        continue;
      }

      // DIRECT file.
      const fname = filenameFor(entry, res.url || entry.url, contentType, 0);
      const bytes = await saveBinary(dir, fname, res);
      manifest.push(row(entry, entry.url, path.relative(process.cwd(), path.join(dir, fname)), bytes, contentType));
      console.log(`           ✓ ${fname} (${human(bytes)}, ${contentType || 'unknown'})`);
    } catch (err: any) {
      console.warn(`           ✗ ${err?.name === 'TimeoutError' ? 'timeout' : err?.message ?? err}`);
    }
    await delay();
  }

  if (manifest.length > 0) {
    await fs.mkdir(RAW_DIR, { recursive: true });
    const manifestPath = path.join(RAW_DIR, 'manifest.json');
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2),
    );
    console.log(`\n[download] done. ${manifest.length} file(s) saved. Manifest: ${path.relative(process.cwd(), manifestPath)}`);
    console.log('[download] next: parse these raw files into the CSV schemas (xlsx/pdf parser).');
  } else {
    console.log('\n[download] done, but no files were saved (see warnings above).');
  }
}

function row(e: SourceEntry, sourceUrl: string, savedAs: string, bytes: number, ct: string): ManifestRow {
  return {
    province: e.province,
    year: e.year,
    type: e.type,
    sourceUrl,
    savedAs,
    bytes,
    contentType: ct,
    fetchedAt: new Date().toISOString(),
  };
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function delay(ms = DELAY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('[download] crashed:', err);
  process.exit(1);
});
