import { generatePassword } from './generated-password';

describe('generatePassword', () => {
  it('is long enough to clear the 10-character minimum the DTOs enforce', () => {
    expect(generatePassword().length).toBe(16);
  });

  it('avoids characters that are ambiguous when read off a screen', () => {
    const sample = Array.from({ length: 200 }, () => generatePassword()).join('');
    expect(sample).not.toMatch(/[0O1lI]/);
  });

  it('does not repeat itself', () => {
    const generated = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(generated.size).toBe(500);
  });
});
