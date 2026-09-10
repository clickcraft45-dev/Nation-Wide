import { createElement as h } from 'react';
import { join } from 'node:path';
import type { RateCardData } from '../rate-card-data.service';
import { brandAsset } from '../brand-assets';

// Plain React.createElement calls, not JSX — this is a NestJS backend with no other UI code, so
// this file deliberately avoids pulling a JSX toolchain (tsconfig "jsx" option, .tsx extension)
// into an otherwise API-only project just for one template.
//
// @react-pdf/renderer ships ESM-only (package.json "type": "module", no CJS entrypoint) — a
// top-level `import` of it here would make Jest's CJS test runtime crash the instant anything
// requires this file (e.g. app.module.ts's import chain in an e2e spec that never even touches
// PDF rendering). A dynamic `import()` defers loading to Node's own ESM interop at call time,
// which both the real server and Jest handle fine, instead of a static require at module-load.

// A Zone can have dozens of member countries (e.g. a real FedEx "Rest of Africa" zone has 49) —
// cramming that many columns onto one page is unreadable regardless of font size, so country
// columns are paginated into fixed-size chunks, each getting its own page with the full header
// repeated for context. This is what lets the layout "support any number of countries" without
// breaking. Fewer per page than the original design since each column is now wider (flag + name
// + transit time).
const COUNTRIES_PER_PAGE = 4;

// Black-and-white document: the brand shows through the wordmark, not a colour wash. The
// settings' primaryColor is deliberately not used here.
const INK = '#0b0b0c';

// The PDF's base-14 fonts (Helvetica etc.) have no ₹ glyph — Noto Sans is bundled as a real asset
// (not fetched over the network at render time) specifically because it covers the Indian Rupee
// Sign (U+20B9). Registered once per process, not once per render.
let fontRegistered = false;
function ensureFontRegistered(
  Font: Awaited<typeof import('@react-pdf/renderer')>['Font'],
) {
  if (fontRegistered) return;
  // process.cwd() (not __dirname) so this resolves the same way whether running compiled
  // (dist/src/...) or via ts-node — both are invoked with backend as the working directory.
  // These fonts ship inside the image and are read-only; they are not application storage.
  const fontsDir = join(process.cwd(), 'assets', 'fonts');
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: join(fontsDir, 'NotoSans-Regular.ttf') },
      { src: join(fontsDir, 'NotoSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  fontRegistered = true;
}

// StyleSheet is passed in (rather than imported at module scope) since it only exists once the
// dynamic import in renderClassicTemplate below has resolved.
function buildStyles(
  StyleSheet: Awaited<typeof import('@react-pdf/renderer')>['StyleSheet'],
  brand: string,
) {
  return StyleSheet.create({
    page: {
      padding: 28,
      // Room for the fixed page footer.
      paddingBottom: 56,
      fontSize: 9,
      fontFamily: 'NotoSans',
      color: '#1f2937',
    },
    // Full-bleed black band: wordmark left, company identity right.
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: brand,
      marginHorizontal: -28,
      marginTop: -28,
      paddingHorizontal: 28,
      paddingVertical: 16,
      marginBottom: 18,
    },
    headerWordmark: { width: 132, height: 30, objectFit: 'contain' },
    headerWordmarkText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
    headerRight: { alignItems: 'flex-end', maxWidth: 300 },
    headerName: {
      color: '#ffffff',
      fontSize: 9.5,
      fontWeight: 'bold',
      textAlign: 'right',
    },
    headerMeta: {
      color: '#a1a1aa',
      fontSize: 7.5,
      marginTop: 2,
      textAlign: 'right',
    },
    titleBlock: { alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 22, fontWeight: 'bold', color: brand, letterSpacing: 1 },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 6,
    },
    subtitleDash: { fontSize: 11, color: brand },
    subtitle: {
      fontSize: 12,
      fontWeight: 'bold',
      color: brand,
      letterSpacing: 0.5,
    },
    badgeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 22,
      marginTop: 12,
    },
    badgeCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1.5,
      borderColor: brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 3,
    },
    badgeCol: { alignItems: 'center' },
    badgeLabel: {
      fontSize: 6.5,
      fontWeight: 'bold',
      color: brand,
      letterSpacing: 0.5,
    },
    infoRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
    infoCard: {
      flex: 1,
      backgroundColor: '#f4f4f5',
      borderRadius: 8,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    infoLabel: {
      fontSize: 7,
      color: '#6b7280',
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    infoValue: { fontSize: 9.5, fontWeight: 'bold', color: '#1f2937' },
    infoValueLine: {
      fontSize: 8.5,
      fontWeight: 'bold',
      color: '#1f2937',
      marginTop: 1,
    },
    pageIndicator: {
      fontSize: 7.5,
      color: '#9ca3af',
      textAlign: 'center',
      marginBottom: 6,
    },
    tableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: brand,
      borderRadius: 6,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#e5e7eb',
    },
    weightCell: { width: 90, padding: 8, fontWeight: 'bold', fontSize: 9 },
    weightHeaderCell: { width: 90, padding: 10, justifyContent: 'center' },
    countryHeaderCell: { flex: 1, padding: 8, alignItems: 'center' },
    countryHeaderTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 2,
    },
    flagCircle: { width: 16, height: 16, borderRadius: 8, overflow: 'hidden' },
    flagImg: { width: 16, height: 16 },
    countryHeaderText: { color: '#ffffff', fontWeight: 'bold', fontSize: 9 },
    countryHeaderTransit: { color: 'rgba(255,255,255,0.85)', fontSize: 6.5 },
    priceCell: { flex: 1, padding: 8, textAlign: 'center', fontSize: 9 },
    footer: {
      marginTop: 12,
    },
    footerBullet: {
      flexDirection: 'row',
      gap: 4,
      marginBottom: 3,
      alignItems: 'flex-start',
    },
    footerBulletMark: { fontSize: 7, color: brand, marginTop: 1 },
    footerBulletText: {
      fontSize: 7,
      color: '#374151',
      flex: 1,
      lineHeight: 1.3,
    },
    noticeBox: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: brand,
      borderRadius: 6,
      padding: 8,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
    },
    noticeText: { fontSize: 7, color: '#374151', flex: 1, lineHeight: 1.3 },
    pageFooter: {
      position: 'absolute',
      left: 28,
      right: 28,
      bottom: 20,
      borderTopWidth: 0.75,
      borderTopColor: '#d4d4d8',
      paddingTop: 6,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    pageFooterText: { fontSize: 7, color: '#71717a' },
  });
}

