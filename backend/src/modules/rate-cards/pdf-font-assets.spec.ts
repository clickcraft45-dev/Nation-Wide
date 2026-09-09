import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Both PDF templates (classic-template.ts for rate cards, tax-invoice-template.ts for GST
// invoices) register NotoSans from this exact path expression, and @react-pdf/renderer reads a
// registered font at render time — a missing file throws ENOENT and fails the whole render.
//
// The container previously shipped backend/dist and backend/prisma but not backend/assets, so
// every rate card and every GST invoice 500'd in production while both worked locally. This is
// the smallest thing that fails if the fonts stop being reachable from the working directory.
describe('PDF font assets', () => {
  const fontsDir = join(process.cwd(), 'assets', 'fonts');

  it.each(['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf'])(
    'ships %s where the templates look for it',
    (file) => {
      expect(existsSync(join(fontsDir, file))).toBe(true);
    },
  );
});
