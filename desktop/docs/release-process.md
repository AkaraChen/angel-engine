# Desktop Release Process

Angel Engine ships from GitHub Releases on two update channels that share one
repository. Downloading a build by hand from the Releases page works the same
way it always has; the channels only decide what the in-app updater installs.

| Channel  | Version         | GitHub Release | Update files (mac)               | Who gets it                       |
| -------- | --------------- | -------------- | -------------------------------- | --------------------------------- |
| `stable` | `1.2.3`         | Latest release | `latest-mac.yml`, `beta-mac.yml` | Everyone                          |
| `beta`   | `1.2.3-beta.4`  | Pre-release    | `beta-mac.yml`                   | Only "Receive beta updates" users |

Linux and Windows use the same channel rules with platform-native file names
(`latest-linux.yml` / `beta-linux.yml`, and `latest.yml` / `beta.yml` on
Windows). A stable release writes the beta channel file too, so beta users roll
forward onto stable instead of getting stranded on the last pre-release. A beta
release never writes `latest-*.yml`, which is what keeps stable users off
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
   version as input). The workflow builds on **Linux, Windows, and macOS** in
   parallel, runs desktop unit tests, packages installers, and uploads platform
   assets to the same GitHub Release (mac may also sign and notarize when
   secrets are configured).
3. `bun run --filter desktop publish` on each runner derives everything else:
   the GitHub release type (`release` / `prerelease`), the electron-builder
   channel, and the list of artifacts to attach for that OS.

### Multi-platform beta iteration

To re-exercise the three-platform pipeline:

```sh
# from a clean tree with the multi-platform packaging changes committed
pnpm --dir desktop version 1.2.3-beta.N --no-git-tag-version   # or npm version
git add desktop/package.json
git commit -m "chore(desktop): release 1.2.3-beta.N"
git tag v1.2.3-beta.N
git push && git push origin v1.2.3-beta.N
```

If the tag trigger does not start the workflow:

```sh
gh workflow run desktop-release.yml --repo AkaraChen/angel-engine --ref master -f version=1.2.3-beta.N
```

## Verifying a release

- A stable release must have both `latest-mac.yml` and `beta-mac.yml` (and the
  linux/win equivalents when those platforms published).
- A beta release must have `beta-mac.yml` (plus `beta-linux.yml` / `beta.yml`
  when published) and **no** `latest-*.yml` for that platform.
- The GitHub release is marked "Pre-release" for beta versions only.
- Expect platform installers such as:
  - macOS: `Angel-Engine-<version>-arm64.dmg`, `.zip`
  - Linux: `Angel-Engine-<version>-x86_64.AppImage`, `Angel-Engine-<version>-amd64.deb`
  - Windows: `Angel-Engine-<version>-x64.exe`

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
  older app is not safe. **Assigning `autoUpdater.channel` re-enables
  `allowDowngrade`** (electron-updater's setter does it unconditionally), so
  `allowDowngrade = false` must always be set *after* the channel — that is why
  both live together in `applyChannel()`.
- Switching channels cancels any download in flight and ignores results from the
  channel the user just left, so a half-downloaded beta can never be offered for
  install after beta is turned off.

## Known limits

- Automatic updates are still macOS-only (`process.platform === "darwin"`).
  Linux and Windows get installable release artifacts; in-app auto-update for
  those platforms is not enabled yet.
- CI packages the runner's native arch (macOS arm64, Linux x64, Windows x64).
  Cross-building every arch from one host is not required.
