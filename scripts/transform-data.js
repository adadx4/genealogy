// Transform script: rename `census` → `residence` in events, tag existing
// resources with new event types where applicable, add Cyndi's List meta-resource
// and a few specific new resources, then write back the canonical JS file and
// JSON snapshot. Idempotent — running twice produces the same output.

const fs = require('fs');
const path = require('path');

const JS_PATH = path.join(__dirname, '..', 'resources', 'genealogy-free-resources.js');
const JSON_PATH = path.join(__dirname, '..', 'resources', 'genealogy-free-resources.json');

global.window = {};
require(JS_PATH);
const data = window.GENEALOGY_RESOURCES;

const ALL_EVENTS = [
  'birth', 'baptism', 'marriage', 'death', 'burial',
  'residence', 'employment', 'education', 'travel', 'military', 'legal', 'other'
];

function renameCensus(events) {
  return events.map((e) => (e === 'census' ? 'residence' : e));
}

function dedupe(arr) {
  return Array.from(new Set(arr));
}

// Apply a function to a resource's own coverage, optionally also to its
// sub-collections. The two operations have different scopes:
// - `renameCensus` should run everywhere (sub-collections too).
// - `tagAdditions` should run only on the parent — sub-collections like
//   "England Births and Christenings" intentionally have narrower coverage
//   and should not be broadened to all event types.
function applyToCoverage(resource, fn, { includeCollections = true } = {}) {
  if (resource.coverage) {
    resource.coverage = resource.coverage.map((c) => ({ ...c, events: fn(c.events) }));
  }
  if (includeCollections && resource.collections) {
    resource.collections = resource.collections.map((col) => {
      if (col.coverage) {
        col.coverage = col.coverage.map((c) => ({ ...c, events: fn(c.events) }));
      }
      return col;
    });
  }
}

// Step 1: rename census → residence everywhere (parent + collections)
data.forEach((r) => applyToCoverage(r, renameCensus));

// Step 1b: reset known sub-collections to their canonical narrow event sets.
// (Earlier versions of this script accidentally over-broadened these. This step
// makes the script idempotent against any prior corruption.)
const collectionEventResets = {
  // FamilySearch
  'fs-england-bc': ['birth', 'baptism'],
  'fs-england-marriages': ['marriage'],
  'fs-england-deaths': ['death', 'burial'],
  'fs-1881-census-eng': ['residence'],
  'fs-scotland-bc': ['birth', 'baptism'],
  'fs-scotland-marriages': ['marriage'],
  'fs-scotland-deaths': ['death', 'burial'],
  'fs-ireland-bc': ['birth', 'baptism'],
  'fs-ireland-marriages': ['marriage'],
  // fs-ireland-civil has multiple coverage entries — reset handled per-entry below
  'fs-australia-bc': ['birth', 'baptism'],
  'fs-australia-marriages': ['marriage'],
  'fs-australia-deaths': ['death', 'burial'],
  'fs-canada-census': ['residence'],
  // Findmypast
  'fmp-1921-census': ['residence'],
  'fmp-1939-register': ['residence'],
  'fmp-parish-records': ['baptism', 'marriage', 'burial'],
  // fmp-irish-records also has a wider event set — reset below
};

for (const r of data) {
  if (!r.collections) continue;
  for (const col of r.collections) {
    const reset = collectionEventResets[col.id];
    if (reset && col.coverage && col.coverage.length === 1) {
      col.coverage[0].events = reset;
    }
  }
}

// Special-case: fs-ireland-civil has three event-specific coverage windows.
const fsIrelandCivil = data
  .flatMap((r) => r.collections || [])
  .find((c) => c.id === 'fs-ireland-civil');
if (fsIrelandCivil) {
  fsIrelandCivil.coverage = [
    { events: ['birth'], startYear: 1864, endYear: 1958 },
    { events: ['marriage'], startYear: 1845, endYear: 1958 },
    { events: ['death'], startYear: 1864, endYear: 1958 },
  ];
}

// Special-case: fmp-irish-records covers a broader (but still bounded) event set.
const fmpIrish = data
  .flatMap((r) => r.collections || [])
  .find((c) => c.id === 'fmp-irish-records');
if (fmpIrish) {
  fmpIrish.coverage = [
    { events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'residence'], startYear: 1700, endYear: null },
  ];
}

