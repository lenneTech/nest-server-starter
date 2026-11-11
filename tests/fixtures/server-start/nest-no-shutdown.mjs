// Fixture: like nest.mjs, but without a shutdown handler — a main.ts that lost
// installGracefulShutdown(). Outside a container SIGTERM still kills it at once; with the
// check's PID 1 preload it keeps listening, as it would in a container.
import { createServer } from 'node:http';
const port = Number(process.env.NSC__PORT);
createServer((_req, res) => res.end('ok')).listen(port, '127.0.0.1', () =>
  console.log(`Server started at http://[::1]:${port}`),
);
