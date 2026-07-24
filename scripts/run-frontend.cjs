const { spawn } = require('node:child_process');
const { assertPortFree } = require('./find-free-port.cjs');
const { BACKEND_PORT, FRONTEND_PORT } = require('./ports.cjs');

function resolveBackendApiUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  const backendPort = process.env.BACKEND_PORT ?? String(BACKEND_PORT);
  return `http://localhost:${backendPort}/api/v1`;
}

async function run() {
  await assertPortFree(FRONTEND_PORT, 'frontend');
  const backendApiUrl = resolveBackendApiUrl();
  console.log(`Starting frontend on port ${FRONTEND_PORT} with backend API at ${backendApiUrl}`);

  const child = spawn('npm', ['run', 'dev', '--workspace=apps/frontend'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(FRONTEND_PORT),
      NEXT_PUBLIC_API_BASE_URL: backendApiUrl,
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
