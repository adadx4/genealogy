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

// Add new sub-collections to existing parents (idempotent — skipped if id exists).
const newSubCollections = [
  {
    parentId: 'paid-findmypast',
    collection: {
      id: 'fmp-outbound-passengers',
      name: 'Britain Outbound Passenger Lists 1890-1960',
      url: 'https://search.findmypast.co.uk/search-world-records/passenger-lists-leaving-uk-1890-1960',
      scope: { countries: ['England', 'Wales', 'Scotland', 'Ireland', 'Northern Ireland'] },
      coverage: [{ events: ['travel'], startYear: 1890, endYear: 1960 }],
      notes: 'Board of Trade BT 27 — passenger lists for ships departing British ports. Free name-index via TNA Discovery; Findmypast has the searchable images.',
    },
  },
  // Batch 5: filtered FamilySearch searches for under-represented regions.
  // These all use the documented q.* parameter pattern — the URL lands on a
  // search-results page restricted to the country, surfacing the relevant
  // named FS collections in the results.
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-philippines',
      name: 'Philippines records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=Philippines',
      scope: { countries: ['Philippines'] },
      coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence'], startYear: 1565, endYear: null }],
      notes: 'Surfaces Philippines Civil Registration, Catholic Church Records (Spanish colonial era onward), and 19th-century census fragments.',
    },
  },
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-thailand',
      name: 'Thailand records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=Thailand',
      scope: { countries: ['Thailand'] },
      coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial'], startYear: 1700, endYear: null }],
      notes: 'Limited indexed coverage — Thailand has thin free-online genealogy infrastructure. FamilySearch holds some Catholic mission and colonial-era records.',
    },
  },
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-mexico',
      name: 'Mexico records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=Mexico',
      scope: { countries: ['Mexico'] },
      coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence'], startYear: 1500, endYear: null }],
      notes: 'Mexico Catholic Church Records (1500s onward) — one of the largest digitised Catholic parish collections anywhere. Plus Mexico Civil Registration from the late 1800s.',
    },
  },
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-brazil',
      name: 'Brazil records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=Brazil',
      scope: { countries: ['Brazil'] },
      coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence'], startYear: 1600, endYear: null }],
      notes: 'Brazil Catholic Church Records, civil registration and slavery-era records.',
    },
  },
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-argentina',
      name: 'Argentina records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=Argentina',
      scope: { countries: ['Argentina'] },
      coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence'], startYear: 1600, endYear: null }],
      notes: 'Argentina Catholic Church Records and provincial civil registration.',
    },
  },
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-south-africa',
      name: 'South Africa records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=South%20Africa',
      scope: { countries: ['South Africa'] },
      coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence'], startYear: 1652, endYear: null }],
      notes: 'NGK (Dutch Reformed) church records, civil registration, and Cape Colony colonial documents.',
    },
  },
  {
    parentId: 'us-familysearch',
    collection: {
      id: 'fs-china',
      name: 'China records',
      url: 'https://www.familysearch.org/search/record/results?q.birthLikePlace=China',
      scope: { countries: ['China'] },
      coverage: [{ events: ['birth', 'marriage', 'death', 'other'], startYear: 1300, endYear: null }],
      notes: 'Chinese Genealogies (jiapu) — clan and lineage books — plus some 19th- and 20th-century civil records. Coverage for surnames varies enormously.',
    },
  },
];

