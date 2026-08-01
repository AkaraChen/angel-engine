import type {
  ChatElicitationAnswer,
  ChatElicitationResponse,
  DaemonElicitation,
  DaemonElicitationQuestion,
} from "@/platform/chat-types";

import { ShieldCheck } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ElicitationPromptProps {
  elicitation: DaemonElicitation;
  onRespond: (response: ChatElicitationResponse) => void;
}

/**
 * Approval controls stack into a column on a phone. At 375px the four
 * permission buttons never fit on one line, and wrapping them was what let the
 * last button hang past the transcript's edge (fab6e3c) once a label grew — a
 * column has no horizontal overflow to give away. They go back to a row from
 * `sm` up, where the card is wide enough for it.
 */
const ACTION_ROW = "flex flex-col gap-2 sm:flex-row sm:flex-wrap";
const ACTION_BUTTON = "h-11 w-full min-w-0 sm:w-auto";

function formatKind(
  kind: DaemonElicitation["kind"],
  t: TFunction<"translation", undefined>,
): string {
  switch (kind) {
    case "approval":
      return "approval";
    case "userInput":
      return t("elicitation.userInput");
    case "dynamicToolCall":
      return t("elicitation.dynamicTool");
    case "permissionProfile":
      return t("elicitation.permissionProfile");
    case "externalFlow":
      return t("elicitation.externalFlow");
  }
  const exhaustive: never = kind;
  return exhaustive;
}

/**
 * Prompt the user to resolve an elicitation raised by the daemon mid-turn.
 * Supports permission approvals, structured questions, free-form text answers,
 * dynamic tool call confirmation, and external-flow completion.
 */
export function ElicitationPrompt({
  elicitation,
  onRespond,
}: ElicitationPromptProps) {
  return (
    <div
      className="
        w-full max-w-[calc(100vw_-_2rem)] min-w-0 overflow-hidden rounded-xl
        border border-border-subtle bg-card p-3 shadow-xs
      "
    >
      <ElicitationHeader elicitation={elicitation} />

      {elicitation.body !== null && elicitation.body !== undefined ? (
        // Approval bodies are raw shell commands / absolute paths: they have no
        // break opportunities, so `pre-wrap` alone would run them off screen.
        <p
          className="
            mt-1 max-h-48 overflow-y-auto font-mono text-xs wrap-anywhere
            whitespace-pre-wrap text-muted-foreground
          "
        >
          {elicitation.body}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <ElicitationActions elicitation={elicitation} onRespond={onRespond} />
      </div>
    </div>
  );
}

function ElicitationActions({
  elicitation,
  onRespond,
}: ElicitationPromptProps) {
  const questions = elicitation.questions ?? [];
  if (questions.length > 0) {
    return <QuestionForm questions={questions} onRespond={onRespond} />;
  }

  switch (elicitation.kind) {
    case "approval":
    case "permissionProfile":
      return <PermissionActions onRespond={onRespond} />;
    case "dynamicToolCall":
      return <DynamicToolActions onRespond={onRespond} />;
    case "externalFlow":
      return <ExternalFlowActions onRespond={onRespond} />;
    case "userInput":
      return <TextAnswerForm kind={elicitation.kind} onRespond={onRespond} />;
  }
  const exhaustive: never = elicitation.kind;
  return exhaustive;
}

function ElicitationHeader({
  elicitation,
}: {
  elicitation: DaemonElicitation;
}) {
  const { t } = useTranslation();
  const title = elicitation.title ?? t("elicitation.defaultTitle");
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      <ShieldCheck className="shrink-0 text-primary" size={16} weight="fill" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatKind(elicitation.kind, t)}
      </span>
    </div>
  );
}

function PermissionActions({
  onRespond,
}: {
  onRespond: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={ACTION_ROW}>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "allow" })}
      >
        {t("elicitation.allow")}
      </Button>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "allowForSession" })}
        variant="outline"
      >
        {t("elicitation.allowForSession")}
      </Button>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "deny" })}
        variant="outline"
      >
        {t("elicitation.deny")}
      </Button>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "cancel" })}
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}

