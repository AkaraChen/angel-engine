// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  confirmAction,
  ConfirmDialogHost,
  requestConfirm,
} from "./confirm-dialog";

afterEach(cleanup);

describe("ConfirmDialogHost", () => {
  it("resolves with the value of the action the user picks", async () => {
    render(<ConfirmDialogHost />);
    const answer = confirmAction({
      cancelLabel: "Cancel",
      confirmLabel: "Delete",
      title: "Delete all chats?",
    });

    await screen.findByText("Delete all chats?");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await expect(answer).resolves.toBe(true);
  });

  it("resolves with the cancel value when dismissed with Escape", async () => {
    render(<ConfirmDialogHost />);
    const answer = confirmAction({
      cancelLabel: "Cancel",
      confirmLabel: "Delete",
      title: "Delete all chats?",
    });

    await screen.findByText("Delete all chats?");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await expect(answer).resolves.toBe(false);
  });

  it("queues prompts instead of stacking overlays", async () => {
    render(<ConfirmDialogHost />);
    const first = requestConfirm({
      actions: [{ label: "Save", value: "save" }],
      cancelValue: "cancel",
      title: "Save changes to a.ts?",
    });
    const second = requestConfirm({
      actions: [{ label: "Save", value: "save" }],
      cancelValue: "cancel",
      title: "Save changes to b.ts?",
    });

    await screen.findByText("Save changes to a.ts?");
    expect(screen.queryByText("Save changes to b.ts?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await expect(first).resolves.toBe("save");

    await waitFor(() => {
      expect(screen.getByText("Save changes to b.ts?")).toBeDefined();
    });
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await expect(second).resolves.toBe("cancel");
  });
});
