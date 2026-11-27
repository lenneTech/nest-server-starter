import { HttpExceptionLogFilter } from '@lenne.tech/nest-server';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';

import { postgresRole, quoteIdent, testDatabaseKind } from './test-database-server.js';
import { useOwnTestDatabase } from './test-db.js';

/**
 * PostgreSQL only: the application role cannot get around row-level security.
 *
 * nest-server puts forced row-level security on every tenant table and refuses, at boot, an application role that could
 * ignore it: a superuser, a role with BYPASSRLS, the owner of a table, a role allowed to TRUNCATE one. This spec proves
 * the two halves for the starter's roles (docker/postgres/initdb/10-roles.sh, LOCAL_POSTGRES in src/config.env.ts):
 *
 * 1. The guard is wired: the starter's own ServerModule does not boot with the OWNER role as its application role.
 * 2. The configured application role is bound: on a table with forced row-level security it sees only the rows its
 *    policy admits, and it can neither switch row-level security off nor truncate the table.
 *
 * A database of its own, because the boot in 1. runs as the owner and must not leave tables behind in the worker's
 * database that the other specs share. On MongoDB the spec is skipped: there is no role to check, and the CI job
 * `postgres` runs it.
 */
const onPostgres = testDatabaseKind() === 'postgres';
const ownDatabase = onPostgres ? await useOwnTestDatabase('roles') : undefined;
const appUrl = process.env.NSC__DATABASE__URL ?? '';
const ownerUrl = process.env.NSC__DATABASE__OWNER_URL ?? '';
if (onPostgres) {
  // The owner as the application role: the one connection the boot has to refuse
  process.env.NSC__DATABASE__URL = ownerUrl;
}

describe.skipIf(!onPostgres)('PostgreSQL roles (e2e)', () => {
  let owner: Client;
  let app: Client;

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await ownDatabase?.release();
  });

  it('refuses to boot with the owner role as the application role', async () => {
    const { default: envConfig } = await import('../src/config.env.js');
    const { imports, ServerModule } = await import('../src/server/server.module.js');
    expect(postgresRole((envConfig.database as { url: string }).url)).toBe(postgresRole(ownerUrl));

    let nestApp: NestExpressApplication | undefined;
    const boot = async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [...imports, ServerModule],
        providers: [{ provide: 'PUB_SUB', useValue: { publish: async () => {} } }],
      }).compile();
      nestApp = moduleFixture.createNestApplication<NestExpressApplication>();
      nestApp.useGlobalFilters(new HttpExceptionLogFilter());
      await nestApp.init();
    };
    try {
      await expect(boot()).rejects.toThrow(/application role "[^"]+" owns/);
    } finally {
      await nestApp?.close().catch(() => undefined);
    }
  });

  it('binds the configured application role to row-level security', async () => {
    const appRole = quoteIdent(postgresRole(appUrl));
    owner = new Client({ connectionString: ownerUrl });
    app = new Client({ connectionString: appUrl });
    await owner.connect();
    await app.connect();

    // The role itself: no superuser, no BYPASSRLS
    const { rows: roles } = await app.query<{ bypassrls: boolean; superuser: boolean }>(
      'SELECT rolsuper AS superuser, rolbypassrls AS bypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(roles[0]).toEqual({ bypassrls: false, superuser: false });

    // A tenant table as nest-server builds one: owned by the owner, row-level security enabled and forced
    await owner.query(`CREATE TABLE rls_probe (tenant text NOT NULL)`);
    await owner.query(`ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY`);
    await owner.query(`ALTER TABLE rls_probe FORCE ROW LEVEL SECURITY`);
    await owner.query(
      `CREATE POLICY rls_probe_tenant ON rls_probe USING (tenant = current_setting('probe.tenant', true))
         WITH CHECK (tenant = current_setting('probe.tenant', true))`,
    );
    await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON rls_probe TO ${appRole}`);
    for (const tenant of ['a', 'b']) {
      await owner.query(`SELECT set_config('probe.tenant', $1, false)`, [tenant]);
      await owner.query(`INSERT INTO rls_probe (tenant) VALUES ($1)`, [tenant]);
    }

    // Without a tenant it sees nothing, with one only that tenant's row
    expect((await app.query('SELECT tenant FROM rls_probe')).rows).toEqual([]);
    await app.query(`SELECT set_config('probe.tenant', 'a', false)`);
    expect((await app.query('SELECT tenant FROM rls_probe')).rows).toEqual([{ tenant: 'a' }]);

    // And it cannot get out: not by switching row-level security off for its session, not on the table, not by TRUNCATE
    await app.query('SET row_security = off');
    await expect(app.query('SELECT tenant FROM rls_probe')).rejects.toThrow(/row-level security/);
    await app.query('RESET row_security');
    await expect(app.query('ALTER TABLE rls_probe DISABLE ROW LEVEL SECURITY')).rejects.toThrow(/must be owner/);
    await expect(app.query('TRUNCATE rls_probe')).rejects.toThrow(/permission denied/);

    // None of the attempts changed anything: the policy still holds, and tenant b's row is still there
    expect((await app.query('SELECT tenant FROM rls_probe')).rows).toEqual([{ tenant: 'a' }]);
    await app.query(`SELECT set_config('probe.tenant', 'b', false)`);
    expect((await app.query('SELECT tenant FROM rls_probe')).rows).toEqual([{ tenant: 'b' }]);
  });
});
