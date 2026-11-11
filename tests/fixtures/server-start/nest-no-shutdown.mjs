// Fixture: like nest.mjs, but without a shutdown handler — a main.ts that lost
// installGracefulShutdown(). Outside a container SIGTERM still kills it at once; with the
// check's PID 1 preload it keeps listening, as it would in a container.
import { createServer } from 'node:http';
const port = Number(process.env.NSC__PORT);
createServer((_req, res) => res.end('ok')).listen(port, '127.0.0.1', () =>
  console.log(`Server started at http://[::1]:${port}`),
);
// Cap: with the preload this server ignores SIGTERM and SIGINT, and it is the test's grandchild.
// A test that fails before the runner stops it cannot clean it up, so it ends itself after 60 s.
// Unref'd, so it keeps nothing alive and does not shorten any measurement in the spec (all <= 10 s).
setTimeout(() => process.exit(0), 60_000).unref();
