import type { SendTextRequest } from "@angel-engine/client-napi";
import type { ChatAttachmentInput } from "../../../shared/chat";

import path from "node:path";
import { ClientInputType } from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { isTextLikeMimeType } from "../../../shared/mime";

type ClientInput = NonNullable<SendTextRequest["input"]>[number];

export function chatAttachmentsToClientInput(
  attachments: ChatAttachmentInput[],
): NonNullable<SendTextRequest["input"]> {
  return attachments.map((attachment): ClientInput => {
    if (attachment.type === "fileMention") {
      const localPath = attachment.path;
      return {
        mimeType: attachment.mimeType ?? null,
        name: is.nonEmptyString(attachment.name)
          ? attachment.name
          : path.basename(localPath),
        path: localPath,
        type: ClientInputType.FileMention,
      };
    }

    if (attachment.type === "image") {
      return {
        data: attachment.data,
        mimeType: attachment.mimeType,
        name: attachment.name ?? null,
        type: ClientInputType.Image,
      };
    }

    if (attachment.type === "skillMention") {
      return {
        name: attachment.name,
        path: attachment.path,
        type: ClientInputType.SkillMention,
      };
    }

    const uri = attachmentUri(attachment);
    if (isTextLikeMimeType(attachment.mimeType)) {
      return {
        mimeType: attachment.mimeType,
        text: Buffer.from(attachment.data, "base64").toString("utf8"),
        type: ClientInputType.EmbeddedTextResource,
        uri,
      };
    }

    return {
      data: attachment.data,
      mimeType: attachment.mimeType,
      name: attachment.name ?? null,
      type: ClientInputType.EmbeddedBlobResource,
      uri,
    };
  });
}

function attachmentUri(attachment: ChatAttachmentInput) {
  const name = is.nonEmptyString(attachment.name)
    ? attachment.name
    : "attachment";
  return `attachment:///${encodeURIComponent(name)}`;
}
