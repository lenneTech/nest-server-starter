// Fixture: every start finds its port taken (Node's own EADDRINUSE), and ends the way src/main.ts
// does: `bootstrap().catch(handleFatalBootstrapError)` logs the stack and exits with 1.
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';

const port = Number(process.env.NSC__PORT);
createNetServer().listen(port, '127.0.0.1', () => {
  createServer()
    .once('error', (error) => {
      process.stderr.write(`[bootstrap] fatal startup error — exiting: ${error.stack}\n`);
      process.exit(1);
    })
    .listen(port, '127.0.0.1');
});
