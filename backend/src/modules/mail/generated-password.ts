import { randomInt } from 'node:crypto';

// No 0/O/1/l/I. These credentials get read off a screen and typed by hand, and a partner locked
// out because "was that a one or an ell" is a support call, not a security improvement.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A first password for an account someone else is creating.
 *
 * Length 16 over this alphabet is ~93 bits of entropy, comfortably past the 10-character minimum
 * the DTOs enforce. `randomInt` (CSPRNG, rejection-sampled) rather than Math.random: this value
 * is a credential, and Math.random is both predictable and biased across an alphabet whose size
 * does not divide 2^32.
 */
export function generatePassword(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
