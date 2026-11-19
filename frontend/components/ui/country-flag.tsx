/**
 * Flag for an ISO 3166-1 alpha-2 code, built from regional-indicator characters. No image
 * request: the CSP only allows our own origins in img-src, and emoji need no dependency.
 * Renders nothing for a code that is not two letters, so callers never show a broken glyph.
 */
export function countryFlagEmoji(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function CountryFlag({ code, className }: { code: string | null | undefined; className?: string }) {
  const flag = countryFlagEmoji(code);
  if (!flag) return null;
  return (
    <span aria-hidden className={className} style={{ fontFamily: '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif' }}>
      {flag}
    </span>
  );
}
