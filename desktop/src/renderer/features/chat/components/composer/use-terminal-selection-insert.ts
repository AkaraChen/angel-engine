import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import { useEffect } from "react";
import { subscribeToTerminalSelectionInserts } from "@/features/chat/components/composer/terminal-selection-to-composer";

export function useTerminalSelectionInsert(
  controller: ComposerEditorController,
) {
  const { appendMarkdown } = controller;
  useEffect(
    () =>
      subscribeToTerminalSelectionInserts((markdown) => {
        appendMarkdown(markdown);
      }),
    [appendMarkdown],
  );
}
