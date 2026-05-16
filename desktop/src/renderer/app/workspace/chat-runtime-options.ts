import type { AgentValueOption } from "@shared/agents";
import type { ChatRuntimeConfigOption } from "@shared/chat";

export const NO_CONFIG_OVERRIDE_VALUE = "__angel_no_override__";

export function runtimeConfigOptionsToAgentOptions(
  options: ChatRuntimeConfigOption[] | undefined,
  defaultLabel: string,
): AgentValueOption[] {
  const defaultOption: AgentValueOption = {
    label: defaultLabel,
    value: NO_CONFIG_OVERRIDE_VALUE,
  };
  if (!options?.length) return [defaultOption];
  const runtimeOptions = options.flatMap((option) => {
    const value = selectedConfigOverride(option.value);
    if (!value) return [];
    return [
      {
        description: option.description ?? undefined,
        label: option.label,
        value,
      },
    ];
  });
  return [defaultOption, ...runtimeOptions];
}

export function runtimeConfigOptionCount(
  options: ChatRuntimeConfigOption[] | undefined,
): number {
  return (
    options?.filter((option) => selectedConfigOverride(option.value)).length ??
    0
  );
}

export function ensureConfigOption(
  options: AgentValueOption[],
  value: string | null | undefined,
  defaultLabel: string,
  configDefaultLabel: string,
) {
  const normalizedValue = normalizeConfigDisplayValue(value);
  if (options.some((option) => option.value === normalizedValue)) {
    return options;
  }
  return [
    ...options,
    {
      label:
        normalizedValue === NO_CONFIG_OVERRIDE_VALUE
          ? defaultLabel
          : labelFromConfigValue(normalizedValue, configDefaultLabel),
      value: normalizedValue,
    },
  ];
}

export function resolveSavedConfigSelection({
  canSet,
  currentValue,
  options,
  savedValue,
}: {
  canSet: boolean | undefined;
  currentValue: string | null | undefined;
  options: ChatRuntimeConfigOption[] | undefined;
  savedValue: string | undefined;
}): { displayValue?: string; overrideValue?: string } {
  const saved = selectedConfigOverride(savedValue);
  if (!saved || canSet === false) return {};

  const optionValues = configOptionValues(options);
  if (optionValues.has(saved)) {
    return { displayValue: saved, overrideValue: saved };
  }

  const current = selectedConfigOverride(currentValue);
  if (current && (optionValues.size === 0 || optionValues.has(current))) {
    return { displayValue: current };
  }

  const first = firstConfigOptionValue(options);
  return first ? { displayValue: first, overrideValue: first } : {};
}

export function normalizeConfigDisplayValue(value: string | null | undefined) {
  return value || NO_CONFIG_OVERRIDE_VALUE;
}

export function selectedConfigOverride(value: string | null | undefined) {
  if (!value || value === NO_CONFIG_OVERRIDE_VALUE) {
    return undefined;
  }
  return value;
}

export function supportedConfigOverride({
  canSet,
  options,
  value,
}: {
  canSet: boolean | undefined;
  options: ChatRuntimeConfigOption[] | undefined;
  value: string | null | undefined;
}) {
  const override = selectedConfigOverride(value);
  if (!override || canSet === false) return undefined;

  const optionValues = configOptionValues(options);
  if (optionValues.size > 0 && !optionValues.has(override)) {
    return undefined;
  }

  return override;
}

function labelFromConfigValue(value: string, defaultLabel: string) {
  if (value === "xhigh") return "XHigh";
  if (value === "default") return defaultLabel;
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function configOptionValues(
  options: ChatRuntimeConfigOption[] | undefined,
): Set<string> {
  return new Set(
    options?.flatMap((option) => {
      const value = selectedConfigOverride(option.value);
      return value ? [value] : [];
    }) ?? [],
  );
}

function firstConfigOptionValue(
  options: ChatRuntimeConfigOption[] | undefined,
): string | undefined {
  return options
    ?.map((option) => selectedConfigOverride(option.value))
    .find((value): value is string => Boolean(value));
}
