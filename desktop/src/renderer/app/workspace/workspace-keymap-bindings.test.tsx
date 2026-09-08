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
});
