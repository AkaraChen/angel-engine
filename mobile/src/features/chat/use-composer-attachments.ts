import type { ChatAttachmentInput } from "@angel-engine/daemon-api/chat";

import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  chatAttachmentTypeAccepted,
} from "@angel-engine/daemon-api/chat";
import { useCallback, useRef, useState } from "react";

/** Shared receiving-boundary contract; re-exported for picker UI. */
export const MOBILE_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_ACCEPT;
export const MOBILE_ATTACHMENT_MAX_FILES = CHAT_ATTACHMENT_MAX_FILES;
export const MOBILE_ATTACHMENT_MAX_BYTES = CHAT_ATTACHMENT_MAX_FILE_BYTES;

export type ComposerAttachmentErrorCode =
  | "accept"
  | "max_file_size"
  | "max_files"
  | "file_read";

export type ComposerDraftAttachmentStatus = "reading" | "ready" | "error";

export interface ComposerDraftAttachment {
  /** Data URL once read; missing while reading or after a read failure. */
  dataUrl?: string;
  /** Original handle kept so a failed read or send can be retried as-is. */
  file: File;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  status: ComposerDraftAttachmentStatus;
  type: "file" | "image";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read"));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("file_read"));
    };
    reader.readAsDataURL(file);
  });
}

export function draftToChatAttachmentInput(
  draft: ComposerDraftAttachment,
): ChatAttachmentInput {
  if (draft.dataUrl === undefined) {
    throw new Error("Attachment is not ready to send.");
  }
  return {
    data: draft.dataUrl,
    mimeType: draft.mimeType,
    name: draft.name,
    type: draft.type,
  };
}

function draftId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}:${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function useComposerAttachments() {
  const [attachments, setAttachments] = useState<ComposerDraftAttachment[]>([]);
  const [error, setError] = useState<ComposerAttachmentErrorCode | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const clearError = useCallback(() => setError(null), []);

  const remove = useCallback((id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
    setError(null);
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  const readInto = useCallback(async (draft: ComposerDraftAttachment) => {
    try {
      const dataUrl = await readFileAsDataUrl(draft.file);
      setAttachments((current) =>
        current.map((item) =>
          item.id === draft.id ? { ...item, dataUrl, status: "ready" } : item,
        ),
      );
    } catch {
      setAttachments((current) =>
        current.map((item) =>
          item.id === draft.id ? { ...item, status: "error" } : item,
        ),
      );
    }
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setError(null);
      const capacity = Math.max(
        0,
        MOBILE_ATTACHMENT_MAX_FILES - attachmentsRef.current.length,
      );
      // Hard stop: never partially accept a batch that exceeds the remaining
      // slots. Error first, then return before any FileReader work.
      if (list.length > capacity) {
        setError("max_files");
        return;
      }

      const accepted: File[] = [];
      let rejectedType = 0;
      let rejectedSize = 0;
      for (const file of list) {
        if (
          !chatAttachmentTypeAccepted({
            mimeType: mimeOf(file),
            name: file.name,
          })
        ) {
          rejectedType += 1;
          continue;
        }
        if (file.size > MOBILE_ATTACHMENT_MAX_BYTES) {
          rejectedSize += 1;
          continue;
        }
        accepted.push(file);
      }
      // Mixed batches keep the good items and still name what was dropped.
      if (rejectedType > 0) setError("accept");
      else if (rejectedSize > 0) setError("max_file_size");

      const drafts = accepted.map((file): ComposerDraftAttachment => {
        const mimeType = mimeOf(file);
        return {
          file,
          id: draftId(file),
          mimeType,
          name: file.name,
          size: file.size,
          status: "reading",
          type: mimeType.startsWith("image/") ? "image" : "file",
        };
      });
      setAttachments((current) => [...current, ...drafts]);
      await Promise.all(drafts.map((draft) => readInto(draft)));
    },
    [readInto],
  );

  const retry = useCallback(
    async (id: string) => {
      const draft = attachments.find((item) => item.id === id);
      if (!draft || draft.status !== "error") return;
      setAttachments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "reading" } : item,
        ),
      );
      await readInto({ ...draft, status: "reading" });
    },
    [attachments, readInto],
  );

  return {
    addFiles,
    attachments,
    clear,
    clearError,
    error,
    hasErroredAttachment: attachments.some((item) => item.status === "error"),
    isReading: attachments.some((item) => item.status === "reading"),
    readyAttachments: attachments.filter((item) => item.status === "ready"),
    remove,
    retry,
    toInputs: () =>
      attachments
        .filter((item) => item.status === "ready")
        .map(draftToChatAttachmentInput),
  };
}

function mimeOf(file: File): string {
  return file.type || "application/octet-stream";
}
