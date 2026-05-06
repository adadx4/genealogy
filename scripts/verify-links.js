// Link-rot verifier. Walks every URL in the catalogue (resource url, homeUrl,
// and each sub-collection url) and HEAD-checks it. Falls back to GET on servers
// that reject HEAD (405, 501, or hard error). Reports broken URLs, network
// errors, and non-trivial redirects so we can update entries that have moved.
//
// Usage: node scripts/verify-links.js
// Optional: --json writes a machine-readable report to scripts/verify-report.json

const path = require('path');
const fs = require('fs');

const JS_PATH = path.join(__dirname, '..', 'resources', 'genealogy-free-resources.js');
const REPORT_PATH = path.join(__dirname, 'verify-report.json');

global.window = {};
require(JS_PATH);
const data = window.GENEALOGY_RESOURCES;

const TIMEOUT_MS = 20000;
const CONCURRENCY = 6;
// Browser-ish UA — some sites 403 obvious bots even when the URL is fine.
const USER_AGENT = 'Mozilla/5.0 (compatible; GenealogyCatalogVerifier/1.0)';

// Resources whose URLs work in browsers but block scripted access. Verified by
// hand; suppressed from the error report so real failures stay visible.
const ANTI_SCRAPING_FALSE_POSITIVES = new Set([
  'uk-welsh-newspapers',     // 403 to scripted clients
  'au-nsw-bdm',              // 403 on the lifelink search URL
  'paid-thegenealogist',     // 403 redirect on scripted access
  'uk-bna',                  // 403 — hard anti-scraping
  'au-ryerson',              // 429 rate-limit on bursty checks
  'us-dar',                  // 403 on scripted access
  'ca-nb-archives',          // 403 on scripted access
  'us-chronicling-america',  // LoC blocks scripted access
  'au-cemeteries',           // 429 rate-limit on bursty checks
  'ca-ontario-archives',     // perfdrive.com bot-detection middleware
  'ca-banq',                 // perfdrive.com bot-detection middleware
  'asia-philippine-archives',// 403 on scripted access
]);

// Resources where intermittent fetch failures (DNS/network) have been observed
// from this checker but the URL is verified-good. Suppress to keep noise down.
const KNOWN_FLAKY = new Set([
  'uk-gro-index',
  'uk-genuki',
  'global-theshipslist',
  'uk-durhambmd',
  'uk-berkshirebmd',
  'uk-northwalesbmd',
  'us-castle-garden',
  'us-ma-archives',
  'us-tx-archives',
  'ca-bc-archives',
  'paid-prdh-igd',
  'paid-myheritage',          // intermittent fetch failures
  'au-mariners-ships',        // mariners.records.nsw.gov.au — slow, intermittent fetch failures
]);

function flatten(resources) {
  const out = [];
  for (const r of resources) {
    out.push({ id: r.id, label: r.resourceName, kind: 'url', url: r.url });
    if (r.homeUrl && r.homeUrl !== r.url) {
      out.push({ id: r.id, label: r.resourceName, kind: 'homeUrl', url: r.homeUrl });
    }
    for (const c of r.collections || []) {
      out.push({
        id: c.id,
        label: `${r.resourceName} — ${c.name}`,
        kind: 'collection',
        url: c.url,
      });
    }
  }
  return out;
}

function sameDomain(a, b) {
  try {
    return new URL(a).host.replace(/^www\./, '') === new URL(b).host.replace(/^www\./, '');
  } catch {
    return false;
  }
}

async function tryFetch(url, method) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(target) {
  let res;
  try {
    res = await tryFetch(target.url, 'HEAD');
    // Some servers refuse HEAD with 405/501; some return 4xx that is not real.
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      try {
        res = await tryFetch(target.url, 'GET');
      } catch {
        // fall through with the HEAD response
      }
    }
  } catch (err) {
    // HEAD threw (could be socket reset on a HEAD-hostile server). Try GET.
    try {
      res = await tryFetch(target.url, 'GET');
    } catch (err2) {
      return { ...target, error: err2.message || String(err2) };
    }
  }
  return {
    ...target,
    status: res.status,
    ok: res.ok,
    finalUrl: res.url,
    redirected: res.url !== target.url,
    crossDomain: !sameDomain(res.url, target.url),
  };
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  let done = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
      done++;
      if (done % 10 === 0 || done === items.length) {
        process.stderr.write(`  checked ${done}/${items.length}\n`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  const targets = flatten(data);
  console.log(`Checking ${targets.length} URLs (concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS / 1000}s)`);
  const t0 = Date.now();
  const results = await pool(targets, CONCURRENCY, checkOne);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const isSuppressed = (r) =>
    ANTI_SCRAPING_FALSE_POSITIVES.has(r.id) || KNOWN_FLAKY.has(r.id);

  const ok = results.filter((r) => r.ok && !r.redirected);
  const httpsUpgrade = results.filter(
    (r) => r.ok && r.redirected && r.url.startsWith('http://') && r.finalUrl.startsWith('https://') && sameDomain(r.url, r.finalUrl)
  );
  const sameDomainRedirect = results.filter(
    (r) => r.ok && r.redirected && !httpsUpgrade.includes(r) && !r.crossDomain
  );
  const crossDomainRedirect = results.filter((r) => r.ok && r.redirected && r.crossDomain);
  const broken = results.filter((r) => r.status && !r.ok && !isSuppressed(r));
  const errors = results.filter((r) => r.error && !isSuppressed(r));
  const suppressed = results.filter((r) => isSuppressed(r) && (r.error || (r.status && !r.ok)));

  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  ${ok.length} OK (no redirect)`);
  console.log(`  ${httpsUpgrade.length} HTTP→HTTPS upgrade (fine, ignore)`);
  console.log(`  ${sameDomainRedirect.length} same-domain redirect (probably fine)`);
  console.log(`  ${crossDomainRedirect.length} cross-domain redirect (review — site moved?)`);
  console.log(`  ${broken.length} HTTP error (review and fix)`);
  console.log(`  ${errors.length} network error / timeout (review)`);
  console.log(`  ${suppressed.length} suppressed (known anti-scraping or flaky — see lists in script)\n`);

  const print = (heading, list, includeFinal) => {
    if (!list.length) return;
    console.log(`--- ${heading} ---`);
    for (const r of list) {
      console.log(`  [${r.status ?? 'ERR'}] ${r.id} (${r.kind}): ${r.url}`);
      if (includeFinal && r.finalUrl) console.log(`         → ${r.finalUrl}`);
      if (r.error) console.log(`         ${r.error}`);
    }
    console.log();
  };

  print('Cross-domain redirects', crossDomainRedirect, true);
  print('Same-domain redirects', sameDomainRedirect, true);
  print('HTTP errors', broken, true);
  print('Network errors / timeouts', errors, false);

  if (process.argv.includes('--json')) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
    console.log(`Wrote machine-readable report to ${REPORT_PATH}`);
  }
})();
