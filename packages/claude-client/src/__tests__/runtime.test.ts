import type { SendTextRequest } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { claudePrompt } from "../runtime";

type ClientInput = NonNullable<SendTextRequest["input"]>;

async function readPrompt(
  prompt: string | AsyncIterable<unknown>,
): Promise<string | unknown[]> {
  if (typeof prompt === "string") return prompt;

  const messages: unknown[] = [];
  for await (const message of prompt) {
    messages.push(message);
  }
  return messages;
}

describe("claudePrompt", () => {
  it("sends PDFs as Claude document blocks", async () => {
    const data = "JVBERi0xLjQ=";
    const input: ClientInput = [
      {
        data,
        mimeType: "application/pdf",
        name: "spec.pdf",
        type: "embedded_blob_resource",
        uri: "attachment:///spec.pdf",
      },
    ];

    await expect(readPrompt(claudePrompt("", input))).resolves.toEqual([
      {
        message: {
          content: [
            {
              source: {
                data,
                media_type: "application/pdf",
                type: "base64",
              },
              title: "spec.pdf",
              type: "document",
            },
          ],
          role: "user",
        },
        parent_tool_use_id: null,
        type: "user",
      },
    ]);
  });

  it("rejects unsupported binary attachments", () => {
    const input: ClientInput = [
      {
        data: "eA==",
        mimeType: "application/zip",
        name: "archive.zip",
        type: "embedded_blob_resource",
        uri: "attachment:///archive.zip",
      },
    ];

    expect(() => claudePrompt("", input)).toThrow(
      'Attachment type "application/zip" is not supported by the Claude runtime: archive.zip',
    );
  });

  it("rejects PDFs without data", () => {
    const input: ClientInput = [
      {
        data: "",
        mimeType: "application/pdf",
        name: "empty.pdf",
        type: "embedded_blob_resource",
        uri: "attachment:///empty.pdf",
      },
    ];

    expect(() => claudePrompt("", input)).toThrow(
      "PDF attachment is missing data.",
    );
  });

  it("keeps text attachments as text prompts", () => {
    const input: ClientInput = [
      {
        mimeType: "text/markdown",
        text: "# Notes",
        type: "embedded_text_resource",
        uri: "attachment:///notes.md",
      },
    ];

    expect(claudePrompt("", input)).toBe(
      "Resource: attachment:///notes.md\n\n# Notes",
    );
  });

  it("keeps images as Claude image blocks", async () => {
    const input: ClientInput = [
      {
        data: "iVBORw0KGgo=",
        mimeType: "image/png",
        name: "image.png",
        type: "image",
      },
    ];

    await expect(readPrompt(claudePrompt("", input))).resolves.toEqual([
      {
        message: {
          content: [
            {
              source: {
                data: "iVBORw0KGgo=",
                media_type: "image/png",
                type: "base64",
              },
              type: "image",
            },
          ],
          role: "user",
        },
        parent_tool_use_id: null,
        type: "user",
      },
    ]);
  });
});
