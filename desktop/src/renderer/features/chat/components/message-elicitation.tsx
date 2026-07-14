import type {
  ChatElicitation,
  ChatElicitationResponse,
  ChatToolAction,
} from "@angel-engine/daemon-api/chat";
import type { DataMessagePartProps } from "@assistant-ui/react";
import type { TFunction } from "i18next";

import {
  isChatElicitationData,
  isChatErrorData,
  isChatPlanData,
  isChatToolAction,
} from "@angel-engine/daemon-api/chat";
import { useAuiState } from "@assistant-ui/react";
import {
  CaretDown as ChevronDown,
  Question as CircleHelp,
  PaperPlaneRight as Send,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ElicitationQuestionInput,
  PermissionApprovalActions,
} from "@/features/chat/components/elicitation-controls";
import { JsonBlock } from "@/features/chat/components/message-content-parts";
import { inspectorCardClassName } from "@/features/chat/components/message-styles";
import { PlanMessagePart } from "@/features/chat/components/plan-message";
import { nativeControlRowClass } from "@/features/chat/components/thread-styles";
import { useChatRuntimeActions } from "@/features/chat/runtime/use-chat-runtime-actions";
import { cn } from "@/platform/utils";

function isPermissionElicitation(
  elicitation?: ChatElicitation,
): elicitation is ChatElicitation {
  return Boolean(
    elicitation &&
      (elicitation.kind === "approval" ||
        elicitation.kind === "permissionProfile"),
  );
}

function toolActionFromMessagePart(part: unknown): ChatToolAction | undefined {
  if (!is.plainObject(part)) {
    return undefined;
  }
  const candidate = part as { artifact?: unknown; type?: unknown };
  if (candidate.type !== "tool-call") return undefined;
  return isChatToolAction(candidate.artifact) ? candidate.artifact : undefined;
}

function formatElicitationKind(kind: string, t: TFunction) {
  switch (kind) {
    case "userInput":
      return t("messages.elicitation.userInput");
    case "externalFlow":
      return t("messages.elicitation.externalFlow");
    case "dynamicToolCall":
      return t("messages.elicitation.dynamicTool");
    case "permissionProfile":
      return t("messages.elicitation.permissionProfile");
    default:
      return kind || t("common.question");
  }
}

function formatElicitationPhase(phase: string, t: TFunction) {
  if (phase.startsWith("resolved:")) return t("common.answered");
  switch (phase) {
    case "open":
      return t("messages.elicitation.awaitingAnswer");
    case "resolving":
      return t("common.submitting");
    case "cancelled":
      return t("common.cancelled");
    default:
      return phase || t("common.pending");
  }
}

function DataMessagePart(part: DataMessagePartProps) {
  if (part.name === "chat-error" && isChatErrorData(part.data)) {
    return null;
  }

  if (
    (part.name === "plan" || part.name === "todo") &&
    isChatPlanData(part.data)
  ) {
    return <PlanMessagePart plan={part.data} />;
  }

  if (part.name === "elicitation" && isChatElicitationData(part.data)) {
    return <ElicitationQuestionCard elicitation={part.data} />;
  }

  return <JsonBlock label={part.name} value={part.data as unknown} />;
}

function ElicitationQuestionCard({
  elicitation,
}: {
  elicitation: ChatElicitation;
}) {
  const { t } = useTranslation();
  const { resolveElicitation } = useChatRuntimeActions();
  const questions = elicitation.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fallbackAnswer, setFallbackAnswer] = useState("");
  const [submittedResponseType, setSubmittedResponseType] =
    useState<ChatElicitationResponse["type"]>();
  const awaitingInput = elicitation.phase === "open" && !submittedResponseType;
  const hasQuestions = questions.length > 0;
  const hasInputQuestions = elicitation.kind === "userInput" || hasQuestions;
  const isPermissionRequest =
    isPermissionElicitation(elicitation) && !hasInputQuestions;

  const elicitationCardClassName = cn(
    inspectorCardClassName,
    "my-2",
    isPermissionRequest && "shadow-none",
    awaitingInput && "border-primary/30 ring-1 ring-primary/10",
  );
  const elicitationControlRowClass = isPermissionRequest
    ? "min-w-0 rounded-md transition-colors"
    : nativeControlRowClass;

  const backingActionKind = useAuiState((state) => {
    const actionId = elicitation.actionId ?? elicitation.id;
    return state.message.parts
      .map(toolActionFromMessagePart)
      .find((action) => action?.id === actionId)?.kind;
  });
  const allowBypass = backingActionKind !== "plan";
  const phase = submittedResponseType
    ? submittedResponseType === "cancel"
      ? "cancelled"
      : "resolved:Answers"
    : elicitation.phase;
  const title = is.nonEmptyString(elicitation.title)
    ? elicitation.title
    : t("common.question");
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = manualOpen ?? awaitingInput;

  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    setSubmittedResponseType(response.type);
    resolveElicitation(elicitation.id, response);
  };

  const submitAnswers = () => {
    const responseAnswers = hasQuestions
      ? questions.map((question) => {
          const value = answers[question.id];
          if (value === undefined) {
            throw new Error(`Missing answer for question ${question.id}.`);
          }
          return {
            id: question.id,
            value,
          };
        })
      : [{ id: "answer", value: fallbackAnswer }];
    resume({ answers: responseAnswers, type: "answers" });
  };

  return (
    <Collapsible
      className={elicitationCardClassName}
      onOpenChange={setManualOpen}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          elicitationControlRowClass,
          `
            flex min-h-10 w-full items-center gap-2 rounded-none px-3 py-2
            text-left
          `,
        )}
        type="button"
      >
        <CircleHelp
          className={cn(
            "size-3.5 shrink-0",
            awaitingInput ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-muted-foreground",
            )}
          >
            <span>{formatElicitationKind(elicitation.kind, t)}</span>
            <span aria-hidden>·</span>
            <span>{formatElicitationPhase(phase, t)}</span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="
          overflow-hidden
          data-[state=closed]:animate-collapsible-up
          data-[state=open]:animate-collapsible-down
        "
      >
        <div className="mt-1 space-y-3 border-t border-border px-3 py-2.5">
          {is.nonEmptyString(elicitation.body) ? (
            <div className="text-sm/5 whitespace-pre-wrap">
              {elicitation.body}
            </div>
          ) : null}

          {isPermissionRequest ? (
            <PermissionApprovalActions
              allowBypass={allowBypass}
              disabled={!awaitingInput}
              onResume={resume}
            />
          ) : (
            <div className="space-y-3">
              {hasQuestions ? (
                questions.map((question) => (
                  <ElicitationQuestionInput
                    disabled={!awaitingInput}
                    key={question.id}
                    onChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: value,
                      }))
                    }
                    question={question}
                    value={answers[question.id]}
                  />
                ))
              ) : (
                <textarea
                  className="
                    min-h-20 w-full resize-y rounded-md border
                    border-border-subtle bg-background/80 px-3 py-2 text-sm
                    outline-none
                    focus-visible:border-primary/40 focus-visible:ring-3
                    focus-visible:ring-primary/12
                  "
                  disabled={!awaitingInput}
                  onChange={(event) => setFallbackAnswer(event.target.value)}
                  value={fallbackAnswer}
                />
              )}

              {awaitingInput ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={() => resume({ type: "cancel" })}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={submitAnswers} size="xs" type="button">
                    <Send className="size-3.5" />
                    {t("common.submit")}
                  </Button>
                </div>
              ) : (
                <div className="text-right text-[11px] text-muted-foreground">
                  {formatElicitationPhase(phase, t)}
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export { DataMessagePart };