// Step 2: extend coverage with new event tags for resources that genuinely cover them.
// Each entry: id → events to add to *every* coverage entry of that resource.
const tagAdditions = {
  // GENUKI is a reference guide — covers everything
  'uk-genuki': ALL_EVENTS,
  // The National Archives Discovery indexes military, legal, travel records too
  'uk-tna-discovery': ['military', 'legal', 'travel', 'employment', 'education', 'other'],
  // National Records of Scotland — same broad scope
  'uk-nrscotland': ['military', 'legal', 'travel', 'employment', 'education', 'other'],
  // PRONI — wills (legal), land (legal)
  'uk-proni': ['legal'],
  // NSW State Archives — convicts (legal), immigrants (travel), school (education), probate (legal)
  'au-nsw-archives': ['legal', 'travel', 'education', 'employment'],
  // Tasmanian Names Index — convicts, immigrants, divorces
  'au-tas-names': ['legal', 'travel'],
  // Library and Archives Canada — already mentions military, immigration
  'ca-lac': ['military', 'travel'],
  // Archives NZ — passenger lists, military
  'nz-archives': ['military', 'travel', 'legal'],
  // Aggregators — broad coverage
  'us-familysearch': ALL_EVENTS,
  'paid-ancestry': ALL_EVENTS,
  'paid-findmypast': ALL_EVENTS,
  'paid-myheritage': ['residence', 'travel', 'military'],
  'paid-thegenealogist': ['military', 'legal'],
  // British Newspaper Archive — newspapers cover everything
  'uk-bna': ['employment', 'education', 'military', 'legal', 'other'],
};

for (const [id, extra] of Object.entries(tagAdditions)) {
  const r = data.find((x) => x.id === id);
  if (!r) {
    console.warn(`Resource not found: ${id}`);
    continue;
  }
  // Parent only — sub-collections keep their narrow event scope intentionally.
  applyToCoverage(r, (events) => dedupe([...events, ...extra]), { includeCollections: false });
}

