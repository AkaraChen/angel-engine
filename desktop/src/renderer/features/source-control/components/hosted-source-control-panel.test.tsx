// @vitest-environment jsdom

import type { SourceControlActivationView } from "../api/use-activation";
import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const updateConfig = vi.fn();
const refetch = vi.fn();
let activation: SourceControlActivationView;
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({ sourceControl: { updateConfig } }),
}));

vi.mock("../api/use-activation", () => ({
  useSourceControlActivation: () => activation,
}));

import { HostedSourceControlPanel } from "./hosted-source-control-panel";

function view(
  input: Partial<SourceControlActivationView>,
): SourceControlActivationView {
  return {
    activation: null,
    authentication: null,
    candidates: [],
    capabilities: { entries: {} },
    diagnostics: [],
    error: null,
    projectPath: "/work/repo",
    providerDisplayName: null,
    providerId: null,
    providerIdentity: null,
    refetch,
    repository: null,
    status: "unresolved",
    unavailableReason: null,
    unresolvedReason: "no-match",
    ...input,
  };
}

function renderPanel(children: ReactNode = <div>hosted-content</div>) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HostedSourceControlPanel projectId="project-1">
        {children}
      </HostedSourceControlPanel>
    </QueryClientProvider>,
  );
}

describe("HostedSourceControlPanel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    updateConfig.mockReset().mockResolvedValue({});
    refetch.mockReset().mockResolvedValue({});
    window.desktopWindow = {
      ...window.desktopWindow,
      openSettings: vi.fn(),
    };
  });

  it.each([
    "no remote",
    "only an unmanaged remote",
  ])("keeps hosted requests at zero for %s", () => {
    const businessRequest = vi.fn();
    activation = view({ status: "unresolved", unresolvedReason: "no-match" });

    renderPanel(<BusinessContent onRequest={businessRequest} />);

    expect(screen.getByTestId("hosted-source-control-fallback")).toBeTruthy();
    expect(businessRequest).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it("offers a remote selector for ambiguous activation without hosted requests", async () => {
    const businessRequest = vi.fn();
    activation = view({
      candidates: [
        {
          providerId: "forge-a",
          remote: {
            fetchUrl: "https://forge.example/acme/repo.git",
            name: "origin",
            pushUrl: null,
            url: "https://forge.example/acme/repo.git",
          },
          repository: null,
          score: 100,
          source: "remote",
        },
      ],
      status: "ambiguous",
      unresolvedReason: null,
    });

    renderPanel(<BusinessContent onRequest={businessRequest} />);
    expect(
      screen.getByText(
        "workspace.tools.pullRequest.hostedFallback.ambiguousTitle",
      ),
    ).toBeDefined();
    fireEvent.keyDown(
      screen.getByRole("combobox", {
        name: "workspace.tools.pullRequest.hostedFallback.remoteLabel",
      }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("option", {
        name: "origin · forge-a · https://forge.example/acme/repo.git",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace.tools.pullRequest.hostedFallback.apply",
      }),
    );

    await waitFor(() =>
      expect(updateConfig).toHaveBeenCalledWith("project-1", {
        provider: { providerId: "forge-a", remote: "origin" },
      }),
    );
    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    expect(businessRequest).not.toHaveBeenCalled();
  });

  it("reactivates hosted content after configuration", () => {
    const businessRequest = vi.fn();
    activation = view({
      authentication: "authenticated",
      providerIdentity: "forge-a:acme/repo:2",
      status: "active",
      unresolvedReason: null,
    });

    renderPanel(<BusinessContent onRequest={businessRequest} />);

    expect(screen.getByText("hosted-content")).toBeTruthy();
    expect(businessRequest).toHaveBeenCalledOnce();
  });

  it("folds an unavailable provider without rendering hosted content", () => {
    const businessRequest = vi.fn();
    activation = view({
      authentication: "unavailable",
      status: "active",
      unresolvedReason: null,
    });

    renderPanel(<BusinessContent onRequest={businessRequest} />);

    expect(screen.getByTestId("hosted-source-control-fallback")).toBeTruthy();
    expect(businessRequest).not.toHaveBeenCalled();
  });
});

function BusinessContent({ onRequest }: { onRequest: () => void }) {
  onRequest();
  return <div>hosted-content</div>;
}
