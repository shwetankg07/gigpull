/**
 * Name canonicalisation for graph nodes.
 *
 * The upstream dataset is hand-curated, so the same tag or investor arrives
 * under several spellings — 'SaaS'/'saas', 'Deep Tech'/'Deeptech'/'deeptech',
 * 'Info Edge Ventures'/'InfoEdge Ventures'. Left alone these become separate
 * nodes, and the graph shows three fintech clusters where there is one.
 *
 * Measured on the live data, squashing to alphanumerics merges 1,248 tag
 * spellings into 1,089 groups and 504 investor spellings into 497, and every
 * merge inspected was correct — except one, which is why '+' survives below.
 */

/**
 * '+' is kept because it is the only punctuation in this dataset that carries
 * meaning: 'Series B' and 'Series B+' are different funding stages, and
 * stripping it would silently merge them.
 */
export function canonicalKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");
}

export interface CanonicalGroup<Id> {
  key: string;
  display: string;
  ownerIds: Id[];
}

/** Locale-independent ordering; localeCompare would vary by machine. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface CanonicalEntry<Id> {
  name: string;
  ownerId: Id;
}

/**
 * Groups entries by canonical key, choosing the most common surface form as
 * the display name.
 *
 * Ties break towards the smaller code-unit sequence, which puts the
 * capitalised form first — 'Logistics' over 'logistics', where the live data
 * has 13 of each. Arbitrary, but it reads better, and it is compared by code
 * unit rather than by locale so the choice cannot vary between machines.
 */
export function groupByCanonical<Id>(
  entries: Array<CanonicalEntry<Id>>,
): Array<CanonicalGroup<Id>> {
  const groups = new Map<string, { forms: Map<string, number>; owners: Set<Id> }>();

  for (const { name, ownerId } of entries) {
    const trimmed = name.trim();
    const key = canonicalKey(trimmed);
    if (!key) continue;

    let g = groups.get(key);
    if (!g) groups.set(key, (g = { forms: new Map(), owners: new Set() }));
    g.forms.set(trimmed, (g.forms.get(trimmed) ?? 0) + 1);
    g.owners.add(ownerId);
  }

  const out = [...groups].map(([key, g]) => ({
    key,
    display: [...g.forms].sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))[0]![0],
    ownerIds: [...g.owners],
  }));

  // Largest first: consumers slice off the hubs, and stable ordering keeps
  // stored layouts from shuffling between runs on unchanged data.
  return out.sort((a, b) => b.ownerIds.length - a.ownerIds.length || byCodeUnit(a.key, b.key));
}
