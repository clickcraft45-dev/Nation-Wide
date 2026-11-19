import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PricingSearchQueryDto } from './pricing-search-query.dto';

const errors = (query: Record<string, unknown>) =>
  validateSync(plainToInstance(PricingSearchQueryDto, query)).length;

describe('PricingSearchQueryDto', () => {
  it('accepts a normal search and none at all', () => {
    expect(errors({ q: 'united states' })).toBe(0);
    expect(errors({})).toBe(0);
  });

  it('refuses a repeated q and an oversized one', () => {
    expect(errors({ q: ['a', 'b'] })).toBe(1);
    expect(errors({ q: 'x'.repeat(65) })).toBe(1);
  });
});