// Step 3: add Cyndi's List as a meta-resource with sub-collections.
// Skip if already present (idempotent).
if (!data.find((r) => r.id === 'global-cyndis-list')) {
  data.push({
    id: 'global-cyndis-list',
    resourceName: "Cyndi's List",
    url: 'https://www.cyndislist.com/',
    homeUrl: 'https://www.cyndislist.com/',
    accessType: 'free',
    scope: {
      countries: [],
      alsoCovers: [],
      stateProvince: null,
      county: null,
      parish: null,
      religion: 'any',
    },
    coverage: [
      { events: ALL_EVENTS, startYear: null, endYear: null },
    ],
    bestFor: 'Massive curated directory of free and paid genealogy resources, organised by country and topic',
    notes: 'Sub-collections below jump straight to the relevant Cyndi\'s List category page.',
    collections: [
      {
        id: 'cl-england',
        name: 'England directory',
        url: 'https://www.cyndislist.com/uk/eng/',
        scope: { countries: ['England'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for every type of English record.',
      },
      {
        id: 'cl-scotland',
        name: 'Scotland directory',
        url: 'https://www.cyndislist.com/scotland/',
        scope: { countries: ['Scotland'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for Scottish parish, civil, military and emigration records.',
      },
      {
        id: 'cl-wales',
        name: 'Wales directory',
        url: 'https://www.cyndislist.com/wales/',
        scope: { countries: ['Wales'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for Welsh records across all topics.',
      },
      {
        id: 'cl-ireland',
        name: 'Ireland directory',
        url: 'https://www.cyndislist.com/ireland/',
        scope: { countries: ['Ireland', 'Northern Ireland'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for both Republic and Northern Ireland records.',
      },
      {
        id: 'cl-australia',
        name: 'Australia directory',
        url: 'https://www.cyndislist.com/au/',
        scope: { countries: ['Australia'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for Australian records across all states and topics.',
      },
      {
        id: 'cl-canada',
        name: 'Canada directory',
        url: 'https://www.cyndislist.com/canada/',
        scope: { countries: ['Canada'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for Canadian federal and provincial records.',
      },
      {
        id: 'cl-us',
        name: 'United States directory',
        url: 'https://www.cyndislist.com/us/',
        scope: { countries: ['United States'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for US federal, state, and county records.',
      },
      {
        id: 'cl-germany',
        name: 'Germany directory',
        url: 'https://www.cyndislist.com/germany/',
        scope: { countries: ['Germany'] },
        coverage: [{ events: ALL_EVENTS, startYear: null, endYear: null }],
        notes: 'Curated links for German parish, civil and emigration records.',
      },
      {
        id: 'cl-military',
        name: 'Military category',
        url: 'https://www.cyndislist.com/military/',
        scope: {},
        coverage: [{ events: ['military'], startYear: null, endYear: null }],
        notes: 'Worldwide military record links — service rolls, war casualties, regimental histories.',
      },
      {
        id: 'cl-immigration',
        name: 'Immigration & Naturalization category',
        url: 'https://www.cyndislist.com/immigration/',
        scope: {},
        coverage: [{ events: ['travel'], startYear: null, endYear: null }],
        notes: 'Worldwide passenger list, naturalization and emigration links.',
      },
      {
        id: 'cl-cemeteries',
        name: 'Cemeteries category',
        url: 'https://www.cyndislist.com/cemeteries/',
        scope: {},
        coverage: [{ events: ['death', 'burial'], startYear: null, endYear: null }],
        notes: 'Worldwide cemetery, headstone and burial record links.',
      },
      {
        id: 'cl-wills',
        name: 'Wills & Probate category',
        url: 'https://www.cyndislist.com/wills/',
        scope: {},
        coverage: [{ events: ['legal'], startYear: null, endYear: null }],
        notes: 'Worldwide will, probate and estate record links.',
      },
    ],
  });
}

// Step 4: add three specific new resources for the new categories.
const newSpecific = [
  {
    id: 'au-awm',
    resourceName: 'Australian War Memorial',
    url: 'https://www.awm.gov.au/collection/people',
    homeUrl: 'https://www.awm.gov.au/',
    accessType: 'free',
    scope: {
      countries: ['Australia'],
      alsoCovers: [],
      stateProvince: null,
      county: null,
      parish: null,
      religion: 'any',
    },
    coverage: [
      { events: ['military'], startYear: 1885, endYear: null },
    ],
    bestFor: 'Australian military service records, nominal rolls, and unit histories',
    notes: 'Free name search across First and Second AIF, Boer War, Vietnam and other conflict rolls.',
  },
  {
    id: 'uk-old-bailey',
    resourceName: 'Old Bailey Online',
    url: 'https://www.oldbaileyonline.org/search.jsp',
    homeUrl: 'https://www.oldbaileyonline.org/',
    accessType: 'free',
    scope: {
      countries: ['England'],
      alsoCovers: [],
      stateProvince: null,
      county: 'London',
      parish: null,
      religion: 'any',
    },
    coverage: [
      { events: ['legal'], startYear: 1674, endYear: 1913 },
    ],
    bestFor: 'Searchable proceedings of the Old Bailey criminal court, London',
    notes: 'Full-text search of every trial heard at the Old Bailey 1674-1913 — defendants, victims, witnesses all named.',
  },
  {
    id: 'global-theshipslist',
    resourceName: 'TheShipsList',
    url: 'https://www.theshipslist.com/',
    homeUrl: 'https://www.theshipslist.com/',
    accessType: 'free',
    scope: {
      countries: [],
      alsoCovers: [],
      stateProvince: null,
      county: null,
      parish: null,
      religion: 'any',
    },
    coverage: [
      { events: ['travel'], startYear: 1700, endYear: 1955 },
    ],
    bestFor: 'Free passenger lists and ship arrival records across the English-speaking world',
    notes: 'Volunteer-transcribed; particularly strong for UK→Australia, UK→Canada and UK→US voyages.',
  },
];

for (const r of newSpecific) {
  if (!data.find((x) => x.id === r.id)) data.push(r);
}

// Write back the canonical JS file with stable formatting.
const header = '// Auto-generated by scripts/transform-data.js. Edit this file directly OR\n'
  + '// edit the script and re-run. The JSON snapshot at\n'
  + '// resources/genealogy-free-resources.json is regenerated alongside.\n';
const jsContent = `${header}window.GENEALOGY_RESOURCES = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(JS_PATH, jsContent);

const jsonContent = JSON.stringify(data, null, 2) + '\n';
fs.writeFileSync(JSON_PATH, jsonContent);

console.log(`Wrote ${data.length} resources to:`);
console.log(`  ${JS_PATH}`);
console.log(`  ${JSON_PATH}`);

// Sanity check
const censusLeft = JSON.stringify(data).match(/"events"[^]*?"census"/g);
console.log(`Lingering "census" in events: ${censusLeft ? censusLeft.length : 0}`);
