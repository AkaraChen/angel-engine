import { describe, expect, it } from "vitest";
import {
  clearRevisionedText,
  isDraftRevisionCurrent,
  nextDraftRevision,
  updateRevisionedText,
  withoutSubmittedItems,
} from "@/components/ai-elements/draft-submission";

function deferred() {
  let resolve: () => void = () => void 0;
  const promise = new Promise<void>((complete) => {
    resolve = () => complete();
  });
  return { promise, resolve };
}

describe("async draft submission cleanup", () => {
  it("preserves an A → edit → A draft after the submitted promise settles", async () => {
    let draft = { revision: 0, value: "A" };
    const submittedRevision = draft.revision;
    const submission = deferred();
    const cleanup = submission.promise.then(() => {
      draft = clearRevisionedText(draft, submittedRevision);
    });

    draft = updateRevisionedText(draft, "edited");
    draft = updateRevisionedText(draft, "A");
    submission.resolve();
    await cleanup;

    expect(draft).toEqual({ revision: 2, value: "A" });
  });

  it("clears text that was not edited after submission", async () => {
    let draft = { revision: 0, value: "submitted" };
    const submission = deferred();
    const cleanup = submission.promise.then(() => {
      draft = clearRevisionedText(draft, 0);
    });

    submission.resolve();
    await cleanup;

    expect(draft).toEqual({ revision: 1, value: "" });
  });

  it("removes submitted items without removing items added while sending", () => {
    const submitted = [{ id: "submitted" }];
    const addedWhileSending = { id: "new" };

    expect(
      withoutSubmittedItems([...submitted, addedWhileSending], submitted),
    ).toEqual([addedWhileSending]);
  });

  it("preserves editor-owned state when a paste source changes while sending", async () => {
    let revision = 0;
    const submittedRevision = revision;
    const submission = deferred();
    const cleanup = submission.promise.then(() =>
      isDraftRevisionCurrent(revision, submittedRevision),
    );

    revision = nextDraftRevision(revision);
    submission.resolve();

    await expect(cleanup).resolves.toBe(false);
  });
});
