const net = require('node:net');

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function assertPortFree(port, label) {
  if (!(await isPortFree(port))) {
    throw new Error(
      `Port ${port} (${label}) is already in use. Free it (e.g. \`lsof -ti:${port} | xargs kill\`) ` +
        `or change the fixed port assignment in scripts/ports.cjs.`,
    );
  }
}

module.exports = { isPortFree, assertPortFree };
