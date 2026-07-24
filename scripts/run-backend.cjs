const { spawn } = require('node:child_process');
const { assertPortFree } = require('./find-free-port.cjs');
const { BACKEND_PORT } = require('./ports.cjs');

async function run() {
  await assertPortFree(BACKEND_PORT, 'backend');
  console.log(`Starting backend on port ${BACKEND_PORT}`);

  const child = spawn('npm', ['run', 'start:dev', '--workspace=apps/backend'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(BACKEND_PORT) },
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
