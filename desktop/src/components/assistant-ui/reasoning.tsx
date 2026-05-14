import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import {
  useAuiState,
  useScrollLock,
  type ReasoningGroupComponent,
  type ReasoningMessagePartComponent,
} from "@assistant-ui/react";
import { cva, type VariantProps } from "class-variance-authority";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/platform/utils";

const ANIMATION_DURATION = 200;

const reasoningVariants = cva("aui-reasoning-root mb-3 w-full", {
  defaultVariants: { variant: "ghost" },
  variants: {
    variant: {
      ghost: "",
      muted: "rounded-2xl bg-muted/30 px-3 py-2",
      outline:
        "rounded-2xl border border-foreground/10 bg-muted/[0.18] px-3 py-2 dark:border-white/10",
    },
  },
});

export type ReasoningRootProps = Omit<
  ComponentProps<typeof Collapsible>,
  "onOpenChange" | "open"
> &
  VariantProps<typeof reasoningVariants> & {
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  };

function ReasoningRoot({
  children,
  className,
  defaultOpen = false,
  onOpenChange: controlledOnOpenChange,
  open: controlledOpen,
  variant,
  ...props
}: ReasoningRootProps) {
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
        "group/reasoning-root",
        reasoningVariants({ className, variant }),
      )}
      data-slot="reasoning-root"
      data-variant={variant ?? "ghost"}
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

function ReasoningTrigger({
  active,
  className,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean;
}) {
  const { t } = useTranslation();
  const label = t("components.reasoning", {
    defaultValue: "Reasoning",
  });

  return (
    <CollapsibleTrigger
      className={cn(
        "aui-reasoning-trigger group/trigger flex max-w-full items-center gap-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      data-slot="reasoning-trigger"
      {...props}
    >
      <BrainIcon className="aui-reasoning-trigger-icon size-4 shrink-0" />
      <span className="aui-reasoning-trigger-label-wrapper relative inline-block leading-none">
        <span>{label}</span>
        {active ? (
          <span
            aria-hidden
            className="aui-reasoning-trigger-shimmer shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            {label}
          </span>
        ) : null}
      </span>
      <ChevronDownIcon
        className={cn(
          "aui-reasoning-trigger-chevron mt-0.5 size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ReasoningContent({
  children,
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        "aui-reasoning-content relative overflow-hidden text-sm text-muted-foreground outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      data-slot="reasoning-content"
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}

function ReasoningText({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "aui-reasoning-text max-h-64 overflow-y-auto border-l border-foreground/10 pb-2 pl-3 pt-2 text-xs leading-5 dark:border-white/10",
        "whitespace-pre-wrap",
        className,
      )}
      data-slot="reasoning-text"
      {...props}
    >
      {children}
    </div>
  );
}

const ReasoningImpl: ReasoningMessagePartComponent = ({ text }) => {
  if (!text) return null;
  return <>{text}</>;
};

const ReasoningGroupImpl: ReasoningGroupComponent = ({
  children,
  endIndex,
  startIndex,
}) => {
  const isReasoningStreaming = useAuiState((state) => {
    if (state.message.status?.type !== "running") return false;

    const lastIndex = state.message.parts.length - 1;
    if (lastIndex < startIndex || lastIndex > endIndex) return false;

    return state.message.parts[lastIndex]?.type === "reasoning";
  });
  const [open, setOpen] = useState(isReasoningStreaming);

  useEffect(() => {
    setOpen(isReasoningStreaming);
  }, [isReasoningStreaming]);

  return (
    <ReasoningRoot onOpenChange={setOpen} open={open}>
      <ReasoningTrigger active={isReasoningStreaming} />
      <ReasoningContent aria-busy={isReasoningStreaming}>
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
};

const Reasoning = memo(
  ReasoningImpl,
) as unknown as ReasoningMessagePartComponent & {
  Content: typeof ReasoningContent;
  Root: typeof ReasoningRoot;
  Text: typeof ReasoningText;
  Trigger: typeof ReasoningTrigger;
};

const ReasoningGroup = memo(ReasoningGroupImpl) as ReasoningGroupComponent;

Reasoning.displayName = "Reasoning";
Reasoning.Root = ReasoningRoot;
Reasoning.Trigger = ReasoningTrigger;
Reasoning.Content = ReasoningContent;
Reasoning.Text = ReasoningText;
ReasoningGroup.displayName = "ReasoningGroup";

export {
  Reasoning,
  ReasoningContent,
  ReasoningGroup,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
  reasoningVariants,
};
