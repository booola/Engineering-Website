// Monthly vendor check for the Computer Requirements site.
// For every page in data/sources.json it:
//   1. downloads the page and keeps only the requirements section as plain text,
//   2. compares it with the saved copy in data/snapshots/,
//   3. unchanged  -> updates "lastChecked" for that software in data/requirements.json
//      changed    -> saves the new copy and opens a GitHub issue showing what changed
//      unreadable -> opens a GitHub issue asking for a manual check
// No AI or API keys: it only compares text. Run locally with `npm run check`.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const SNAP = path.join(DATA, 'snapshots');
const TODAY = new Date().toISOString().slice(0, 10);
const REPO = process.env.GITHUB_REPOSITORY || '';           // "owner/repo", set by GitHub Actions
const TOKEN = process.env.GITHUB_TOKEN || '';
const LABEL = 'vendor-check';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/* ---------- JSON formatting (short arrays on one line, same as the admin page) ---------- */
const PRIM = String.raw`(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)`;
const ARR = new RegExp(String.raw`\[\s*(` + PRIM + String.raw`(?:\s*,\s*` + PRIM + String.raw`)*)\s*\]`, 'g');
const fmt = o => JSON.stringify(o, null, 2).replace(ARR, (_, inner) => '[' + inner.replace(/\s*\n\s*/g, ' ') + ']') + '\n';

/* ---------- Page to text ---------- */
function decode(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function htmlToText(html) {
  return decode(html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(a|b|strong|em|i|u|span|sup|sub|small|code|abbr|mark|font)(\s[^>]*)?>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|table|section|article|ul|ol|dt|dd)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' '));
}
function tidy(text) {
  return text.split('\n').map(l => l.replace(/[ \t\u00a0]+/g, ' ').replace(/(\s*\|\s*)+$/, '').trim())
    .filter(Boolean).join('\n');
}
async function getText(src) {
  if (src.render === 'browser') {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ userAgent: UA });
      await page.goto(src.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2500);
      return tidy(await page.innerText('body'));
    } finally { await browser.close(); }
  }
  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' } });
    if (!res.ok) throw new Error('The page answered with HTTP ' + res.status);
    return tidy(htmlToText(await res.text()));
  } catch (e) {
    // Some sites block plain downloads; try once more in a real browser.
    if (src.noBrowserRetry) throw e;
    return getText({ ...src, render: 'browser', noBrowserRetry: true });
  }
}
function section(text, src) {
  let a = 0, b = text.length;
  if (src.start) { const m = new RegExp(src.start, 'i').exec(text); if (!m) return null; a = m.index; }
  if (src.end) { const m = new RegExp(src.end, 'i').exec(text.slice(a + 1)); if (m) b = a + 1 + m.index; }
  let out = text.slice(a, b).trim();
  if (src.maxChars) out = out.slice(0, src.maxChars);
  return out;
}

/* ---------- Line diff (longest common subsequence) ---------- */
function diff(oldText, newText) {
  const A = oldText.split('\n'), B = newText.split('\n'), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push('  ' + A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push('- ' + A[i++]);
    else out.push('+ ' + B[j++]);
  }
  while (i < n) out.push('- ' + A[i++]);
  while (j < m) out.push('+ ' + B[j++]);
  // keep 2 lines of context around changes
  const keep = new Set();
  out.forEach((l, k) => { if (l[0] !== ' ') for (let d = -2; d <= 2; d++) keep.add(k + d); });
  const res = []; let last = -1;
  out.forEach((l, k) => { if (keep.has(k)) { if (last >= 0 && k > last + 1) res.push('  …'); res.push(l); last = k; } });
  return res.join('\n');
}

