# gigpull

Finds organisations that need engineering help — with emphasis on the ones
**not advertising for it** — and turns each into a short brief you can act on.

Companies with an open job listing are an efficient, crowded market. Companies
with a visible gap and no listing are an inefficient one, where a specific,
well-researched message arrives as the only message of its kind. gigpull targets
the second group.

**It never sends anything.** It ranks, researches, and writes a brief. You read
it and write the message yourself.

```
$ gigpull run --source osm --categories restaurant,salon
{ collected: 331, created: 331, scored: 296, reranked: 40, dropped: 5 }

$ gigpull list
 105    125  Suryawanshi
 137    125  Aurah Spa And Salon
 165    125  Burma Burma Restaurant & Tea Room

$ gigpull show 105
**Suryawanshi, Indiranagar, Bangalore** — no website
Contact: 080 49653148 (phone)
```

## How it works

Six stages, with SQLite between each, so any stage re-runs against existing rows
without re-running the ones before it.

```
collect → normalise → enrich → score → brief → track
```

**collect** — one module per source, each parsed through a `zod` schema at the
boundary. A source that changes shape fails loudly and in isolation; the rest of
the run continues.

**normalise** — dedupes on an explicit identity key (`osm:node/123`,
`place:ChIJ…`, `domain:acme.com`), never on names. This is the stage that decides
whether the shortlist is usable.

**enrich** — headless Chromium visits the site and records concrete defects:
console errors, missing mobile viewport, no HTTPS, a copyright footer years out
of date. Only companies that clear a cheap pre-filter get a browser.

**score** — two phases. A deterministic weighted sum ranks everything, then an
LLM reranks only the top N. Deterministic first because re-scoring is the inner
loop of weight tuning and needs to be instant and free; the LLM second because
some bad leads are invisible to a formula. On the first live run the formula
ranked a government office above a real restaurant — the rerank caught it.

**brief** — every fact traces to a stored row. A company with no concrete facts
produces no brief rather than a padded one.

**track** — `new → shortlisted → contacted → replied → dead`, with day-7
follow-ups and a thumbs rating that feeds weight tuning.

## Two modes

| | `local` | `startup` |
|---|---|---|
| Target | Restaurants, clinics, gyms, salons, institutes | Funded startups and small product companies |
| Discovery | OpenStreetMap Overpass, or Google Places | Funding news, GitHub |
| Core gap signal | No website, or a dead one | Probe defects, stalled repo, stale changelog |

Both run through the same pipeline. Mode is a column, not a fork.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env     # then fill in what you have
npm run build && npm link
```

Everything works with **no billing account and no paid API**:

- **OpenStreetMap Overpass** for discovery — no key, no account. Tries three
  mirrors in order, because the main volunteer instance returns 504 under load.
- **Gemini** for reranking — free tier via [AI Studio](https://aistudio.google.com),
  no Google Cloud billing needed.

Google Places is supported (`--source places`) and gives better coverage plus
review counts, but needs a Cloud project with billing enabled.

> **Places cost note:** the field mask decides the price tier. Requesting
> `rating` puts you on the Enterprise SKU — 1,000 free calls/month, then
> ~$35/1,000. Requesting review *text* raises that to $40/1,000 for data gigpull
> does not use. `PLACES_FIELD_MASK` is a single locked constant with a test
> asserting no review-text field, so an accidental addition fails CI rather than
> the bill. Set a quota cap in Google Cloud before the first real run.

## Commands

```
gigpull run [--source osm|places] [--categories a,b,c] [--ad-targets file.json]
gigpull list [-n 20]        ranked shortlist, dead leads hidden
gigpull show <id>           print one lead's brief
gigpull mark <id> <status>  shortlisted | contacted | replied | dead
gigpull rate <id> 1|-1      feeds weight tuning
gigpull followups           leads due for a nudge
```

The database is created in the working directory, so run it from one place.

## Scope

**Does not** send email or DMs, scrape Instagram or LinkedIn, or touch any
authenticated surface. Social handles are recorded as strings from a business's
own site or listing, for a human to use. `robots.txt` is respected for all HTML
fetching, and probes run under per-host politeness delays.

Ranking is blind to technology stack — no boost for familiar work, no penalty
for unfamiliar. It ranks only on properties of the opportunity: ability to pay,
urgency, size of the visible gap, and reachability.

## Known limitations

- **OSM gives a list, not a ranking.** Without review counts there is no
  ability-to-pay signal, so scores cluster. Places or a Justdial collector fixes
  this; the axis already exists and is unfed.
- **OSM contact coverage is thin** — roughly 15% of found businesses carry a
  phone or email. Places is materially better here.
- **The Meta Ad Library collector is dormant outside the EU/UK.** The API returns
  only political and social-issue ads elsewhere, so `runs_ads` stays empty in
  India. The collector is correct; the source has nothing to give it.
- **Weights are guesses until labelled.** Rate ~50 leads before the ranking
  means much.

## Development

```bash
npm test          # 112 tests
npm run build
npx tsc --noEmit
```

Design and implementation notes live in `docs/superpowers/`.

## License

MIT
