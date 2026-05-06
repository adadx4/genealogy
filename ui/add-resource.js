const ALL_EVENTS = [
  'birth', 'baptism', 'marriage', 'death', 'burial',
  'residence', 'employment', 'education', 'travel', 'military', 'legal', 'other'
];

const form = document.getElementById('add-form');
const coverageRowsEl = document.getElementById('coverage-rows');
const outputSection = document.getElementById('output-section');
const outputEl = document.getElementById('output');
const nameEl = document.getElementById('resourceName');
const idEl = document.getElementById('id');
const idWarningEl = document.getElementById('id-warning');

const existingIds = new Set(
  (Array.isArray(window.GENEALOGY_RESOURCES) ? window.GENEALOGY_RESOURCES : []).flatMap((r) => {
    const ids = [r.id];
    for (const c of r.collections || []) ids.push(c.id);
    return ids;
  })
);

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

nameEl.addEventListener('blur', () => {
  if (!idEl.value.trim() && nameEl.value.trim()) {
    idEl.value = slugify(nameEl.value);
    checkIdUniqueness();
  }
});

idEl.addEventListener('input', checkIdUniqueness);

function checkIdUniqueness() {
  const id = idEl.value.trim();
  if (!id) {
    idWarningEl.classList.add('hidden');
    return;
  }
  if (existingIds.has(id)) {
    idWarningEl.textContent = `⚠ "${id}" is already used by an existing entry. Pick a different slug.`;
    idWarningEl.classList.remove('hidden');
  } else {
    idWarningEl.classList.add('hidden');
  }
}

// Coverage row management ---------------------------------------------------
function addCoverageRow() {
  const row = document.createElement('div');
  row.className = 'coverage-row';
  const eventCheckboxes = ALL_EVENTS.map((e) => `
    <label class="event-checkbox">
      <input type="checkbox" name="event" value="${e}"> ${e}
    </label>
  `).join('');
  row.innerHTML = `
    <div class="coverage-events">${eventCheckboxes}</div>
    <div class="coverage-years">
      <label class="inline-label">Start year
        <input type="number" class="start-year" min="1500" max="2100" placeholder="optional">
      </label>
      <label class="inline-label">End year
        <input type="number" class="end-year" min="1500" max="2100" placeholder="optional">
      </label>
      <button type="button" class="remove-coverage secondary">Remove</button>
    </div>
  `;
  row.querySelector('.remove-coverage').addEventListener('click', () => {
    if (coverageRowsEl.querySelectorAll('.coverage-row').length > 1) {
      row.remove();
    } else {
      // Don't let the user delete the only row — clear it instead.
      row.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
      row.querySelector('.start-year').value = '';
      row.querySelector('.end-year').value = '';
    }
  });
  coverageRowsEl.appendChild(row);
}

document.getElementById('add-coverage').addEventListener('click', addCoverageRow);
addCoverageRow();

// Form submit ---------------------------------------------------------------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const entry = collectEntry();
  if (!entry) return;
  outputEl.textContent = JSON.stringify(entry, null, 2);
  outputSection.classList.remove('hidden');
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function collectEntry() {
  const id = idEl.value.trim();
  if (existingIds.has(id)) {
    alert(`The slug ID "${id}" is already in use. Pick a different one.`);
    idEl.focus();
    return null;
  }

  const homeUrl = document.getElementById('homeUrl').value.trim();
  const stateProvince = document.getElementById('stateProvince').value.trim() || null;
  const stateAliases = parseCsv(document.getElementById('stateAliases').value);
  const county = document.getElementById('county').value.trim() || null;
  const parish = document.getElementById('parish').value.trim() || null;

  const coverage = [];
  for (const row of coverageRowsEl.querySelectorAll('.coverage-row')) {
    const events = Array.from(row.querySelectorAll('input[name="event"]:checked')).map((cb) => cb.value);
    if (events.length === 0) continue;
    const startYearRaw = row.querySelector('.start-year').value;
    const endYearRaw = row.querySelector('.end-year').value;
    coverage.push({
      events,
      startYear: startYearRaw === '' ? null : Number(startYearRaw),
      endYear: endYearRaw === '' ? null : Number(endYearRaw),
    });
  }
  if (coverage.length === 0) {
    alert('Add at least one coverage period with one or more event types selected.');
    return null;
  }

  const scope = {
    countries: parseCsv(document.getElementById('countries').value),
    alsoCovers: [],
    stateProvince,
    county,
    parish,
    religion: document.getElementById('religion').value,
  };
  if (stateAliases.length > 0) scope.stateAliases = stateAliases;

  const entry = {
    id,
    resourceName: nameEl.value.trim(),
    url: document.getElementById('url').value.trim(),
    accessType: document.getElementById('accessType').value,
    scope,
    coverage,
    bestFor: document.getElementById('bestFor').value.trim(),
  };
  if (homeUrl) entry.homeUrl = homeUrl;
  const notes = document.getElementById('notes').value.trim();
  if (notes) entry.notes = notes;

  return entry;
}

function parseCsv(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

// Copy button ---------------------------------------------------------------
document.getElementById('copy-output').addEventListener('click', () => {
  const text = outputEl.textContent;
  if (!navigator.clipboard) {
    alert('Clipboard API not available. Select the text manually and copy.');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-output');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1500);
  });
});