/* ---------- GitHub issues ---------- */
async function gh(method, url, body) {
  const res = await fetch('https://api.github.com/repos/' + REPO + url, {
    method, headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'vendor-check' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok && res.status !== 422) throw new Error('GitHub API ' + method + ' ' + url + ': ' + res.status + ' ' + await res.text());
  return res.status === 204 ? null : res.json();
}
let openTitles = null;
async function openIssue(title, body) {
  if (!REPO || !TOKEN) { console.log('\n--- Would open issue: ' + title + ' ---\n' + body + '\n'); return; }
  if (!openTitles) {
    await gh('POST', '/labels', { name: LABEL, color: 'FFCD00', description: 'Opened by the monthly vendor check' });
    const list = await gh('GET', '/issues?state=open&labels=' + LABEL + '&per_page=100');
    openTitles = new Set(list.map(x => x.title));
  }
  if (openTitles.has(title)) { console.log('Issue already open: ' + title); return; }
  await gh('POST', '/issues', { title, body, labels: [LABEL] });
  openTitles.add(title);
  console.log('Opened issue: ' + title);
}

/* ---------- Main ---------- */
const sources = JSON.parse(await fs.readFile(path.join(DATA, 'sources.json'), 'utf8')).sources;
const reqPath = path.join(DATA, 'requirements.json');
const req = JSON.parse(await fs.readFile(reqPath, 'utf8'));
await fs.mkdir(SNAP, { recursive: true });

const bySoftware = {};   // software id -> list of statuses
const summary = [];
for (const src of sources) {
  let status, note = '';
  try {
    const full = await getText(src);
    const text = section(full, src);
    if (!text || text.length < 80) throw new Error('Couldn’t find the requirements section on the page (looked for “' + src.start + '”).');
    const file = path.join(SNAP, src.id + '.txt');
    let old = null; try { old = await fs.readFile(file, 'utf8'); } catch {}
    if (old === null) { status = 'baseline'; note = 'First run: saved a copy to compare against next time.'; }
    else if (old.trim() === text.trim()) status = 'unchanged';
    else {
      status = 'changed';
      const sw = req.software[src.software] || {};
      const ver = (text.match(/R\d{4}[ab]/) || [])[0];
      const verNote = ver && sw.version && ver !== sw.version ? `\n**New release:** the page now describes **${ver}**; the site says **${sw.version}**.\n` : '';
      await openIssue(`Vendor requirements changed: ${src.label}`,
`The monthly check found changes on the [${src.label} requirements page](${src.url}).
${verNote}
\`\`\`diff
${diff(old.trim(), text.trim())}
\`\`\`

**What to do**
1. Open the vendor page and confirm the change.
2. Update \`data/requirements.json\` (or use the admin page), including \`version\` if a new release came out, and set \`lastUpdated\` and \`lastChecked\` to today.
3. Close this issue.

Lines starting with \`-\` were removed and \`+\` were added. If the change is only wording or layout, just close the issue.`);
    }
    await fs.writeFile(file, text + '\n');
  } catch (e) {
    status = 'error'; note = e.message;
    await openIssue(`Vendor check couldn’t read: ${src.label}`,
`The monthly check couldn’t read the [${src.label} requirements page](${src.url}).

> ${e.message}

The page may have moved, changed its layout, or blocked the automated check. Please check it by hand. If the address or section heading changed, update this page’s entry in \`data/sources.json\`.

This issue stays open until you close it; the check won’t open a duplicate.`);
  }
  (bySoftware[src.software] ||= []).push(status);
  summary.push(`| ${src.label} | ${status} | ${note.replace(/\|/g, '/')} |`);
  console.log(`${src.label}: ${status}${note ? ' — ' + note : ''}`);
}

// Software whose pages all read cleanly with no changes: refresh lastChecked.
let touched = false;
for (const [id, list] of Object.entries(bySoftware)) {
  if (req.software[id] && list.every(s => s === 'unchanged' || s === 'baseline')) { req.software[id].lastChecked = TODAY; touched = true; }
}
if (touched) await fs.writeFile(reqPath, fmt(req));

const table = ['## Vendor check ' + TODAY, '', '| Page | Result | Note |', '|---|---|---|', ...summary].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, table + '\n');
