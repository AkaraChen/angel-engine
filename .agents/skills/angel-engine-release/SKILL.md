---
name: angel-engine-release
description: "Release Angel Engine desktop builds through the repository's GitHub Actions workflow. Use when the user asks to publish, cut, ship, tag, or release an Angel Engine desktop version, including beta/prerelease and stable releases. Enforces the required order: update desktop/package.json version first, commit it, create and push the release tag, then let or trigger the desktop release Action, and verify signed/notarized artifacts and updater metadata."
---

# Angel Engine Release

## Required Order

Never run the release workflow before the repository version state is committed and pushed.

1. Decide the exact release version, for example `0.0.2` or `0.0.2-beta1`.
2. Ensure the worktree is clean except intentional release edits.
3. Update `desktop/package.json` with `pnpm --dir desktop version <version> --no-git-tag-version`.
4. Run focused checks at minimum:
   ```sh
   npm --prefix crates/angel-engine-client-napi run build
   npm --prefix desktop run typecheck
   git diff --check
   ```
5. Commit the version bump:
   ```sh
   git add desktop/package.json
   git commit -m "chore(desktop): release <version>"
   ```
6. Create the release tag from that commit:
   ```sh
   git tag v<version>
   ```
7. Push the commit and tag:
   ```sh
   git push
   git push origin v<version>
   ```
8. Only after the commit and tag are on the remote, watch the `Desktop Release` GitHub Action triggered by the tag. If the tag trigger does not start, then use workflow dispatch with the same version:
   ```sh
   gh workflow run desktop-release.yml --repo AkaraChen/angel-engine --ref master -f version=<version>
   ```

## Guardrails

- Do not use workflow dispatch as the first release step.
- Do not release a version that is not committed in `desktop/package.json`.
- Do not create a tag on an unverified or dirty worktree.
- Do not push a tag before the matching commit is pushed.
- If a mistaken workflow run was started before the version commit/tag, cancel it before proceeding.
- For prereleases, keep the `v<version>` tag format, such as `v0.0.2-beta1`.
- The desktop release workflow currently publishes GitHub prereleases via `desktop/electron-builder.yml`; stable-vs-prerelease policy must be changed in config before expecting a stable GitHub release.

## Verification

After the Action succeeds, download the release artifacts and verify them before reporting success:

```sh
rm -rf /private/tmp/angel-engine-release-<version>
mkdir -p /private/tmp/angel-engine-release-<version>
gh release download v<version> --repo AkaraChen/angel-engine --dir /private/tmp/angel-engine-release-<version>
```

Required evidence:

- Release has `Angel-Engine-<version>-arm64.dmg`, `Angel-Engine-<version>-arm64.zip`, `Angel-Engine-<version>-arm64.zip.blockmap`, and `latest-mac.yml`.
- `latest-mac.yml` version equals `<version>` and its sha512 matches the downloaded ZIP.
- DMG container passes:
  ```sh
  xcrun stapler validate Angel-Engine-<version>-arm64.dmg
  codesign --verify --verbose=4 Angel-Engine-<version>-arm64.dmg
  spctl -a -vvv -t install Angel-Engine-<version>-arm64.dmg
  ```
- App extracted from ZIP passes:
  ```sh
  codesign --verify --deep --strict --verbose=4 "Angel Engine.app"
  xcrun stapler validate "Angel Engine.app"
  spctl -a -vvv -t exec "Angel Engine.app"
  ```
- App mounted from DMG passes the same app checks.

Clean up mounted DMGs with `hdiutil detach` before finishing.
