# Desktop Release Process

Angel Engine ships from GitHub Releases on two update channels that share one
repository. Downloading a build by hand from the Releases page works the same
way it always has; the channels only decide what the in-app updater installs.

| Channel  | Version         | GitHub Release | Update files                     | Who gets it                       |
| -------- | --------------- | -------------- | -------------------------------- | --------------------------------- |
| `stable` | `1.2.3`         | Latest release | `latest-mac.yml`, `beta-mac.yml` | Everyone                          |
| `beta`   | `1.2.3-beta.4`  | Pre-release    | `beta-mac.yml`                   | Only "Receive beta updates" users |

A stable release writes the beta channel file too, so beta users roll forward
onto stable instead of getting stranded on the last pre-release. A beta release
never writes `latest-mac.yml`, which is what keeps stable users off
pre-releases — the isolation lives in the published files, not in client-side
version sniffing.

## Version format

`desktop/scripts/release-channel.cjs` is the single source of truth and rejects
anything else before a build starts:

- stable: `1.2.3`
- beta: `1.2.3-beta.4` — the dot is mandatory

The dot matters because electron-updater compares prerelease identifiers.
`1.0.0-beta2` parses as the single identifier `beta2`, which sorts *above* every
`1.0.0-beta.N`, so dotted betas on the same base version would never be offered
to clients already running the undotted build. That is why the first dotted beta
was `1.0.1-beta.1` rather than `1.0.0-beta.3`: raising the patch version steps
over the old `1.0.0-beta2` tag.

## Cutting a release

1. Bump `desktop/package.json` to the target version and commit it.
2. Push tag `v<version>` (or run the **Desktop Release** workflow with the
   version as input). The workflow builds on macOS, signs, notarizes, and
   publishes.
3. `bun run --filter desktop publish` derives everything else: the GitHub
   release type (`release` / `prerelease`), the electron-builder publish
   channel, and the list of artifacts to attach.

## Verifying a release

- A stable release must have both `latest-mac.yml` and `beta-mac.yml` attached.
- A beta release must have `beta-mac.yml` and **no** `latest-mac.yml`.
- The GitHub release is marked "Pre-release" for beta versions only.

```sh
gh release view v<version> --repo AkaraChen/angel-engine \
  --json isPrerelease,assets --jq '{isPrerelease, assets: [.assets[].name]}'
```

## Client behavior

- The channel preference lives in the main process at
  `<userData>/updates.json`; the updater needs it before any window exists, so
  it is not part of the renderer settings store.
- Settings → Updates toggles it, and switching channels re-checks immediately.
- Background checks run on window focus and activation, throttled to once every
  four hours.
- `allowDowngrade` stays off. Turning beta off leaves the user on their current
  build until a stable release passes it; rolling a newer database back onto an
  older app is not safe.

## Known limits

- Automatic updates are macOS-only (`process.platform === "darwin"`), and CI
  only builds macOS arm64. Other platforms have no release artifacts today.
