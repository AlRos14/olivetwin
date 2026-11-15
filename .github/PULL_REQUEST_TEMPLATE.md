## Issue / work packet

<!-- Link the Issue (for example, "Closes #12") and state the work packet:
     Phase A (A01–A04) or Phase B (WP-04, WP-07). -->

- Issue:
- Work packet:
- Branch:

## Dependencies

<!-- PRs, contracts, decisions or data this change depends on.
     Write "None" if not applicable. -->

## Changes

<!-- What changes and why. A PR must have a single purpose. -->

## Tests

Commands run from `frontend/` and their result:

```bash
npm ci
npm run validate:data
npm run build
```

- `npm ci` result:
- `npm run validate:data` result:
- `npm run build` result:

<!-- If a command does not apply, explain why. Do not leave the section empty. -->

## Modified files

<!-- List of paths. Flag any shared file or file outside the usual scope
     and who authorised it. -->

## Data provenance

<!-- State: no data / sample (synthetic) / processed_real.
     For processed_real include provider, product or scene, date and
     processing version. Confirm that synthetic data are not presented as NASA. -->

## Risks and limitations

<!-- What may fail, what could not be tested, pending dependencies,
     limitations of `main` protection or access. -->

## Review

- Author:
- Independent reviewer (person):
- [ ] The reviewer is not the author or the same agent session.
- [ ] The human review is recorded (an automated comment does not count).
- [ ] `ci` check green.
- [ ] Changes in `contracts/` or `.github/workflows/` reviewed by integration.

## Screenshots (if there are interface changes)

<!-- Add screenshots or a verifiable description of before and after. -->

## Checklist

- [ ] The PR has a single purpose and links its Issue or work packet.
- [ ] Only files in my scope have been modified.
- [ ] `main` is still buildable and the build passes.
- [ ] The manifests pass `npm run validate:data`.
- [ ] No HDF5, GeoTIFF, NetCDF or other large binaries have been added.
- [ ] No secrets, tokens or credentials have been included.
- [ ] Synthetic data are marked as such and are not attributed to NASA.
- [ ] Contract v1.1.0 has not been broken; any extension is additive or approved.
- [ ] Documentation has been updated if behaviour changes.
- [ ] It will be merged with squash merge and the branch will be deleted.
