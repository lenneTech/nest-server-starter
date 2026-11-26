// Fixture: the first start finds its port taken, as when another process binds it between the
// runner's allocation and the server's own bind; every later start behaves like nest.mjs. The first
// start really binds the port twice, so the error is Node's own EADDRINUSE, and it ends the process
// the way src/main.ts does: `bootstrap().catch(handleFatalBootstrapError)` logs the stack, exits with 1.
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';

const port = Number(process.env.NSC__PORT);
const marker = process.env.FIXTURE_MARKER;
if (marker && !existsSync(marker)) {
  writeFileSync(marker, String(port));
  createNetServer().listen(port, '127.0.0.1', () => {
    createServer()
      .once('error', (error) => {
        process.stderr.write(`[bootstrap] fatal startup error — exiting: ${error.stack}\n`);
        process.exit(1);
      })
      .listen(port, '127.0.0.1');
  });
} else {
  const server = createServer((_req, res) => res.end('ok')).listen(port, '127.0.0.1', () =>
    console.log(`Server started at http://[::1]:${port}`),
  );
  const onSignal = (signal) => {
    process.removeListener('SIGTERM', onSignal);
    server.close(() => process.kill(process.pid, signal));
  };
  process.on('SIGTERM', onSignal);
}