for (const { parentId, collection } of newSubCollections) {
  const parent = data.find((r) => r.id === parentId);
  if (!parent) continue;
  parent.collections = parent.collections || [];
  // Replace if an entry with the same id already exists (so URL/coverage edits
  // here propagate on re-run); otherwise append.
  const existingIdx = parent.collections.findIndex((c) => c.id === collection.id);
  if (existingIdx >= 0) parent.collections[existingIdx] = collection;
  else parent.collections.push(collection);
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
  // Trove — newspapers carry shipping/travel notices and many other event types.
  'au-trove': ['travel', 'military', 'employment', 'legal', 'other'],
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

// Step 4: specific new resources. Each entry is added once (idempotent).
const newSpecific = [
  // --- batch 1: military, legal, travel ---
  {
    id: 'au-awm',
    resourceName: 'Australian War Memorial',
    url: 'https://www.awm.gov.au/collection/people',
    homeUrl: 'https://www.awm.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military'], startYear: 1885, endYear: null }],
    bestFor: 'Australian military service records, nominal rolls, and unit histories',
    notes: 'Free name search across First and Second AIF, Boer War, Vietnam and other conflict rolls.',
  },
  {
    id: 'uk-old-bailey',
    resourceName: 'Old Bailey Online',
    url: 'https://www.oldbaileyonline.org/search.jsp',
    homeUrl: 'https://www.oldbaileyonline.org/',
    accessType: 'free',
    scope: { countries: ['England'], alsoCovers: [], stateProvince: null, county: 'London', parish: null, religion: 'any' },
    coverage: [{ events: ['legal'], startYear: 1674, endYear: 1913 }],
    bestFor: 'Searchable proceedings of the Old Bailey criminal court, London',
    notes: 'Full-text search of every trial heard at the Old Bailey 1674-1913 — defendants, victims, witnesses all named.',
  },
  {
    id: 'global-theshipslist',
    resourceName: 'TheShipsList',
    url: 'https://www.theshipslist.com/',
    homeUrl: 'https://www.theshipslist.com/',
    accessType: 'free',
    scope: { countries: [], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['travel'], startYear: 1700, endYear: 1955 }],
    bestFor: 'Free passenger lists and ship arrival records across the English-speaking world',
    notes: 'Volunteer-transcribed; particularly strong for UK→Australia, UK→Canada and UK→US voyages.',
  },

  // --- batch 2: UK county BMD (UKBMD network) ---
  {
    id: 'uk-durhambmd',
    resourceName: 'DurhamBMD',
    url: 'https://www.durhambmd.org.uk/',
    homeUrl: 'https://www.durhambmd.org.uk/',
    accessType: 'free',
    scope: { countries: ['England'], alsoCovers: [], stateProvince: null, county: 'Durham', parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death'], startYear: 1837, endYear: null }],
    bestFor: 'Free County Durham civil registration district transcriptions',
    notes: 'Volunteer-transcribed; part of the UKBMD network.',
  },
  {
    id: 'uk-staffordshirebmd',
    resourceName: 'StaffordshireBMD',
    url: 'https://www.staffordshirebmd.org.uk/',
    homeUrl: 'https://www.staffordshirebmd.org.uk/',
    accessType: 'free',
    scope: { countries: ['England'], alsoCovers: [], stateProvince: null, county: 'Staffordshire', parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death'], startYear: 1837, endYear: null }],
    bestFor: 'Free Staffordshire civil registration district transcriptions',
    notes: 'Volunteer-transcribed; part of the UKBMD network. Also indexes some pre-1837 parish baptisms.',
  },
  {
    id: 'uk-berkshirebmd',
    resourceName: 'BerkshireBMD',
    url: 'https://www.berkshirebmd.org.uk/',
    homeUrl: 'https://www.berkshirebmd.org.uk/',
    accessType: 'free',
    scope: { countries: ['England'], alsoCovers: [], stateProvince: null, county: 'Berkshire', parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death'], startYear: 1837, endYear: null }],
    bestFor: 'Free Berkshire civil registration district transcriptions',
    notes: 'Volunteer-transcribed; part of the UKBMD network.',
  },
  {
    id: 'uk-wiltshirebmd',
    resourceName: 'WiltshireBMD',
    url: 'https://www.wiltshirebmd.org.uk/',
    homeUrl: 'https://www.wiltshirebmd.org.uk/',
    accessType: 'free',
    scope: { countries: ['England'], alsoCovers: [], stateProvince: null, county: 'Wiltshire', parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death'], startYear: 1837, endYear: null }],
    bestFor: 'Free Wiltshire civil registration district transcriptions',
    notes: 'Volunteer-transcribed; part of the UKBMD network.',
  },
  {
    id: 'uk-northwalesbmd',
    resourceName: 'NorthWalesBMD',
    url: 'https://www.northwalesbmd.org.uk/',
    homeUrl: 'https://www.northwalesbmd.org.uk/',
    accessType: 'free',
    scope: { countries: ['Wales'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death'], startYear: 1837, endYear: null }],
    bestFor: 'Free North Wales civil registration district transcriptions',
    notes: 'Covers Anglesey, Caernarfonshire, Denbighshire, Flintshire, Merionethshire and Montgomeryshire. Part of the UKBMD network.',
  },

  // --- batch 2: Australian state archives ---
  {
    id: 'au-naa',
    resourceName: 'National Archives of Australia',
    url: 'https://recordsearch.naa.gov.au/SearchNRetrieve/Interface/SearchScreens/BasicSearch.aspx',
    homeUrl: 'https://www.naa.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military', 'travel', 'legal', 'employment', 'other'], startYear: 1788, endYear: null }],
    bestFor: 'Australian federal records — military service, immigration, naturalisation, government employment',
    notes: 'RecordSearch is the free public catalogue. Most digitised files are free to view online.',
  },
  {
    id: 'au-prov',
    resourceName: 'Public Record Office Victoria (PROV)',
    url: 'https://prov.vic.gov.au/explore-collection/explore-topic/family-history',
    homeUrl: 'https://prov.vic.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'Victoria', stateAliases: ['VIC', 'Victoria'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'travel', 'employment', 'education', 'burial', 'other'], startYear: 1837, endYear: null }],
    bestFor: 'Victorian state records — wills/probate, inquests, immigration, education, prison',
    notes: 'Free name-search; many indexes and digitised images online. Pair with Victoria BDM for vital events.',
  },
  {
    id: 'au-qsa',
    resourceName: 'Queensland State Archives (QSA)',
    url: 'https://www.archives.qld.gov.au/explore-collection/genealogy',
    homeUrl: 'https://www.archives.qld.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'Queensland', stateAliases: ['QLD', 'Queensland'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'travel', 'employment', 'education', 'other'], startYear: 1859, endYear: null }],
    bestFor: 'Queensland state records — convicts (post-1859), shipping, wills, schools',
    notes: 'Free indexes and digitised images. ArchivesSearch is the public catalogue.',
  },
  {
    id: 'au-srowa',
    resourceName: 'State Records Office of Western Australia',
    url: 'https://archive.sro.wa.gov.au/',
    homeUrl: 'https://www.wa.gov.au/organisation/state-records-office',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'Western Australia', stateAliases: ['WA', 'Western Australia'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'travel', 'employment', 'education', 'other'], startYear: 1829, endYear: null }],
    bestFor: 'WA state records — convicts, wills, immigration, schools',
    notes: 'Free online catalogue and digital archive (AEON).',
  },
  {
    id: 'au-srsa',
    resourceName: 'State Records of South Australia',
    url: 'https://archives.sa.gov.au/finding-information/family-history',
    homeUrl: 'https://archives.sa.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'South Australia', stateAliases: ['SA', 'South Australia'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'travel', 'employment', 'education', 'other'], startYear: 1836, endYear: null }],
    bestFor: 'South Australian state records — wills, immigration, schools, government',
    notes: 'Free indexes; many records require a visit but the catalogue is searchable online.',
  },

  // --- batch 2: UK other ---
  {
    id: 'uk-probate-calendar',
    resourceName: 'England & Wales National Probate Calendar',
    url: 'https://probatesearch.service.gov.uk/',
    homeUrl: 'https://www.gov.uk/search-will-probate',
    accessType: 'freemium',
    scope: { countries: ['England', 'Wales'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'death'], startYear: 1858, endYear: null }],
    bestFor: 'Official England & Wales probate calendar 1858 onward',
    notes: 'Free index search. Will images cost £1.50 each. Replaces the pre-1858 ecclesiastical court system.',
  },
  {
    id: 'uk-nlw',
    resourceName: 'National Library of Wales — Family History',
    url: 'https://www.library.wales/discover-learn/digital-exhibitions/family-history',
    homeUrl: 'https://www.library.wales/',
    accessType: 'free',
    scope: { countries: ['Wales'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'legal', 'other'], startYear: 1500, endYear: null }],
    bestFor: 'Welsh wills, parish registers, tithe maps and newspapers',
    notes: 'Hosts Welsh Newspapers Online, Welsh Tithe Maps and Welsh Wills 1521-1858.',
  },
  {
    id: 'uk-scottish-indexes',
    resourceName: 'Scottish Indexes',
    url: 'https://www.scottishindexes.com/',
    homeUrl: 'https://www.scottishindexes.com/',
    accessType: 'free',
    scope: { countries: ['Scotland'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'legal'], startYear: 1500, endYear: 1925 }],
    bestFor: 'Free Scottish parish, mental health, paternity and prison record indexes',
    notes: 'Run by Graham Maxwell. Particularly strong for asylum records and Sasines (land registers).',
  },
  {
    id: 'uk-sog',
    resourceName: 'Society of Genealogists (London)',
    url: 'https://www.sog.org.uk/search-records/',
    homeUrl: 'https://www.sog.org.uk/',
    accessType: 'paid',
    scope: { countries: ['England', 'Wales', 'Scotland', 'Ireland'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'legal', 'employment', 'other'], startYear: 1500, endYear: null }],
    bestFor: 'Indexed UK and Commonwealth pedigrees, parish records, apprenticeships',
    notes: 'Membership unlocks SoG indexes including Apprenticeships of Great Britain and the Boyd Marriage Index.',
  },

  // --- batch 2: military ---
  {
    id: 'global-cwgc',
    resourceName: 'Commonwealth War Graves Commission',
    url: 'https://www.cwgc.org/find-records/find-war-dead/',
    homeUrl: 'https://www.cwgc.org/',
    accessType: 'free',
    scope: { countries: [], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military', 'death', 'burial'], startYear: 1914, endYear: 1947 }],
    bestFor: 'Free index to Commonwealth war dead from WW1 and WW2',
    notes: 'Authoritative source for British, Australian, Canadian, Indian, NZ, South African and other Commonwealth military deaths 1914-1921 and 1939-1947.',
  },
  {
    id: 'paid-fold3',
    resourceName: 'Fold3',
    url: 'https://www.fold3.com/search/',
    homeUrl: 'https://www.fold3.com/',
    accessType: 'paid',
    scope: { countries: ['United States', 'England', 'Wales', 'Scotland', 'Ireland'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military'], startYear: 1750, endYear: null }],
    bestFor: 'Comprehensive military records — US Civil War, WW1, WW2, plus UK service records',
    notes: 'Owned by Ancestry. Some collections are free; full access requires subscription.',
  },
  {
    id: 'paid-forces-war-records',
    resourceName: 'Forces War Records',
    url: 'https://www.forces-war-records.co.uk/search/',
    homeUrl: 'https://www.forces-war-records.co.uk/',
    accessType: 'paid',
    scope: { countries: ['England', 'Wales', 'Scotland', 'Ireland', 'Northern Ireland'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military'], startYear: 1700, endYear: null }],
    bestFor: 'British and Commonwealth military records — Boer War to WW2',
    notes: 'Specialised paid site, now owned by Findmypast; some overlap with FMP military collections.',
  },

  // --- batch 2: travel / immigration ---
  {
    id: 'us-uscis-genealogy',
    resourceName: 'USCIS Genealogy Program',
    url: 'https://www.uscis.gov/records/genealogy',
    homeUrl: 'https://www.uscis.gov/',
    accessType: 'paid',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['travel', 'legal'], startYear: 1893, endYear: 1957 }],
    bestFor: 'US naturalization, alien registration and immigration files',
    notes: 'Index search is free; record copies cost a fee. Holds A-Files, naturalization C-Files and visa files.',
  },

  // --- batch 2: European ---
  {
    id: 'global-geneanet',
    resourceName: 'Geneanet',
    url: 'https://en.geneanet.org/search/',
    homeUrl: 'https://en.geneanet.org/',
    accessType: 'freemium',
    scope: { countries: ['France', 'Germany', 'Belgium', 'Switzerland', 'Italy', 'Spain'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence'], startYear: 1500, endYear: null }],
    bestFor: 'Strongest free European genealogy site — France-focused, growing across Western Europe',
    notes: 'Free name search and tree access; some images and DNA features require Premium.',
  },

  // --- batch 2: Ireland ---
  {
    id: 'paid-rootsireland',
    resourceName: 'RootsIreland',
    url: 'https://www.rootsireland.ie/search/',
    homeUrl: 'https://www.rootsireland.ie/',
    accessType: 'paid',
    scope: { countries: ['Ireland', 'Northern Ireland'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'burial'], startYear: 1700, endYear: 1900 }],
    bestFor: 'Indexed Irish Catholic and Church of Ireland parish baptisms, marriages and burials',
    notes: 'Pay-per-view. Most comprehensive name-search across pre-civil-registration Irish parish records.',
  },

  // --- batch 2: free general digital libraries ---
  {
    id: 'global-internet-archive',
    resourceName: 'Internet Archive — Genealogy',
    url: 'https://archive.org/details/genealogy',
    homeUrl: 'https://archive.org/',
    accessType: 'free',
    scope: { countries: [], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'residence', 'military', 'legal', 'employment', 'education', 'other'], startYear: 1500, endYear: null }],
    bestFor: 'Free digitised genealogy books, county histories, city directories',
    notes: 'Full-text search of millions of public-domain books. Especially useful for 19th-century county histories and city directories.',
  },
  {
    id: 'global-hathitrust',
    resourceName: 'HathiTrust Digital Library',
    url: 'https://www.hathitrust.org/',
    homeUrl: 'https://www.hathitrust.org/',
    accessType: 'free',
    scope: { countries: [], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'residence', 'military', 'legal', 'employment', 'education', 'other'], startYear: 1500, endYear: null }],
    bestFor: 'Academic library of digitised genealogy and local history books',
    notes: 'Searchable across 15+ million volumes from research libraries. Public-domain works are fully readable.',
  },

  // --- batch 2: Indigenous Australian ---
  {
    id: 'au-aiatsis',
    resourceName: 'AIATSIS Family History Unit',
    url: 'https://aiatsis.gov.au/family-history',
    homeUrl: 'https://aiatsis.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['other', 'birth', 'marriage', 'death'], startYear: 1788, endYear: null }],
    bestFor: 'Aboriginal and Torres Strait Islander family history records',
    notes: 'Specialised support for Indigenous Australian family research, including Stolen Generations records.',
  },

  // --- batch 2: paid US newspapers (also broad UK/AU coverage) ---
  {
    id: 'paid-newspapers-com',
    resourceName: 'Newspapers.com',
    url: 'https://www.newspapers.com/search/',
    homeUrl: 'https://www.newspapers.com/',
    accessType: 'paid',
    scope: { countries: ['United States', 'Canada', 'England', 'Australia'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'employment', 'military', 'legal', 'other'], startYear: 1700, endYear: null }],
    bestFor: 'Searchable images of 25,000+ newspapers, mainly US and Canadian',
    notes: 'Owned by Ancestry. Powerful for obituaries, marriage announcements and small-town family news.',
  },
  {
    id: 'paid-genealogybank',
    resourceName: 'GenealogyBank',
    url: 'https://www.genealogybank.com/search/',
    homeUrl: 'https://www.genealogybank.com/',
    accessType: 'paid',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'employment', 'military', 'legal', 'other'], startYear: 1690, endYear: null }],
    bestFor: 'US historical newspapers including African-American papers and Social Security Death Index',
    notes: 'Particularly strong for early American newspapers (pre-1830) and minority-press papers.',
  },

  // --- batch 3: US — national / multi-state ---
  {
    id: 'us-nara',
    resourceName: 'National Archives (NARA) — Genealogy',
    url: 'https://www.archives.gov/research/genealogy',
    homeUrl: 'https://www.archives.gov/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military', 'travel', 'legal', 'residence', 'employment', 'other'], startYear: 1775, endYear: null }],
    bestFor: 'US federal records — military service, immigration, naturalization, land, federal census',
    notes: 'NARA holds the original federal census schedules, military service files, and ship passenger lists. Many digitised collections are indexed via Ancestry/FamilySearch but NARA itself is the authoritative free source.',
  },
  {
    id: 'us-chronicling-america',
    resourceName: 'Chronicling America',
    url: 'https://chroniclingamerica.loc.gov/search/pages/results/',
    homeUrl: 'https://chroniclingamerica.loc.gov/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'employment', 'military', 'legal', 'other'], startYear: 1690, endYear: 1963 }],
    bestFor: 'Free full-text search of historic US newspapers',
    notes: 'Library of Congress project. 22+ million pages from all 50 states, free to search and view.',
  },
  {
    id: 'us-dar',
    resourceName: 'DAR Genealogical Research Database',
    url: 'https://services.dar.org/Public/DAR_Research/search_adb/',
    homeUrl: 'https://www.dar.org/library/genealogical-research',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military', 'birth', 'marriage', 'death'], startYear: 1700, endYear: 1830 }],
    bestFor: 'Index of American Revolutionary War patriots and their descendants',
    notes: 'Free to search the Genealogical Research System — Ancestor Database, Member List, Bible Records, Genealogical Records Committee Reports.',
  },
  {
    id: 'us-castle-garden',
    resourceName: 'Castle Garden',
    url: 'https://www.castlegarden.org/searcher.php',
    homeUrl: 'https://www.castlegarden.org/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['travel'], startYear: 1820, endYear: 1892 }],
    bestFor: 'Free index of 11 million immigrants who entered the US through Castle Garden (the pre-Ellis Island port of entry in NYC)',
    notes: 'Covers the period before Ellis Island opened in 1892. For Ellis-era arrivals (1892-1957) use FamilySearch or Ancestry.',
  },
  {
    id: 'us-civil-war-soldiers',
    resourceName: 'Civil War Soldiers and Sailors System (NPS)',
    url: 'https://www.nps.gov/civilwar/soldiers-and-sailors-database.htm',
    homeUrl: 'https://www.nps.gov/civilwar/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military', 'death'], startYear: 1861, endYear: 1865 }],
    bestFor: 'Free index of 6.3 million US Civil War soldiers and sailors (Union and Confederate)',
    notes: 'National Park Service project. Includes regimental histories, prisoner records, Medal of Honor recipients, and cemetery information.',
  },
  {
    id: 'us-stevemorse',
    resourceName: 'Stephen P. Morse — One-Step Webpages',
    url: 'https://www.stevemorse.org/',
    homeUrl: 'https://www.stevemorse.org/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'travel', 'residence', 'military', 'other'], startYear: 1700, endYear: null }],
    bestFor: 'Smarter search front-ends for Ellis Island, Castle Garden, US census, NYC vital records and many other sites',
    notes: 'Not a record set — wraps clunky search forms with better UX. Especially useful for soundex-driven Ellis Island searches and NYC vital record indexes.',
  },
  {
    id: 'us-afrigeneas',
    resourceName: 'AfriGeneas',
    url: 'http://www.afrigeneas.com/',
    homeUrl: 'http://www.afrigeneas.com/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'burial', 'other'], startYear: 1700, endYear: null }],
    bestFor: 'African American family research — slave records, Freedmen records, surnames, beginner help',
    notes: 'Volunteer community site. Hosts surname databases, marriage and death indexes, and active research forums.',
  },

  // --- batch 3: US — state archives ---
  {
    id: 'us-ny-archives',
    resourceName: 'New York State Archives',
    url: 'http://www.archives.nysed.gov/research/family-history-and-genealogy',
    homeUrl: 'http://www.archives.nysed.gov/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: 'New York', stateAliases: ['NY', 'New York'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'military', 'travel', 'employment', 'education', 'birth', 'marriage', 'death', 'other'], startYear: 1664, endYear: null }],
    bestFor: 'New York State records — court, military, land, education, civil service',
    notes: 'NY did not centralise vital registration until 1880; for earlier vitals see town clerks and FamilySearch.',
  },
  {
    id: 'us-ca-archives',
    resourceName: 'California State Archives',
    url: 'https://www.sos.ca.gov/archives/research/',
    homeUrl: 'https://www.sos.ca.gov/archives/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: 'California', stateAliases: ['CA', 'California'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'military', 'travel', 'employment', 'education', 'other'], startYear: 1850, endYear: null }],
    bestFor: 'California state records — court, military, prison, land, government employment',
    notes: 'Held by the Secretary of State. The CA Death Index 1905-1939 is freely searchable on FamilySearch.',
  },
  {
    id: 'us-ma-archives',
    resourceName: 'Massachusetts Archives',
    url: 'https://www.sec.state.ma.us/divisions/archives/research/genealogy.htm',
    homeUrl: 'https://www.sec.state.ma.us/divisions/archives/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: 'Massachusetts', stateAliases: ['MA', 'Massachusetts'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'military', 'travel', 'employment', 'birth', 'marriage', 'death', 'other'], startYear: 1620, endYear: null }],
    bestFor: 'Massachusetts state records — early colonial records, vital records, military, court',
    notes: 'MA has continuous vital registration from 1841. Pre-1841 town vitals are covered by AmericanAncestors (NEHGS).',
  },
  {
    id: 'us-pa-archives',
    resourceName: 'Pennsylvania State Archives',
    url: 'https://www.phmc.pa.gov/Archives/Research/Pages/Genealogy.aspx',
    homeUrl: 'https://www.phmc.pa.gov/Archives/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: 'Pennsylvania', stateAliases: ['PA', 'Pennsylvania'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'military', 'travel', 'employment', 'birth', 'marriage', 'death', 'other'], startYear: 1682, endYear: null }],
    bestFor: 'Pennsylvania state records — military, naturalisation, land, vital records',
    notes: 'PA Death Certificates 1906-1969 and Birth Certificates 1906-1909 are freely searchable on Ancestry via Pennsylvania State Archives.',
  },
  {
    id: 'us-tx-archives',
    resourceName: 'Texas State Library and Archives',
    url: 'https://www.tsl.texas.gov/arc/genealogy.html',
    homeUrl: 'https://www.tsl.texas.gov/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: 'Texas', stateAliases: ['TX', 'Texas'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'military', 'travel', 'employment', 'birth', 'marriage', 'death', 'other'], startYear: 1836, endYear: null }],
    bestFor: 'Texas state records — Republic-era documents, Confederate pensions, prison, vital records',
    notes: 'Civil registration is 1903 onward but county clerks held earlier marriage records. Confederate Pension Applications are indexed online.',
  },
  {
    id: 'us-va-library',
    resourceName: 'Library of Virginia',
    url: 'https://www.lva.virginia.gov/public/genealogy.htm',
    homeUrl: 'https://www.lva.virginia.gov/',
    accessType: 'free',
    scope: { countries: ['United States'], alsoCovers: [], stateProvince: 'Virginia', stateAliases: ['VA', 'Virginia'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'military', 'travel', 'employment', 'birth', 'marriage', 'death', 'other'], startYear: 1607, endYear: null }],
    bestFor: 'Virginia state records — colonial and early American court, land, military',
    notes: 'Holds extensive colonial records. Many county order books and chancery causes are digitised and freely searchable.',
  },

  // --- batch 3: Canada ---
  {
    id: 'ca-canadian-headstones',
    resourceName: 'Canadian Headstones',
    url: 'https://canadianheadstones.ca/',
    homeUrl: 'https://canadianheadstones.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['death', 'burial'], startYear: 1700, endYear: null }],
    bestFor: 'Free Canadian cemetery and headstone index with photographs',
    notes: 'Volunteer-driven; coverage varies by province. Complement to Find a Grave for Canadian burials.',
  },
  {
    id: 'ca-automated-genealogy',
    resourceName: 'Automated Genealogy',
    url: 'http://automatedgenealogy.com/',
    homeUrl: 'http://automatedgenealogy.com/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['residence'], startYear: 1851, endYear: 1911 }],
    bestFor: 'Free name-indexed transcriptions of the Canadian census 1851-1911',
    notes: 'Volunteer transcriptions of LAC images. Often easier to search than the official LAC interface.',
  },
  {
    id: 'ca-cvwm',
    resourceName: 'Canadian Virtual War Memorial',
    url: 'https://www.veterans.gc.ca/eng/remembrance/memorials/canadian-virtual-war-memorial',
    homeUrl: 'https://www.veterans.gc.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['military', 'death', 'burial'], startYear: 1899, endYear: null }],
    bestFor: 'Free index of Canadians who died in military service from the Boer War onward',
    notes: 'Veterans Affairs Canada project. Includes service records, photos and burial information for over 118,000 Canadian war dead.',
  },
  {
    id: 'ca-ontario-archives',
    resourceName: 'Archives of Ontario',
    url: 'https://www.archives.gov.on.ca/en/family_history/family_history_main.aspx',
    homeUrl: 'https://www.archives.gov.on.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Ontario', stateAliases: ['ON', 'Ontario'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'legal', 'travel', 'military', 'employment', 'education', 'other'], startYear: 1791, endYear: null }],
    bestFor: 'Ontario provincial records — vital statistics, land, court, education',
    notes: 'Ontario civil registration: births 1869+, marriages 1801+ (county-held pre-1869), deaths 1869+. Many indexes free via FamilySearch.',
  },
  {
    id: 'ca-banq',
    resourceName: 'Bibliothèque et Archives nationales du Québec (BAnQ)',
    url: 'https://www.banq.qc.ca/services/services_specialises/genealogie/',
    homeUrl: 'https://www.banq.qc.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Quebec', stateAliases: ['QC', 'Quebec', 'Québec'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'legal', 'travel', 'other'], startYear: 1621, endYear: null }],
    bestFor: 'Quebec genealogy — Catholic parish registers, notarial records, civil status',
    notes: 'BAnQ holds the most comprehensive Quebec records. Many Catholic parish registers and notarial collections digitised and free online.',
  },
  {
    id: 'ca-ns-archives',
    resourceName: 'Nova Scotia Archives',
    url: 'https://archives.novascotia.ca/genealogy/',
    homeUrl: 'https://archives.novascotia.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Nova Scotia', stateAliases: ['NS', 'Nova Scotia'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'legal', 'travel', 'military', 'other'], startYear: 1763, endYear: 1949 }],
    bestFor: 'Nova Scotia provincial records — births, marriages, deaths, ship passenger lists',
    notes: 'Excellent free online indexes — births 1864-1924, marriages 1763-1949, deaths 1864-1974 are all searchable with images.',
  },
  {
    id: 'ca-bc-archives',
    resourceName: 'British Columbia Archives',
    url: 'https://search-bcarchives.royalbcmuseum.bc.ca/',
    homeUrl: 'https://royalbcmuseum.bc.ca/research/bc-archives',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'British Columbia', stateAliases: ['BC', 'British Columbia'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'legal', 'travel', 'military', 'employment', 'other'], startYear: 1858, endYear: null }],
    bestFor: 'British Columbia provincial records — vital statistics, court, land, photographs',
    notes: 'BC Vital Statistics Agency indexes births, marriages and deaths separately at https://www.vs.gov.bc.ca/. Free with images for older events.',
  },
  {
    id: 'ca-mb-archives',
    resourceName: 'Archives of Manitoba',
    url: 'https://www.gov.mb.ca/chc/archives/',
    homeUrl: 'https://www.gov.mb.ca/chc/archives/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Manitoba', stateAliases: ['MB', 'Manitoba'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'legal', 'travel', 'military', 'employment', 'other'], startYear: 1820, endYear: null }],
    bestFor: 'Manitoba provincial records — Hudson\'s Bay Company, Métis scrip, civil registration',
    notes: 'Holds the unique Hudson\'s Bay Company Archives, important for fur trade and Métis ancestry.',
  },
  {
    id: 'ca-sk-archives',
    resourceName: 'Provincial Archives of Saskatchewan',
    url: 'https://saskarchives.com/family-history',
    homeUrl: 'https://saskarchives.com/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Saskatchewan', stateAliases: ['SK', 'Saskatchewan'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'legal', 'travel', 'employment', 'other'], startYear: 1878, endYear: null }],
    bestFor: 'Saskatchewan provincial records — homestead files, school, vital statistics',
    notes: 'Homestead Files (1872-1930) are particularly useful for tracing land grants to settlers.',
  },
  {
    id: 'ca-ab-archives',
    resourceName: 'Provincial Archives of Alberta',
    url: 'https://provincialarchives.alberta.ca/',
    homeUrl: 'https://provincialarchives.alberta.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Alberta', stateAliases: ['AB', 'Alberta'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'legal', 'travel', 'employment', 'education', 'other'], startYear: 1870, endYear: null }],
    bestFor: 'Alberta provincial records — homestead, school, court, vital statistics',
    notes: 'Free online catalogue. Vital records (1898-1970s) are managed separately by Alberta Vital Statistics.',
  },
  {
    id: 'ca-nb-archives',
    resourceName: 'Provincial Archives of New Brunswick',
    url: 'https://archives.gnb.ca/',
    homeUrl: 'https://archives.gnb.ca/',
    accessType: 'free',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'New Brunswick', stateAliases: ['NB', 'New Brunswick'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['birth', 'marriage', 'death', 'baptism', 'burial', 'legal', 'travel', 'military', 'other'], startYear: 1784, endYear: null }],
    bestFor: 'New Brunswick provincial records — Loyalist arrivals, Acadian records, vital statistics',
    notes: 'Excellent free online indexes including vital statistics (1888-1965), late registrations and county marriage registers.',
  },
  {
    id: 'paid-prdh-igd',
    resourceName: 'PRDH-IGD',
    url: 'https://www.prdh-igd.com/en/Home',
    homeUrl: 'https://www.prdh-igd.com/',
    accessType: 'paid',
    scope: { countries: ['Canada'], alsoCovers: [], stateProvince: 'Quebec', stateAliases: ['QC', 'Quebec', 'Québec'], county: null, parish: null, religion: 'Catholic' },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial'], startYear: 1621, endYear: 1865 }],
    bestFor: 'Reconstructed family files for every Quebec Catholic to 1865',
    notes: 'Université de Montréal project. The most comprehensive linked dataset for Quebec Catholic ancestry — pay-per-request or subscription.',
  },

  // --- batch 4: Australian convict + immigration ---
  {
    id: 'au-convict-records',
    resourceName: 'Convict Records of Australia',
    url: 'https://convictrecords.com.au/',
    homeUrl: 'https://convictrecords.com.au/',
    accessType: 'free',
    scope: { countries: ['Australia', 'England', 'Wales', 'Scotland', 'Ireland'], alsoCovers: [], stateProvince: null, county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'travel'], startYear: 1788, endYear: 1868 }],
    bestFor: 'Free aggregated index of British and Irish convicts transported to Australia',
    notes: 'Volunteer-driven; pulls together transportation records, ship arrival lists and conduct registers across all penal colonies (NSW, VDL, WA).',
  },
  {
    id: 'au-founders-survivors',
    resourceName: 'Founders and Survivors',
    url: 'https://www.foundersandsurvivors.org/',
    homeUrl: 'https://www.foundersandsurvivors.org/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'Tasmania', stateAliases: ['TAS', 'Tasmania'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['legal', 'travel', 'birth', 'marriage', 'death', 'other'], startYear: 1803, endYear: 1920 }],
    bestFor: 'Academic project linking Tasmanian convicts to their descendants',
    notes: 'University of Tasmania research project. Connects convict records, vital events, and family-history submissions; particularly powerful for tracing descendants of Van Diemen\'s Land convicts.',
  },
  {
    id: 'au-passengers-history',
    resourceName: 'Passengers in History',
    url: 'https://passengersinhistory.sa.gov.au/',
    homeUrl: 'https://passengersinhistory.sa.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'South Australia', stateAliases: ['SA', 'South Australia'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['travel'], startYear: 1836, endYear: 1900 }],
    bestFor: 'Free name-search index of South Australian passenger arrivals',
    notes: 'Hosted by the South Australian Maritime Museum. Combines assisted and unassisted arrivals and links to original ship and voyage details.',
  },
  {
    id: 'au-mariners-ships',
    resourceName: 'Mariners and Ships in Australian Waters (NSW)',
    url: 'https://mariners.records.nsw.gov.au/',
    homeUrl: 'https://mariners.records.nsw.gov.au/',
    accessType: 'free',
    scope: { countries: ['Australia'], alsoCovers: [], stateProvince: 'New South Wales', stateAliases: ['NSW', 'New South Wales'], county: null, parish: null, religion: 'any' },
    coverage: [{ events: ['travel', 'employment'], startYear: 1788, endYear: 1900 }],
    bestFor: 'Free index of seamen and ships visiting NSW ports',
    notes: 'Originally hosted by NSW State Records, now under MHNSW. Useful for ancestors who served on or arrived via shipping into Sydney and other NSW ports.',
  },

  // --- batch 5: rest-of-world standalone resources ---
  {
    id: 'global-slave-voyages',
    resourceName: 'Slave Voyages Database',
    url: 'https://www.slavevoyages.org/voyage/database',
    homeUrl: 'https://www.slavevoyages.org/',
    accessType: 'free',
    scope: {
      countries: ['United States', 'Brazil', 'Jamaica', 'Cuba', 'Haiti', 'Dominican Republic', 'Trinidad and Tobago', 'Barbados', 'Bahamas', 'Puerto Rico'],
      alsoCovers: [],
      stateProvince: null, county: null, parish: null, religion: 'any',
    },
    coverage: [{ events: ['travel', 'other'], startYear: 1500, endYear: 1875 }],
    bestFor: 'Free comprehensive index of trans-Atlantic and intra-American slave voyages',
    notes: 'Hosts records for ~36,000 voyages, naming captains and ports of departure/arrival; the African Origins and Intra-American databases name 100,000+ enslaved individuals.',
  },
  {
    id: 'caribbean-jamaican-fs',
    resourceName: 'Jamaican Family Search Genealogy Research Library',
    url: 'https://www.jamaicanfamilysearch.com/',
    homeUrl: 'https://www.jamaicanfamilysearch.com/',
    accessType: 'free',
    scope: {
      countries: ['Jamaica'],
      alsoCovers: [],
      stateProvince: null, county: null, parish: null, religion: 'any',
    },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence', 'other'], startYear: 1655, endYear: 1962 }],
    bestFor: 'Free Jamaican parish registers, BMD indexes, wills and surname lists',
    notes: 'Long-running volunteer site with the largest free Jamaica-specific genealogy collection online. Includes coverage of the planter/slave-owning class as well as later civil records.',
  },
  {
    id: 'asia-fibis',
    resourceName: 'Families in British India Society (FIBIS)',
    url: 'https://search.fibis.org/',
    homeUrl: 'https://www.fibis.org/',
    accessType: 'free-with-login',
    scope: {
      countries: ['India', 'Pakistan', 'Bangladesh', 'Myanmar'],
      alsoCovers: [],
      stateProvince: null, county: null, parish: null, religion: 'any',
    },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'military', 'employment', 'travel', 'residence', 'other'], startYear: 1600, endYear: 1947 }],
    bestFor: 'Free indexes for British and Anglo-Indian families during the Raj',
    notes: 'FIBIwiki + FIBIS Database. Strong on Indian Army, East India Company, civil service, ecclesiastical records and cemetery transcriptions.',
  },
  {
    id: 'africa-eggsa',
    resourceName: 'eGGSA — Genealogical Society of South Africa',
    url: 'https://www.eggsa.org/',
    homeUrl: 'https://www.eggsa.org/',
    accessType: 'free',
    scope: {
      countries: ['South Africa', 'Namibia', 'Zimbabwe', 'Botswana'],
      alsoCovers: [],
      stateProvince: null, county: null, parish: null, religion: 'any',
    },
    coverage: [{ events: ['birth', 'baptism', 'marriage', 'death', 'burial', 'residence', 'legal', 'other'], startYear: 1652, endYear: 1990 }],
    bestFor: 'Free Southern African genealogy — gravestone photos, NGK church records, BMDs, family pedigrees',
    notes: 'The largest free SA-region database. Holds the eGGSA Branch image library, Source Cards, gravestone photos and the GISA collection.',
  },
  {
    id: 'asia-philippine-archives',
    resourceName: 'National Archives of the Philippines',
    url: 'http://nationalarchives.gov.ph/',
    homeUrl: 'http://nationalarchives.gov.ph/',
    accessType: 'free',
    scope: {
      countries: ['Philippines'],
      alsoCovers: [],
      stateProvince: null, county: null, parish: null, religion: 'any',
    },
    coverage: [{ events: ['legal', 'residence', 'birth', 'marriage', 'death', 'other'], startYear: 1565, endYear: null }],
    bestFor: 'Spanish colonial documents, civil registration and notarial records',
    notes: 'Holds the Philippine Revolutionary Records, Spanish-era parish documents and civil registers. Many records require an in-person visit to Manila but the catalogue is online.',
  },
  {
    id: 'la-mexico-agn',
    resourceName: 'Archivo General de la Nación (México)',
    url: 'https://www.gob.mx/agn',
    homeUrl: 'https://www.gob.mx/agn',
    accessType: 'free',
    scope: {
      countries: ['Mexico'],
      alsoCovers: [],
      stateProvince: null, county: null, parish: null, religion: 'any',
    },
    coverage: [{ events: ['legal', 'travel', 'employment', 'military', 'residence', 'other'], startYear: 1521, endYear: null }],
    bestFor: 'Mexican federal records — colonial, Inquisition, land grants, civil and military',
    notes: 'AGN holds the colonial-era Ramo de la Inquisición, Mercedes (land grants), and civil registration backups. Some collections digitised; many require a visit.',
  },

  // --- batch 5: cross-region note ---
  // Thailand has very limited free online genealogical infrastructure beyond
  // FamilySearch's (mostly non-indexed) holdings — the FS sub-collection below
  // is currently the best filtered entry-point.
];

