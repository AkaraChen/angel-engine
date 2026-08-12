import { type as arkType } from "arktype";

import type { RepositoryIdentity } from "./types";

export interface ProjectProviderConfig {
  providerId: string;
  remote: string;
  repository?: RepositoryIdentity;
}

export interface SourceControlProjectConfig {
  provider?: ProjectProviderConfig;
}

export interface ProviderHostMapping {
  host: string;
  providerId: string;
}

export const projectProviderConfigSchema = arkType({
  "+": "reject",
  providerId: "string > 0",
  remote: "string > 0",
  "repository?": {
    "+": "reject",
    providerId: "string > 0",
    host: "string > 0",
    namespace: "string[]",
    name: "string > 0",
    remoteId: "string | null",
    displayPath: "string > 0",
    webUrl: "string | null",
    "extensions?": { "[string]": "unknown" },
  },
});

export const sourceControlProjectConfigSchema = arkType({
  "+": "reject",
  "provider?": projectProviderConfigSchema,
});

export const providerHostMappingSchema = arkType({
  "+": "reject",
  host: "string > 0",
  providerId: "string > 0",
});
