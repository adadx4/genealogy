const searchForm = document.getElementById('search-form');
const resultsSection = document.getElementById('results');
const resultsListEl = document.getElementById('results-list');
const resultsSummaryEl = document.getElementById('results-summary');
const resultsExplanationEl = document.getElementById('results-explanation');
const submitButton = document.getElementById('submitButton');
const resetButton = document.getElementById('resetButton');

let resourceIndex = [];

const COUNTRY_ALIASES = {
  'uk': 'united kingdom',
  'great britain': 'united kingdom',
  'britain': 'united kingdom',
  'england and wales': 'england',
  'eire': 'ireland',
  'republic of ireland': 'ireland',
  'usa': 'united states',
  'us': 'united states',
  'america': 'united states',
};

const UK_CONSTITUENTS = ['england', 'wales', 'scotland', 'northern ireland'];

function normalize(text) {
  return (text || '').trim().toLowerCase();
}

function canonicalCountry(text) {
  const n = normalize(text);
  return COUNTRY_ALIASES[n] || n;
}

function getFormData() {
  const startYear = Number(document.getElementById('rangeStartYear').value) || null;
  const endYear = Number(document.getElementById('rangeEndYear').value) || null;
  return {
    eventType: document.getElementById('eventType').value,
    rangeStartYear: startYear,
    rangeEndYear: endYear,
    country: document.getElementById('country').value.trim(),
    stateProvince: document.getElementById('stateProvince').value.trim(),
    county: document.getElementById('county').value.trim(),
    parish: document.getElementById('townParish').value.trim(),
    religion: document.getElementById('religion').value,
  };
}

// Merge a sub-collection's scope and coverage with its parent resource. Any field
// the collection sets overrides the parent; anything it omits is inherited.
function mergeWithParent(collection, parent) {
  const parentScope = parent.scope || {};
  const childScope = collection.scope || {};
  const merged = {
    ...parent,
    ...collection,
    scope: { ...parentScope, ...childScope },
    coverage: collection.coverage || parent.coverage || [],
    accessType: collection.accessType || parent.accessType,
    parent,
    isCollection: true,
  };
  delete merged.collections;
  return merged;
}

function entryCountryMatches(entry, queryCountry) {
  const scope = entry.scope || {};
  const countries = (scope.countries || []).map(canonicalCountry);
  const aliases = (scope.alsoCovers || []).map(canonicalCountry);
  if (countries.length === 0) return true;
  const q = canonicalCountry(queryCountry);
  if (countries.includes(q) || aliases.includes(q)) return true;
  // Broad-to-narrow rollup only: a "United Kingdom" query should match resources
  // covering any UK constituent. The reverse (a Northern Ireland query matching a
  // UK-wide resource) is intentionally NOT handled here — list each constituent
  // country in the entry's `countries` array if it genuinely covers it.
  if (q === 'united kingdom' && countries.some((c) => UK_CONSTITUENTS.includes(c))) return true;
  return false;
}

function entryStateMatches(entry, queryState) {
  if (!queryState) return true;
  const scopeState = normalize(entry.scope?.stateProvince);
  if (!scopeState) return true;
  const aliases = (entry.scope?.stateAliases || []).map(normalize);
  const q = normalize(queryState);
  return scopeState === q || aliases.includes(q);
}

function entryCountyMatches(entry, queryCounty) {
  if (!queryCounty) return true;
  const scopeCounty = normalize(entry.scope?.county);
  if (!scopeCounty) return true;
  return scopeCounty === normalize(queryCounty);
}

function entryParishMatches(entry, queryParish) {
  if (!queryParish) return true;
  const scopeParish = normalize(entry.scope?.parish);
  if (!scopeParish) return true;
  return scopeParish === normalize(queryParish);
}

function entryReligionMatches(entry, queryReligion) {
  const r = normalize(queryReligion);
  if (!r || r === 'any') return true;
  const scopeReligion = normalize(entry.scope?.religion);
  if (!scopeReligion || scopeReligion === 'any') return true;
  return scopeReligion === r;
}

function coverageEntryMatches(cov, eventType, queryStart, queryEnd) {
  if (!cov.events || !cov.events.includes(eventType)) return false;
  const start = cov.startYear == null ? -Infinity : cov.startYear;
  const end = cov.endYear == null ? Infinity : cov.endYear;
  const qs = queryStart == null ? -Infinity : queryStart;
  const qe = queryEnd == null ? Infinity : queryEnd;
  return start <= qe && end >= qs;
}

function findMatchingCoverage(entry, eventType, queryStart, queryEnd) {
  return (entry.coverage || []).find((cov) =>
    coverageEntryMatches(cov, eventType, queryStart, queryEnd)
  );
}

