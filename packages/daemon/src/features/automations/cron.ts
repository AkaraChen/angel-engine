const FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const;
const MAX_SEARCH_YEARS = 5;

interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

interface CronExpression {
  dayOfMonth: CronField;
  dayOfWeek: CronField;
  hour: CronField;
  minute: CronField;
  month: CronField;
}

export function isValidCron(value: string): boolean {
  return parseCron(value) !== undefined;
}

/** Returns the first matching local-time minute strictly after `after`. */
export function nextCronRun(value: string, after: Date): Date | undefined {
  const until = new Date(after);
  until.setFullYear(until.getFullYear() + MAX_SEARCH_YEARS);
  return upcomingCronRuns(value, after, until, 1)[0];
}

/** Returns matching local-time minutes in `(after, until]`. */
export function upcomingCronRuns(
  value: string,
  after: Date,
  until: Date,
  limit = 10_000,
): Date[] {
  const cron = parseCron(value);
  if (cron === undefined || limit <= 0 || until <= after) return [];

  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  const runs: Date[] = [];
  while (candidate <= until && runs.length < limit) {
    if (matches(cron, candidate)) runs.push(new Date(candidate));
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return runs;
}

function parseCron(value: string): CronExpression | undefined {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== FIELD_RANGES.length) return undefined;
  const parsed = fields.map((field, index) => {
    const range = FIELD_RANGES[index];
    return range ? parseField(field, range[0], range[1]) : undefined;
  });
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parsed;
  return minute && hour && dayOfMonth && month && dayOfWeek
    ? { dayOfMonth, dayOfWeek, hour, minute, month }
    : undefined;
}

function parseField(
  value: string,
  minimum: number,
  maximum: number,
): CronField | undefined {
  const segments = value.split(",");
  if (segments.some((segment) => segment.length === 0)) return undefined;
  const values = new Set<number>();

  for (const segment of segments) {
    const parts = segment.split("/");
    if (parts.length > 2) return undefined;
    const [rangePart, stepPart] = parts;
    if (rangePart === undefined) return undefined;
    const step = stepPart === undefined ? 1 : integer(stepPart);
    if (step === undefined || step <= 0) return undefined;

    let start = minimum;
    let end = maximum;
    if (rangePart !== "*") {
      const bounds = rangePart.split("-");
      if (bounds.length > 2) return undefined;
      const first = integer(bounds[0]);
      const last = bounds.length === 2 ? integer(bounds[1]) : first;
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
    wildcard: value === "*" || value.startsWith("*/"),
  };
}

function integer(value: string | undefined): number | undefined {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;
}

function matches(cron: CronExpression, candidate: Date): boolean {
  if (!cron.minute.values.has(candidate.getMinutes())) return false;
  if (!cron.hour.values.has(candidate.getHours())) return false;
  if (!cron.month.values.has(candidate.getMonth() + 1)) return false;

  const dayOfMonth = cron.dayOfMonth.values.has(candidate.getDate());
  const weekday = candidate.getDay();
  const dayOfWeek =
    cron.dayOfWeek.values.has(weekday) ||
    (weekday === 0 && cron.dayOfWeek.values.has(7));
  if (cron.dayOfMonth.wildcard) return dayOfWeek;
  if (cron.dayOfWeek.wildcard) return dayOfMonth;
  return dayOfMonth || dayOfWeek;
}
