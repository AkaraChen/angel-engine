// @vitest-environment jsdom

import type { CapabilityMatrix } from "@angel-engine/daemon-api/source-control";
import type { FC, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloneRepositoryDialog } from "./clone-repository-dialog";

const supportedCapabilities: CapabilityMatrix = {
  entries: {
    "discovery.listNamespaces": { supported: true },
    "discovery.listRepositories": { supported: true },
    "provider.clone": { supported: true },
  },
};

const mocks = vi.hoisted(() => ({
  capabilities: { entries: {} } as CapabilityMatrix,
  listNamespaces: vi.fn(),
  listRepositories: vi.fn(),
  status: "active" as "active" | "unresolved",
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({
    sourceControl: {
      listNamespaces: mocks.listNamespaces,
      listRepositories: mocks.listRepositories,
    },
  }),
}));

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => ({
    capabilities: mocks.capabilities,
    projectPath: mocks.status === "active" ? "/repos/widgets" : null,
    providerDisplayName: mocks.status === "active" ? "GitLab" : null,
    providerIdentity:
      mocks.status === "active"
        ? "gitlab:gitlab.example.com/acme/widgets:4"
        : null,
    status: mocks.status,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "projectImport.clone": "Clone",
        "projectImport.discoveryUnavailable":
          "Repository browsing requires an active source control provider.",
        "projectImport.tabUrl": "Git URL",
        "projectImport.urlLabel": "Repository URL",
        "projectImport.urlPlaceholder": "Repository URL",
      })[key] ?? key,
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  const Passthrough: FC<{ children: ReactNode }> = ({ children }) => (
    <>{children}</>
  );
  const DialogContent: FC<{ children: ReactNode }> = ({ children }) => (
    <div role="dialog">{children}</div>
  );
  return {
    Dialog: Passthrough,
    DialogContent,
    DialogDescription: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

beforeEach(() => {
  mocks.capabilities = supportedCapabilities;
  mocks.status = "active";
  mocks.listNamespaces
    .mockReset()
    .mockResolvedValue([
      { avatarUrl: null, id: "acme", name: "Acme", path: ["acme"] },
    ]);
  mocks.listRepositories.mockReset().mockResolvedValue([
    {
      displayPath: "acme/widgets",
      host: "gitlab.example.com",
      name: "widgets",
      namespace: ["acme"],
      providerId: "gitlab",
      remoteId: "10",
      webUrl: "https://gitlab.example.com/acme/widgets",
    },
  ]);
});

afterEach(cleanup);

describe("CloneRepositoryDialog", () => {
  it("uses provider discovery and clones the selected repository URL", async () => {
    const onClone = vi.fn();
    renderDialog(onClone);

    expect(await screen.findByText("widgets")).toBeDefined();
    expect(mocks.listNamespaces).toHaveBeenCalledWith("/repos/widgets", "", 50);
    expect(mocks.listRepositories).toHaveBeenCalledWith(
      "/repos/widgets",
      ["acme"],
      "",
      50,
    );

    fireEvent.click(screen.getByText("widgets"));
    expect(onClone).toHaveBeenCalledWith(
      "https://gitlab.example.com/acme/widgets",
    );
  });

  it("hides discovery and keeps URL-only clone when namespaces are unsupported", async () => {
    mocks.capabilities = {
      entries: {
        "discovery.listNamespaces": {
          reason: {
            kind: "not-implemented",
            message: "This provider cannot enumerate namespaces.",
          },
          supported: false,
        },
      },
    };
    const onClone = vi.fn();
    renderDialog(onClone);

    expect(
      screen.getByText("This provider cannot enumerate namespaces."),
    ).toBeDefined();
    expect(screen.queryByText("GitLab")).toBeNull();
    expect(mocks.listNamespaces).not.toHaveBeenCalled();
    expect(mocks.listRepositories).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Repository URL"), {
      target: { value: "ssh://git@git.example.com/team/widgets.git" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone" }));
    expect(onClone).toHaveBeenCalledWith(
      "ssh://git@git.example.com/team/widgets.git",
    );
  });

  it("makes zero discovery requests when activation is not active", async () => {
    mocks.status = "unresolved";
    renderDialog(vi.fn());

    expect(
      screen.getByText(
        "Repository browsing requires an active source control provider.",
      ),
    ).toBeDefined();
    await waitFor(() => {
      expect(mocks.listNamespaces).not.toHaveBeenCalled();
      expect(mocks.listRepositories).not.toHaveBeenCalled();
    });
  });
});

function renderDialog(onClone: (url: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CloneRepositoryDialog
        onClone={onClone}
        onOpenChange={vi.fn()}
        open
        projectId="project-1"
      />
    </QueryClientProvider>,
  );
}
