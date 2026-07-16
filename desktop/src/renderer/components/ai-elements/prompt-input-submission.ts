export type PromptInputSubmissionResult = boolean | void;

export function shouldClearSubmittedInput(
  result: PromptInputSubmissionResult,
): boolean {
  return result !== false;
}
