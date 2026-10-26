/**
 * The test runner must resolve packages the way Node does at runtime.
 *
 * graphql declares `"main": "index"` (no extension) next to an `index.mjs` and has no `exports` map. Node resolves
 * that to `index.js` — for `require` and for `import` alike — while Vite probes `.mjs` first. Under vitest an `import`
 * of graphql therefore loads a second, ESM copy, and a schema built by the copy @nestjs/graphql uses is refused by the
 * other one: "Cannot use GraphQLSchema from another module or realm" (GraphQL subscriptions close with 4500).
 *
 * This project's own tests never import graphql, so in npm mode nothing here would notice. A VENDOR-mode project does:
 * vitest transforms the vendored core under src/core/ itself, and since nest-server 12.0.0 that core imports graphql
 * with `import` instead of `import x = require(...)`. Both vitest configs therefore set `resolve.extensions` in Node's
 * order, and both travel into every generated project. This spec runs under vitest.config.ts; the e2e config's
 * setting is checked in tests/unit/vitest-e2e-config.spec.ts. PORTED from @lenne.tech/nest-server on 2026-10-26.
 */
import * as graphql from 'graphql';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('vitest resolves packages like Node', () => {
  it('an `import` of graphql is the instance Node and `require` load', () => {
    const nodeGraphql = createRequire(join(__dirname, '../../package.json'))('graphql');
    expect(graphql.GraphQLSchema).toBe(nodeGraphql.GraphQLSchema);
    expect(graphql.execute).toBe(nodeGraphql.execute);
  });
});
