export type AutomationStatus = "active" | "failing" | "paused" | "running";

export type AutomationRunStatus =
  | "cancelled"
  | "failed"
  | "missed"
  | "running"
  | "succeeded";

export type SchedulePreset =
  | "every-30-minutes"
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekly"
  | "custom";

export interface AutomationRun {
  durationSeconds?: number;
  error?: string;
  id: string;
  startedAt: string;
  status: AutomationRunStatus;
  trigger: "manual" | "scheduled";
}

export interface Automation {
  cron: string;
  enabled: boolean;
  id: string;
  name: string;
  nextRunAt?: string;
  notifyOnFailure: boolean;
  projectId?: string;
  prompt: string;
  runs: AutomationRun[];
  status: AutomationStatus;
}

export interface CreateAutomationInput {
  cron: string;
  name: string;
  notifyOnFailure: boolean;
  projectId?: string;
  prompt: string;
}

export interface CreateAutomationFormState extends CreateAutomationInput {
  preset: SchedulePreset;
  projectId: string;
  time: string;
  weekday: string;
}

export type AutomationTemplate = Partial<CreateAutomationInput> & {
  cron: string;
  name: string;
  prompt: string;
};

export type AutomationParameterField =
  | "name"
  | "notifyOnFailure"
  | "projectId"
  | "prompt";

export interface AutomationWizardValidation {
  firstInvalidStep?: 1 | 2 | 3;
  steps: readonly [boolean, boolean, boolean, boolean];
  timeRequired: boolean;
}

export interface AutomationWizardNavigation {
  completedSteps: readonly [boolean, boolean, boolean, boolean];
  step: 1 | 2 | 3 | 4;
}

export const PRESET_CRON: Record<Exclude<SchedulePreset, "custom">, string> = {
  "every-30-minutes": "*/30 * * * *",
  daily: "0 9 * * *",
  hourly: "0 * * * *",
  weekdays: "0 9 * * 1-5",
  weekly: "0 9 * * 1",
};

export const DEFAULT_CREATE_AUTOMATION_FORM: CreateAutomationFormState = {
  cron: PRESET_CRON.daily,
  name: "",
  notifyOnFailure: true,
  preset: "daily",
  projectId: "",
  prompt: "",
  time: "09:00",
  weekday: "1",
};

export function createAutomationFormInitialState(
  template?: AutomationTemplate,
  existingNames: string[] = [],
): CreateAutomationFormState {
  if (template === undefined) return { ...DEFAULT_CREATE_AUTOMATION_FORM };

  const preset = naturalPresetForCron(template.cron);
  const time =
    timeForCron(template.cron) ?? DEFAULT_CREATE_AUTOMATION_FORM.time;
  const weekday =
    weekdayForCron(template.cron) ?? DEFAULT_CREATE_AUTOMATION_FORM.weekday;
  const cron =
    preset === "weekly"
      ? cronForNaturalSchedule(preset, time, weekday, template.cron)
      : template.cron;
  return {
    ...DEFAULT_CREATE_AUTOMATION_FORM,
    ...template,
    cron,
    name: uniqueAutomationName(template.name, existingNames),
    preset,
    projectId: template.projectId ?? DEFAULT_CREATE_AUTOMATION_FORM.projectId,
    time,
    weekday,
  };
}

function naturalPresetForCron(cron: string): SchedulePreset {
  const normalized = cron.trim();
  if (/^\d+ \* \* \* \*$/.test(normalized)) return "hourly";
  if (/^\d+ \d+ \* \* \*$/.test(normalized)) return "daily";
  if (/^\d+ \d+ \* \* [0-7]$/.test(normalized)) return "weekly";
  return presetForCron(normalized) ?? "custom";
}

