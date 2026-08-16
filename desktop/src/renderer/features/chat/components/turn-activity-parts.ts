import type { PartState } from "@assistant-ui/react";

export function activityPartIndices(parts: readonly PartState[]) {
  const indices: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const type = parts[index]?.type;
    if (type === "reasoning" || type === "tool-call") indices.push(index);
  }
  return indices;
}
