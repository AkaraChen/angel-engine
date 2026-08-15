# Source-control provider plugins

Provider plugins normalize a hosted source-control product into the contracts in
`@angel-engine/daemon-api/source-control`. Provider-specific API payloads and CLI
behavior stay inside the adapter; the registry and renderer consume only the
normalized contract.

## Minimum implementation

A provider must define a manifest, pure remote matching, readiness/auth checks,
and repository URL parsing. See
`packages/daemon/src/features/source-control/contract/example-provider.ts` for a
complete minimum plugin.

Keep these invariants:

- `discovery.match` is pure. It may inspect only `ProbeContext`; do not read the
  filesystem, execute a CLI, or make a network request.
- Missing capabilities are unsupported. Declare every implemented optional
  operation in `manifest.capabilities` and do not declare operations that are
  absent.
- Use `manifest.unsupportedCapabilities` when the UI needs a stable explanation
  such as `out-of-scope`, `not-implemented`, or `requires-configuration`.
- Preserve provider identity. `namespace` is ordered and may be deeper than one
  segment. Azure DevOps uses `[organization, project]`, repository `name`, and
  the repository GUID as `remoteId` when available.
- Validate all CLI/API JSON at the adapter boundary before mapping it.
- Respect `ProviderOperationContext.signal` and `deadline` for every operation.
- Never put a token in a command argument, clone URL, `RepositoryIdentity`,
  diagnostic, log, or project configuration. Authenticated clone should use the
  shared credentialed-clone strategy and an ephemeral askpass shim when a token
  is the last available credential source.

## Contract suite

Add a provider contract test next to the plugin:

```ts
runProviderContractSuite(createProvider, {
  repository: {
    expected: repositoryIdentity,
    urls: [httpsUrl, sshUrl, scpStyleUrl],
  },
});
```

The suite checks manifest/implementation coherence, duplicate or conflicting
capability declarations, repository identity normalization, pure discovery, and
fail-closed invocation of undeclared capabilities. Provider-specific tests must
also cover auth failure, self-hosted mapping, credentials/redaction, output
mapping, cancellation, and timeout behavior relevant to that provider.

Run the focused contract gate before broader provider work:

```sh
bun run --filter @angel-engine/daemon test -- src/features/source-control/providers/<provider>/contract.test.ts
```

Before review, run the workspace `typecheck`, `lint`, and `test` scripts.

## Built-in capability boundaries

GitLab's first release intentionally excludes `changeRequests.merge` and all
`reviewThreads.*` operations. Azure DevOps is a minimum adapter limited to auth,
discovery, repository identity, and change-request list/get. Consumers must use
the capability matrix and must not infer support from provider name.
