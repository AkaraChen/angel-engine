# Source-control provider contract

The first release loads only first-party provider plugins bundled with Angel Engine. The registry lifecycle and operation contracts do not assume that plugins are statically linked, but third-party discovery and dynamic loading are deliberately unavailable until a stronger sandbox and signing policy exists.

## Trust and isolation

Provider code is trusted application code but is still treated as a failure boundary. Every readiness check and provider operation runs through the registry invocation wrapper, which applies a finite deadline, caller cancellation, failure normalization, and secret redaction. A provider timeout or exception invalidates only that operation; it does not terminate the daemon, disable the shared local Git backend, or unload another provider.

Plugins receive the minimum provider-neutral operation input. They do not receive the daemon database, renderer objects, or unrestricted credential records. The renderer receives only `ProviderActivation`, capability state, and redacted diagnostics.

## Credentials and configuration

Project configuration selects a provider, remote, and optional repository identity. Its schema rejects extra fields, including tokens. Credentials remain in the provider-owned CLI, operating-system keychain, or OAuth storage and never enter `.angel/source-control.json`, registry diagnostics, or renderer payloads.

Provider transports must execute commands without a shell and pass arguments as an array. Remote strings and provider output are data, never command fragments. Interactive credential prompts are forbidden in daemon operations.

## Cancellation and timeout

Every invocation receives an `AbortSignal` and absolute deadline. Caller cancellation produces `source-control/cancelled`; an exhausted deadline produces `source-control/timeout`; synchronous throws, rejected promises, and non-`Error` failures become `source-control/failed`. Providers should stop work when signaled, while the registry deadline remains authoritative even if a provider ignores cancellation.

Activations carry a project generation. Remote or configuration changes increment that generation; an operation using an older activation fails with `source-control/stale-activation` and must probe again.

## Stable check identity

Consumers that deduplicate check events across provider attempts must use the v1 logical identity. Its ordered segments are provider id, `repositoryKey(repository)`, group kind (or the literal `ungrouped`), group name (or empty), group stage (or empty), and check name.

Before encoding, every segment is normalized to Unicode NFC. The serialized key starts with `check:v1:` and encodes each segment as its UTF-8 byte length, `:`, then the segment bytes. Length-prefixing is mandatory: joining raw values with `:`, `/`, or another delimiter is not collision-safe because provider names and check labels may contain those characters. Repository consumers must use the shared `repositoryKey` helper rather than reconstructing the repository path.

The identity deliberately excludes check id, group id, attempt, retry ancestry, status, conclusion, timestamps, details URL, and log reference. Consequently, retries of the same logical check keep one fingerprint even when their outcomes differ. An ungrouped check uses `ungrouped` plus empty group name and stage segments, keeping the absence of a group explicit and deterministic. Providers must populate group kind, name, and stage consistently across attempts; consumers must not infer identity from provider-specific extensions.
