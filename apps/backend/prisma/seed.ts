import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nationwide.dev';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log(`Seeded admin user: ${admin.email} (role: ${admin.role})`);
  console.log(
    SEED_ADMIN_PASSWORD === 'ChangeMe123!'
      ? 'Using default dev password "ChangeMe123!" — override with SEED_ADMIN_PASSWORD for anything beyond local dev.'
      : 'Password set from SEED_ADMIN_PASSWORD env var.',
  );

  // Real ICL API details aren't wired up yet (see Section 12/31) — this row lets orders
  // and shipments reference a provider today, ahead of the real ICLAdapter landing in Phase 6.
  const iclProvider = await prisma.shippingProvider.upsert({
    where: { code: 'ICL' },
    update: {},
    create: {
      code: 'ICL',
      name: 'ICL',
      adapterClass: 'ICLAdapter',
      isActive: true,
    },
  });

  console.log(`Seeded shipping provider: ${iclProvider.code} (${iclProvider.name})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
