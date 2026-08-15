export interface BriefInput {
  name: string;
  city: string | null;
  rating: number | null;
  reviewCount: number;
  hasWebsite: boolean;
  runsAds: boolean;
  defects: string[];
  contacts: Array<{ type: string; value: string }>;
  angle: string | null;
}

const DEFECT_LABELS: Record<string, string> = {
  console_errors: "site throws console errors on mobile",
  no_mobile_viewport: "site is not mobile-responsive",
  no_https: "site has no HTTPS",
  stale_copyright: "site footer years out of date",
};

export function buildBrief(input: BriefInput): string | null {
  const facts: string[] = [];
  if (!input.hasWebsite) facts.push("no website");
  if (input.runsAds) facts.push("running paid ads");
  for (const d of input.defects) facts.push(DEFECT_LABELS[d] ?? d);

  const hasEvidence = facts.length > 0 || input.reviewCount > 0;
  if (!hasEvidence) return null;

  const headBits = [input.name];
  if (input.city) headBits.push(input.city);
  const head = headBits.join(", ");

  const stats: string[] = [];
  if (input.rating !== null) stats.push(`${input.rating}★`);
  if (input.reviewCount > 0) stats.push(`${input.reviewCount} reviews`);
  if (!input.hasWebsite) stats.push("no website");

  const lines = [`**${head}** — ${stats.join(", ")}`];

  const rest = facts.filter((f) => f !== "no website");
  if (rest.length > 0) lines.push(rest.join(". ") + ".");

  if (input.contacts.length > 0) {
    lines.push(
      "Contact: " + input.contacts.map((c) => `${c.value} (${c.type})`).join(" · "),
    );
  }

  if (input.angle) lines.push(`**Angle:** ${input.angle}`);

  return lines.join("\n");
}
