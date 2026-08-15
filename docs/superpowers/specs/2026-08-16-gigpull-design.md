# gigpull — design

**Date:** 2026-08-16
**Status:** draft, pending review

## Purpose

Find paid work — freelance gigs and internships — by detecting organisations that
need engineering help, with emphasis on those that need it but are not advertising
for it.

Companies with an open job listing are an efficient, crowded market. Companies with
a visible gap and no listing are an inefficient one, where a specific, well-researched
message arrives as the only message of its kind. gigpull targets the second group.

The tool produces a ranked shortlist with a per-lead brief. **It never sends anything.**
The human reads the brief and writes the message.

### Success criteria

1. A daily run surfaces 10–20 leads worth reading, with under 10% duplicates.
2. Each lead's brief names at least one concrete, verifiable fact about that
   organisation that could open a cold message.
3. Time from opening the shortlist to having a sendable draft is under five minutes
   per lead.
4. Contact details in the brief are sufficient to reach the decision-maker without
   further research.

### Non-goals

- Sending, scheduling, or automating outreach of any kind.
- Scraping Instagram, LinkedIn, or any authenticated surface.
- Maximising lead volume. Ten researched leads beat four hundred generic ones.
- Ranking by technology stack. See "Neutrality" below.

## Two modes, one pipeline

gigpull runs in two modes that share every stage of the pipeline and differ only in
collectors and scoring weights.

| | `local` | `startup` |
|---|---|---|
| Target | Small businesses — restaurants, clinics, gyms, salons, boutiques, institutes | Funded startups and small product companies |
| Pays for | Ordering, booking, payments, CRM, a site where none exists | Contract work, internships, part-time roles |
| Identity key | Google `place_id` | Canonical domain |
| Core gap signal | No website, or a dead/abandoned one | Product defects, stalled repo, stale changelog |
| Goal served | Cash, soon | Longer-term role, mentorship, brand |

Both modes run from one binary, one database, one scorer. Mode is a column, not a fork.

## Neutrality

The scorer is blind to technology stack. It does not up-rank work resembling
projects already built, and does not down-rank it either. Ranking depends only on
properties of the opportunity: ability to pay, urgency, size of the visible gap,
and reachability of the decision-maker.

This is a deliberate constraint. The operator's stated priority is learning breadth,
which any stack-affinity term would quietly undermine by narrowing the funnel to
familiar work.

## Architecture

Six stages. Each is independently runnable and independently testable.

```
collect → normalise → enrich → score → brief → track
```

State lives in SQLite between every stage, so any stage can be re-run against
existing rows without re-running the ones before it. This matters most for the
scorer, which will be re-tuned many times against a fixed corpus of already-collected
companies.

### 1. Collect

One module per source. Every collector implements:

```ts
interface Collector {
  name: string;
  mode: "local" | "startup";
  run(ctx: RunContext): AsyncIterable<RawCandidate>;
}
```

Collectors emit loosely-shaped candidates and do no judging. Every collector output
is parsed through a `zod` schema at the boundary. A source that changes its markup
produces a typed, logged, per-collector failure — never silent garbage downstream.

**Local mode**

| Source | Access | Yields |
|---|---|---|
| Google Places API (New) | Official REST API, key + billing | name, category, rating, review count, phone, website field, place_id |
| Meta Ad Library | Official public API | whether the business currently runs paid ads |
| Justdial / IndiaMART | Public HTML | premium-listing status, category, contact |

Social handles a business publishes on its own site or in a listing are recorded as
contacts for the human to use. gigpull does not fetch Instagram, and therefore does
not derive signals from profile content — this keeps the collector set consistent
with the non-goal above.

**Startup mode**

| Source | Access | Yields |
|---|---|---|
| Entrackr / Inc42 / YourStory | RSS + article fetch, LLM extraction | company, amount, stage, date, sector |
| Product Hunt | Official GraphQL API | recent launches, maker profiles, site |
| YC / Antler / Surge directories | Public HTML | recent-cohort membership |
| Wellfound / Internshala / YC WaaS | Public listings | active roles — evidence budget exists |
| GitHub Search API | Official REST/GraphQL | active engineering orgs |

