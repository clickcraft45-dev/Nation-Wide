import { termLines } from './tax-invoice-template';

describe('termLines', () => {
  it('splits one term per line, dropping blanks and any numbering the admin typed', () => {
    expect(
      termLines(
        '1. Goods at owner risk\r\n\n2) Claims within 7 days\n- No cash refunds  ',
      ),
    ).toEqual([
      'Goods at owner risk',
      'Claims within 7 days',
      'No cash refunds',
    ]);
  });

  it('keeps a term that merely starts with a number', () => {
    expect(termLines('30 days credit for account customers')).toEqual([
      '30 days credit for account customers',
    ]);
  });
});
