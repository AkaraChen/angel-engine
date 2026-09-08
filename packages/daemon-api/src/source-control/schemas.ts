import { type as arkType } from "arktype";

const extensionsSchema = arkType({ "[string]": "unknown" });

export const repositoryIdentitySchema = arkType({
  "+": "reject",
  providerId: "string > 0",
  host: "string > 0",
  namespace: "string[]",
  name: "string > 0",
  remoteId: "string | null",
  displayPath: "string > 0",
  webUrl: "string | null",
  "extensions?": extensionsSchema,
});

export const sourceControlActorSchema = arkType({
  "+": "reject",
  id: "string | null",
  login: "string > 0",
  displayName: "string | null",
  avatarUrl: "string | null",
  webUrl: "string | null",
  "extensions?": extensionsSchema,
});

export const unsupportedReasonSchema = arkType({
  "+": "reject",
  kind: "'not-implemented' | 'out-of-scope' | 'requires-configuration' | 'unauthenticated' | 'cli-missing' | 'permission-denied' | 'plan-restricted' | 'unknown-capability'",
  message: "string > 0",
  "docsUrl?": "string",
});

const supportedCapabilitySchema = arkType({
  "+": "reject",
  supported: "true",
});
const unsupportedCapabilitySchema = arkType({
  "+": "reject",
  supported: "false",
  reason: unsupportedReasonSchema,
});
export const capabilityStateSchema = supportedCapabilitySchema.or(
  unsupportedCapabilitySchema,
);

export const capabilityMatrixSchema = arkType({
  "+": "reject",
  entries: { "[string]": capabilityStateSchema },
});

const capabilityIdSchema = arkType(
  "'provider.auth' | 'discovery.listNamespaces' | 'discovery.listRepositories' | 'repositoryIdentity' | 'provider.clone'",
);

export const providerManifestSchema = arkType({
  "+": "reject",
  id: "string > 0",
  displayName: "string > 0",
  hosts: "string[]",
  capabilities: capabilityIdSchema.array(),
  "unsupportedCapabilities?": { "[string]": unsupportedReasonSchema },
  "extensions?": extensionsSchema,
});

export const providerDiagnosticSchema = arkType({
  "+": "reject",
  code: "string > 0",
  message: "string > 0",
  severity: "'info' | 'warning' | 'error'",
  "extensions?": extensionsSchema,
});

export const providerActivationSchema = arkType({
  "+": "reject",
  generation: "number.integer >= 0",
  provider: providerManifestSchema,
  projectPath: "string > 0",
  remote: {
    "+": "reject",
    name: "string > 0",
    url: "string > 0",
  },
  repository: repositoryIdentitySchema.or("null"),
  authentication:
    "'authenticated' | 'unauthenticated' | 'unavailable' | 'unknown'",
  capabilities: capabilityMatrixSchema,
  unavailableReason: unsupportedReasonSchema.or("null"),
  diagnostics: providerDiagnosticSchema.array(),
});

export const sourceControlErrorDetailsSchema = arkType({
  "+": "reject",
  providerId: "string > 0",
  operation: "string > 0",
  retryable: "boolean",
  "providerCode?": "string",
  "providerMessage?": "string",
});

export const eventFingerprintSchema = arkType({
  "+": "reject",
  kind: "'check' | 'review-comment'",
  value: "string > 0",
});
