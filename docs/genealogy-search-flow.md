# Genealogy Search Flow

## Goal
Build a record search assistant that guides researchers one event at a time and connects them to the best free source, or explains the next logical step if a direct free match does not exist.

## Questionnaire flow

1. Event selection
   - "What event are you searching for?"
   - Options: `birth`, `baptism`, `marriage`, `death`, `burial`, `census`

2. Person details
   - Given name(s)
   - Surname
   - Alternate spellings

3. Date details
   - Exact date, estimated year, or year range
   - Allow approximate values when exact date is unknown

4. Location details
   - Country
   - State / province / region
   - County / district
   - Town / parish / village
   - Known church or synagogue

5. Family context
   - Father and mother names
   - Spouse name (for marriage and death searches)
   - Fathers occupation, if known

6. Religious / denominational context
   - Catholic, Protestant, Jewish, LDS, Orthodox, Other, or Unknown
   - Use this to route to parish registers, synagogue records, or denominational archives

7. Source clue / research context
   - "Found in census", "family story says church register", "ancestor lived in parish X"
   - Helps choose between civil vital records and religious registers

## Recommendation logic

- Match event + country + approximate year + religion to a best-fit resource.
- Prefer a single highly relevant free resource instead of many generic options.
- If no direct free match exists, return a next step rather than leaving the researcher stuck.

### Examples

- **England/Wales birth 1880** → recommend `FreeBMD` and note that a baptism may also be found in `FreeREG`.
- **Ireland birth 1850** → explain that civil registration begins 1864 and suggest parish baptism records from the National Library of Ireland.
- **Virginia birth 1820** → explain that statewide civil registration was not in place, and suggest county church/christening records or local county archives.
- **Jewish town in Poland** → recommend `JewishGen` town databases and cemetery indexes.

## Resource-mapping strategy

Use a structured reference table with these fields:
- `country`
- `region`
- `event`
- `resource-name`
- `url`
- `access-type`
- `coverage-years`
- `best-for`
- `religion`
- `notes`

This supports both:
- direct lookup of the best free site for a query
- fallback guidance when the preferred source is unavailable

## Suggested implementation steps

1. Start with the most common geographies:
   - United Kingdom / Ireland
   - United States
   - Canada
   - Australia / New Zealand
   - Central Europe / German-speaking regions
   - Jewish records globally

2. Add a second layer for coverage and start dates:
   - England/Wales civil birth registration starts 1837
   - Ireland civil registration starts 1864
   - US state registration dates vary by state
   - Many European churches have parish registers long before civil records

3. Build the tool output as:
   - "Best free resource"
   - "Why this source fits your query"
   - "If not found, next step"

4. Keep the user focused on one event per search.

## UK and Australia priority guidance

### United Kingdom
- England/Wales birth 1837 onward → `FreeBMD` for civil index lookup.
- England/Wales baptisms and burials before 1837 or when baptism detail is needed → `FreeREG`.
- United Kingdom census support → `FreeCEN` for family and residence evidence.
- Northern Ireland family history → `PRONI` for civil, church, and land collections.
- Scotland research → use `ScotlandsPeople` free search to identify index entries and then follow citations to local parish or archive materials.

### Australia
- Start with `Trove` for newspaper birth, baptism, and death notices, especially for pre-registration events.
- Use `Australian state BDM historical indexes` as a general hub for free state-level vital indexes.
- For New South Wales, search the free NSW BDM historical indexes for 1842-1900 births and older vital events.
- For Victoria, use the Victoria BDM historical indexes for records from 1837-1920.
- If the place is not in NSW or Victoria, search the corresponding state archive or BDM free historical index for the relevant state.

## Why this helps researchers

- It avoids unfocused, broad searches.
- It gives clear expectations when records are unavailable.
- It helps researchers use the right free repository for the place and event.
- It converts partial location/family data into a meaningful search path.
