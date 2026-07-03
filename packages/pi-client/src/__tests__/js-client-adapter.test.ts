import { describe, expect, it } from "vitest";
import {
  PiAgentAdapter,
  piClientInputFromChatAttachments,
} from "../js-client-adapter";

describe("PiAgentAdapter", () => {
  it("registers the pi runtime id", () => {
    expect(new PiAgentAdapter().id).toBe("pi");
  });

  it("converts JS client attachments to engine input", () => {
    expect(
      piClientInputFromChatAttachments([
        { path: "/repo/src/main.ts", type: "fileMention" },
        {
          data: "aGVsbG8=",
          mimeType: "text/plain",
          name: "note.txt",
          path: null,
          type: "file",
        },
        {
          name: "review",
          path: "/skills/review/SKILL.md",
          type: "skillMention",
        },
      ]),
    ).toEqual([
      {
        mimeType: null,
        name: "main.ts",
        path: "/repo/src/main.ts",
        type: "file_mention",
      },
      {
        mimeType: "text/plain",
        text: "hello",
        type: "embedded_text_resource",
        uri: "attachment:///note.txt",
      },
      {
        name: "review",
        path: "/skills/review/SKILL.md",
        type: "skill_mention",
      },
    ]);
  });
});
