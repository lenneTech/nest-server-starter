---
name: image-probe-use-throwaway-mongo
description: When smoke-testing the built prod image during a review, use a disposable Mongo container, not the host MongoDB — a hook blocks dropping the probe DB afterwards
metadata:
  type: feedback
---

When proving "does the production image start and migrate" by building the Dockerfile and running it,
point `NSC__MONGOOSE__URI` at a throwaway `mongo` container on a private docker network, not at the
host MongoDB via `host.docker.internal`.

**Why:** a PreToolUse hook blocks `dropDatabase` (manual confirmation required), so a probe DB created
on the host MongoDB cannot be cleaned up by the agent and is left behind for the user (happened
2026-10-29 with `nss-review-prod-probe`). Removing a container leaves nothing behind.

**How to apply:** `docker network create` + `docker run -d --network ... mongo:<pinned>` → run the image on
the same network → `docker rm -f` both + `docker network rm`. The probe itself stays the same: mount a
throwaway JS migration into `/app/dist/migrations` (the starter bundles none, so the entrypoint would
otherwise skip the migrate CLI), then check the effect in the DB, not just the exit code
(see [[silent-success-failure-mode]]).