A collector failing must not abort a run. Failures are recorded per-collector in
`runs` and the run continues.

### 2. Normalise and dedupe

The same organisation arrives from several sources under several names. Dedupe is
the primary determinant of whether the shortlist is usable, so identity is explicit
rather than inferred:

- `local` → `place:<google_place_id>`
- `startup` → `domain:<canonical_domain>`

Domain canonicalisation lowercases, strips `www.`, drops the scheme and any query
string, and follows redirects once to catch marketing-domain aliases. Names are
never used as identity — "Acme", "Acme Inc." and "Acme Technologies Pvt Ltd"
collapse only if their domains agree.

Merging appends to a company's `signals` list. Nothing is overwritten; every
observation keeps its source and timestamp so a wrong signal can be traced back.

### 3. Enrich

Enrichment is expensive — a headless browser per site — so it runs only on companies
that clear a cheap pre-filter, and results are cached with a TTL (7 days for web
probes, 24 hours for GitHub).

The pre-filter is deliberately crude and uses only data already collected, costing no
network calls: the company must have at least one `pay_capacity` signal (local: review
count above a configured floor, or paid ads, or a premium listing; startup: funding
within the last 180 days, or an active job listing), and must not already be a `dead`
lead. Everything else proceeds to enrichment. The filter exists to bound cost, not to
rank — ranking is the scorer's job, and it runs after enrichment so it can see the gap
signals.

- **Web probe** (Playwright, Chromium): homepage plus up to two key pages. Records
  console errors, failed requests, missing mobile viewport, broken links, transfer
  weight, HTTPS and certificate state, and coarse Lighthouse scores. Also detects the
  abandoned-site pattern: expired builder trials, copyright footers years out of date.
- **GitHub probe** (startup mode, public orgs only): open issue count, median issue
  age, last commit date, stale PR count, CI presence, public Dependabot alerts.
- **Team size**: count of people on an about or team page. Coarse, but adequate below
  roughly twenty people, which is the entire target range.
- **Staleness**: date of last blog post, changelog entry, or app-store update.
- **Contact discovery**: `mailto:` links, contact pages, phone numbers, and the social
  handles a business publishes on its own site. Handles are recorded as strings for
  the human to use. gigpull does not fetch authenticated platform content.

Concurrency is bounded by `p-limit` with per-host politeness delays. `robots.txt` is
respected for all HTML fetching.

### 4. Score

A deterministic weighted sum over independent axes. Not an LLM judgement — when a
lead ranks wrongly, the operator must be able to see which axis caused it and change
one number.

| Axis | Meaning | Local signals | Startup signals |
|---|---|---|---|
| `pay_capacity` | Can they pay | review volume, runs paid ads, multiple locations, premium listing | funding recency and stage, hiring at all |
| `urgency` | Do they need it now | recent bad reviews, seasonal category | days since raise or launch |
| `gap` | Size of visible gap | no site, dead site, marketplace-only ordering | probe defects, stalled repo, stale changelog |
| `reachability` | Can the decision-maker be reached | direct phone or owner email | founder email, small team |
| `latency_bonus` | Uncrowded | — | no advertised role |

Weights live in a versioned config file. Each score row stores its `weights_version`
and a full per-axis breakdown, so re-tuning is auditable and old scores stay
interpretable.

Weights are initially guesses. The tracker records a thumbs up/down per lead; after
roughly fifty labels the weights get a first real tuning pass. This is expected work,
not a failure.

### 5. Brief

Per lead, one short block assembled from stored signals and defects. The LLM's job is
phrasing only — every fact in a brief traces to a row in `signals` or `probes`. It
does not infer, estimate, or embellish, and a brief with no concrete facts is
suppressed rather than padded.

```
Anand Sweets, Indiranagar — 4.5★, 892 reviews, no website
Running 3 active Meta ads. Zomato-only ordering. Instagram bio → Linktree.
Owner: +91 98xxx · anandsweets.blr@gmail.com
Angle: direct WhatsApp ordering, skip the 25% aggregator cut.
```

The angle line states the business problem in the target's terms, not the technology
proposed to fix it.

### 6. Track

