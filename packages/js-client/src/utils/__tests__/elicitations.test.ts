import { describe, expect, it } from "vitest";
import type { ChatElicitation, ChatHistoryMessagePart } from "../../types";
import {
  cloneChatElicitation,
  isChatElicitationData,
  upsertChatElicitationPart,
} from "../elicitations";

function elicitation(
  overrides: Partial<ChatElicitation> = {},
): ChatElicitation {
  return {
    choices: ["allow"],
    id: "elicit-1",
    kind: "approval",
    phase: "pending",
    questions: [
      {
        id: "q1",
        options: [{ description: "Use once", label: "Allow" }],
      },
    ],
    ...overrides,
  };
}

describe("elicitation utils", () => {
  it("validates and clones elicitation data", () => {
    const data: ChatElicitation = elicitation();
    const cloned: ChatElicitation = cloneChatElicitation(data);

    expect(isChatElicitationData(data)).toBe(true);
    expect(isChatElicitationData({ id: "missing" })).toBe(false);
    expect(cloned).toEqual(data);
    expect(cloned.questions).not.toBe(data.questions);
  });

  it("upserts elicitation parts by id", () => {
    const parts: ChatHistoryMessagePart[] = [];

    upsertChatElicitationPart(parts, elicitation({ body: "first" }));
    upsertChatElicitationPart(parts, elicitation({ body: "second" }));

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      data: { body: "second", id: "elicit-1" },
      name: "elicitation",
      type: "data",
    });
  });
});
