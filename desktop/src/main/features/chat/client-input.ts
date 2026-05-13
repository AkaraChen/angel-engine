import type { SendTextRequest } from "@angel-engine/client-napi";

export type ClientInput = NonNullable<SendTextRequest["input"]>[number];
export type ClientInputType = ClientInput["type"];

export const CLIENT_INPUT_TYPES = {
  embedded_blob_resource: "embedded_blob_resource",
  embedded_text_resource: "embedded_text_resource",
  file_mention: "file_mention",
  image: "image",
  raw_content_block: "raw_content_block",
  resource_link: "resource_link",
  text: "text",
} as const satisfies { [Type in ClientInputType]: Type };
