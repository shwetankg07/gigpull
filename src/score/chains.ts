/**
 * National and global chains, matched before the LLM rerank.
 *
 * These outlets score well on the deterministic axes — high footfall, often no
 * individual website — but their technology is decided centrally, so a local
 * pitch goes nowhere. The rerank already drops them, but only after spending a
 * call and, worse, only after they have occupied slots in the top N that better
 * leads needed. Catching them deterministically is free and keeps the rerank
 * budget for genuine judgement calls.
 *
 * This list is deliberately short and India-weighted. It does not need to be
 * exhaustive: anything it misses still reaches the rerank, which is the real
 * safety net. Add entries when you see one waste a slot.
 */
const CHAIN_NAMES = [
  "kfc", "pizza hut", "dominos", "domino s", "mcdonalds", "mcdonald s",
  "burger king", "subway", "starbucks", "cafe coffee day", "ccd",
  "third wave coffee", "blue tokai", "chaayos", "chai point", "barista",
  "wow momo", "faasos", "behrouz", "ovenstory", "biryani blues",
  "baskin robbins", "naturals ice cream", "corner house",
  "haldiram", "bikanervala", "sagar ratna", "saravana bhavan",
  "cult fit", "cultfit", "gold s gym", "golds gym", "anytime fitness",
  "lakme salon", "naturals salon", "jawed habib", "toni guy",
  "apollo pharmacy", "medplus", "practo", "dr lal pathlabs",
  "reliance", "dmart", "more supermarket", "spencer s", "big bazaar",
];

/**
 * Normalises to lowercase words so punctuation, case, and outlet suffixes
 * ("KFC — Indiranagar") do not defeat matching.
 */
function normalise(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

export function isKnownChain(name: string): boolean {
  if (!name.trim()) return false;
  const haystack = normalise(name);
  // Padded with spaces on both sides so matching is on whole words —
  // "Subway" must not fire inside "Subwaycraft".
  return CHAIN_NAMES.some((chain) => haystack.includes(` ${chain} `));
}
