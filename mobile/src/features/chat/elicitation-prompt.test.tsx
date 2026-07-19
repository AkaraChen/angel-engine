import type { DaemonElicitation } from "@/platform/chat-types";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ElicitationPrompt } from "./elicitation-prompt";

afterEach(cleanup);

function elicitation(
  overrides: Partial<DaemonElicitation> = {},
): DaemonElicitation {
  return {
    id: "e1",
    kind: "userInput",
    title: "Need input",
    body: "Please provide the missing value.",
    ...overrides,
  };
}

describe("ElicitationPrompt", () => {
  it("renders permission approval actions", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({ kind: "approval" })}
        onRespond={onRespond}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(onRespond).toHaveBeenCalledWith({ type: "allow" });

    fireEvent.click(screen.getByRole("button", { name: "Allow for session" }));
    expect(onRespond).toHaveBeenCalledWith({ type: "allowForSession" });

    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(onRespond).toHaveBeenCalledWith({ type: "deny" });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onRespond).toHaveBeenCalledWith({ type: "cancel" });
  });

  it("renders permission approval actions even when the event includes choices", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({
          kind: "approval",
          choices: ["Allow", "Allow for session", "Deny"],
        })}
        onRespond={onRespond}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Allow for session" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(onRespond).toHaveBeenCalledWith({ type: "allow" });
  });

  it("renders a free-form textarea for userInput without questions", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({ kind: "userInput" })}
        onRespond={onRespond}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "my answer" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(onRespond).toHaveBeenCalledWith({
      type: "answers",
      answers: [{ id: "answer", value: "my answer" }],
    });
  });

  it("renders option buttons and submits the selected answer", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({
          kind: "userInput",
          questions: [
            {
              id: "q1",
              header: "Pick one",
              question: "Which environment?",
              options: [
                { label: "dev", description: "Development" },
                { label: "prod" },
              ],
            },
          ],
        })}
        onRespond={onRespond}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dev/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(onRespond).toHaveBeenCalledWith({
      type: "answers",
      answers: [{ id: "q1", value: "dev" }],
    });
  });

  it("renders a password input for secret questions", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({
          kind: "userInput",
          questions: [{ id: "q1", question: "Password", isSecret: true }],
        })}
        onRespond={onRespond}
      />,
    );

    const input = screen.getByLabelText("Password");
    expect(input.getAttribute("type")).toBe("password");
  });

  it("renders dynamic tool call confirm/reject actions", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({ kind: "dynamicToolCall" })}
        onRespond={onRespond}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(onRespond).toHaveBeenCalledWith({
      type: "dynamicToolResult",
      success: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onRespond).toHaveBeenCalledWith({
      type: "dynamicToolResult",
      success: false,
    });
  });

  it("renders external flow completion action", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({ kind: "externalFlow" })}
        onRespond={onRespond}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onRespond).toHaveBeenCalledWith({ type: "externalComplete" });
  });

  it("renders simple choices as answer buttons", () => {
    const onRespond = vi.fn();
    render(
      <ElicitationPrompt
        elicitation={elicitation({
          kind: "SomeChoice",
          choices: ["option-a", "option-b"],
        })}
        onRespond={onRespond}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "option-a" }));
    expect(onRespond).toHaveBeenCalledWith({
      type: "answers",
      answers: [{ id: "choice", value: "option-a" }],
    });
  });
});
