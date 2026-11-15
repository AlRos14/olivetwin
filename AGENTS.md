# AGENTS.md — Rules for automated agents

This document is mandatory for any agent working in the OliveTwin
repository. People additionally follow
[`docs/contributing.md`](docs/contributing.md) and the pull request template.

An agent may implement, test, document and propose changes. **It may not
merge, approve its own work, change permissions or validate scientific claims
on its own.**

## Language

Communicate with the team in Spanish (replies, summaries, PR messages);
documentation and UI text are written in English, with Spanish UI translations
in the `es` catalogs. Code and technical names may stay in English when that is
the convention.

## Before writing

1. Read, in this order: `README.md`, this file, `docs/contributing.md`,
   `docs/contract-freeze.md` and `contracts/README.md` (if they already exist in
   your branch).
2. Inspect the real state: `git status`, current branch, worktrees and recent
   commits. Do not assume the tree is clean.
3. Review files and uncommitted changes before editing. **Do not overwrite
   anyone else's work.**
4. Identify your work packet, your issue or PR and your write scope. If they
   are not defined, stop and ask for an assignment.
5. If the repository already contains previous work, integrate it or respect
   it; do not restart the project.

## Work isolation

- Work in **your own worktree** with **your own branch**. Do not work on
  `main` or on someone else's branch.
- Do not `git push` directly to `main`, do not merge, do not close other
  people's PRs and do not rewrite shared history.
- Do not use human credentials to simulate an approval. If you share
  credentials with a person, GitHub cannot tell who approved: record it and
  complement the review through an external channel or a separate bot account.
- Do not change the repository configuration (visibility, access, protections)
  unless the owner explicitly instructs it.

## Write scopes

A single owner per file or subpackage. Agents do not edit paths in someone
else's scope: if they need a change outside their scope, they open a request to
the owner and note it in their report.

### WP-04 and WP-07 scope map

| Scope | WP-04 | WP-07 |
|---|---|---|
| Data and contract | `contracts/`, `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/`, `frontend/public/data/`, `scripts/` for data generation and validation | — |
| Interface and map | — | `frontend/src/components/`, styles, Leaflet code, controls, legends and notices |
| Integration | `App.vue` only as a composition point; integration changes are coordinated between both WPs | Same: `App.vue` is not used to introduce data logic or complete components |

- WP-04 **does not implement** the map view or UI components.
- WP-07 **does not generate scientific data** or redefine the JSON Schema.
- `frontend/package.json` and `frontend/package-lock.json` are shared: adding
  dependencies requires explicit coordination.
- `.github/workflows/`, `contracts/` and the governance documents require
  integration review in addition to the owner.
- A contract change is opened as an issue and affects only the dependent
  nodes; it is not changed unilaterally.

### Phase A

In Phase A the nodes A01 (bootstrap), A02 (minimum contract), A03 (governance)
and A04 (CI) have separate scopes. A01 does not edit `frontend/public/data/`,
A02 does not edit `frontend/src/`, and A04 does not edit `package.json` without
coordination with A01. Phase A agents also do not implement WP-04 or WP-07.

Phase A is closed. The current phase is **Phase B** (WP-04 ∥ WP-07), governed
by the scope table above and by [`docs/c0-interfaces.md`](docs/c0-interfaces.md).
Node status and archived plans are in
[`docs/work-packets/README.md`](docs/work-packets/README.md).

## Mandatory checks

From `frontend/`, before declaring a change finished:

```bash
npm ci
npm run validate:data
npm run build
```

- `npm ci` must start from a versioned `package-lock.json`.
- `npm run validate:data` validates the manifests against the contract schema.
- `npm run build` must generate `frontend/dist/` without errors.

If a command does not exist or cannot be run in your branch, **do not invent it
and do not silently omit it**: record the blocker and its cause. For
documentation-only changes, run at least a link and coherence review, and state
that the code checks do not apply.

## Evidence

The delivery report must include:

- exact commands executed and their result (success or error);
- relevant excerpts of the output, not just the claim "it works";
- list of modified files;
- link or reference to the PR/commit when it exists;
- screenshot or verifiable description if the change is to the interface.

"Tested" without reproducible evidence is not accepted.

## Data, science and provenance

- The project answers the
  ["Dancing with the SARs"](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/)
  challenge of the NASA Space Apps Challenge 2026. Prioritise the resources
  listed in [`docs/challenge.md`](docs/challenge.md). Any other open source or
  licensed resource that permits research use may be used; **not**
  commercially licensed resources.
- **Do not invent** URLs, users, permissions, figures, dates, products or
  scientific results.
- Do not claim that radar measures production directly, that NDVI is NISAR or
  that surface soil moisture equals irrigation. Inferences require compatible
  data and validation.
- Do not present synthetic data as NASA observations or as real data. Keep
  `status: synthetic` and the notices visible.
- Do not assign `processed_real` without verifiable provenance, date, product
  or scene identifier, processing version and quality warnings. That status
  requires human scientific approval.
- Do not version HDF5, GeoTIFF, NetCDF or other large scientific binaries.
  Publish only optimised assets in `frontend/public/data/`.
- Do not download or incorporate data without clear licence and provenance. Do
  not include secrets, tokens or credentials in the repository.

## Commits and pull requests

- Small commits with a conventional prefix: `feat:`, `fix:`, `docs:`,
  `chore:`, `test:`, `ci:`, `refactor:`.
- A PR must have a purpose, link its issue or work packet and follow the
  template.
- The required check is called **`ci`**. Do not merge with the check red.
- The review must be **independent**: author and reviewer cannot be the same
  person or the same agent session.
- **An automated comment is not a human approval.** Do not write "approved" on
  behalf of a person and do not use an agent to satisfy the review
  requirement.
- Do not merge. The human owner performs the merge after the review.

## Delivery of each packet

When finished, summarise results, changes, commands, tests, failures,
screenshots and how real data would be incorporated. Use this format:

```yaml
work_packet: WP07-03
status: PASS | BLOCKED | FAIL
owner_role: R4
files_changed: []
commands_executed: []
acceptance_results: []
risks_or_limitations: []
requires_contract_change: false
review_requested: true
commit_or_pr: null
```

If the work is blocked by permissions, dependencies or a scientific decision,
use `BLOCKED` and describe exactly what is missing; do not disguise it as
`PASS`.
