import type { DesignChange } from "@shared/workspace-browser";

import { useEffect, useMemo, useState } from "react";

import {
  DESIGN_CSS_FIELD_GROUPS,
  applyDesignChangeEdit,
  isUnsafeCssValue,
} from "@shared/design-mode-css";
import { Input } from "@/components/ui/input";
import { cn } from "@/platform/utils";

export function DesignModeCssInspector({
  changes,
  computedStyles,
  disabled,
  onChangesChange,
}: {
  changes: DesignChange[];
  computedStyles?: Record<string, string>;
  disabled?: boolean;
  onChangesChange: (changes: DesignChange[]) => void;
}) {
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const draftByProperty = useMemo(() => {
    const map = new Map<string, string>();
    for (const change of changes) {
      map.set(change.property, change.value);
    }
    return map;
  }, [changes]);

  // Clear rejection banner when the selection (computed styles identity) changes.
  useEffect(() => {
    setRejectMessage(null);
  }, [computedStyles]);

  return (
    <div
      className="
        max-h-64 shrink-0 overflow-y-auto border-b border-border-subtle
        bg-surface-1 px-3 py-2
      "
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs font-medium text-foreground">CSS inspector</div>
        <div className="text-[11px] text-muted-foreground">
          Draft only · live preview
        </div>
      </div>

      {rejectMessage ? (
        <div
          className={cn(
            "mb-2 rounded-md border border-status-danger-border",
            "bg-status-danger-soft px-2 py-1.5 text-xs text-status-danger",
          )}
          role="alert"
        >
          {rejectMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {DESIGN_CSS_FIELD_GROUPS.map((group) => (
          <section key={group.id}>
            <h3
              className="
                mb-1.5 text-[10px] font-semibold tracking-wide
                text-muted-foreground uppercase
              "
            >
              {group.label}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {group.fields.map((field) => {
                const draftValue = draftByProperty.get(field.property);
                const computed = computedStyles?.[field.property] ?? "";
                const displayValue = draftValue ?? "";
                const isDraft = draftValue !== undefined;
                return (
                  <label
                    className="flex min-w-0 flex-col gap-0.5"
                    key={field.property}
                  >
                    <span
                      className={cn(
                        "truncate text-[10px] text-muted-foreground",
                        isDraft && "text-primary",
                      )}
                      title={field.property}
                    >
                      {field.label}
                    </span>
                    <Input
                      aria-label={`${field.label} (${field.property})`}
                      className={cn(
                        "h-7 px-2 font-mono text-[11px]",
                        isDraft && "border-primary/50",
                      )}
                      disabled={disabled}
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        if (nextValue.trim() && isUnsafeCssValue(nextValue)) {
                          setRejectMessage(
                            `Rejected unsafe value for ${field.property} (url(/expression(/@import not allowed).`,
                          );
                          return;
                        }
                        const result = applyDesignChangeEdit(
                          changes,
                          field.property,
                          nextValue,
                        );
                        if (result.rejected) {
                          setRejectMessage(
                            `Rejected value for ${field.property}.`,
                          );
                          return;
                        }
                        setRejectMessage(null);
                        onChangesChange(result.changes);
                      }}
                      placeholder={
                        computed || field.placeholder || field.property
                      }
                      spellCheck={false}
                      value={displayValue}
                    />
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
