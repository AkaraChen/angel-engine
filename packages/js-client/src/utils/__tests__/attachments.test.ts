import { describe, expect, it } from "vitest";
import type { ChatAttachmentInput } from "../../types";
import {
  base64ByteSize,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  chatAttachmentTypeAccepted,
  normalizeChatAttachmentsInput,
} from "../attachments";

function base64OfBytes(length: number): string {
  return Buffer.alloc(length, 1).toString("base64");
}

function filePayload(
  overrides: Partial<{
    data: string;
    mimeType: string;
    name: string | null;
    type: "file" | "image";
  }> = {},
): ChatAttachmentInput {
  return {
    data: "aGVsbG8=",
    mimeType: "text/plain",
    name: "note.txt",
    type: "file",
    ...overrides,
  };
}

describe("base64ByteSize", () => {
  it("counts exact decoded bytes including padding variants", () => {
    expect(base64ByteSize("aGVsbG8=")).toBe(5); // "hello", one `=`
    expect(base64ByteSize("aGk=")).toBe(2); // "hi", one `=`
    expect(base64ByteSize("YQ==")).toBe(1); // "a", two `=`
    expect(base64ByteSize("aGVsbG8")).toBe(5); // no padding
    expect(base64ByteSize(base64OfBytes(CHAT_ATTACHMENT_MAX_FILE_BYTES))).toBe(
      CHAT_ATTACHMENT_MAX_FILE_BYTES,
    );
  });
});

describe("chatAttachmentTypeAccepted", () => {
  it.each([
    { mimeType: "image/png", name: "shot.png" },
    { mimeType: "image/jpeg", name: "photo.jpg" },
    { mimeType: "application/pdf", name: "doc.pdf" },
    { mimeType: "text/plain", name: "notes.txt" },
    { mimeType: "text/markdown", name: "README.md" },
    { mimeType: "text/csv", name: "data.csv" },
    { mimeType: "application/json", name: "config.json" },
    { mimeType: "text/plain", name: "server.log" },
    { mimeType: "text/plain", name: null },
    { mimeType: "image/webp", name: "no-extension" },
  ])("accepts supported payload %j", (file) => {
    expect(chatAttachmentTypeAccepted(file)).toBe(true);
  });

  it.each([
    { mimeType: "application/zip", name: "archive.zip" },
    { mimeType: "video/mp4", name: "clip.mp4" },
    { mimeType: "application/octet-stream", name: "blob.bin" },
    { mimeType: "application/pdf", name: "fake.png" },
    { mimeType: "image/png", name: "fake.pdf" },
    { mimeType: "text/plain", name: "fake.jpg" },
  ])("rejects unsupported or contradictory payload %j", (file) => {
    expect(chatAttachmentTypeAccepted(file)).toBe(false);
  });
});

describe("normalizeChatAttachmentsInput", () => {
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

  it("accepts a file of exactly the maximum size", () => {
    const input = filePayload({
      data: base64OfBytes(CHAT_ATTACHMENT_MAX_FILE_BYTES),
    });
    expect(normalizeChatAttachmentsInput([input])).toHaveLength(1);
  });

  it("rejects a file one byte over the maximum size", () => {
    const input = filePayload({
      data: base64OfBytes(CHAT_ATTACHMENT_MAX_FILE_BYTES + 1),
    });
    expect(() => normalizeChatAttachmentsInput([input])).toThrow(
      "maximum file size",
    );
  });

  it("rejects unsupported direct API types even without a picker", () => {
    expect(() =>
      normalizeChatAttachmentsInput([
        filePayload({
          data: Buffer.from("zip").toString("base64"),
          mimeType: "application/zip",
          name: "archive.zip",
        }),
      ]),
    ).toThrow("Unsupported chat attachment type.");
    expect(() =>
      normalizeChatAttachmentsInput([
        filePayload({
          data: Buffer.from("video").toString("base64"),
          mimeType: "video/mp4",
          name: "clip.mp4",
        }),
      ]),
    ).toThrow("Unsupported chat attachment type.");
  });

  it("rejects a data URL that contradicts the declared MIME type", () => {
    expect(() =>
      normalizeChatAttachmentsInput([
        filePayload({
          data: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "text/plain",
        }),
      ]),
    ).toThrow("disagree");
  });

  it("limits uploads but not mentions", () => {
    const uploads = Array.from({ length: CHAT_ATTACHMENT_MAX_FILES + 1 }, () =>
      filePayload(),
    );
    expect(() => normalizeChatAttachmentsInput(uploads)).toThrow(
      `limited to ${CHAT_ATTACHMENT_MAX_FILES} files`,
    );

    const manyMentions = Array.from(
      { length: CHAT_ATTACHMENT_MAX_FILES + 1 },
      (_, index) => ({
        path: `/tmp/file-${index}.ts`,
        type: "fileMention" as const,
      }),
    );
    expect(normalizeChatAttachmentsInput(manyMentions)).toHaveLength(
      CHAT_ATTACHMENT_MAX_FILES + 1,
    );

    const mixed = [
      ...Array.from({ length: CHAT_ATTACHMENT_MAX_FILES }, () => filePayload()),
      { path: "/tmp/mention.ts", type: "fileMention" as const },
    ];
    expect(normalizeChatAttachmentsInput(mixed)).toHaveLength(
      CHAT_ATTACHMENT_MAX_FILES + 1,
    );
  });
});