Lead status: `new → shortlisted → contacted → replied → dead`, plus a follow-up date
and free-text notes. Prevents double-contacting and surfaces nudges due at day seven.
Also stores the thumbs up/down that feeds scorer tuning.

## Data model

```
companies   id, identity_key (unique), mode, name, city, category,
            website, created_at, updated_at
signals     id, company_id, source, kind, value_json, observed_at
probes      id, company_id, kind, ok, result_json, ran_at, expires_at
contacts    id, company_id, type, value, source
scores      id, company_id, total, breakdown_json, weights_version, scored_at
leads       id, company_id, status, brief_md, rating,
            contacted_at, follow_up_at, notes
runs        id, collector, mode, started_at, finished_at, ok, item_count, error
```

`identity_key` carries the unique constraint. Everything else references `companies`.

## Tech stack

TypeScript end to end — one toolchain, and types shared between collectors and any
later dashboard.

| Layer | Choice |
|---|---|
| Runtime | Node 22, TypeScript, ESM |
| HTTP | native `fetch`, `p-limit` for concurrency |
| HTML parsing | `cheerio` |
| Browser probes | `playwright` (Chromium) |
| Validation | `zod` at every external boundary |
| Database | `better-sqlite3` + `drizzle-orm` |
| LLM | `@anthropic-ai/sdk` |
| CLI | `commander` |
| Tests | `vitest` |
| Scheduling | systemd user timer |

`drizzle-orm` is chosen so that moving to Postgres or Neon later — if a hosted
dashboard is ever wanted — is a driver change rather than a rewrite.

### External credentials

| Key | Cost | Notes |
|---|---|---|
| Google Places API (New) | free monthly credit, then per-lookup | requires a GCP project with billing enabled — **operator action required** |
| Meta Ad Library | free | requires a Meta developer app |
| Anthropic API | usage-based | extraction and brief phrasing only |
| GitHub token | free | raises rate limits |
| Product Hunt token | free | developer account |

## Error handling

- **Collector failure** is isolated. One source breaking does not abort the run; the
  failure is recorded in `runs` with its error and reported in the run summary.
- **Schema drift** surfaces as a `zod` parse error naming the collector and field.
  Treated as a loud failure, never coerced.
- **Probe failure** — timeout, TLS error, bot wall — is stored as a probe with
  `ok = false`. Absence of evidence is never scored as evidence of a gap.
- **Rate limits** get exponential backoff and are respected, never worked around.
- **LLM failure or refusal** falls back to a plain templated brief from stored facts.
  A lead is never dropped because phrasing failed.

## Testing

- **Collectors**: fixture-driven. Saved API responses and HTML snapshots per source;
  tests assert parsing and schema conformance offline. Fixtures are refreshed
  deliberately, and a refresh that breaks a test is the intended early warning of
  source rot.
- **Dedupe**: unit tests over the known-hard cases — name variants, `www` and scheme
  differences, marketing-domain aliases, and two genuinely distinct companies that
  must not merge.
- **Scorer**: pure function, therefore directly unit-testable. Table-driven cases
  pinning the ordering of hand-built companies.
- **Probes**: run against a local fixture server serving deliberately broken pages —
  console errors, missing viewport, expired-looking footers — so assertions are stable
  and no third-party site is hit in CI.
- **Brief**: asserts every fact in generated output traces to a stored row, and that a
  factless company yields no brief.

## Out of scope for v1

Auto-sending; a web dashboard; authenticated-platform scraping; multi-user support;
hosted deployment; email verification services; CRM integration.

## Risks

1. **Dedupe quality** — the dominant failure mode of tools in this shape. Mitigated by
   explicit identity keys rather than fuzzy name matching.
2. **Google Places cost** — the only meaningful running cost. Mitigated by caching
   place lookups aggressively and bounding queries per run.
3. **Source rot** — listing sites redesign. Mitigated by fixtures, schema validation,
   and isolated per-collector failure.
4. **Cold scoring** — the weights are guesses until labelled. Accepted, with the
   labelling loop built in from the start.
5. **Operator follow-through** — a shortlist nobody messages is worth nothing. The
   tool's value is bounded by outreach actually happening; briefs are optimised for
   time-to-send for this reason.