function timeForCron(cron: string): string | undefined {
  const [minute, hour] = cron.trim().split(/\s+/);
  if (
    minute === undefined ||
    hour === undefined ||
    !/^\d+$/.test(minute) ||
    !/^\d+$/.test(hour)
  ) {
    return undefined;
  }
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function weekdayForCron(cron: string): string | undefined {
  const weekday = cron.trim().split(/\s+/)[4];
  if (weekday === "7") return "0";
  return weekday !== undefined && /^[0-6]$/.test(weekday) ? weekday : undefined;
}

export function weekdayKeyForValue(value: string): string {
  return (
    [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][Number(value)] ?? "monday"
  );
}

export function cronForNaturalSchedule(
  preset: SchedulePreset,
  time: string,
  weekday: string,
  customCron: string,
): string {
  if (preset === "custom") return customCron;
  if (preset === "hourly") return PRESET_CRON.hourly;
  if (preset === "every-30-minutes") return PRESET_CRON["every-30-minutes"];
  if (preset === "weekdays") return PRESET_CRON.weekdays;

  const [hour, minute] = time.split(":");
  if (
    hour === undefined ||
    minute === undefined ||
    !/^\d{2}$/.test(hour) ||
    !/^\d{2}$/.test(minute)
  ) {
    return "";
  }
  return preset === "weekly"
    ? `${Number(minute)} ${Number(hour)} * * ${weekday === "7" ? "0" : weekday}`
    : `${Number(minute)} ${Number(hour)} * * *`;
}

export function automationParameterGroups(template?: AutomationTemplate): {
  advanced: AutomationParameterField[];
  primary: AutomationParameterField[];
} {
  const fields: AutomationParameterField[] = [
    "name",
    "prompt",
    "projectId",
    "notifyOnFailure",
  ];
  if (template === undefined) return { advanced: [], primary: fields };

  return {
    advanced: fields.filter((field) => template[field] !== undefined),
    primary: fields.filter((field) => template[field] === undefined),
  };
}

export function validateAutomationWizard(
  state: CreateAutomationFormState,
  sourceSelected: boolean,
  hasNextRun: boolean,
): AutomationWizardValidation {
  const timeRequired =
    (state.preset === "daily" || state.preset === "weekly") &&
    state.time.trim().length === 0;
  const sourceValid = sourceSelected;
  const scheduleValid =
    sourceValid && !timeRequired && validateCron(state.cron) && hasNextRun;
  const parametersValid =
    scheduleValid &&
    state.name.trim().length > 0 &&
    state.prompt.trim().length > 0;
  const steps = [
    sourceValid,
    scheduleValid,
    parametersValid,
    parametersValid,
  ] as const;
  const invalidIndex = steps.slice(0, 3).findIndex((valid) => !valid);

  return {
    firstInvalidStep:
      invalidIndex === -1 ? undefined : ((invalidIndex + 1) as 1 | 2 | 3),
    steps,
    timeRequired,
  };
}

export function reconcileAutomationWizardNavigation(
  navigation: AutomationWizardNavigation,
  stepValidity: readonly [boolean, boolean, boolean, boolean],
  firstInvalidStep?: 1 | 2 | 3,
): AutomationWizardNavigation {
  const completedSteps = navigation.completedSteps.map(
    (completed, index) => completed && stepValidity[index],
  ) as [boolean, boolean, boolean, boolean];
  const step =
    firstInvalidStep !== undefined && navigation.step > firstInvalidStep
      ? firstInvalidStep
      : navigation.step;
  if (
    step === navigation.step &&
    completedSteps.every(
      (completed, index) => completed === navigation.completedSteps[index],
    )
  ) {
    return navigation;
  }
  return { completedSteps, step };
}

export function summarizeAutomationPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length > 120
    ? `${normalized.slice(0, 117).trimEnd()}…`
    : normalized;
}

function uniqueAutomationName(name: string, existingNames: string[]): string {
  const normalizedNames = new Set(
    existingNames.map((existingName) =>
      existingName.trim().toLocaleLowerCase(),
    ),
  );
  if (!normalizedNames.has(name.trim().toLocaleLowerCase())) return name;

  let suffix = 2;
  while (
    normalizedNames.has(`${name} (${suffix})`.trim().toLocaleLowerCase())
  ) {
    suffix += 1;
  }
  return `${name} (${suffix})`;
}

const CRON_FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const;
const PREVIEW_SEARCH_YEARS = 5;

interface ParsedCronField {
  values: Set<number>;
  wildcard: boolean;
}

