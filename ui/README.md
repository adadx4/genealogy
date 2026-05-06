# Genealogy Search UI

A local web UI that filters a curated catalogue of genealogy record collections by place, date and event, and lists every collection that matches.

## Files

- `index.html` — front-end form and results panel
- `styles.css` — UI styling
- `app.js` — filter logic and result rendering

## How filtering works

A resource matches when **all** of the following hold:

- **Country** — the resource lists the queried country (or has no country, meaning global)
- **State / county / parish** — if the resource is scoped to a specific state, county or parish, the query value must match (or be empty); empty query fields act as wildcards
- **Religion** — must match if the resource is religion-scoped, otherwise ignored
- **Event + date overlap** — at least one of the resource's coverage entries must list the chosen event and overlap the queried date range

Results are sorted: most specific scope first (parish → county → state → country → global), then free options before paid.

## How to open

Just double-click `index.html`. The data is loaded via a regular `<script>` tag (`../resources/genealogy-free-resources.js`), so it works straight from `file://` — no server needed.

If you prefer a local server (auto-reload, etc.), any of these work:

- VS Code Live Server: right-click `index.html` → "Open with Live Server"
- Python: `python -m http.server 8000` from any parent directory, then open the path to `index.html`

## Data files

Two copies of the resource catalogue live alongside each other:

- [`../resources/genealogy-free-resources.js`](../resources/genealogy-free-resources.js) — canonical for the UI; loaded as a global (`window.GENEALOGY_RESOURCES`)
- [`../resources/genealogy-free-resources.json`](../resources/genealogy-free-resources.json) — snapshot of the same data in pure JSON, useful for tooling / external scripts

The JS file is what the page actually reads. If you edit the catalogue, edit the JS file (or edit the JSON and regenerate the JS — they share an identical array literal).

## Adding new resources

Edit the JS file. Each entry needs:

- `id` — unique slug
- `resourceName`, `url` (search page), `homeUrl` (optional), `accessType` (`free`, `free-with-login`, `freemium`, `paid`)
- `scope` — `countries` (array), `alsoCovers` (array of aliases), `stateProvince`, `stateAliases`, `county`, `parish`, `religion`
- `coverage` — array of `{ events: [], startYear, endYear }` ranges (use `null` for open-ended)
- `bestFor`, `notes`

Use `null` for any scope field that does not apply (a national resource has `stateProvince: null`).
