const { spawn } = require('node:child_process');
const { assertPortFree } = require('./find-free-port.cjs');
const { BACKEND_PORT, FRONTEND_PORT } = require('./ports.cjs');

async function run() {
  await Promise.all([
    assertPortFree(BACKEND_PORT, 'backend'),
    assertPortFree(FRONTEND_PORT, 'frontend'),
  ]);

  const backendApiUrl = `http://localhost:${BACKEND_PORT}/api/v1`;

  console.log(`Starting backend on port ${BACKEND_PORT}`);
  console.log(`Starting frontend on port ${FRONTEND_PORT} with backend API at ${backendApiUrl}`);

  const backend = spawn('npm', ['run', 'start:dev', '--workspace=apps/backend'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
    },
  });

  const frontend = spawn('npm', ['run', 'dev', '--workspace=apps/frontend'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(FRONTEND_PORT),
      NEXT_PUBLIC_API_BASE_URL: backendApiUrl,
    },
  });

  const cleanup = (code) => {
    if (!backend.killed) backend.kill('SIGINT');
    if (!frontend.killed) frontend.kill('SIGINT');
    process.exit(code);
  };

  backend.on('exit', cleanup);
  frontend.on('exit', cleanup);

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