function entryMatchesFilters(entry, query) {
  if (!entryCountryMatches(entry, query.country)) return null;
  if (!entryStateMatches(entry, query.stateProvince)) return null;
  if (!entryCountyMatches(entry, query.county)) return null;
  if (!entryParishMatches(entry, query.parish)) return null;
  if (!entryReligionMatches(entry, query.religion)) return null;
  const coverage = findMatchingCoverage(
    entry,
    query.eventType,
    query.rangeStartYear,
    query.rangeEndYear
  );
  if (!coverage) return null;
  return { entry, coverage };
}

function specificityScore(entry) {
  const scope = entry.scope || {};
  if (scope.parish) return 4;
  if (scope.county) return 3;
  if (scope.stateProvince) return 2;
  if ((scope.countries || []).length > 0) return 1;
  return 0;
}

function accessRank(accessType) {
  switch (accessType) {
    case 'free': return 0;
    case 'free-with-login': return 1;
    case 'freemium': return 2;
    case 'paid': return 3;
    default: return 4;
  }
}

function filterResources(query) {
  const matches = [];
  for (const resource of resourceIndex) {
    const collections = resource.collections || [];
    if (collections.length > 0) {
      // Try each sub-collection. Collections that match supersede the resource itself.
      const collectionMatches = [];
      for (const collection of collections) {
        const merged = mergeWithParent(collection, resource);
        const m = entryMatchesFilters(merged, query);
        if (m) collectionMatches.push(m);
      }
      if (collectionMatches.length > 0) {
        matches.push(...collectionMatches);
        continue;
      }
      // No sub-collection matched — fall back to the parent resource (so an
      // aggregator like FamilySearch is still discoverable for off-catalogue queries).
      const fallback = entryMatchesFilters(resource, query);
      if (fallback) matches.push(fallback);
    } else {
      const m = entryMatchesFilters(resource, query);
      if (m) matches.push(m);
    }
  }
  return matches.sort((a, b) => {
    const sa = specificityScore(a.entry);
    const sb = specificityScore(b.entry);
    if (sa !== sb) return sb - sa;
    const aa = accessRank(a.entry.accessType);
    const ab = accessRank(b.entry.accessType);
    if (aa !== ab) return aa - ab;
    const an = a.entry.parent ? a.entry.parent.resourceName : a.entry.resourceName;
    const bn = b.entry.parent ? b.entry.parent.resourceName : b.entry.resourceName;
    if (an !== bn) return an.localeCompare(bn);
    const ac = a.entry.name || '';
    const bc = b.entry.name || '';
    return ac.localeCompare(bc);
  });
}

function describeScope(resource) {
  const scope = resource.scope || {};
  const parts = [];
  if (scope.parish) parts.push(scope.parish);
  if (scope.county) parts.push(scope.county);
  if (scope.stateProvince) parts.push(scope.stateProvince);
  if ((scope.countries || []).length > 0) {
    parts.push(scope.countries.join(' / '));
  } else if (parts.length === 0) {
    parts.push('Global / multi-country');
  }
  if (scope.religion && scope.religion !== 'any') {
    parts.push(`${scope.religion} only`);
  }
  return parts.join(' — ');
}

function describeCoverage(coverage, queryEvent) {
  const start = coverage.startYear ?? '…';
  const end = coverage.endYear ?? 'present';
  // Show just the event the user searched for, plus a hint when the coverage
  // entry covers many other event types too (so users know the resource is broader).
  const allEvents = coverage.events || [];
  const others = allEvents.filter((e) => e !== queryEvent);
  const otherHint = others.length > 0
    ? ` (also covers ${others.length === 1 ? others[0] : others.length + ' other event types'})`
    : '';
  return `${queryEvent}: ${start}–${end}${otherHint}`;
}

