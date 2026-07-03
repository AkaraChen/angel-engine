import type { SendTextRequest } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { piPrompt, piThinkingLevel } from "../runtime";

type ClientInput = NonNullable<SendTextRequest["input"]>;

describe("piPrompt", () => {
  it("uses Pi skill command syntax", () => {
    const input: ClientInput = [
      {
        name: "skill-authoring",
        path: "/home/user/.pi/agent/skills/skill-authoring/SKILL.md",
        type: "skill_mention",
      },
    ];

    expect(piPrompt("", input)).toEqual({
      images: [],
      text: "/skill:skill-authoring",
    });
  });

  it("keeps images in prompt options", () => {
    const input: ClientInput = [
      {
        data: "iVBORw0KGgo=",
        mimeType: "image/png",
        name: "image.png",
        type: "image",
      },
    ];

    expect(piPrompt("look", input)).toEqual({
      images: [{ data: "iVBORw0KGgo=", mimeType: "image/png", type: "image" }],
      text: "look",
    });
  });

  it("rejects unsupported binary attachments", () => {
    const input: ClientInput = [
      {
        data: "JVBERi0xLjQ=",
        mimeType: "application/pdf",
        name: "spec.pdf",
        type: "embedded_blob_resource",
        uri: "attachment:///spec.pdf",
      },
    ];

    expect(() => piPrompt("", input)).toThrow(
      'Attachment type "application/pdf" is not supported by the Pi runtime: spec.pdf',
    );
  });
});

describe("piThinkingLevel", () => {
  it("accepts Pi thinking levels only", () => {
    expect(piThinkingLevel("high")).toBe("high");
    expect(() => piThinkingLevel("maximum")).toThrow(
      "Unsupported Pi thinking level",
    );
  });
});
