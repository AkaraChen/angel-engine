import { describe, expect, it } from "vitest";

import {
  chatMessageReferences,
  chatMessageReferencesFromRunConfig,
  runConfigWithChatMessageReferences,
} from "@/features/chat/chat-message-references";

describe("chat message references", () => {
  it("keeps file and skill references in run config instead of attachments", () => {
    const references = chatMessageReferences(
      [
        {
          mimeType: "text/typescript",
          name: "app.ts",
          path: "/repo/src/app.ts",
          relativePath: "src/app.ts",
          type: "file",
        },
      ],
      [
        {
          description: "Create and maintain skills",
          enabled: true,
          name: "skill-authoring",
          path: "/skills/skill-authoring/SKILL.md",
          scope: "user",
        },
      ],
    );
    const runConfig = runConfigWithChatMessageReferences(undefined, references);

    expect(chatMessageReferencesFromRunConfig(runConfig)).toEqual([
      {
        mimeType: "text/typescript",
        name: "app.ts",
        path: "/repo/src/app.ts",
        type: "fileMention",
      },
      {
        name: "skill-authoring",
        path: "/skills/skill-authoring/SKILL.md",
        type: "skillMention",
      },
    ]);
  });

  it("clears stale references when the current message has none", () => {
    const runConfig = runConfigWithChatMessageReferences(
      {
        custom: {
          chatMessageReferences: [
            {
              name: "skill-authoring",
              path: "/skills/skill-authoring/SKILL.md",
              type: "skillMention",
            },
          ],
          mode: "plan",
        },
      },
      [],
    );

    expect(runConfig).toEqual({ custom: { mode: "plan" } });
    expect(chatMessageReferencesFromRunConfig(runConfig)).toEqual([]);
  });
});