function explanationFor(query, matches) {
  const reasons = [];
  if (matches.length === 0) {
    reasons.push('No free or paid resource in the catalogue covers that exact combination of place, date and event.');
    if (query.rangeStartYear || query.rangeEndYear) {
      reasons.push('Try widening the date range or removing it to see what else exists for that place.');
    }
    if (query.parish) {
      reasons.push('Parish-specific entries are limited; clear the parish field to see county- and country-level options.');
    } else if (query.county) {
      reasons.push('Clear the county field to see country-wide options.');
    }
    return reasons.join(' ');
  }
  const country = canonicalCountry(query.country);
  if ((country === 'england' || country === 'wales') && query.rangeStartYear && query.rangeStartYear < 1837) {
    reasons.push('Civil registration began in England and Wales in 1837 — for earlier events, parish registers (FreeREG, county sites) are the main free path.');
  }
  if (country === 'ireland' && query.rangeStartYear && query.rangeStartYear < 1864 && (query.eventType === 'birth' || query.eventType === 'death')) {
    reasons.push('Irish civil birth and death registration began in 1864 — for earlier events, look at church baptism and burial registers.');
  }
  if (country === 'scotland' && query.rangeStartYear && query.rangeStartYear < 1855) {
    reasons.push('Scottish statutory registration began in 1855 — for earlier events, use the Old Parish Registers via ScotlandsPeople.');
  }
  if (country === 'australia' && query.rangeStartYear && query.rangeStartYear < 1850 && (query.eventType === 'birth' || query.eventType === 'death')) {
    reasons.push('Australian colonies introduced civil registration at different dates in the 1840s–1850s — Trove newspaper notices often fill the gap.');
  }
  return reasons.join(' ');
}

function renderResults(query, matches) {
  resultsSection.classList.remove('hidden');
  const isFreeish = (a) => a === 'free' || a === 'free-with-login' || a === 'freemium';
  const freeCount = matches.filter((m) => isFreeish(m.entry.accessType)).length;
  const paidCount = matches.filter((m) => m.entry.accessType === 'paid').length;
  if (matches.length === 0) {
    resultsSummaryEl.textContent = 'No matching resources found.';
  } else {
    const parts = [];
    if (freeCount) parts.push(`${freeCount} free / freemium`);
    if (paidCount) parts.push(`${paidCount} paid`);
    const noun = matches.length === 1 ? 'result' : 'results';
    resultsSummaryEl.textContent = `${matches.length} ${noun} (${parts.join(', ')}).`;
  }
  resultsExplanationEl.textContent = explanationFor(query, matches);
  resultsListEl.innerHTML = matches.map((m) => renderResultCard(m, query.eventType)).join('');
}

function renderResultCard({ entry, coverage }, queryEvent) {
  const access = entry.accessType || 'unknown';
  const scopeText = describeScope(entry);
  const coverageText = describeCoverage(coverage, queryEvent);
  const isCollection = !!entry.isCollection;
  const title = isCollection
    ? `${entry.parent.resourceName} — ${entry.name}`
    : entry.resourceName;
  const homeUrl = entry.homeUrl || (entry.parent && entry.parent.homeUrl);
  const homeLink = homeUrl && homeUrl !== entry.url
    ? ` · <a href="${escapeAttr(homeUrl)}" target="_blank" rel="noopener noreferrer">home</a>`
    : '';
  const bestFor = entry.bestFor || (isCollection ? entry.parent.bestFor : '');
  const notes = entry.notes || '';
  const collectionBadge = isCollection ? '<span class="result-badge">collection</span>' : '';
  return `<li class="result-card result-${access}">
    <div class="result-head">
      <a class="result-name" href="${escapeAttr(entry.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>
      <span class="result-meta">${collectionBadge}<span class="result-access">${escapeHtml(access)}</span></span>
    </div>
    <div class="result-scope">${escapeHtml(scopeText)}</div>
    <div class="result-coverage">${escapeHtml(coverageText)}</div>
    ${bestFor ? `<div class="result-best-for">${escapeHtml(bestFor)}</div>` : ''}
    <div class="result-notes">${escapeHtml(notes)}${homeLink}</div>
  </li>`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(text) {
  return escapeHtml(text);
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = getFormData();
  if (!query.eventType) {
    alert('Please choose an event type.');
    return;
  }
  if (!query.country) {
    alert('Please enter a country.');
    return;
  }
  const matches = filterResources(query);
  renderResults(query, matches);
});

resetButton.addEventListener('click', () => {
  searchForm.reset();
  resultsSection.classList.add('hidden');
});

if (Array.isArray(window.GENEALOGY_RESOURCES)) {
  resourceIndex = window.GENEALOGY_RESOURCES;
  submitButton.disabled = false;
  submitButton.textContent = 'Find matching resources';
} else {
  submitButton.textContent = 'Resource data missing — check the script tag';
  console.error('window.GENEALOGY_RESOURCES is not defined. Make sure resources/genealogy-free-resources.js loaded before app.js.');
}
(function prefillFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return;
  ['eventType','country','stateProvince','county','townParish','rangeStartYear','rangeEndYear','religion'].forEach(id => {
    const v = params.get(id);
    if (v == null) return;
    const el = document.getElementById(id);
    if (el) el.value = v;
  });
  if (params.get('autosubmit') === '1' && resourceIndex.length > 0
      && document.getElementById('eventType').value
      && document.getElementById('country').value) {
    searchForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
})();
