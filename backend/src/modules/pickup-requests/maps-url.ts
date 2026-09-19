/**
 * Pulls coordinates out of a Google Maps link staff paste when booking a pickup by phone.
 *
 * Covers the shapes Google actually hands out: "@lat,lng,17z" (browser), "!3dlat!4dlng" (a place),
 * "?q=lat,lng" / "?ll=" / "?query=" / "?destination=" (shared or API links). A link that names only
 * a place ("/place/Charminar") has no coordinates in it and yields null — the partner then opens the
 * link itself.
 */
export function parseMapsUrl(
  url: string,
): { latitude: number; longitude: number } | null {
  let text: string;
  try {
    text = decodeURIComponent(url);
  } catch {
    text = url;
  }
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patterns = [
    // The place pin beats the "@" viewport centre when both are present.
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(
      String.raw`[?&](?:q|ll|query|destination|center)=${num},\s*${num}`,
    ),
    new RegExp(String.raw`@${num},${num}`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}

// Only Google's own hosts are ever fetched: the server following an arbitrary pasted URL would
// let anyone with a staff login make it request internal addresses (SSRF).
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const MAX_REDIRECTS = 5;

export function isGoogleMapsUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === 'https:' &&
      (SHORT_LINK_HOSTS.has(hostname) ||
        /^(www\.)?google\.[a-z.]+$/.test(hostname) ||
        hostname === 'maps.google.com')
    );
  } catch {
    return false;
  }
}

/**
 * Parses the link, following Google's own short-link redirects when the app "Share" button produced
 * a maps.app.goo.gl link (those carry no coordinates until expanded). Never throws: an unresolvable
 * link is simply null.
 */
export async function resolveMapsUrl(
  url: string,
): Promise<{ latitude: number; longitude: number } | null> {
  let current = url.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isGoogleMapsUrl(current)) return null;
    const parsed = parseMapsUrl(current);
    if (parsed) return parsed;
    if (!SHORT_LINK_HOSTS.has(new URL(current).hostname)) return null;
    try {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      const next = res.headers.get('location');
      if (!next) return null;
      current = new URL(next, current).toString();
    } catch {
      return null;
    }
  }
  return null;
}
