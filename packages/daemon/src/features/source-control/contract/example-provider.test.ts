import { runProviderContractSuite } from "./provider-contract";
import { createExampleProvider } from "./example-provider";

runProviderContractSuite(createExampleProvider, {
  repository: {
    expected: {
      displayPath: "acme/widgets",
      host: "code.example.test",
      name: "widgets",
      namespace: ["acme"],
      providerId: "example",
      remoteId: null,
      webUrl: "https://code.example.test/acme/widgets",
    },
    urls: [
      "https://code.example.test/acme/widgets",
      "https://code.example.test/acme/widgets.git",
    ],
  },
});
