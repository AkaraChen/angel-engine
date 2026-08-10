/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const registered = new Map<string, () => unknown>();

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));

vi.mock("@/platform/keymap/provider", () => ({
  useCommand: (id: string, handler: () => unknown) => {
    registered.set(id, handler);
  },
  useContextKey: () => {},
  KeymapScope: ({
    children,
    scope,
    id,
  }: {
    children?: React.ReactNode;
    scope: string;
    id?: string;
  }) => (
    <div data-keymap-scope={scope} data-keymap-scope-id={id}>
      {children}
    </div>
  ),
}));

import { WorkspaceKeymapBindings } from "./workspace-keymap-bindings";

afterEach(() => {
  cleanup();
  registered.clear();
});

describe("WorkspaceKeymapBindings", () => {
  it("wraps children in view scope so workspace DOM is covered", () => {
    const { container } = render(
      <WorkspaceKeymapBindings
        onCreateStandaloneChat={vi.fn()}
        onOpenSettings={vi.fn()}
      >
        <button type="button">workspace-body</button>
      </WorkspaceKeymapBindings>,
    );

    const scope = container.querySelector('[data-keymap-scope="view"]');
    expect(scope).not.toBeNull();
    expect(scope?.getAttribute("data-keymap-scope-id")).toBe("workspace");
    expect(scope?.textContent).toContain("workspace-body");
  });

  it("wires next/previous tab handlers when provided", () => {
    const onNextTab = vi.fn(() => true);
    const onPreviousTab = vi.fn(() => true);
    render(
      <WorkspaceKeymapBindings
        hasMultipleTabs
        onCreateStandaloneChat={vi.fn()}
        onNextTab={onNextTab}
        onOpenSettings={vi.fn()}
        onPreviousTab={onPreviousTab}
        powerModeActive
      >
        <span />
      </WorkspaceKeymapBindings>,
    );

    expect(registered.get("workspace.nextTab")?.()).toBe(true);
    expect(onNextTab).toHaveBeenCalledTimes(1);
    expect(registered.get("workspace.previousTab")?.()).toBe(true);
    expect(onPreviousTab).toHaveBeenCalledTimes(1);
  });

  it("does not register a files.save placeholder handler", () => {
    render(
      <WorkspaceKeymapBindings
        onCreateStandaloneChat={vi.fn()}
        onOpenSettings={vi.fn()}
      >
        <span />
      </WorkspaceKeymapBindings>,
    );
    expect(registered.has("files.save")).toBe(false);
  });
});
