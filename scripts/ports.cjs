// Fixed ports for local dev. Chosen because 3000-3003/5432/6379 are held by other
// containers/projects on this machine (see README's "Local development" note).
const BACKEND_PORT = 4000;
const FRONTEND_PORT = 3004;

module.exports = { BACKEND_PORT, FRONTEND_PORT };
