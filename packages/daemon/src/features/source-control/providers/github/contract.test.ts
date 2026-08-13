import type { ProbeContext } from "@angel-engine/daemon-api/source-control";

import { runProviderContractSuite } from "../../contract/provider-contract";
import { createGitHubPlugin } from "./plugin";

const repository = {
  displayPath: "acme/widgets",
  host: "github.com",
  name: "widgets",
  namespace: ["acme"],
  providerId: "github",
  remoteId: null,
  webUrl: "https://github.com/acme/widgets",
} as const;

const probe: ProbeContext = {
  defaultRemote: "origin",
  explicitProviderId: null,
  explicitRemote: null,
  hostMappings: {},
  projectPath: "/contract",
  remotes: [
    {
      fetchUrl: "https://github.com/acme/widgets.git",
      name: "origin",
      pushUrl: null,
      url: "https://github.com/acme/widgets.git",
    },
  ],
  upstreamRemote: null,
};

runProviderContractSuite(createGitHubPlugin, {
  probe,
  repository: {
    expected: repository,
    urls: [
      "https://github.com/acme/widgets.git",
      "ssh://git@github.com/acme/widgets.git",
      "git@github.com:acme/widgets.git",
    ],
  },
});
