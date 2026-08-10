// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextUsageBar } from "./context-usage-bar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("ContextUsageBar", () => {
  it("renders a visible near-limit warning", () => {
    render(<ContextUsageBar usage={{ size: 100_000, used: 95_000 }} />);

    expect(screen.getByText(/usage\.contextNearLimit/)).toBeTruthy();
  });

  it("does not render near-limit copy below the danger threshold", () => {
    render(<ContextUsageBar usage={{ size: 100_000, used: 75_000 }} />);

    expect(screen.queryByText(/usage\.contextNearLimit/)).toBeNull();
  });
});
