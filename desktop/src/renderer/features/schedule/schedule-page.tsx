import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC, FormEvent, KeyboardEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import type {
  Automation,
  AutomationTemplate,
  AutomationRun,
  AutomationRunStatus,
  CreateAutomationFormState,
  SchedulePreset,
} from "@/features/schedule/schedule-model";

import {
  CalendarDots,
  CaretDown,
  CaretRight,
  Check,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  automationListQueryOptions,
  createAutomationMutationOptions,
  deleteAutomationMutationOptions,
  runAutomationNowMutationOptions,
  setAutomationEnabledMutationOptions,
} from "@/features/schedule/requests/automations";
import {
  createAutomationFormState,
  DEFAULT_CREATE_AUTOMATION_FORM,
  nextRunPreview,
  PRESET_CRON,
  presetForCron,
  sortedRuns,
  validateCron,
} from "@/features/schedule/schedule-model";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

const NO_PROJECT_SELECT_VALUE = "__no_project__";

/** Older runs stop informing the decision to keep or fix an automation. */
const RUN_HISTORY_LIMIT = 5;

const RUN_LABEL_KEY: Record<AutomationRunStatus, string> = {
  cancelled: "schedule.runStatus.cancelled",
  failed: "schedule.runStatus.failed",
  missed: "schedule.runStatus.missed",
  running: "schedule.runStatus.running",
  succeeded: "schedule.runStatus.succeeded",
};

interface SchedulePageProps {
  projects: Project[];
}

/**
 * One column of automations, each expandable in place.
 *
 * The screen is deliberately spare. An automation page is not a record viewer:
 * between visits the only things that changed are "when does this run next" and
 * "did anything break", so those are the only two facts a collapsed row spends
 * pixels on. Configuration the user typed in themselves stays in the create
 * flow; the expanded row is for actions and changing run history.
 */
export const SchedulePage: FC<SchedulePageProps> = ({ projects }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listQuery = useQuery(automationListQueryOptions());
  const automations = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const existingNames = useMemo(
    () => automations.map(({ name }) => name),
    [automations],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createTemplate, setCreateTemplate] = useState<AutomationTemplate>();
  const [expandedId, setExpandedId] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);

  const runNowMutation = useMutation(
    runAutomationNowMutationOptions({ queryClient }),
  );
  const setEnabledMutation = useMutation(
    setAutomationEnabledMutationOptions({ queryClient }),
  );
  const deleteMutation = useMutation(
    deleteAutomationMutationOptions({ queryClient }),
  );

  const broken = automations.filter(
    (automation) => automation.status === "failing",
  );
  const rest = automations
    .filter((automation) => automation.status !== "failing")
    .sort(byNextRun);

  const openCreate = (template?: AutomationTemplate) => {
    setCreateTemplate(template);
    setCreateOpen(true);
  };

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => {
    event.preventDefault();
    const headers = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-automation-card]",
      ) ?? [],
    );
    const currentIndex = headers.indexOf(event.currentTarget);
    headers
      .at((currentIndex + direction + headers.length) % headers.length)
      ?.focus();
  };

  const requestDelete = (automation: Automation) => {
    void confirmAction({
      cancelLabel: t("common.cancel"),
      confirmLabel: t("common.delete"),
      title: t("schedule.deleteConfirm", { name: automation.name }),
      tone: "danger",
    }).then((confirmed) => {
      if (!confirmed) return;
      deleteMutation.mutate(automation.id);
      setExpandedId(undefined);
    });
  };

  const renderCard = (automation: Automation) => (
    <AutomationCard
      automation={automation}
      expanded={automation.id === expandedId}
      key={automation.id}
      onDelete={() => requestDelete(automation)}
      onKeyDown={moveFocus}
      onRunNow={() => runNowMutation.mutate(automation.id)}
      onSetEnabled={(enabled) =>
        setEnabledMutation.mutate({ enabled, id: automation.id })
      }
      onToggle={() =>
        setExpandedId((current) =>
          current === automation.id ? undefined : automation.id,
        )
      }
      runNowPending={runNowMutation.isPending}
      setEnabledPending={setEnabledMutation.isPending}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-end gap-4 px-6 py-4">
        <Button size="sm" onClick={() => openCreate()}>
          <Plus weight="bold" />
          {t("schedule.newAutomation")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" ref={listRef}>
        <div
          className={cn(
            "mx-auto w-full",
            listQuery.isError
              ? "flex min-h-full max-w-none"
              : "max-w-2xl px-6 pb-6",
          )}
        >
          {listQuery.isPending ? (
            <ScheduleSkeleton />
          ) : listQuery.isError ? (
            <ScheduleNotice text={t("schedule.disconnected")} />
          ) : automations.length === 0 ? (
            <ScheduleRecipes onCreate={openCreate} />
          ) : (
            <div className="space-y-1.5">
              {broken.map(renderCard)}
              {rest.map(renderCard)}
            </div>
          )}
        </div>
      </div>

      <CreateAutomationDialog
        onOpenChange={setCreateOpen}
        open={createOpen}
        projects={projects}
        existingNames={existingNames}
        template={createTemplate}
      />
    </div>
  );
};

