export function canonicalDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Reject opaque non-web schemes (mailto:, tel:, javascript:) before prepending
  // a scheme — otherwise "mailto:a@b.com" becomes "https://mailto:a@b.com", which
  // parses as userinfo plus the host b.com. A scheme name never contains a dot,
  // which is what separates "mailto:x" from a bare "acme.com:8080".
  const opaqueScheme = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(?!\/\/)/);
  if (opaqueScheme && !opaqueScheme[1]!.includes(".")) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
  const withScheme = hasScheme ? raw : `https://${raw}`;
  let host: string;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes(".") || host.includes(" ")) return null;
  return host.startsWith("www.") ? host.slice(4) : host;
}

export function domainIdentity(url: string): string | null {
  const domain = canonicalDomain(url);
  return domain ? `domain:${domain}` : null;
}

export function placeIdentity(placeId: string): string {
  return `place:${placeId}`;
}
