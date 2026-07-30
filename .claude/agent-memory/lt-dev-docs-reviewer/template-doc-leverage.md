---
name: template-doc-leverage
description: nest-server-starter is a TEMPLATE cloned into every new lt project, so inline comments/docs propagate downstream — grade doc accuracy harder than in a normal repo
metadata:
  type: project
---

`nest-server-starter` is not an application — it is the template that `lt server create` and
`lt fullstack init` clone into `projects/api` of every new lt project. Every comment, README line
and config annotation is therefore copied into every downstream customer project.

**Why:** a wrong inline comment here is not one wrong comment; it is one wrong comment per project
created from this point on, and downstream developers have no way to know it was wrong upstream.
Comments here are also rarely revisited after the clone, so they decay silently in N repos at once.

**How to apply:** when reviewing docs in this repo, weight *accuracy* above *presence*.
Specifically flag:
- **Frozen counts / specific numbers** in permanent comments ("eight stray files", "11 paths",
  "8 ts-morph paths"). They are correct for one commit and wrong forever after; they are also
  unverifiable for a downstream reader. Prefer describing the mechanism, not the tally.
- **Comments describing mechanisms that do not exist in the repo** — verify every named key,
  file and directory actually exists before accepting the prose.
- **Anecdotes about other/customer projects** ("this is exactly how a customer project ended
  up with…"). Unverifiable downstream and meaningless in a cloned repo.
- **Language drift** — every non-i18n comment in this repo is English (the only German is
  legitimate `de:` translation data in `src/server/common/errors/project-errors.ts` and its test
  assertions). A German comment is a defect in a template shipped internationally.

See [[verify-docker-monorepo-claims]] for the cross-repo checks that settle Docker/monorepo claims.
