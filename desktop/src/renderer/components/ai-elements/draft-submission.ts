export interface RevisionedText {
  revision: number;
  value: string;
}

export function nextDraftRevision(revision: number): number {
  return revision + 1;
}

export function isDraftRevisionCurrent(
  currentRevision: number,
  submittedRevision?: number,
): boolean {
  return currentRevision === submittedRevision;
}

export function updateRevisionedText(
  current: RevisionedText,
  value: string,
): RevisionedText {
  return { revision: nextDraftRevision(current.revision), value };
}

export function clearRevisionedText(
  current: RevisionedText,
  expectedRevision?: number,
): RevisionedText {
  return expectedRevision === undefined || current.revision === expectedRevision
    ? updateRevisionedText(current, "")
    : current;
}

export function withoutSubmittedItems<T extends { id: string }>(
  current: T[],
  submitted: readonly { id: string }[],
): T[] {
  const submittedIds = new Set(submitted.map(({ id }) => id));
  return current.filter(({ id }) => !submittedIds.has(id));
}