for (const r of newSpecific) {
  if (!data.find((x) => x.id === r.id)) data.push(r);
}

// Step 5: URL corrections from the link-rot verifier (scripts/verify-links.js).
// Each correction targets either a resource (by id) or a sub-collection (by collection id).
const resourceUrlFixes = {
  // FreeBMD search.shtml is gone — point at homepage where the search box lives.
  'uk-freebmd': { url: 'https://www.freebmd.org.uk/' },
  // NRScotland reorganised; the deep path 404s.
  'uk-nrscotland': { url: 'https://www.nrscotland.gov.uk/' },
  // PRONI now has its own dedicated domain.
  'uk-proni': {
    url: 'https://www.proni.gov.uk/',
    homeUrl: 'https://www.proni.gov.uk/',
  },
  // GRONI homeUrl 404s; drop it (the search url is enough).
  'uk-groni': { homeUrl: null },
  // Library and Archives Canada migrated to canada.ca.
  'ca-lac': {
    url: 'https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history.html',
    homeUrl: 'https://www.canada.ca/en/library-archives.html',
  },
  // NZ Internal Affairs moved to govt.nz.
  'nz-bdm-historical': {
    homeUrl: 'https://www.govt.nz/organisations/births-deaths-and-marriages/',
  },
  // NSW BDM and WA BDM homeUrls 404; drop them.
  'au-nsw-bdm': { homeUrl: null },
  'au-wa-bdm': { homeUrl: null },
  // NT BDM deep path 404s; use the parent.
  'au-nt-bdm': { url: 'https://nt.gov.au/law/bdm' },
  // NSW State Archives — Museums of History reorganised; use homepage.
  'au-nsw-archives': { url: 'https://mhnsw.au/' },
  // Queensland State Archives migrated under qld.gov.au.
  'au-qsa': {
    url: 'https://www.qld.gov.au/recreation/arts/heritage/archives',
    homeUrl: 'https://www.qld.gov.au/recreation/arts/heritage/archives',
  },
  // SROWA homeUrl 404s; use the working archive URL alone.
  'au-srowa': { homeUrl: null },
  // SRSA family-history page 404s; use homepage.
  'au-srsa': { url: 'https://archives.sa.gov.au/' },
  // AWM /collection/people 404s; use homepage.
  'au-awm': { url: 'https://www.awm.gov.au/' },
  // NLW family-history page 404s; use homepage.
  'uk-nlw': { url: 'https://www.library.wales/' },
  // SoG search path 404s; use homepage.
  'uk-sog': {
    url: 'https://sog.org.uk/',
    homeUrl: 'https://sog.org.uk/',
  },
  // CWGC deep search paths variously 500/404; use homepage where the search UI lives.
  'global-cwgc': { url: 'https://www.cwgc.org/' },
  // RootsIreland /search/ redirects to a stale blog post; use homepage.
  'paid-rootsireland': { url: 'https://www.rootsireland.ie/' },
  // WikiTree Special:Search redirects without a query; use homepage.
  'global-wikitree': { url: 'https://www.wikitree.com/' },
  // NAA — family-history landing page 404s; use the homepage where the
  // family-history navigation is prominent.
  'au-naa': { url: 'https://www.naa.gov.au/' },
  // Deceased Online servlet URL redirects to homepage anyway; just point there.
  'uk-deceased-online': { url: 'https://www.deceasedonline.com/' },
  // Geneanet /search/ path 404s; use homepage.
  'global-geneanet': { url: 'https://en.geneanet.org/' },
  // Forces War Records changed domain.
  'paid-forces-war-records': {
    url: 'https://uk.forceswarrecords.com/search',
    homeUrl: 'https://uk.forceswarrecords.com/',
  },

  // --- batch 3 corrections ---
  // Chronicling America moved under loc.gov/collections.
  'us-chronicling-america': {
    url: 'https://www.loc.gov/collections/chronicling-america/',
    homeUrl: 'https://www.loc.gov/collections/chronicling-america/',
  },
  // NY State Archives family-history page 404s; use the archives homepage.
  'us-ny-archives': { url: 'http://www.archives.nysed.gov/' },
  // California State Archives — research path 404s either way; use the archives homepage.
  'us-ca-archives': { url: 'https://www.sos.ca.gov/archives/' },
  // Pennsylvania State Archives moved under pa.gov.
  'us-pa-archives': {
    url: 'https://www.pa.gov/agencies/phmc',
    homeUrl: 'https://www.pa.gov/agencies/phmc',
  },
  // Library of Virginia genealogy.htm is gone; use homepage.
  'us-va-library': { url: 'https://www.lva.virginia.gov/' },
  // Archives of Ontario deep path is gone; use the section homepage.
  'ca-ontario-archives': { url: 'https://www.archives.gov.on.ca/en/family_history/' },
  // BAnQ deep path 404s; use the homepage where genealogy navigation lives.
  'ca-banq': { url: 'https://www.banq.qc.ca/' },
  // BC Archives moved from royalbcmuseum.bc.ca to rbcm.ca.
  'ca-bc-archives': { homeUrl: 'https://rbcm.ca/research/bc-archives' },
  // Saskatchewan Archives /family-history path 404s; use homepage.
  'ca-sk-archives': { url: 'https://www.saskarchives.com/' },

  // --- batch 5 corrections ---
  // jamaicanfamilysearch.com — http fetch fails; HTTPS works.
  'caribbean-jamaican-fs': {
    url: 'https://www.jamaicanfamilysearch.com/',
    homeUrl: 'https://www.jamaicanfamilysearch.com/',
  },
};

