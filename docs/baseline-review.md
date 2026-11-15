# Independent review of the Phase A baseline (node A05)

Reviewer: A05 (independent; did not implement A01-A04). Reviewed branch: `bootstrap/phase-a` @ `91f0b9b` (A04 merge), PR #1 of `AlRos14/olivetwin`. Date: 2026-11-14.

## Overall verdict: PASS with limitations

There are no blocking findings. The limitations are: the PR is still open (integration is an act of the GA), `main` is not protected (a known limitation documented honestly) and the human owners of WP-04/WP-07 are still to be assigned.

## Commands and evidence

Clean worktree (`git worktree add -b phase-a/a05-review ... bootstrap/phase-a`).

| Command | Result |
|---|---|
| `npm ci --prefix frontend` | OK, 0 vulnerabilities |
| `npm run validate:data --prefix frontend` | `Resultado: OK — 10 comprobaciones superadas (0 fallos)`: schema compiles, 2 valid manifests, 3 valid fixtures accepted, 4 invalid ones rejected (`layer-legend-object`, `missing-schema-version`, `unknown-dataset-mode`, `zones-null`) |
| `npm run build --prefix frontend` | OK (`vue-tsc -b && vite build`), 12 modules, `dist/` generated |
| Invalid manifest: `sed 's/"real"/"unknown"/'` on `frontend/public/data/real/manifest.json` (reverted with `git checkout`, not committed) | `✗ frontend/public/data/real/manifest.json no cumple el contrato`, `Resultado: FALLO — 1 de 10`, exit code 1. The CI step `Validar manifiestos de datos` would fail. |
| `gh pr checks 1` | `ci pass 13s` (run 43606418655). PR `OPEN`, `MERGEABLE`, with no reviews or comments |
| `gh api repos/AlRos14/olivetwin` | `private: true`, default `main`, the authenticated user is admin |
| `gh api .../branches/main --jq .protected` | `false` |
| `gh api .../collaborators` | only `AlRos14` |

## Compatibility with the WP-04/WP-07 contract (§4 of the plan)

