import {
  memo,
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type FC,
  type PropsWithChildren,
} from "react";
import {
  useAuiState,
  useScrollLock,
  type PartState,
} from "@assistant-ui/react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/platform/utils";
import { isChatToolAction, isTerminalChatToolPhase } from "@/shared/chat";

const ANIMATION_DURATION = 200;

const toolGroupVariants = cva(
  "aui-tool-group-root group/tool-group my-2 w-full",
  {
    defaultVariants: { variant: "outline" },
    variants: {
      variant: {
        ghost: "",
        muted:
          "rounded-[1.15rem] border border-foreground/10 bg-background/55 py-1.5 shadow-[0_14px_34px_-28px_rgba(0,0,0,0.58)] backdrop-blur-xl dark:border-white/10 dark:bg-card/45",
        outline:
          "rounded-[1.15rem] border border-foreground/10 bg-background/55 py-1.5 shadow-[0_14px_34px_-28px_rgba(0,0,0,0.58)] backdrop-blur-xl dark:border-white/10 dark:bg-card/45",
      },
    },
  },
);

export type ToolGroupRootProps = Omit<
  ComponentProps<typeof Collapsible>,
  "onOpenChange" | "open"
> &
  VariantProps<typeof toolGroupVariants> & {
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  };

function ToolGroupRoot({
  children,
  className,
  defaultOpen = false,
  onOpenChange: controlledOnOpenChange,
  open: controlledOpen,
  variant,
  ...props
}: ToolGroupRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) lockScroll();
      if (!isControlled) setUncontrolledOpen(open);
      controlledOnOpenChange?.(open);
    },
    [controlledOnOpenChange, isControlled, lockScroll],
  );

  return (
    <Collapsible
      className={cn(
        toolGroupVariants({ variant }),
        "group/tool-group-root",
        className,
      )}
      data-slot="tool-group-root"
      data-variant={variant ?? "outline"}
      onOpenChange={handleOpenChange}
      open={isOpen}
      ref={collapsibleRef}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

function ToolGroupTrigger({
  active = false,
  className,
  label,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean;
  label: string;
}) {
  return (
    <CollapsibleTrigger
      className={cn(
        "aui-tool-group-trigger group/trigger flex min-h-9 items-center gap-2 text-xs transition-colors hover:text-foreground",
        "group-data-[variant=outline]/tool-group-root:w-full group-data-[variant=outline]/tool-group-root:px-3.5",
        "group-data-[variant=muted]/tool-group-root:w-full group-data-[variant=muted]/tool-group-root:px-3.5",
        className,
      )}
      data-slot="tool-group-trigger"
      {...props}
    >
      {active ? (
        <LoaderIcon
          className="aui-tool-group-trigger-loader size-3.5 shrink-0 animate-spin text-primary/75"
          data-slot="tool-group-trigger-loader"
        />
      ) : (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-muted-foreground/35"
        />
      )}
      <span
        className={cn(
          "aui-tool-group-trigger-label-wrapper relative flex min-w-0 items-baseline gap-2 text-start leading-none",
          "group-data-[variant=outline]/tool-group-root:grow",
          "group-data-[variant=muted]/tool-group-root:grow",
        )}
        data-slot="tool-group-trigger-label"
      >
        <span className="font-medium text-foreground/85">Activity</span>
        <span className="truncate text-muted-foreground">{label}</span>
        {active && (
          <span
            aria-hidden
            className="aui-tool-group-trigger-shimmer shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
            data-slot="tool-group-trigger-shimmer"
          >
            Activity
          </span>
        )}
      </span>
      <ChevronDownIcon
        className={cn(
          "aui-tool-group-trigger-chevron size-4 shrink-0 text-muted-foreground/80",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
        data-slot="tool-group-trigger-chevron"
      />
    </CollapsibleTrigger>
  );
}

function ToolGroupContent({
  children,
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        "aui-tool-group-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      data-slot="tool-group-content"
      {...props}
    >
      <div
        className={cn(
          "mt-2 flex flex-col gap-1.5",
          "group-data-[variant=outline]/tool-group-root:mt-1.5 group-data-[variant=outline]/tool-group-root:border-t group-data-[variant=outline]/tool-group-root:border-foreground/10 group-data-[variant=outline]/tool-group-root:px-2.5 group-data-[variant=outline]/tool-group-root:pt-2 dark:group-data-[variant=outline]/tool-group-root:border-white/10",
          "group-data-[variant=muted]/tool-group-root:mt-1.5 group-data-[variant=muted]/tool-group-root:border-t group-data-[variant=muted]/tool-group-root:border-foreground/10 group-data-[variant=muted]/tool-group-root:px-2.5 group-data-[variant=muted]/tool-group-root:pt-2 dark:group-data-[variant=muted]/tool-group-root:border-white/10",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

type ToolGroupComponent = FC<
  PropsWithChildren<{ endIndex: number; startIndex: number }>
> & {
  Content: typeof ToolGroupContent;
  Root: typeof ToolGroupRoot;
  Trigger: typeof ToolGroupTrigger;
};

const ToolGroupImpl: FC<
  PropsWithChildren<{ endIndex: number; startIndex: number }>
> = ({ children, endIndex, startIndex }) => {
  const active = useAuiState((state) =>
    hasActiveToolGroupPart(state.message.parts, startIndex, endIndex),
  );
  const label = useAuiState((state) =>
    formatToolGroupLabel(state.message.parts, startIndex, endIndex),
  );
  const hasTextAfterGroup = useAuiState((state) =>
    hasTextContentAfterIndex(state.message.parts, endIndex),
  );
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = manualOpen ?? !hasTextAfterGroup;

  return (
    <ToolGroupRoot onOpenChange={setManualOpen} open={open}>
      <ToolGroupTrigger active={active} label={label} />
      <ToolGroupContent>{children}</ToolGroupContent>
    </ToolGroupRoot>
  );
};

function formatToolGroupLabel(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
) {
  let approvalCount = 0;
  let partCount = 0;

  forEachToolGroupPart(parts, startIndex, endIndex, (part) => {
    partCount += 1;
    if (isElicitationToolPart(part)) approvalCount += 1;
  });

  const toolCount = Math.max(0, partCount - approvalCount);
  const labels = [
    toolCount > 0
      ? `${toolCount} tool ${toolCount === 1 ? "call" : "calls"}`
      : undefined,
    approvalCount > 0
      ? `${approvalCount} approval${approvalCount === 1 ? "" : "s"}`
      : undefined,
  ].filter(Boolean);

  return labels.join(" · ") || "0 tool calls";
}

function hasActiveToolGroupPart(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
) {
  let active = false;
  forEachToolGroupPart(parts, startIndex, endIndex, (part) => {
    if (isActiveToolPart(part)) active = true;
  });
  return active;
}

function hasTextContentAfterIndex(parts: readonly PartState[], index: number) {
  for (
    let partIndex = Math.max(0, index + 1);
    partIndex < parts.length;
    partIndex += 1
  ) {
    const part = parts[partIndex];
    if (part?.type === "text" && part.text) return true;
  }
  return false;
}

function forEachToolGroupPart(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
  visit: (part: PartState) => void,
) {
  const start = Math.max(0, startIndex);
  const end = Math.min(endIndex, parts.length - 1);
  for (let index = start; index <= end; index += 1) {
    const part = parts[index];
    if (part) visit(part);
  }
}

function isActiveToolPart(part: PartState) {
  if (part.type !== "tool-call") return false;

  if (isChatToolAction(part.artifact) && part.artifact.phase) {
    return !isTerminalChatToolPhase(part.artifact.phase);
  }

  return (
    part.status.type === "running" || part.status.type === "requires-action"
  );
}

function isElicitationToolPart(part: PartState) {
  return (
    part.type === "tool-call" &&
    isChatToolAction(part.artifact) &&
    part.artifact.kind === "elicitation"
  );
}

const ToolGroup = memo(ToolGroupImpl) as unknown as ToolGroupComponent;

ToolGroup.displayName = "ToolGroup";
ToolGroup.Root = ToolGroupRoot;
ToolGroup.Trigger = ToolGroupTrigger;
ToolGroup.Content = ToolGroupContent;

export {
  ToolGroup,
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
  toolGroupVariants,
};