function QuestionForm({
  onRespond,
  questions,
}: {
  onRespond: (response: ChatElicitationResponse) => void;
  questions: DaemonElicitationQuestion[];
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const canSubmit = useMemo(
    () => questions.every((q) => answers[q.id] !== undefined),
    [questions, answers],
  );

  const submit = () => {
    const responseAnswers: ChatElicitationAnswer[] = questions.map((q) => ({
      id: q.id,
      value: answers[q.id] ?? "",
    }));
    onRespond({ type: "answers", answers: responseAnswers });
  };

  return (
    <div className="space-y-3">
      {questions.map((question) => (
        <QuestionInput
          key={question.id}
          onChange={(value) =>
            setAnswers((current) => ({ ...current, [question.id]: value }))
          }
          question={question}
          value={answers[question.id]}
        />
      ))}
      <div className={cn(ACTION_ROW, "sm:justify-end")}>
        <Button
          className={ACTION_BUTTON}
          onClick={() => onRespond({ type: "cancel" })}
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button
          className={ACTION_BUTTON}
          disabled={!canSubmit}
          onClick={submit}
        >
          {t("elicitation.submit")}
        </Button>
      </div>
    </div>
  );
}

function QuestionInput({
  onChange,
  question,
  value,
}: {
  onChange: (value: string) => void;
  question: DaemonElicitationQuestion;
  value?: string;
}) {
  const { t } = useTranslation();
  const options = question.options ?? [];
  const hasOptions = options.length > 0;
  const [selection, setSelection] = useState<
    { label: string; type: "option" } | { type: "other" } | undefined
  >(() =>
    value !== undefined && options.some((option) => option.label === value)
      ? { label: value, type: "option" }
      : undefined,
  );
  const selectedOptionLabel =
    selection?.type === "option" ? selection.label : value;
  const selectedOther = selection?.type === "other";
  const showFreeform = !hasOptions || selectedOther;

  return (
    <div className="space-y-2">
      {question.header !== null && question.header !== undefined ? (
        <div className="text-[11px] font-medium text-muted-foreground uppercase">
          {question.header}
        </div>
      ) : null}
      {question.question !== null && question.question !== undefined ? (
        <div className="text-sm wrap-anywhere">{question.question}</div>
      ) : null}

      {hasOptions ? (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <button
              aria-pressed={selectedOptionLabel === option.label}
              className={cn(
                "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm wrap-anywhere transition-colors duration-150 hover:bg-accent",
                selectedOptionLabel === option.label &&
                  "border-primary/35 bg-primary-soft",
              )}
              key={option.label}
              onClick={() => {
                setSelection({ label: option.label, type: "option" });
                onChange(option.label);
              }}
              type="button"
            >
              <span>{option.label}</span>
              {option.description !== null &&
              option.description !== undefined ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))}
          {question.isOther ? (
            <button
              aria-pressed={selectedOther}
              className={cn(
                "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm wrap-anywhere transition-colors duration-150 hover:bg-accent",
                selectedOther && "border-primary/35 bg-primary-soft",
              )}
              onClick={() => {
                setSelection({ type: "other" });
                onChange("");
              }}
              type="button"
            >
              {t("elicitation.other")}
            </button>
          ) : null}
        </div>
      ) : null}

      {showFreeform ? (
        question.isSecret ? (
          <Input
            aria-label={question.question ?? t("elicitation.question")}
            onChange={(event) => onChange(event.target.value)}
            type="password"
            value={value ?? ""}
          />
        ) : (
          <Textarea
            className="min-h-16"
            onChange={(event) => onChange(event.target.value)}
            value={value ?? ""}
          />
        )
      ) : null}
    </div>
  );
}

function TextAnswerForm({
  kind,
  onRespond,
}: {
  kind: string;
  onRespond: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const canSubmit = value.trim().length > 0;

  const submit = () => {
    if (kind === "userInput") {
      onRespond({ type: "answers", answers: [{ id: "answer", value }] });
    } else {
      onRespond({ type: "raw", value });
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        className="min-h-16"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <div className={cn(ACTION_ROW, "sm:justify-end")}>
        <Button
          className={ACTION_BUTTON}
          onClick={() => onRespond({ type: "cancel" })}
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button
          className={ACTION_BUTTON}
          disabled={!canSubmit}
          onClick={submit}
        >
          {t("elicitation.submit")}
        </Button>
      </div>
    </div>
  );
}

function DynamicToolActions({
  onRespond,
}: {
  onRespond: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={ACTION_ROW}>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "dynamicToolResult", success: true })}
      >
        {t("elicitation.allow")}
      </Button>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "dynamicToolResult", success: false })}
        variant="outline"
      >
        {t("elicitation.deny")}
      </Button>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "cancel" })}
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}

function ExternalFlowActions({
  onRespond,
}: {
  onRespond: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={ACTION_ROW}>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "externalComplete" })}
      >
        {t("elicitation.submit")}
      </Button>
      <Button
        className={ACTION_BUTTON}
        onClick={() => onRespond({ type: "cancel" })}
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}
