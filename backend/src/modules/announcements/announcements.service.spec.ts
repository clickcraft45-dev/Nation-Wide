import { slugify } from './announcements.service';

describe('slugify', () => {
  it('turns a title into a URL segment', () => {
    expect(slugify('Diwali Sale 2026!')).toBe('diwali-sale-2026');
    expect(slugify('  --Holiday: closed 1-3 Nov--  ')).toBe(
      'holiday-closed-1-3-nov',
    );
  });
});
