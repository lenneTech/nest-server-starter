import { RoleEnum } from '@lenne.tech/nest-server';
import { describe, expect, it } from 'vitest';

import { FileInfo } from '../../src/server/modules/file/file-info.model.js';
import { Meta } from '../../src/server/modules/meta/meta.model.js';

/**
 * What `securityCheck()` of the starter's own models hands to whom.
 *
 * The permissions scanner (`lt server permissions`) reports every model without a `securityCheck`
 * override, and every project generated from the starter inherits the models below. Each case runs
 * for an admin, a signed-in user without roles, an unauthenticated caller (`undefined`) and force
 * mode, the four callers the CheckSecurityInterceptor passes in.
 */

/** A caller as the interceptor sees it: only `hasRole()` matters to these checks. */
function caller(roles: string[]): any {
  return { hasRole: (role: string | string[]) => [role].flat().some((r) => roles.includes(r)), id: 'u1', roles };
}

const ADMIN = caller([RoleEnum.ADMIN]);
const USER = caller([]);

function fileInfo(): FileInfo {
  return FileInfo.map({ contentType: 'image/png', filename: 'a.png', id: 'f1', length: 3 });
}

function meta(): Meta {
  return Meta.map({ commit: 'abc', environment: 'test', package: 'api', title: 'API', version: '1.0.0' });
}

describe('securityCheck of the starter models', () => {
  describe('FileInfo (admin API only)', () => {
    it('returns the complete object to an admin', () => {
      const info = fileInfo();
      expect(info.securityCheck(ADMIN)).toBe(info);
      expect(info.filename).toBe('a.png');
    });

    it('returns the complete object in force mode', () => {
      const info = fileInfo();
      expect(info.securityCheck(undefined, true)).toBe(info);
    });

    it('returns nothing to a signed-in user without the admin role', () => {
      expect(fileInfo().securityCheck(USER)).toBeUndefined();
    });

    it('returns nothing to an unauthenticated caller', () => {
      expect(fileInfo().securityCheck(undefined)).toBeUndefined();
    });
  });

  describe('Meta (public on purpose)', () => {
    it.each([
      ['an unauthenticated caller', undefined],
      ['a signed-in user', USER],
      ['an admin', ADMIN],
    ])('returns every field to %s', (_who, user) => {
      const m = meta();
      expect(m.securityCheck(user)).toBe(m);
      expect({ ...m }).toMatchObject({
        commit: 'abc',
        environment: 'test',
        package: 'api',
        title: 'API',
        version: '1.0.0',
      });
    });
  });
});
