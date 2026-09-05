/**
 * Production-safe seed for the very first ADMIN user.
 *
 * Deliberately separate from seed.ts: that one is a development fixture that creates demo
 * customers, shipments and quotes, and must never run against production. This script touches
 * exactly one row in admin_users and nothing else.
 *
 * Credentials come from the environment only — there is no default password here, because a
 * default is what ends up unchanged on a live box. Run with:
 *
 *   npm run db:seed:admin --workspace=backend
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Same cost factor as AuthService.PASSWORD_HASH_ROUNDS — a hash written here must verify against
// bcrypt.compare() in the login path, and be indistinguishable from one the app wrote itself.
const PASSWORD_HASH_ROUNDS = 10;

// Both rules mirror RegisterDto so a seeded admin could not be created weaker than a
// self-registered user: length over complexity (NIST 800-63B), and E.164 phone.
const MIN_PASSWORD_LENGTH = 10;
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. All four of ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME and ADMIN_PHONE are required.`);
  }
  return value;
}

async function main(): Promise<void> {
  const email = required('ADMIN_EMAIL').toLowerCase();
  const password = required('ADMIN_PASSWORD');
  const name = required('ADMIN_NAME');
  const phone = required('ADMIN_PHONE');

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!E164_REGEX.test(phone)) {
    throw new Error('ADMIN_PHONE must be in E.164 format, e.g. +919876543210');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL is not a valid email address.');
  }

  // AuthService.findAccountByEmail resolves admin_users before customers, so an admin sharing an
  // email with an existing customer would silently shadow that customer's login. Refuse rather
  // than create the collision.
  const clashingCustomer = await prisma.customer.findUnique({
    where: { email },
    select: { id: true },
  });
  if (clashingCustomer) {
    throw new Error(
      `A customer account already uses ${email}. Choose a different ADMIN_EMAIL — an admin with this address would shadow that customer's login.`,
    );
  }

  const existing = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, role: true, isActive: true },
  });

  // update: {} is the whole idempotency guarantee — a second run must not rotate the password,
  // rename the user, or reactivate an account somebody deliberately disabled.
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
      name,
      phone,
      role: 'ADMIN',
      isActive: true,
    },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (existing) {
    console.log(`Admin already exists, left untouched: ${admin.email} (role=${existing.role}, isActive=${existing.isActive})`);
    if (existing.role !== 'ADMIN' || !existing.isActive) {
      console.warn(
        `WARNING: that account is role=${existing.role} isActive=${existing.isActive}, not an active ADMIN. This seed will not change it — promote it deliberately if that is what you want.`,
      );
    }
    return;
  }

  console.log(`Created admin ${admin.email} (role=${admin.role}, isActive=${admin.isActive}).`);
}

main()
  .catch((error: Error) => {
    // Message only — never the stack, which on a bad DATABASE_URL includes the connection string.
    console.error(`Admin seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
