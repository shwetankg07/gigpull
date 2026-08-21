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
 105    125  Example Tiffin Room
 137    125  Example Spa & Salon
 165    125  Example Tea House

$ gigpull show 105
**Example Tiffin Room, Indiranagar, Bangalore** — no website
Contact: 080 00000000 (phone)
```

<sub>Sample output uses invented businesses. Real runs return real
establishments and their published contact details — treat that database as
third-party personal data and keep it out of version control.</sub>

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

Every lead also carries **Google Maps, Street View and source links**, built from
the name and coordinates already collected — no API key, no billing. Looking at
the storefront and the review count takes ten seconds and tells you far more than
a database row about whether a place is worth a call.

## Two tabs

**Local gigs** runs on your machine against SQLite, exactly as before. **Startups**
is a deployed board over Bangalore's startup ecosystem, backed by Supabase and
gated behind a login.

They share one pipeline and one schema; the mode is a column, not a fork.

### The startup tab

Seeded from [bangalorestartupmap.com](https://bangalorestartupmap.com) — 885
startups and 72 funds, with stage, sector, headcount, funding, founders and
investors. There is no JSON API, so the collector reassembles the dataset from
the page's inline Next.js flight stream and validates it with zod.

It ranks on **the odds of a reply from somewhere that can pay**, which is a
narrower goal than "best company" and was chosen deliberately: when every
stage, sector and team size is acceptable, category filters rank nothing and
leave 885 companies tied. Five axes, each measuring one thing in one
direction:

| Axis | Reads |
|---|---|
| `receptivity` | headcount and stage — small places answer students |
| `pay_capacity` | funding, with headcount only as a fallback |
| `reachability` | founder link, company LinkedIn, website |
| `latency` | **no** advertised role, per this tool's whole premise |
| `proximity` | distance to your nearest anchor — a bonus, never a filter |

The funded-but-small sweet spot is not encoded in any axis. It emerges from
receptivity falling as pay capacity rises, which keeps the reasoning visible
and the weights tunable.

> **A worked failure.** The first live run put Razorpay, CRED and Ola on top.
> Reachability, funding figures and careers pages all correlate with company
> size, and the unit tests had held those constant — so the ranking had
> quietly become "biggest company wins". Fixed by preferring known funding
> over inferred headcount, narrowing the reachability spread, and rewarding
> unadvertised need instead of a visible opening.

### The graph

Investors and niche tags are drawn as **hub nodes**, not as lines between
companies. Pairwise, shared-investor edges come to 4,591 — Peak XV alone backs
53 of these companies and forms a 1,378-edge clique. As hubs it is 751, and a
line to a labelled hub also tells you *why* two companies are connected.

Live totals: **1,433 nodes, 1,769 edges**, median company degree 1. Tags above
8 members are excluded — `saas` has 133 and says only what the sector colour
already says.

Layout is computed by the worker and stored, never simulated in the browser.

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

## Deploying the startup tab

```bash
# 1. Supabase: run the migration, then create your user by hand.
#    There is no sign-up form — this board holds other people's contact details.
psql "$DATABASE_URL" -f packages/core/sql/001_startup_tab.sql

# 2. Fill it.
DATABASE_URL=... GIGPULL_ANCHORS="lat,lon;lat,lon" gigpull startup-sync

# 3. Deploy. render.yaml defines the web service and a weekly sync job.
```

Row level security is on for every table with no anonymous policy anywhere.
That matters more than it looks: the browser is handed the Supabase anon key,
which is public by design, and RLS is the only thing between that key and
every founder's contact details in the database. `DATABASE_URL` is
server-side only and is asserted absent from the client bundle.

`GIGPULL_ANCHORS` is optional and personal — it describes where you spend your
weekdays. It belongs in `.env`, never in the repository.

## Commands

```
gigpull run [--mode local|startup|both] [--region <spec>] [--categories a,b,c]
gigpull startup-sync        collect startups into Postgres, rebuild the graph
gigpull regions             list built-in regions
gigpull web [-p 4321]       lead board in a browser  <- start here
gigpull list [-n 20]        ranked shortlist, dead leads hidden
gigpull show <id>           print one lead's brief
gigpull mark <id> <status>  shortlisted | contacted | replied | dead
gigpull rate <id> 1|-1      feeds weight tuning
gigpull rescore             re-score + re-rank what is stored, no refetching
gigpull followups           leads due for a nudge
```

`rescore` matters more than it looks: re-scoring is the inner loop of weight
tuning, and re-collecting thousands of businesses to change one weight would
make tuning impractical.

### Regions

`--region` takes a preset (`bangalore`, `mumbai`, `jabalpur`…), the `metros`
group, an Indian PIN code, any place name, or a raw `south,west,north,east`
bbox. Anything without a preset is geocoded through Nominatim. PIN codes are
looked up as postal codes rather than free text, because name search is
ambiguous where it matters — "Sihora" returns a namesake in Damoh district,
while `483225` gives the Jabalpur one.

**There is no all-India region, deliberately.** Overpass is a free volunteer
service with hard memory and time limits; a query spanning the country would
time out, would be abusive even if it did not, and would return far more leads
than anyone can work. Regions are queried one request at a time so a failure in
one does not lose the others.

> **OSM coverage collapses outside the metros.** Measured on real runs:
> Bangalore returns ~9,200 businesses with ~1,200 reachable; Jabalpur returns
> 28 with 1 reachable; Sihora returns **zero** — its entire bounding box holds
> 38 named OSM objects, none of them shops. The tool is not broken there, the
> map is empty. For tier-2 and tier-3 towns you need Google Places or local
> knowledge, not OpenStreetMap.

### The board

`gigpull web` serves a kanban of every lead across the five statuses, bound to
loopback only — the database holds third-party contact details and the server
has no authentication.

Each lead shows its brief, click-to-copy contacts, and a **why it ranks here**
panel breaking the score down per axis. That panel is the reason the scorer is
deterministic: when a lead ranks wrongly you can see which axis caused it and
change one weight, rather than arguing with a model. It also makes structural
gaps obvious — with OSM as the only source, every lead shows `pay capacity 0`,
which is exactly why scores cluster.

The database is created in the working directory, so run it from one place.

## Scope

**Does not** send email or DMs, scrape Instagram or LinkedIn, or touch any
authenticated surface. Social handles are recorded as strings from a business's
own site or listing, for a human to use. `robots.txt` is respected for all HTML
fetching, and probes run under per-host politeness delays.

Ranking is blind to technology stack — no boost for familiar work, no penalty
for unfamiliar. It ranks only on properties of the opportunity: ability to pay,
urgency, size of the visible gap, and reachability.

### The database holds other people's data

`gigpull.db` accumulates names, phone numbers, and email addresses belonging to
real businesses. It is gitignored, and it should stay that way — do not commit
it, publish it, share it, or paste extracts of it anywhere public. The same goes
for screenshots and issue reports: scrub real contact details first. Everything
in this repository's docs and fixtures is invented for that reason.

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
npm test          # 269 tests
npm run build
npx tsc --noEmit
```

Design and implementation notes live in `docs/superpowers/`.

## License

MIT