const collectionUrlFixes = {
  // Findmypast 1939 Register has a marketing landing page that works.
  'fmp-1939-register': 'https://www.findmypast.co.uk/1939-register',
  // FMP parish-records page 404s; use the discover hub filtered by record type.
  'fmp-parish-records': 'https://www.findmypast.co.uk/discover/explore-our-records/parish-records',
  // Findmypast Ireland search redirects to /discover.
  'fmp-irish-records': 'https://www.findmypast.co.uk/discover?region=Ireland',
};

// Sub-collections to remove (broken URLs without a verified replacement). Parent
// resources still match via their broader scope, so users keep a discovery path.
const removeCollections = new Set([
  // Cyndi's List slugs that silently redirect to /404/.
  'cl-scotland',
  'cl-wales',
  'cl-ireland',
  'cl-australia',
  'cl-military',
  // Findmypast parish-records page lacks a stable URL; the FMP parent covers it.
  'fmp-parish-records',
]);

for (const r of data) {
  const fix = resourceUrlFixes[r.id];
  if (fix) {
    if ('url' in fix) r.url = fix.url;
    if ('homeUrl' in fix) {
      if (fix.homeUrl == null) delete r.homeUrl;
      else r.homeUrl = fix.homeUrl;
    }
  }
  if (r.collections) {
    r.collections = r.collections.filter((c) => !removeCollections.has(c.id));
    for (const c of r.collections) {
      if (collectionUrlFixes[c.id]) c.url = collectionUrlFixes[c.id];
    }
  }
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
