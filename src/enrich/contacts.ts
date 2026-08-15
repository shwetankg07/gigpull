import * as cheerio from "cheerio";

export type ContactType = "email" | "phone" | "instagram" | "linkedin" | "x";

export interface DiscoveredContact {
  type: ContactType;
  value: string;
}

const SOCIAL_PATTERNS: Array<{ type: ContactType; re: RegExp }> = [
  { type: "instagram", re: /instagram\.com\/([A-Za-z0-9._]+)/i },
  { type: "linkedin", re: /linkedin\.com\/(?:company|in)\/([A-Za-z0-9._-]+)/i },
  { type: "x", re: /(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i },
];

export function extractContacts(html: string, _baseUrl: string): DiscoveredContact[] {
  const $ = cheerio.load(html);
  const found = new Map<string, DiscoveredContact>();

  const add = (type: ContactType, value: string) => {
    const trimmed = value.trim();
    if (trimmed) found.set(`${type}:${trimmed}`, { type, value: trimmed });
  };

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.toLowerCase().startsWith("mailto:")) {
      add("email", href.slice(7).split("?")[0] ?? "");
      return;
    }
    if (href.toLowerCase().startsWith("tel:")) {
      add("phone", href.slice(4));
      return;
    }
    for (const { type, re } of SOCIAL_PATTERNS) {
      const m = href.match(re);
      if (m?.[1]) {
        add(type, m[1]);
        return;
      }
    }
  });

  return [...found.values()];
}
