import { rupeesInWords, websiteHost } from './tax-invoice-template';

describe('rupeesInWords', () => {
  it('spells amounts in the Indian system, with paise', () => {
    expect(rupeesInWords(19282.4)).toBe(
      'Rupees Nineteen Thousand Two Hundred Eighty-Two and Forty Paise Only',
    );
    expect(rupeesInWords(12345678)).toBe(
      'Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only',
    );
    expect(rupeesInWords(100000)).toBe('Rupees One Lakh Only');
    expect(rupeesInWords(0)).toBe('Rupees Zero Only');
    expect(rupeesInWords(0.05)).toBe('Rupees Zero and Five Paise Only');
  });
});

describe('websiteHost', () => {
  it('prints the site, not the page the admin pasted', () => {
    expect(
      websiteHost('https://www.nationwidelogistics.co/admin/invoices'),
    ).toBe('nationwidelogistics.co');
    expect(websiteHost('nationwidelogistics.co')).toBe(
      'nationwidelogistics.co',
    );
  });
});