interface ParsedCron {
  dayOfMonth: ParsedCronField;
  dayOfWeek: ParsedCronField;
  hour: ParsedCronField;
  minute: ParsedCronField;
  month: ParsedCronField;
}

export function validateCron(value: string): boolean {
  return parseCron(value) !== undefined;
}

export function presetForCron(
  cron: string,
): Exclude<SchedulePreset, "custom"> | undefined {
  const normalized = cron.trim();
  return (
    Object.entries(PRESET_CRON) as Array<
      [Exclude<SchedulePreset, "custom">, string]
    >
  ).find(([, expression]) => expression === normalized)?.[0];
}

export function nextRunPreview(
  preset: SchedulePreset,
  now = new Date(),
  customCron?: string,
): Date[] {
  const expression =
    customCron ?? (preset === "custom" ? undefined : PRESET_CRON[preset]);
  if (expression === undefined) return [];

  const cron = parseCron(expression);
  if (cron === undefined) return [];

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  const searchLimit = new Date(candidate);
  searchLimit.setFullYear(searchLimit.getFullYear() + PREVIEW_SEARCH_YEARS);
  const preview: Date[] = [];

  while (preview.length < 3 && candidate <= searchLimit) {
    if (cronMatches(cron, candidate)) preview.push(new Date(candidate));
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return preview;
}

export function hasMissedRun(automations: Automation[]): boolean {
  return automations.some((automation) =>
    automation.runs.some((run) => run.status === "missed"),
  );
}

export function sortedRuns(runs: AutomationRun[]): AutomationRun[] {
  return [...runs].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

function parseCron(value: string): ParsedCron | undefined {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== CRON_FIELD_RANGES.length) return undefined;

  const parsed = fields.map((field, index) => {
    const range = CRON_FIELD_RANGES[index];
    return range === undefined
      ? undefined
      : parseCronField(field, range[0], range[1]);
  });
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parsed;
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return undefined;
  }

  return { dayOfMonth, dayOfWeek, hour, minute, month };
}

function parseCronField(
  field: string,
  minimum: number,
  maximum: number,
): ParsedCronField | undefined {
  const values = new Set<number>();
  const segments = field.split(",");
  if (segments.some((segment) => segment.length === 0)) return undefined;

  for (const segment of segments) {
    const parts = segment.split("/");
    if (parts.length > 2) return undefined;
    const [rangePart, stepPart] = parts;
    if (rangePart === undefined) return undefined;

    const step = stepPart === undefined ? 1 : parseCronInteger(stepPart);
    if (step === undefined || step <= 0) return undefined;

    let start = minimum;
    let end = maximum;
    if (rangePart !== "*") {
      const bounds = rangePart.split("-");
      if (bounds.length > 2) return undefined;
      const first = parseCronInteger(bounds[0]);
      const last = bounds.length === 2 ? parseCronInteger(bounds[1]) : first;
      if (
        first === undefined ||
        last === undefined ||
        first < minimum ||
        last > maximum ||
        first > last
      ) {
        return undefined;
      }
      start = first;
      end = last;
    }

    for (let current = start; current <= end; current += step) {
      values.add(current);
    }
  }

  return {
    values,
    wildcard: field === "*" || field.startsWith("*/"),
  };
}

function parseCronInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function cronMatches(cron: ParsedCron, candidate: Date): boolean {
  if (!cron.minute.values.has(candidate.getMinutes())) return false;
  if (!cron.hour.values.has(candidate.getHours())) return false;
  if (!cron.month.values.has(candidate.getMonth() + 1)) return false;

  const dayOfMonthMatches = cron.dayOfMonth.values.has(candidate.getDate());
  const weekday = candidate.getDay();
  const dayOfWeekMatches =
    cron.dayOfWeek.values.has(weekday) ||
    (weekday === 0 && cron.dayOfWeek.values.has(7));

  if (cron.dayOfMonth.wildcard) return dayOfWeekMatches;
  if (cron.dayOfWeek.wildcard) return dayOfMonthMatches;
  return dayOfMonthMatches || dayOfWeekMatches;
}
