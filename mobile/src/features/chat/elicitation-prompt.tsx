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

const PERMISSION_KINDS = new Set(["approval", "permissionProfile"]);

function isPermissionElicitation(elicitation: DaemonElicitation): boolean {
  return PERMISSION_KINDS.has(elicitation.kind);
}

function formatKind(
  kind: string,
  t: TFunction<"translation", undefined>,
): string {
  switch (kind) {
    case "userInput":
      return t("elicitation.userInput");
    case "dynamicToolCall":
      return t("elicitation.dynamicTool");
    case "permissionProfile":
      return t("elicitation.permissionProfile");
    case "externalFlow":
      return t("elicitation.externalFlow");
    default:
      return kind;
  }
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
  const questions = elicitation.questions ?? [];
  const isPermission = isPermissionElicitation(elicitation);
  const hasQuestions = questions.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <ElicitationHeader elicitation={elicitation} />

      {elicitation.body !== null && elicitation.body !== undefined ? (
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
          {elicitation.body}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {isPermission ? (
          <PermissionActions onRespond={onRespond} />
        ) : hasQuestions ? (
          <QuestionForm questions={questions} onRespond={onRespond} />
        ) : elicitation.kind === "dynamicToolCall" ? (
          <DynamicToolActions onRespond={onRespond} />
        ) : elicitation.kind === "externalFlow" ? (
          <ExternalFlowActions onRespond={onRespond} />
        ) : elicitation.kind === "userInput" ? (
          <TextAnswerForm kind={elicitation.kind} onRespond={onRespond} />
        ) : elicitation.choices !== undefined &&
          elicitation.choices.length > 0 ? (
          <ChoiceList choices={elicitation.choices} onRespond={onRespond} />
        ) : (
          <TextAnswerForm kind={elicitation.kind} onRespond={onRespond} />
        )}
      </div>
    </div>
  );
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
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => onRespond({ type: "allow" })} size="sm">
        {t("elicitation.allow")}
      </Button>
      <Button
        onClick={() => onRespond({ type: "allowForSession" })}
        size="sm"
        variant="outline"
      >
        {t("elicitation.allowForSession")}
      </Button>
      <Button
        onClick={() => onRespond({ type: "deny" })}
        size="sm"
        variant="outline"
      >
        {t("elicitation.deny")}
      </Button>
      <Button
        onClick={() => onRespond({ type: "cancel" })}
        size="sm"
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
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => onRespond({ type: "cancel" })}
          size="sm"
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button disabled={!canSubmit} onClick={submit} size="sm">
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
        <div className="text-sm">{question.question}</div>
      ) : null}

      {hasOptions ? (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <button
              aria-pressed={selectedOptionLabel === option.label}
              className={cn(
                "w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                selectedOptionLabel === option.label &&
                  "border-primary/35 bg-primary/10",
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
                "w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                selectedOther && "border-primary/35 bg-primary/10",
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
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => onRespond({ type: "cancel" })}
          size="sm"
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button disabled={!canSubmit} onClick={submit} size="sm">
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
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => onRespond({ type: "dynamicToolResult", success: true })}
        size="sm"
      >
        {t("elicitation.allow")}
      </Button>
      <Button
        onClick={() => onRespond({ type: "dynamicToolResult", success: false })}
        size="sm"
        variant="outline"
      >
        {t("elicitation.deny")}
      </Button>
      <Button
        onClick={() => onRespond({ type: "cancel" })}
        size="sm"
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
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => onRespond({ type: "externalComplete" })} size="sm">
        {t("elicitation.submit")}
      </Button>
      <Button
        onClick={() => onRespond({ type: "cancel" })}
        size="sm"
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}

function ChoiceList({
  choices,
  onRespond,
}: {
  choices: string[];
  onRespond: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      {choices.map((choice) => (
        <Button
          className="justify-start"
          key={choice}
          onClick={() =>
            onRespond({
              type: "answers",
              answers: [{ id: "choice", value: choice }],
            })
          }
          size="sm"
          variant="outline"
        >
          {choice}
        </Button>
      ))}
      <Button
        className="justify-start"
        onClick={() => onRespond({ type: "cancel" })}
        size="sm"
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}
