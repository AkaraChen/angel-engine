import type { FC, ReactNode } from "react";

import { Binoculars, CaretDown } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/platform/utils";

import type { ShepherdSourceCardParts } from "./parse-shepherd-source-card";

export const ShepherdSourceCard: FC<{
  parts: ShepherdSourceCardParts;
  /** Fallback body renderer for non-text content (attachments). */
  trailing?: ReactNode;
}> = ({ parts, trailing }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasBody = parts.body.length > 0;

  return (
    <Collapsible
      className="
        w-full max-w-[min(100%,36rem)] overflow-hidden rounded-xl border
        border-border-subtle bg-card text-card-foreground shadow-xs
      "
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        className="
          flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs
          hover:bg-muted/40
        "
        disabled={!hasBody}
      >
        <Binoculars
          className="mt-0.5 size-3.5 shrink-0 text-primary"
          weight="fill"
        />
        <span className="min-w-0 flex-1 font-medium wrap-break-word">
          {parts.header}
        </span>
        {hasBody ? (
          <CaretDown
            aria-hidden
            className={cn(
              "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        ) : null}
        <span className="sr-only">
          {open
            ? t("workspace.tools.pullRequest.shepherd.sourceCollapse")
            : t("workspace.tools.pullRequest.shepherd.sourceExpand")}
        </span>
      </CollapsibleTrigger>
      {hasBody ? (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
          "
        >
          <pre
            className="
              max-h-80 overflow-auto border-t border-border-subtle bg-surface-1
              px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap
              text-muted-foreground select-text
            "
          >
            {parts.body}
          </pre>
        </CollapsibleContent>
      ) : null}
      {trailing}
    </Collapsible>
  );
};