- The §4.3 example of the plan extracted from the `.md` is byte-for-byte equivalent (JSON) to `frontend/scripts/fixtures/valid/sample-plan-4.3.json`, and the validator accepts it. The schema uses draft 2020-12 (`prefixItems`) and the validator uses `ajv@8.20.0` (pinned) with the 2020 class.
- §4.4 and Phase A manifests (`zones: []`) valid for `sample` and `real`.
- Fields from §4.3 (`variable`, `range`, `legend` as an array of `{value,color,label}`, `provenance` with nullable `acquisitionDate/sceneId/referenceUrl/note`, `imageCrs`, `qualityNote`) supported. `provenance` is open (`additionalProperties: true`) and the rest is closed: WP-04 will be able to extend it additively.
- `layer.id` enum `ndvi|soil-moisture`, `status` enum `synthetic|processed_real`, `kind` const `image-overlay`, `image` with no leading `/`, `..`, `:` or `\`: consistent with §4.2. The `datasetMode`/`status` coherence and the `processed_real` rules are, correctly, left to WP-04 (semantics).
- Nothing incompatible with the contract; no blocker for WP-04/WP-07.

## Scopes

- A01 (`phase-a/a01`): only `frontend/` (without `public/data`), `.gitignore`, `.nvmrc`, `.gitkeep`. OK.
- A02: `contracts/`, `docs/contract-freeze.md`, `frontend/public/data/*/manifest.json`; does not touch `frontend/src/`. OK.
- A03: `README.md`, `AGENTS.md`, PR template, `docs/contributing.md`. OK.
- A04: `ci.yml`, `frontend/scripts/validate-data.mjs`, fixtures; `package.json` only adds `validate:data` and ajv/ajv-formats (dependencies required by the plan, coordinated). OK. (Per-branch diffs against `main` appear accumulated because the branches are stacked; the content owned by each one respects its scope.)
- `frontend/src/` is left with the minimal template, without `types/manifest.ts` or stubs (contract-freeze reserves it for WP-04). No Leaflet/Router/Pinia.

## Documentation

- The repo URL (`https://github.com/AlRos14/olivetwin`, private) is the real one, verified with `gh`. The only verified collaborator is `AlRos14`; the rest of the identities and the WP-04/07 owners appear as "to be assigned". There is no fictitious `CODEOWNERS`. There are no invented URLs or users.
- README (l.149-156), `docs/contributing.md` (l.134-145) and `AGENTS.md` explicitly state that `main` is NOT protected and that the rules are by convention. Consistent with `protected: false`. They do not claim protection.
- `docs/contributing.md` / `AGENTS.md` cover: no merge by agents, an agent/comment does not count as human approval, limits of shared credentials, `wp04/…` branches etc., squash, no HDF5. The PR template includes WP/Issue, data provenance, risks and a contract checklist.
- `.gitignore`: `node_modules/`, `dist/`, `.env*` (except `.env.example`), `*.h5 *.hdf5 *.tif *.tiff *.nc`, with an exceptions section. Largest versioned file: `package-lock.json` (48 KB). No large binaries.

## GA checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Correct repo, permissions and verifiable `main` | PASS (limited) | Real private repo, default `main`, admin verified; only 1 verified collaborator; the other 5 cannot be checked with the available permissions and are documented as pending |
| 2 | Single baseline PR integrated; no changes overwritten | PENDING | PR #1 open and mergeable; the merge is an act of the GA. Linear history since `0751209` with no conflicts |
| 3 | `frontend` starts and compiles from a clean install | PASS | `npm ci` + `build` OK (`dev` not run; the `dev` script exists) |
| 4 | `contracts/` and `contract-freeze.md` document v1.1.0, modes, bbox and paths | PASS | Reviewed against §4.2; schema and docs consistent |
| 5 | Empty sample/real manifests, parseable and validated | PASS | `validate:data` |
| 6 | CI runs on PR and fails on an invalid contract | PASS | `ci` green in the PR; the trigger is `pull_request`; local failure demonstrated (exit 1). A failure within CI itself was not exercised on GitHub (the same command was tested locally) |
| 7 | AGENTS.md, CONTRIBUTING and PR template | PASS | Present and aligned with the plan |
| 8 | NISAR/NDVI/historical folders without large binaries | PASS | `pipelines/{nisar,vegetation,historical}/.gitkeep`, `data/references`, `scripts` |
| 9 | WP-04/WP-07 owners and scopes documented | PARTIAL PASS | Scopes documented (`contract-freeze.md` l.104-108, `contributing.md` l.37); human owners "to be assigned" (not invented). The project owner must approve them before launching Phase B |
| 10 | Limitations of `main` protection recorded | PASS | Documented in README, contributing and AGENTS; `protected=false` confirmed |

## Findings

### Blockers
None.

### Minor / to watch
1. The human owners of WP-04 and WP-07 remain unassigned (`docs/contract-freeze.md:108`, `contracts/README.md:187`). GA requirement: the project owner must designate them or expressly accept the exception.
2. `main` without protection and only one verified collaborator: the owner must expressly approve this exception (plan §7 "GA close"). Enable the `ci` check as required when the GitHub plan allows it.
3. The WP04/07 plan §4.1 places `validate-data.*` in `scripts/` (root) as a WP-04 deliverable, whereas the A04 validator is in `frontend/scripts/validate-data.mjs` (`ci.yml` and `package.json` point there, per the Phase A plan §6). WP-04 must decide whether to relocate or extend it, and coordinate with CI.
4. The schema's `image` forbids any `..` even inside a file name (`a..b.png`) or `:`; it is stricter than the plan but safe. No foreseeable impact.
5. `frontend/package.json` only has `engines` `^20.19.0 || >=22.12.0` and `.nvmrc` = `22`; consistent. No exact Node lockfile (acceptable).
6. The CI failure on an invalid contract was demonstrated locally; a broken branch was not pushed to GitHub (the review does not push).

## GA decision (project owner, 2026-11-14)

**GA: PASS with approved exceptions.** PR #1 is merged into `main` (squash) and Phase B (WP-04 ∥ WP-07) is authorised.

Expressly approved exceptions:

1. **WP-04/WP-07 owners:** since this is a 48 h hackathon, the assignment of people is coordinated outside the repository and is neither recorded nor verified on GitHub. File scopes and independent review remain mandatory.
2. **Protection of `main`:** the repository is private on a free account; if GitHub does not allow protection, convention applies (PR + green `ci` check + review). It is not declared protected.
3. **Collaborators:** only `AlRos14` is a verified collaborator; the access of the rest of the team is managed separately.
4. **Validator location** (`frontend/scripts/validate-data.mjs` versus `scripts/` in the WP-04/07 plan §4.1): it stays in `frontend/scripts/`; WP-04 extends it there.

## Update 2026-11-14 (post-GA)

The repository became **public** (a competition requirement) and the collaborators were added. It is now possible to
protect `main`: mandatory PR + required `ci` check, no force-push and no deletion, 0 required approvals.
Exception 2 of the GA decision is resolved.
