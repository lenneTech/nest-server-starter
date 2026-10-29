---
name: user-service-e2e-coverage-map
description: Which e2e assertions actually pin UserService.setAvatar() and create()'s createdBy branch, why the createdBy branch has no test (unreachable in the default config), and the scratch mutation recipe for tests/unit specs
metadata:
  type: reference
---

Learned in the 2026-10-29 review of the nest-server 12.1.0 lock-step update (dataStore refactor).

- **setAvatar() is pinned in both directions** by `tests/modules/avatar-rest.e2e-spec.ts`: test 2 asserts the DB `users.avatar`
  equals the returned file id (the write landed), test 3 asserts the previous file is gone from `fs.files` (the
  PREVIOUS id was returned; returning the new id would delete the fresh upload and fail test 2's 200 download).
  The `fs.files` check is not vacuous: e2e has no S3 bucket, so storage derives to GridFS, bucket `'fs'`
  (FileService calls `super(connection, 'fs', …)`).
- **create()'s `if (!user.createdBy)` branch has NO e2e test, and none can reach it in the starter's default config.**
  BetterAuth `/iam/sign-up/email` never calls `UserService.create()` (framework callers: only legacy
  `CoreAuthService.signUp` with IAM disabled, plus the controller/resolver); admin `POST /users` gets
  `createdBy` from `CrudService.create()` via `currentUser`. So judge changes there by equivalence:
  `MongooseDataStore.updateById` = `model.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean()`.
- No test asserts the stored TYPE of `createdBy`/`updatedBy`. Check it directly on the built schema:
  import `dist/src/server/modules/user/user.model.js` with `NODE_ENV=e2e` and print `UserSchema.path('createdBy').instance`.
  It printed `ObjectId`, and `objectIdType()` was the project's own mongoose `Schema.Types.ObjectId`.
- **Mutation runs for any `tests/unit` spec** use the same scratch copy as [[audit-suppression-review-proofs]]:
  `package.json`, `vitest.config.ts`, `tsconfig.json`, `tests/unit/support/`, the spec, the module under test,
  plus a symlinked `node_modules`. Mutate the module with sed and run `node <root>/node_modules/vitest/vitest.mjs run --config vitest.config.ts <spec>`.
