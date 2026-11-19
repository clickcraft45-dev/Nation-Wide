import { dialablePhone } from './phone.util';

describe('dialablePhone', () => {
  it('keeps a real E.164 number', () => {
    expect(dialablePhone('+919876543210')).toBe('+919876543210');
  });

  it('drops the Google sign-up placeholder and empty values', () => {
    expect(dialablePhone('google:102054546467701321467')).toBeNull();
    expect(dialablePhone('')).toBeNull();
    expect(dialablePhone(null)).toBeNull();
    expect(dialablePhone(undefined)).toBeNull();
  });
});
