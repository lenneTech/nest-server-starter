// Fixture: behaves like this starter's built API — port from NSC__PORT, Nest's own log lines, then
// the line main.ts prints once the server listens. On SIGTERM it does what NestJS's
// enableShutdownHooks() does: drop its own listener, close the app, re-raise the signal.
import { createServer } from 'node:http';
const port = Number(process.env.NSC__PORT);
console.log('[Nest] 1  - LOG [NestApplication] Nest application successfully started');
const server = createServer((_req, res) => res.end('ok')).listen(port, '127.0.0.1', () =>
  console.log(`Server started at http://[::1]:${port}`),
);
const onSignal = (signal) => {
  process.removeListener('SIGTERM', onSignal);
  server.close(() => process.kill(process.pid, signal));
};
process.on('SIGTERM', onSignal);
