import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  draftToChatAttachmentInput,
  MOBILE_ATTACHMENT_ACCEPT,
  MOBILE_ATTACHMENT_MAX_BYTES,
  MOBILE_ATTACHMENT_MAX_FILES,
  useComposerAttachments,
} from "./use-composer-attachments";

function makeFile(name: string, type: string, size = 12): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe("draftToChatAttachmentInput", () => {
  it("maps ready image drafts onto the normalized ChatAttachmentInput boundary", () => {
    expect(
      draftToChatAttachmentInput({
        dataUrl: "data:image/png;base64,abc",
        file: makeFile("shot.png", "image/png"),
        id: "1",
        mimeType: "image/png",
        name: "shot.png",
        size: 12,
        status: "ready",
        type: "image",
      }),
    ).toEqual({
      data: "data:image/png;base64,abc",
      mimeType: "image/png",
      name: "shot.png",
      type: "image",
    });
  });

  it("maps ready file drafts without inventing provider JSON", () => {
    expect(
      draftToChatAttachmentInput({
        dataUrl: "data:text/plain;base64,dGVzdA==",
        file: makeFile("notes.txt", "text/plain"),
        id: "2",
        mimeType: "text/plain",
        name: "notes.txt",
        size: 4,
        status: "ready",
        type: "file",
      }),
    ).toEqual({
      data: "data:text/plain;base64,dGVzdA==",
      mimeType: "text/plain",
      name: "notes.txt",
      type: "file",
    });
  });

  it("refuses drafts that are not ready", () => {
    expect(() =>
      draftToChatAttachmentInput({
        file: makeFile("notes.txt", "text/plain"),
        id: "3",
        mimeType: "text/plain",
        name: "notes.txt",
        size: 4,
        status: "error",
        type: "file",
      }),
    ).toThrow("not ready");
  });
});

describe("mobile attachment limits", () => {
  it("exposes the shared receiving-boundary contract for UI copy", () => {
    expect(MOBILE_ATTACHMENT_MAX_FILES).toBe(5);
    expect(MOBILE_ATTACHMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(MOBILE_ATTACHMENT_ACCEPT).toContain("image/*");
    expect(MOBILE_ATTACHMENT_ACCEPT).toContain(".pdf");
  });
});

describe("useComposerAttachments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads accepted files into ready drafts", async () => {
    const { result } = renderHook(() => useComposerAttachments());

    await act(async () => {
      await result.current.addFiles([
        makeFile("notes.txt", "text/plain"),
        makeFile("shot.png", "image/png"),
      ]);
    });

    expect(result.current.attachments).toHaveLength(2);
    expect(result.current.attachments.map((item) => item.status)).toEqual([
      "ready",
      "ready",
    ]);
    expect(result.current.toInputs()).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("keeps accepted items and names the rejected subset in mixed batches", async () => {
    const { result } = renderHook(() => useComposerAttachments());

    await act(async () => {
      await result.current.addFiles([
        makeFile("notes.txt", "text/plain"),
        makeFile("archive.zip", "application/zip"),
      ]);
    });

    expect(result.current.attachments.map((item) => item.name)).toEqual([
      "notes.txt",
    ]);
    expect(result.current.error).toBe("accept");
  });

  it("rejects a batch that exceeds the file limit without adding any of it", async () => {
    const { result } = renderHook(() => useComposerAttachments());

    await act(async () => {
      await result.current.addFiles(
        Array.from({ length: MOBILE_ATTACHMENT_MAX_FILES }, (_, index) =>
          makeFile(`file-${index}.txt`, "text/plain"),
        ),
      );
    });
    expect(result.current.attachments).toHaveLength(
      MOBILE_ATTACHMENT_MAX_FILES,
    );

    await act(async () => {
      await result.current.addFiles([makeFile("extra.txt", "text/plain")]);
    });
    expect(result.current.attachments).toHaveLength(
      MOBILE_ATTACHMENT_MAX_FILES,
    );
    expect(result.current.error).toBe("max_files");
  });

  it("rejects an oversize pick entirely without reading accepted members", async () => {
    const { result } = renderHook(() => useComposerAttachments());

    // Leave one slot free, then pick two files — both must be refused.
    await act(async () => {
      await result.current.addFiles(
        Array.from({ length: MOBILE_ATTACHMENT_MAX_FILES - 1 }, (_, index) =>
          makeFile(`keep-${index}.txt`, "text/plain"),
        ),
      );
    });
    expect(result.current.attachments).toHaveLength(
      MOBILE_ATTACHMENT_MAX_FILES - 1,
    );

    await act(async () => {
      await result.current.addFiles([
        makeFile("a.txt", "text/plain"),
        makeFile("b.txt", "text/plain"),
      ]);
    });
    expect(result.current.attachments).toHaveLength(
      MOBILE_ATTACHMENT_MAX_FILES - 1,
    );
    expect(result.current.attachments.map((item) => item.name)).not.toContain(
      "a.txt",
    );
    expect(result.current.error).toBe("max_files");
  });

  it("marks read failures per item and keeps them retryable", async () => {
    class FailingReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingReader);

    const { result } = renderHook(() => useComposerAttachments());
    await act(async () => {
      await result.current.addFiles([makeFile("notes.txt", "text/plain")]);
    });

    expect(result.current.attachments[0]?.status).toBe("error");
    expect(result.current.hasErroredAttachment).toBe(true);
    expect(result.current.toInputs()).toHaveLength(0);

    // Removing the failed tile clears the way for a fresh pick.
    act(() => result.current.remove(result.current.attachments[0]!.id));
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.hasErroredAttachment).toBe(false);
  });

  it("retries a failed read from the retained File handle", async () => {
    let attempts = 0;
    class FlakyReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        attempts += 1;
        if (attempts === 1) {
          queueMicrotask(() => this.onerror?.());
          return;
        }
        this.result = "data:text/plain;base64,dGVzdA==";
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", FlakyReader);

    const { result } = renderHook(() => useComposerAttachments());
    await act(async () => {
      await result.current.addFiles([makeFile("notes.txt", "text/plain")]);
    });
    expect(result.current.attachments[0]?.status).toBe("error");

    await act(async () => {
      await result.current.retry(result.current.attachments[0]!.id);
    });
    await waitFor(() => {
      expect(result.current.attachments[0]?.status).toBe("ready");
    });
    expect(result.current.toInputs()).toHaveLength(1);
  });
});
