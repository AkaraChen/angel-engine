import { describe, expect, it } from "vitest";
import type { ChatAttachmentInput } from "../../types";
import { normalizeChatAttachmentsInput } from "../attachments";

describe("attachment utils", () => {
  it("normalizes encoded file and image attachments", () => {
    const input: ChatAttachmentInput = {
      data: "data:text/plain;base64,aGVsbG8=",
      mimeType: "text/plain",
      name: "note.txt",
      type: "file",
    };

    expect(normalizeChatAttachmentsInput([input])).toEqual([
      {
        data: "aGVsbG8=",
        mimeType: "text/plain",
        name: "note.txt",
        path: null,
        type: "file",
      },
    ]);
  });

  it("normalizes file mentions and validates arrays", () => {
    expect(
      normalizeChatAttachmentsInput([
        { path: "/tmp/example.ts", type: "fileMention" },
      ]),
    ).toEqual([
      {
        mimeType: null,
        name: "example.ts",
        path: "/tmp/example.ts",
        type: "fileMention",
      },
    ]);

    expect(() => normalizeChatAttachmentsInput({})).toThrow(
      "Chat attachments must be an array.",
    );
  });
});