function formatMoney(amount: number): string {
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

// Simple icon glyphs drawn with Svg primitives (24x24 viewBox) — a deliberately hand-approximated
// icon set, not pixel-identical stock artwork, since this is a generated document rather than a
// design file.
function badgeIcon(
  Svg: Awaited<typeof import('@react-pdf/renderer')>['Svg'],
  Path: Awaited<typeof import('@react-pdf/renderer')>['Path'],
  Circle: Awaited<typeof import('@react-pdf/renderer')>['Circle'],
  Line: Awaited<typeof import('@react-pdf/renderer')>['Line'],
  kind: 'safe' | 'reliable' | 'fast' | 'global',
  brand: string,
) {
  const common = { fill: 'none', stroke: brand, strokeWidth: 1.6 };
  if (kind === 'safe') {
    return h(
      Svg,
      { viewBox: '0 0 24 24', style: { width: 16, height: 16 } },
      h(Path, {
        ...common,
        d: 'M12,3 L19,6 V11 C19,16 16,19.5 12,21 C8,19.5 5,16 5,11 V6 Z',
      }),
    );
  }
  if (kind === 'reliable') {
    return h(
      Svg,
      { viewBox: '0 0 24 24', style: { width: 16, height: 16 } },
      h(Path, { ...common, d: 'M3,7 L12,3 L21,7 L12,11 Z' }),
      h(Path, { ...common, d: 'M3,7 L3,17 L12,21 L12,11 Z' }),
      h(Path, { ...common, d: 'M21,7 L21,17 L12,21 L12,11 Z' }),
    );
  }
  if (kind === 'fast') {
    return h(
      Svg,
      { viewBox: '0 0 24 24', style: { width: 16, height: 16 } },
      h(Path, {
        fill: brand,
        stroke: 'none',
        d: 'M13,2 L4,14 L11,14 L10,22 L20,10 L13,10 Z',
      }),
    );
  }
  return h(
    Svg,
    { viewBox: '0 0 24 24', style: { width: 16, height: 16 } },
    h(Circle, { ...common, cx: 12, cy: 12, r: 9 }),
    h(Path, { ...common, d: 'M12,3 C8,3 8,21 12,21 C16,21 16,3 12,3 Z' }),
    h(Line, { ...common, x1: 3, y1: 12, x2: 21, y2: 12 }),
  );
}

export async function renderClassicTemplate(
  data: RateCardData,
  logoBuffer?: Buffer,
  flagBuffers?: Map<string, Buffer>,
) {
  const rp = await import('@react-pdf/renderer');
  const {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
    Font,
    Svg,
    Path,
    Circle,
    Line,
  } = rp;
  ensureFontRegistered(Font);

  const brand = INK;
  const styles = buildStyles(StyleSheet, brand);
  const scopeLabel = data.countries.map((c) => c.name).join(' & ');
  const countryChunks = chunk(data.countries, COUNTRIES_PER_PAGE);
  const settings = data.companySettings;
  // ponytail: the header is always the bundled white wordmark on black — an uploaded company logo
  // (logoBuffer) has no guaranteed contrast on black, so it is not placed here.
  const wordmark = brandAsset('wordmark-white.png');

  const badges: {
    kind: 'safe' | 'reliable' | 'fast' | 'global';
    label: string;
  }[] = [
    { kind: 'safe', label: 'SAFE' },
    { kind: 'reliable', label: 'RELIABLE' },
    { kind: 'fast', label: 'FAST' },
    { kind: 'global', label: 'GLOBAL' },
  ];

  return h(
    Document,
    { title: `Shipment Rate Card — ${scopeLabel}` },
    ...countryChunks.map((countryChunk, pageIndex) => {
      const startIndex = pageIndex * COUNTRIES_PER_PAGE;

      return h(
        Page,
        { size: 'A4', style: styles.page, key: pageIndex },
        // Header
        h(
          View,
          { style: styles.header },
          wordmark
            ? h(Image, { style: styles.headerWordmark, src: wordmark })
            : h(
                Text,
                { style: styles.headerWordmarkText },
                settings.companyName,
              ),
          h(
            View,
            { style: styles.headerRight },
            h(Text, { style: styles.headerName }, settings.companyName),
            settings.tagline
              ? h(Text, { style: styles.headerMeta }, settings.tagline)
              : null,
          ),
        ),
        // Title
        h(
          View,
          { style: styles.titleBlock },
          h(Text, { style: styles.title }, 'SHIPMENT RATE CARD'),
          h(
            View,
            { style: styles.subtitleRow },
            h(Text, { style: styles.subtitleDash }, '—'),
            h(Text, { style: styles.subtitle }, scopeLabel.toUpperCase()),
            h(Text, { style: styles.subtitleDash }, '—'),
          ),
          h(
            View,
            { style: styles.badgeRow },
            ...badges.map((badge) =>
              h(
                View,
                { style: styles.badgeCol, key: badge.kind },
                h(
                  View,
                  { style: styles.badgeCircle },
                  badgeIcon(Svg, Path, Circle, Line, badge.kind, brand),
                ),
                h(Text, { style: styles.badgeLabel }, badge.label),
              ),
            ),
          ),
        ),
        // Info row
        h(
          View,
          { style: styles.infoRow },
          h(
            View,
            { style: styles.infoCard },
            h(
              View,
              null,
              h(Text, { style: styles.infoLabel }, 'Effective From'),
              h(Text, { style: styles.infoValue }, data.effectiveDate),
            ),
          ),
          h(
            View,
            { style: styles.infoCard },
            h(
              View,
              null,
              h(Text, { style: styles.infoLabel }, 'Transit Time'),
              ...data.countries.map((c) =>
                h(
                  Text,
                  { style: styles.infoValueLine, key: c.id },
                  `${c.name}: ${c.transitTime ?? '—'}`,
                ),
              ),
            ),
          ),
        ),
        countryChunks.length > 1
          ? h(
              Text,
              { style: styles.pageIndicator },
              `Countries ${startIndex + 1}-${startIndex + countryChunk.length} of ${data.countries.length}`,
            )
          : null,
        // Pricing table
        h(
          View,
          { style: styles.tableHeaderRow },
          h(
            View,
            { style: styles.weightHeaderCell },
            h(Text, { style: styles.countryHeaderText }, 'QUANTITY'),
          ),
          ...countryChunk.map((country) => {
            const flagBuffer = flagBuffers?.get(country.id);
            return h(
              View,
              { style: styles.countryHeaderCell, key: country.id },
              h(
                View,
                { style: styles.countryHeaderTop },
                flagBuffer
                  ? h(
                      View,
                      { style: styles.flagCircle },
                      h(Image, { style: styles.flagImg, src: flagBuffer }),
                    )
                  : null,
                h(Text, { style: styles.countryHeaderText }, country.name),
              ),
              country.transitTime
                ? h(
                    Text,
                    { style: styles.countryHeaderTransit },
                    country.transitTime,
                  )
                : null,
            );
          }),
        ),
        ...data.weightRows.map((row, rowIndex) =>
          h(
            View,
            {
              style: [
                styles.tableRow,
                { backgroundColor: rowIndex % 2 === 1 ? '#f4f4f5' : '#ffffff' },
              ],
              key: row.weightKg,
            },
            h(View, { style: styles.weightCell }, h(Text, null, row.label)),
            ...countryChunk.map((country, chunkIndex) => {
              const countryIndex = startIndex + chunkIndex;
              const price = data.prices[countryIndex]?.[rowIndex] ?? null;
              const display =
                price === null
                  ? '—'
                  : row.isPerKg
                    ? `${formatMoney(price / row.weightKg)} / per kg`
                    : formatMoney(price);
              return h(
                View,
                { style: styles.priceCell, key: country.id },
                h(Text, null, display),
              );
            }),
          ),
        ),
        // Footer
        h(
          View,
          { style: styles.footer },
          settings.termsAndConditions
            ? h(
                View,
                { style: styles.footerBullet },
                h(Text, { style: styles.footerBulletMark }, '•'),
                h(
                  Text,
                  { style: styles.footerBulletText },
                  settings.termsAndConditions,
                ),
              )
            : null,
          settings.legalDisclaimer
            ? h(
                View,
                { style: styles.footerBullet },
                h(Text, { style: styles.footerBulletMark }, '•'),
                h(
                  Text,
                  { style: styles.footerBulletText },
                  settings.legalDisclaimer,
                ),
              )
            : null,
          settings.restrictedItemsNotice
            ? h(
                View,
                { style: styles.footerBullet },
                h(Text, { style: styles.footerBulletMark }, '•'),
                h(
                  Text,
                  { style: styles.footerBulletText },
                  settings.restrictedItemsNotice,
                ),
              )
            : null,
          settings.footerNotes
            ? h(
                View,
                { style: styles.footerBullet },
                h(Text, { style: styles.footerBulletMark }, '•'),
                h(
                  Text,
                  { style: styles.footerBulletText },
                  settings.footerNotes,
                ),
              )
            : null,
          settings.insuranceDisclaimer
            ? h(
                View,
                { style: styles.noticeBox },
                h(
                  Svg,
                  { viewBox: '0 0 24 24', style: { width: 14, height: 14 } },
                  h(Path, {
                    fill: 'none',
                    stroke: brand,
                    strokeWidth: 1.6,
                    d: 'M12,3 L19,6 V11 C19,16 16,19.5 12,21 C8,19.5 5,16 5,11 V6 Z',
                  }),
                ),
                h(
                  Text,
                  { style: styles.noticeText },
                  settings.insuranceDisclaimer,
                ),
              )
            : null,
        ),
        // Fixed, so it repeats on any page the table spills onto.
        h(
          View,
          { style: styles.pageFooter, fixed: true },
          h(
            Text,
            { style: styles.pageFooterText },
            [
              settings.companyName,
              settings.supportPhone,
              settings.supportEmail,
              settings.website,
            ]
              .filter(Boolean)
              .join('  ·  '),
          ),
          h(Text, {
            style: styles.pageFooterText,
            render: ({
              pageNumber,
              totalPages,
            }: {
              pageNumber: number;
              totalPages: number;
            }) => `Page ${pageNumber} of ${totalPages}`,
          }),
        ),
      );
    }),
  );
}
