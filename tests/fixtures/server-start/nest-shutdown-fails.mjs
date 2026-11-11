// Fixture: like nest.mjs, but its shutdown fails (an onModuleDestroy that throws, say) and the
// handler exits with code 1.
import { createServer } from 'node:http';
const port = Number(process.env.NSC__PORT);
const server = createServer((_req, res) => res.end('ok')).listen(port, '127.0.0.1', () =>
  console.log(`Server started at http://[::1]:${port}`),
);
process.on('SIGTERM', () => {
  console.error('shutdown failed: boom while closing');
  server.close(() => process.exit(1));
});
