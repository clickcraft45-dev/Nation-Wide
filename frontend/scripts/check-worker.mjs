/**
 * Fails (exit 1) if the Worker answers any of these routes with a 5xx.
 *
 *   node scripts/check-worker.mjs                      boot .open-next/worker.js locally and check it
 *   node scripts/check-worker.mjs https://example.com  check a live deployment
 *
 * Why: `next build` and `opennextjs-cloudflare build` both pass when the Worker cannot start. On
 * 12 Oct 2026 a lockfile refresh pulled Next 16.4 under OpenNext 1.20.6, every request threw
 * "Unexpected loadManifest(/.next/server/preview-props.json)", and the site served Cloudflare
 * error 1101 until someone noticed. Only a real request catches that, so deploy:cf runs this first.
 *
 * ponytail: three routes that render without the API. Add a dynamic route here if one ever breaks
 * on its own; those need the backend up, which a local check cannot assume.
 */
import { unstable_dev } from 'wrangler';

const ROUTES = ['/', '/login', '/track'];
const target = process.argv[2];

let base = target?.replace(/\/$/, '');
let worker;
if (!base) {
  worker = await unstable_dev('.open-next/worker.js', {
    config: 'wrangler.jsonc',
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
  base = `http://${worker.address}:${worker.port}`;
}

let failed = false;
for (const route of ROUTES) {
  let status, detail = '';
  try {
    const res = await fetch(base + route, { redirect: 'manual' });
    status = res.status;
    if (status >= 500) {
      const body = await res.text();
      // Cloudflare's 1101 page is a full HTML document; its <title> is the useful part.
      detail = (body.match(/<title>([^<]*)/)?.[1] ?? body).replace(/\s+/g, ' ').slice(0, 300);
    }
  } catch (err) {
    status = 'no response';
    detail = err.message;
  }
  const ok = typeof status === 'number' && status < 500;
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${status}  ${base}${route}${detail ? `\n      ${detail}` : ''}`);
}

await worker?.stop();

if (failed) {
  console.error(
    target
      ? '\nThe live site is failing. Roll back with: npx wrangler rollback\nThen read the error with: npx wrangler tail nation-wide'
      : '\nThe built Worker does not serve pages, so nothing was deployed. Usually Next.js moved ahead of\n@opennextjs/cloudflare: check its supported range with `npm view @opennextjs/cloudflare peerDependencies`.',
  );
  process.exit(1);
}
