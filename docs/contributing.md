# Contributing guide

OliveTwin is developed in a single repository:
<https://github.com/AlRos14/olivetwin> (public). This guide explains where to
propose work, what each person may edit and what a pull request needs in order
to be integrated.

Repository documentation is written in **English**; team communication may be in
Spanish.

## Where to open an Issue

Use the repository's **Issues** tab to:

- propose a feature or a contract change;
- report a reproducible bug;
- ask for access, review or clarification about a scope;
- record a blocker or a limitation.

Before opening an Issue, search whether an equivalent one already exists. Include context,
expected result, current result, affected files, commands executed and
the provenance of the data involved. Do not publish secrets, tokens or personal
data in an Issue.

There are no example users or invented owners. Team identities will
be recorded once verified; for now only `AlRos14` appears as
repository owner and verified collaborator.

## What can I edit?

The assignment of people to **WP-04** and **WP-07** is coordinated **outside the repository** (GA decision, 48 h hackathon): it is neither recorded nor verified on GitHub.
File scopes are mandatory: if you need to touch a shared area, mention it in
the corresponding Issue before doing so.

| Area | Use | Who edits |
|---|---|---|
| `frontend/src/components/`, styles, Leaflet | Map, panels, legend, controls and notices. | WP-07 |
| `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/` | Contract, manifest loading and state. | WP-04 |
| `frontend/public/data/` | `real` manifest and optimised assets (the demo does not include sample data). | WP-04 |
| `contracts/` | JSON Schema and contract documentation. | Contract owner (WP-04) with integration review |
| `frontend/scripts/` | Data validation. | WP-04 |
| `frontend/src/App.vue` | View composition. | Integration, coordinated between WP-04 and WP-07 |
| `frontend/package.json`, `package-lock.json` | Dependencies and scripts. | Explicit coordination before adding dependencies |
| `.github/workflows/` | CI. | Integration |
| `pipelines/` | Scientific work and data generation. | Data team / pipeline owner |
| `README.md`, `AGENTS.md`, `docs/contributing.md` | Governance and documentation. | Collaboration owner |

If you need a change outside your scope, do not overwrite the file: open an
Issue or ask the owner to make it. A single owner per file or subpackage;
author and reviewer must never be the same person.

## Branches

Create a short branch from `main`. Convention:

- `bootstrap/...` — scaffolding and initial setup (for example,
  `bootstrap/phase-a`).
- `wp04/...` — contracts, data, loader and validation.
- `wp07/...` — Leaflet map, components and styles.
- `wp02/...` — work of the WP-02 package.

Use lowercase and hyphens, with a descriptive and short name. Do not work
directly on `main` and do not reuse an already merged branch.

## Pull requests

`main` must **always compile**. Changes come in through small pull
requests:

1. Open an Issue or link the work packet.
2. Create a short branch from `main`.
3. Make small commits with a conventional prefix (`feat:`, `fix:`, `docs:`,
   `chore:`, `test:`, `ci:`, `refactor:`).
4. Open the PR against `main` using
   [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).
5. Wait for the **`ci`** check to be green and for an independent review.
6. The merge is done with **squash merge** and the branch is deleted.

Rules for a PR:

- one purpose per PR; avoid mixing refactorings, formatting and
  functional changes;
- do not include files outside your scope;
- update the documentation and examples if behaviour changes;
- include screenshots or a verifiable description if the change is in the interface;
- do not merge your own PR.

### Required check: `ci`

The CI workflow runs the installation, the manifest validation and the
build. The stable job name is **`ci`**. A PR with `ci` in red is not
merged, even if the npm installation worked: the check also verifies
the build and the data contract.

### Independent review

- Each work packet has a human owner and requires review by another person.
- An automatic comment, an agent approval or a review from the
  same session **do not count** as human approval.
- If several people share credentials, GitHub cannot tell who
  approved. In that case, record the review through an external channel or
  use a separate bot account for automations.
- Changes in `contracts/` and `.github/workflows/` additionally require
  integration review.
- The reviewer checks the scope, the tests, the data provenance, the
  absence of large binaries and that no unvalidated scientific results are claimed.

## Data and large files

- **Do not version** HDF5, intermediate GeoTIFF, NetCDF or other large
  scientific binaries. `.gitignore` excludes `*.h5`, `*.hdf5`, `*.tif`, `*.tiff`
  and `*.nc`.
- Publish only optimised assets (PNG and JSON) in `frontend/public/data/`.
- Every layer must declare provenance, a date when it exists and status
  (`synthetic` or `processed_real`).
- Synthetic data must be marked as such and never presented as
  NASA observations.
- An exception to version a small test requires justification and
  approval from the owner; do not add it on your own initiative.
- Do not incorporate data without clear licence and provenance. Open source
  resources, or resources with a licence that allows use in research, are admitted, but not
  resources with a commercial licence. The recommended resources of the challenge are in
  [`docs/challenge.md`](challenge.md).

## Data contract

The frozen contract is **v1.1.0**. Extensions must be additive or
approved as an interface change with its version. Do not change without agreement:

- the order `bbox = [west, south, east, north]` in EPSG:4326;
- the coherence between `datasetMode` and the `status` of each layer;
- the paths relative to `public/` and their resolution with `import.meta.env.BASE_URL`.

See [`docs/contract-freeze.md`](contract-freeze.md) and
[`contracts/README.md`](../contracts/README.md).

## Translations

- The interface is translated through the catalogues in
  `frontend/src/i18n/messages/{en,es}`. English is the default language and Spanish is
  selectable with a discreet selector.
- Texts that come from the published data (titles, descriptions, notices, provenance, legend
  labels, crops…) are translated in `frontend/public/data/real/i18n/en.json`, without
  changing the JSON data.
- To update them: regenerate the catalogue with `npm run i18n:data -- --write`,
  translate the missing entries and run `npm run validate:data`.

## Protection of `main`

Configured on 2026-11-14, when the repository became public:

- PR mandatory to enter `main`; required `ci` check;
- no force-push and no deletion of `main`;
- 0 approvals required on GitHub (48 h hackathon): the independent
  review is kept as a team rule, not as a technical block;
- the administrator can bypass the protection only in an emergency.

A `CODEOWNERS` file with fictitious users is not created. It will be completed when
the real identities are verified.

## Before requesting review

- [ ] The branch starts from `main` and has one purpose.
- [ ] Only files in my scope have been modified.
- [ ] `npm ci` works from a clean installation.
- [ ] `npm run validate:data` passes.
- [ ] `npm run build` passes.
- [ ] The PR links its Issue or work packet.
- [ ] The PR template is complete, with provenance and risks.
- [ ] There are no large binaries, secrets or unmarked synthetic data.
- [ ] I have requested review from a person other than the implementer.