/** Paused automations have no next run, and sort last rather than first. */
function byNextRun(left: Automation, right: Automation): number {
  const leftAt = left.nextRunAt ?? "";
  const rightAt = right.nextRunAt ?? "";
  if (leftAt === "") return rightAt === "" ? 0 : 1;
  if (rightAt === "") return -1;
  return leftAt.localeCompare(rightAt);
}

function AutomationCard({
  automation,
  expanded,
  onDelete,
  onKeyDown,
  onRunNow,
  onSetEnabled,
  onToggle,
  runNowPending,
  setEnabledPending,
}: {
  automation: Automation;
  expanded: boolean;
  onDelete: () => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => void;
  onRunNow: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onToggle: () => void;
  runNowPending: boolean;
  setEnabledPending: boolean;
}) {
  const { t } = useTranslation();
  const runs = sortedRuns(automation.runs);
  const panelId = `automation-panel-${automation.id}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        expanded ? "border-border" : "border-border-subtle",
      )}
    >
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-overlay-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-automation-card={automation.id}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") onKeyDown(event, 1);
          if (event.key === "ArrowUp") onKeyDown(event, -1);
        }}
        type="button"
      >
        <CaretRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          weight="bold"
        />
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-medium",
              !automation.enabled && "text-muted-foreground",
            )}
          >
            {automation.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {scheduleLabel(t, automation.cron)}
          </span>
        </div>
        {/* Only a broken automation gets a word. "Active" is the absence of
            news, and the next-run time already implies it. */}
        {automation.status === "failing" ? (
          <span className="shrink-0 text-xs text-status-danger">
            {t("schedule.status.failing")}
          </span>
        ) : null}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {automation.nextRunAt
            ? formatRelativeTime(automation.nextRunAt)
            : t("schedule.paused")}
        </span>
      </button>

      {expanded ? (
        <div
          className="border-t border-border-subtle pt-3 pr-4 pb-4 pl-[2.625rem]"
          id={panelId}
        >
          <p className="text-sm">{automation.prompt}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={runNowPending || automation.status === "running"}
              size="sm"
              variant="outline"
              onClick={onRunNow}
            >
              {automation.status === "running"
                ? t("schedule.alreadyRunning")
                : t("schedule.runNow")}
            </Button>
            <Button
              disabled={setEnabledPending}
              size="sm"
              variant="outline"
              onClick={() => onSetEnabled(!automation.enabled)}
            >
              {automation.enabled ? t("schedule.pause") : t("schedule.resume")}
            </Button>
            <Button
              aria-label={t("common.delete")}
              className="ml-auto"
              size="icon-sm"
              variant="ghost"
              onClick={onDelete}
            >
              <Trash className="text-status-danger" />
            </Button>
          </div>

          {runs.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {runs.slice(0, RUN_HISTORY_LIMIT).map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A run is worth one line: what happened, when, and — only when it failed —
 * why. Duration and the "Scheduled" trigger were dropped: they were printed on
 * every row and nobody changes anything because of either.
 */
function RunRow({ run }: { run: AutomationRun }) {
  const { t } = useTranslation();
  const failed = run.status === "failed";
  const missed = run.status === "missed";

  return (
    <div className="text-xs">
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            failed && "text-status-danger",
            missed && "text-status-attention",
            !failed && !missed && "text-muted-foreground",
          )}
        >
          {t(RUN_LABEL_KEY[run.status])}
        </span>
        <span className="text-muted-foreground">
          {formatRelativeTime(run.startedAt)}
        </span>
        {run.trigger === "manual" ? (
          <span className="text-muted-foreground">
            {t("schedule.triggerType.manual")}
          </span>
        ) : null}
      </span>
      {run.error ? (
        <p className="mt-0.5 text-muted-foreground">{run.error}</p>
      ) : null}
    </div>
  );
}

type CreateFormAction =
  | {
      field: keyof CreateAutomationFormState;
      type: "field";
      value: boolean | string;
    }
  | { state: CreateAutomationFormState; type: "initialize" }
  | { preset: SchedulePreset; type: "preset" }
  | { type: "reset" };

function createFormReducer(
  state: CreateAutomationFormState,
  action: CreateFormAction,
): CreateAutomationFormState {
  if (action.type === "reset") return DEFAULT_CREATE_AUTOMATION_FORM;
  if (action.type === "initialize") return action.state;
  if (action.type === "preset") {
    return {
      ...state,
      cron:
        action.preset === "custom" ? state.cron : PRESET_CRON[action.preset],
      preset: action.preset,
    };
  }
  return { ...state, [action.field]: action.value };
}

type WizardStep = 1 | 2 | 3 | 4;
type RecipeId = "blank" | "ciHeartbeat" | "dependencyAudit" | "nightlyTests";

interface DisplayTemplate extends AutomationTemplate {
  description: string;
  id: Exclude<RecipeId, "blank">;
  name: string;
  prompt: string;
}

function automationTemplates(t: TFunction): DisplayTemplate[] {
  return (["dependencyAudit", "ciHeartbeat", "nightlyTests"] as const).map(
    (id) => {
      const description = t(`schedule.recipes.${id}Description`);
      return {
        cron:
          id === "ciHeartbeat"
            ? PRESET_CRON["every-30-minutes"]
            : id === "nightlyTests"
              ? "0 2 * * *"
              : PRESET_CRON.daily,
        description,
        id,
        name: t(`schedule.recipes.${id}`),
        prompt: description.split(" · ").at(-1) ?? description,
      };
    },
  );
}

function guidedFormState(
  template: AutomationTemplate | undefined,
  existingNames: string[],
): CreateAutomationFormState {
  const initial = createAutomationFormState(template, existingNames);
  return { ...initial, preset: scheduleKindForCron(initial.cron) };
}

function scheduleKindForCron(cron: string): SchedulePreset {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return "custom";
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (
    minute === "0" &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "hourly";
  }
  if (
    /^\d+$/.test(minute ?? "") &&
    /^\d+$/.test(hour ?? "") &&
    dayOfMonth === "*" &&
    month === "*"
  ) {
    return dayOfWeek === "*"
      ? "daily"
      : /^\d$/.test(dayOfWeek ?? "")
        ? "weekly"
        : "custom";
  }
  return "custom";
}

function timeForCron(cron: string): string {
  const [minute, hour] = cron.trim().split(/\s+/);
  if (!/^\d+$/.test(minute ?? "") || !/^\d+$/.test(hour ?? "")) {
    return "09:00";
  }
  return `${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
}

function weekdayForCron(cron: string): string {
  const day = cron.trim().split(/\s+/)[4];
  return /^\d$/.test(day ?? "") ? (day === "7" ? "0" : day) : "1";
}

function cronForTime(time: string, weekday?: string): string {
  const [hour = "9", minute = "0"] = time.split(":");
  return `${Number(minute)} ${Number(hour)} * * ${weekday ?? "*"}`;
}

function CreateAutomationDialog({
  onOpenChange,
  open,
  projects,
  existingNames,
  template,
}: {
  existingNames: string[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: Project[];
  template?: AutomationTemplate;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    createFormReducer,
    DEFAULT_CREATE_AUTOMATION_FORM,
  );
  const [step, setStep] = useState<WizardStep>(1);
  const [highestStep, setHighestStep] = useState<WizardStep>(1);
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<RecipeId>("blank");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const createMutation = useMutation(
    createAutomationMutationOptions({ queryClient }),
  );
  const templates = automationTemplates(t);
  const cronValid = validateCron(state.cron);
  const canSubmit =
    state.name.trim().length > 0 && state.prompt.trim().length > 0 && cronValid;
  const project = projects.find(({ id }) => id === state.projectId);
  const preview = nextRunPreview("custom", new Date(), state.cron);
  const nextRun = preview[0];
  const selectedTemplate = templates.find(
    ({ id }) => id === selectedTemplateId,
  );
  const stepTitles = [
    t("schedule.guided.chooseTitle"),
    t("schedule.guided.scheduleTitle"),
    t("schedule.guided.parametersTitle"),
    t("schedule.guided.reviewTitle"),
  ];
  const currentStepValid =
    step === 2
      ? cronValid
      : step === 3
        ? state.name.trim().length > 0 && state.prompt.trim().length > 0
        : true;
  const isDirty =
    selectedTemplateId !== "blank" ||
    state.cron !== DEFAULT_CREATE_AUTOMATION_FORM.cron ||
    state.name !== DEFAULT_CREATE_AUTOMATION_FORM.name ||
    state.notifyOnFailure !== DEFAULT_CREATE_AUTOMATION_FORM.notifyOnFailure ||
    state.projectId !== DEFAULT_CREATE_AUTOMATION_FORM.projectId ||
    state.prompt !== DEFAULT_CREATE_AUTOMATION_FORM.prompt;

  useEffect(() => {
    if (!open) return;
    dispatch({
      state: guidedFormState(template, existingNames),
      type: "initialize",
    });
    setSelectedTemplateId((template?.id as RecipeId | undefined) ?? "blank");
    setStep(1);
    setHighestStep(1);
    setAdvancedOpen(false);
    // Capture the opening payload once. Query refreshes may replace the names
    // array while the wizard is open; re-initializing here would erase edits.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateField = (
    field: keyof CreateAutomationFormState,
    value: boolean | string,
  ) => {
    dispatch({ field, type: "field", value });
  };

  const selectTemplate = (id: RecipeId) => {
    const nextTemplate = templates.find((item) => item.id === id);
    setSelectedTemplateId(id);
    dispatch({
      state: guidedFormState(nextTemplate, existingNames),
      type: "initialize",
    });
  };

  const selectSchedule = (preset: "custom" | "daily" | "hourly" | "weekly") => {
    const currentTime = timeForCron(state.cron);
    const cron =
      preset === "custom"
        ? state.cron
        : preset === "hourly"
          ? PRESET_CRON.hourly
          : cronForTime(
              currentTime,
              preset === "weekly" ? weekdayForCron(state.cron) : undefined,
            );
    dispatch({ state: { ...state, cron, preset }, type: "initialize" });
  };

  const goToStep = (nextStep: WizardStep) => {
    setStep(nextStep);
    setHighestStep((current) => Math.max(current, nextStep) as WizardStep);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      void confirmAction({
        cancelLabel: t("common.cancel"),
        confirmLabel: t("dialog.confirm.discard"),
        title: t("schedule.discardConfirm"),
        tone: "danger",
      }).then((confirmed) => {
        if (!confirmed) return;
        dispatch({ type: "reset" });
        onOpenChange(false);
      });
      return;
    }
    if (!nextOpen) {
      dispatch({ type: "reset" });
    }
    onOpenChange(nextOpen);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate(
      {
        cron: state.cron,
        name: state.name.trim(),
        notifyOnFailure: state.notifyOnFailure,
        projectId: project?.id,
        prompt: state.prompt.trim(),
      },
      {
        onSuccess: () => {
          dispatch({ type: "reset" });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] min-h-[min(42rem,calc(100vh-2rem))] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="px-6 pt-6">
            {t("schedule.createTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("schedule.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <WizardProgress
          current={step}
          highest={highestStep}
          onSelect={goToStep}
          titles={stepTitles}
        />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {step === 1 ? (
              <ChooseTemplateStep
                selected={selectedTemplateId}
                templates={templates}
                onSelect={selectTemplate}
              />
            ) : null}
            {step === 2 ? (
              <ScheduleStep
                cron={state.cron}
                cronValid={cronValid}
                nextRun={nextRun}
                preset={state.preset}
                onCronChange={(cron) => updateField("cron", cron)}
                onPresetChange={selectSchedule}
                onTimeChange={(time) => {
                  updateField(
                    "cron",
                    cronForTime(
                      time,
                      state.preset === "weekly"
                        ? weekdayForCron(state.cron)
                        : undefined,
                    ),
                  );
                }}
                onWeekdayChange={(weekday) =>
                  updateField(
                    "cron",
                    cronForTime(timeForCron(state.cron), weekday),
                  )
                }
              />
            ) : null}
            {step === 3 ? (
              <ParametersStep
                advancedOpen={advancedOpen}
                projects={projects}
                state={state}
                onAdvancedOpenChange={setAdvancedOpen}
                onFieldChange={updateField}
              />
            ) : null}
            {step === 4 ? (
              <ReviewStep
                nextRun={nextRun}
                project={project}
                state={state}
                templateName={
                  selectedTemplate?.name ?? t("schedule.guided.blankName")
                }
                onEdit={goToStep}
              />
            ) : null}
          </div>
          <DialogFooter className="flex-row items-center border-t border-border-subtle px-6 py-4 sm:justify-between">
            <Button
              className="mr-auto whitespace-nowrap"
              type="button"
              variant="ghost"
              onClick={() => requestOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            {step > 1 ? (
              <Button
                className="whitespace-nowrap"
                type="button"
                variant="outline"
                onClick={() => setStep((step - 1) as WizardStep)}
              >
                {t("schedule.guided.back")}
              </Button>
            ) : null}
            {step < 4 ? (
              <Button
                className="whitespace-nowrap"
                disabled={!currentStepValid}
                type="button"
                onClick={() => goToStep((step + 1) as WizardStep)}
              >
                {t("schedule.guided.next")}
              </Button>
            ) : (
              <Button
                className="whitespace-nowrap"
                disabled={!canSubmit || createMutation.isPending}
                type="submit"
              >
                {t("schedule.createAction")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {error ? (
        <span className="text-xs font-normal text-status-danger">{error}</span>
      ) : null}
    </label>
  );
}

function WizardProgress({
  current,
  highest,
  onSelect,
  titles,
}: {
  current: WizardStep;
  highest: WizardStep;
  onSelect: (step: WizardStep) => void;
  titles: string[];
}) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-border-subtle px-6 py-4">
      <p className="text-sm font-medium sm:hidden">
        {t("schedule.guided.stepShort", { number: current, total: 4 })}
      </p>
      <ol className="hidden grid-cols-4 gap-2 sm:grid">
        {titles.map((title, index) => {
          const number = (index + 1) as WizardStep;
          const completed = number < highest;
          const active = number === current;
          return (
            <li key={title}>
              <button
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  active &&
                    "bg-primary-soft font-medium text-primary-soft-foreground",
                  completed &&
                    !active &&
                    "text-foreground hover:bg-overlay-hover",
                  !completed && !active && "text-muted-foreground",
                )}
                disabled={!completed || active}
                type="button"
                onClick={() => onSelect(number)}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums",
                    (completed || active) &&
                      "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {completed ? <Check weight="bold" /> : number}
                </span>
                <span className="truncate">
                  {t("schedule.guided.stepLabel", { number, title })}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepIntro({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="mb-5">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ChooseTemplateStep({
  onSelect,
  selected,
  templates,
}: {
  onSelect: (id: RecipeId) => void;
  selected: RecipeId;
  templates: DisplayTemplate[];
}) {
  const { t } = useTranslation();
  const cards = [
    ...templates,
    {
      description: t("schedule.guided.blankDescription"),
      id: "blank" as const,
      name: t("schedule.guided.blankName"),
    },
  ];
  return (
    <>
      <StepIntro
        description={t("schedule.guided.chooseDescription")}
        title={t("schedule.guided.chooseTitle")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((item) => {
          const active = selected === item.id;
          return (
            <button
              aria-pressed={active}
              className={cn(
                "relative min-h-28 rounded-lg border p-4 text-left transition-colors hover:bg-overlay-hover",
                active
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-card",
              )}
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
            >
              {active ? (
                <Check
                  className="absolute top-4 right-4 size-4 text-primary"
                  weight="bold"
                />
              ) : null}
              <span className="block pr-6 text-sm font-medium">
                {item.name}
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ScheduleStep({
  cron,
  cronValid,
  nextRun,
  onCronChange,
  onPresetChange,
  onTimeChange,
  onWeekdayChange,
  preset,
}: {
  cron: string;
  cronValid: boolean;
  nextRun?: Date;
  onCronChange: (cron: string) => void;
  onPresetChange: (preset: "custom" | "daily" | "hourly" | "weekly") => void;
  onTimeChange: (time: string) => void;
  onWeekdayChange: (weekday: string) => void;
  preset: SchedulePreset;
}) {
  const { t } = useTranslation();
  const options = [
    { id: "hourly" as const, label: t("schedule.guided.everyHour") },
    { id: "daily" as const, label: t("schedule.guided.dailyAt") },
    { id: "weekly" as const, label: t("schedule.guided.weeklyOn") },
    { id: "custom" as const, label: t("schedule.schedulePresets.custom") },
  ];
  const weekdayOptions = Array.from({ length: 7 }, (_, day) => ({
    label: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(
      new Date(2026, 7, 16 + day),
    ),
    value: String(day),
  }));

  return (
    <>
      <StepIntro
        description={t("schedule.guided.scheduleDescription")}
        title={t("schedule.guided.scheduleTitle")}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            aria-pressed={preset === option.id}
            className={cn(
              "rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-overlay-hover",
              preset === option.id
                ? "border-primary bg-primary-soft"
                : "border-border bg-card",
            )}
            key={option.id}
            type="button"
            onClick={() => onPresetChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border-subtle bg-surface-1 p-4">
        {preset === "daily" ? (
          <Field label={t("schedule.guided.dailyAt")}>
            <Input
              type="time"
              value={timeForCron(cron)}
              onChange={(event) => onTimeChange(event.currentTarget.value)}
            />
          </Field>
        ) : null}
        {preset === "weekly" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("schedule.guided.weeklyOn")}>
              <Select
                value={weekdayForCron(cron)}
                onValueChange={onWeekdayChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekdayOptions.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("schedule.schedule")}>
              <Input
                type="time"
                value={timeForCron(cron)}
                onChange={(event) => onTimeChange(event.currentTarget.value)}
              />
            </Field>
          </div>
        ) : null}
        {preset === "custom" ? (
          <Field
            error={cronValid ? undefined : t("schedule.invalidCron")}
            label={t("schedule.customCron")}
          >
            <Input
              aria-invalid={!cronValid}
              className="font-mono"
              value={cron}
              onChange={(event) => onCronChange(event.currentTarget.value)}
            />
          </Field>
        ) : null}
        <div
          className={cn(
            "mt-4 rounded-md px-3 py-2 text-sm",
            cronValid
              ? "bg-primary-soft text-primary-soft-foreground"
              : "bg-status-danger-soft text-status-danger",
          )}
        >
          {nextRun
            ? t("schedule.guided.nextRun", {
                time: formatDateTime(nextRun.toISOString()),
              })
            : t("schedule.guided.noNextRun")}
        </div>
      </div>
    </>
  );
}

function ParametersStep({
  advancedOpen,
  onAdvancedOpenChange,
  onFieldChange,
  projects,
  state,
}: {
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onFieldChange: (
    field: keyof CreateAutomationFormState,
    value: boolean | string,
  ) => void;
  projects: Project[];
  state: CreateAutomationFormState;
}) {
  const { t } = useTranslation();
  return (
    <>
      <StepIntro
        description={t("schedule.guided.parametersDescription")}
        title={t("schedule.guided.parametersTitle")}
      />
      <div className="space-y-4">
        <Field
          error={
            state.name.trim() ? undefined : t("schedule.guided.fieldRequired")
          }
          label={t("schedule.name")}
        >
          <Input
            autoFocus
            aria-invalid={!state.name.trim()}
            value={state.name}
            onChange={(event) =>
              onFieldChange("name", event.currentTarget.value)
            }
          />
        </Field>
        <Field
          error={
            state.prompt.trim() ? undefined : t("schedule.guided.fieldRequired")
          }
          label={t("schedule.prompt")}
        >
          <Textarea
            aria-invalid={!state.prompt.trim()}
            className="min-h-32"
            value={state.prompt}
            onChange={(event) =>
              onFieldChange("prompt", event.currentTarget.value)
            }
          />
        </Field>

        <Collapsible open={advancedOpen} onOpenChange={onAdvancedOpenChange}>
          <CollapsibleTrigger asChild>
            <Button
              className="w-full justify-between"
              type="button"
              variant="outline"
            >
              {t("schedule.guided.advancedSettings")}
              <CaretDown
                className={cn(
                  "transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-border-subtle bg-surface-1 p-4">
            <Field label={t("schedule.agent")}>
              <Select disabled value="current">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    {t("schedule.currentAgent")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("schedule.project")}>
              <Select
                value={state.projectId || NO_PROJECT_SELECT_VALUE}
                onValueChange={(value) =>
                  onFieldChange(
                    "projectId",
                    value === NO_PROJECT_SELECT_VALUE ? "" : value,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT_SELECT_VALUE}>
                    {t("schedule.noProject")}
                  </SelectItem>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {getProjectDisplayName(item.path)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-md border border-border-subtle px-3 py-2.5 text-sm">
              <span>{t("schedule.notifyOnFailure")}</span>
              <Switch
                checked={state.notifyOnFailure}
                onCheckedChange={(checked) =>
                  onFieldChange("notifyOnFailure", checked)
                }
              />
            </label>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  );
}

function ReviewStep({
  nextRun,
  onEdit,
  project,
  state,
  templateName,
}: {
  nextRun?: Date;
  onEdit: (step: WizardStep) => void;
  project?: Project;
  state: CreateAutomationFormState;
  templateName: string;
}) {
  const { t } = useTranslation();
  const rows = [
    {
      label: t("schedule.guided.chooseTitle"),
      step: 1 as const,
      value: templateName,
    },
    {
      label: t("schedule.guided.scheduleTitle"),
      step: 2 as const,
      value: `${scheduleLabel(t, state.cron)}\n${nextRun ? t("schedule.guided.nextRun", { time: formatDateTime(nextRun.toISOString()) }) : t("schedule.guided.noNextRun")}`,
    },
    {
      label: t("schedule.guided.keyParameters"),
      step: 3 as const,
      value: [
        state.name,
        state.prompt,
        project ? getProjectDisplayName(project.path) : t("schedule.noProject"),
        state.notifyOnFailure ? t("schedule.notifyOnFailure") : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  return (
    <>
      <StepIntro
        description={t("schedule.guided.reviewDescription")}
        title={t("schedule.guided.reviewTitle")}
      />
      <div className="divide-y divide-border-subtle rounded-lg border border-border">
        {rows.map((row) => (
          <div className="flex items-start gap-4 p-4" key={row.label}>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {row.label}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                {row.value}
              </p>
            </div>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onEdit(row.step)}
            >
              {t("common.edit")}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

function ScheduleRecipes({
  onCreate,
}: {
  onCreate: (template?: AutomationTemplate) => void;
}) {
  const { t } = useTranslation();
  const templates = automationTemplates(t);
  return (
    <div className="m-auto w-full max-w-3xl p-6">
      <div className="mb-5 text-center">
        <CalendarDots
          className="mx-auto mb-2 size-8 text-muted-foreground"
          weight="duotone"
        />
        <p className="font-display text-base font-semibold">
          {t("schedule.recipes.title")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["dependencyAudit", "ciHeartbeat", "nightlyTests"] as const).map(
          (recipe) => (
            <button
              className="rounded-lg border border-border bg-card p-4 text-left hover:bg-overlay-hover"
              key={recipe}
              onClick={() =>
                onCreate(templates.find(({ id }) => id === recipe))
              }
              type="button"
            >
              <span className="block text-sm font-medium">
                {t(`schedule.recipes.${recipe}`)}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(`schedule.recipes.${recipe}Description`)}
              </span>
            </button>
          ),
        )}
      </div>
      <Button
        className="mx-auto mt-3 flex"
        variant="ghost"
        onClick={() => onCreate()}
      >
        {t("schedule.startFromScratch")}
      </Button>
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton className="h-16 rounded-lg" key={index} />
      ))}
    </div>
  );
}

function ScheduleNotice({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
      <WarningCircle className="size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function presetLabel(t: TFunction, preset: SchedulePreset): string {
  return t(`schedule.schedulePresets.${preset}`);
}

function scheduleLabel(t: TFunction, cron: string): string {
  const preset = presetForCron(cron);
  if (preset !== undefined) return presetLabel(t, preset);

  const kind = scheduleKindForCron(cron);
  if (kind === "daily") {
    return `${t("schedule.guided.dailyAt")} ${timeForCron(cron)}`;
  }
  if (kind === "weekly") {
    const weekday = Number(weekdayForCron(cron));
    const weekdayLabel = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
    }).format(new Date(2026, 7, 16 + weekday));
    return `${t("schedule.guided.weeklyOn")} ${weekdayLabel} ${timeForCron(cron)}`;
  }
  return cron.trim();
}
