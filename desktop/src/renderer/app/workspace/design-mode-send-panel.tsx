import type { PromptInputFile } from "@/components/ai-elements/prompt-input";
import type { DesignSelectionDraft } from "@/app/workspace/design-mode-send";
import type { FormEvent } from "react";

import { PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/platform/utils";

export function DesignModeSendPanel({
  busy,
  error,
  onCancel,
  onSend,
  selection,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: (input: {
    userAttachments: PromptInputFile[];
    userText: string;
  }) => void;
  selection: DesignSelectionDraft;
}) {
  const fieldId = useId();
  const [userText, setUserText] = useState("");
  const [userAttachments, setUserAttachments] = useState<PromptInputFile[]>([]);

  useEffect(() => {
    setUserText("");
    setUserAttachments([]);
  }, [selection.anchor, selection.element?.selector, selection.browserViewId]);

  const summary = selectionSummary(selection);
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      onSend({ userAttachments, userText });
    },
    [onSend, userAttachments, userText],
  );

  return (
    <form
      className="
        shrink-0 border-b border-border-subtle bg-surface-1 px-3 py-2
      "
      onSubmit={handleSubmit}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">
            Send selection to agent
          </div>
          <div
            className="
              mt-0.5 truncate font-mono text-[11px] text-muted-foreground
            "
            title={summary}
          >
            {summary}
          </div>
        </div>
        <Button
          aria-label="Dismiss design selection"
          disabled={busy}
          onClick={onCancel}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <label className="sr-only" htmlFor={fieldId}>
        Design instruction
      </label>
      <Textarea
        className="min-h-16 resize-none text-sm"
        disabled={busy}
        id={fieldId}
        onChange={(event) => setUserText(event.currentTarget.value)}
        placeholder="e.g. Make this button primary"
        value={userText}
      />

      {error ? (
        <div
          className={cn(
            "mt-2 rounded-md border border-status-danger-border",
            "bg-status-danger-soft px-2 py-1.5 text-xs text-status-danger",
          )}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          disabled={busy}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button disabled={busy} size="sm" type="submit">
          <PaperPlaneTilt className="size-3.5" weight="fill" />
          {busy ? "Please wait…" : "Send to chat"}
        </Button>
      </div>
    </form>
  );
}

function selectionSummary(selection: DesignSelectionDraft): string {
  if (selection.element) {
    const react =
      selection.element.reactComponents &&
      selection.element.reactComponents.length > 0
        ? ` · ${selection.element.reactComponents
            .map((name) => `<${name}>`)
            .join(" ")}`
        : "";
    return `${selection.element.tagName.toLowerCase()} ${selection.element.selector}${react}`;
  }
  if (selection.anchor.kind === "region") {
    const { rect } = selection.anchor;
    return `region ${Math.round(rect.width)}×${Math.round(rect.height)}`;
  }
  if (selection.anchor.kind === "element") {
    return selection.anchor.selector;
  }
  return "selection";
}
