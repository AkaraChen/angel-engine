import type { AgentValueOption } from "@shared/agents";
import type { ReactNode } from "react";
import type { ChatOptionsContextValue } from "@/features/chat/runtime/chat-options-context";
import {
  Robot as Bot,
  Brain,
  Check,
  CaretDown as ChevronDown,
  Cpu,
  Paperclip,
  MagnifyingGlass as Search,
  ShieldCheck,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { AGENT_OPTIONS } from "@shared/agents";
import is from "@sindresorhus/is";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { agentRuntimeIconSvg } from "@/features/agents/agent-runtime-icons";
import {
  composerSettingDisabledReason,
  filterComposerOptions,
  optionLabel,
  shortEffortLabel,
} from "./composer-helpers";

export const composerModelMenuTriggerClassName =
  "h-8 min-w-0 gap-1.5 rounded-md px-2 text-xs font-medium text-foreground focus-visible:!border-transparent focus-visible:!ring-0 hover:bg-overlay-hover aria-expanded:bg-overlay-active";
export const composerModelMenuValueClassName =
  "min-w-0 max-w-28 truncate text-muted-foreground";
export const composerNativeMenuClassName =
  "flex flex-col p-1 data-open:zoom-in-100 data-closed:zoom-out-100 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0 data-[side=top]:slide-in-from-bottom-0";
export const composerNativeMenuLabelClassName =
  "px-2 pb-1 pt-1 text-[11px] font-medium leading-4 text-muted-foreground/80";

export function PromptAttachmentButton() {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();

  return (
    <Button
      className="focus-visible:ring-0!"
      onClick={attachments.openFileDialog}
      size="icon-sm"
      title={t("composer.attachFiles")}
      type="button"
      variant="ghost"
    >
      <Paperclip />
      <span className="sr-only">{t("composer.attachFiles")}</span>
    </Button>
  );
}

export function ComposerModelMenu({
  disabled,
  hideProvider,
  options,
}: {
  disabled?: boolean;
  hideProvider?: boolean;
  options: ChatOptionsContextValue;
}) {
  return (
    <>
      {hideProvider ? null : (
        <ComposerProviderMenu disabled={disabled} options={options} />
      )}
      <ComposerModelEffortMenu disabled={disabled} options={options} />
      <ComposerAgentSettingsMenu disabled={disabled} options={options} />
    </>
  );
}

function ComposerProviderMenu({
  disabled,
  options,
}: {
  disabled?: boolean;
  options: ChatOptionsContextValue;
}) {
  const { t } = useTranslation();
  const providerOptions = options.runtimeOptions;
  const providerLabel =
    providerOptions.find((agent) => agent.value === options.runtime)?.label ??
    AGENT_OPTIONS.find((agent) => agent.id === options.runtime)?.label ??
    options.runtime;
  const providerIconSvg = agentRuntimeIconSvg(options.runtime);
  const providerDisabledReason =
    options.runtimeDisabledReason ??
    (providerOptions.every((provider) => provider.value === options.runtime)
      ? t("composer.disabledReasons.onlyOneAgent")
      : undefined) ??
    (disabled
      ? t("composer.disabledReasons.agentCannotChangeWhileRunning")
      : undefined);
  const providerDisabled =
    !options.canSetRuntime ||
    disabled ||
    providerOptions.every((provider) => provider.value === options.runtime);

  if (providerOptions.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("composer.provider")}
          className={`
            ${composerModelMenuTriggerClassName}
            max-w-40
          `}
          size="sm"
          title={providerDisabledReason ?? t("composer.provider")}
          type="button"
          variant="ghost"
        >
          {is.nonEmptyString(providerIconSvg) ? (
            <span
              aria-hidden="true"
              className="
                flex size-2.5 shrink-0 items-center justify-center
                text-muted-foreground
                [&_svg]:size-2.5 [&_svg]:shrink-0
              "
              // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
              // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
              dangerouslySetInnerHTML={{ __html: providerIconSvg }}
            />
          ) : (
            <Bot
              className="size-3.5 shrink-0 text-muted-foreground"
              weight="duotone"
            />
          )}
          <span className={composerModelMenuValueClassName}>
            {providerLabel}
          </span>
          <ComposerModelMenuChevron />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={`
          ${composerNativeMenuClassName}
          w-52 min-w-0
        `}
        align="start"
        sideOffset={4}
        variant="native"
      >
        <DropdownMenuLabel className={composerNativeMenuLabelClassName}>
          {t("composer.provider")}
        </DropdownMenuLabel>
        {providerOptions.map((provider) => (
          <ComposerModelMenuItem
            disabled={providerDisabled}
            disabledReason={providerDisabledReason}
            iconSvg={agentRuntimeIconSvg(provider.value)}
            key={provider.value}
            label={provider.label}
            onSelect={() => {
              void options.setRuntime(provider.value);
            }}
            selected={provider.value === options.runtime}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComposerModelEffortMenu({
  disabled,
  options,
}: {
  disabled?: boolean;
  options: ChatOptionsContextValue;
}) {
  const { t } = useTranslation();
  const [modelQuery, setModelQuery] = useState("");
  const modelLabel = optionLabel(options.modelOptions, options.model);
  const effortLabel = optionLabel(
    options.reasoningEffortOptions,
    options.reasoningEffort,
  );
  const modelDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetModel ||
    options.modelOptionCount < 2;
  const effortDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetReasoningEffort ||
    options.reasoningEffortOptionCount < 2;
  const effortDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetReasoningEffort,
        disabled,
        label: t("composer.settingLabels.reasoningEffort"),
        optionCount: options.reasoningEffortOptionCount,
        t,
      });
  const modelDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetModel,
        disabled,
        label: t("composer.model"),
        optionCount: options.modelOptionCount,
        t,
      });
  const filteredModelOptions = useMemo(
    () => filterComposerOptions(options.modelOptions, modelQuery),
    [options.modelOptions, modelQuery],
  );
  const effortDisplayLabel = shortEffortLabel(
    effortLabel,
    t("common.useDefault"),
    t("common.default"),
  );
  const modelEffortLabel = `${modelLabel} ${effortDisplayLabel}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${t("composer.model")} / ${t("composer.effort")}`}
          className={`
            ${composerModelMenuTriggerClassName}
            max-w-[18rem]
          `}
          size="sm"
          title={modelEffortLabel}
          type="button"
          variant="ghost"
        >
          <Cpu
            className="size-3.5 shrink-0 text-muted-foreground"
            weight="duotone"
          />
          <span className="max-w-52 min-w-0 truncate text-muted-foreground">
            {modelEffortLabel}
          </span>
          <ComposerModelMenuChevron />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={`
          ${composerNativeMenuClassName}
          w-68 min-w-0
        `}
        align="start"
        sideOffset={4}
        variant="native"
      >
        <DropdownMenuLabel className={composerNativeMenuLabelClassName}>
          {t("composer.model")} /{t("composer.effort")}
        </DropdownMenuLabel>
        <ComposerModelMenuSub
          disabled={modelDisabled}
          disabledReason={modelDisabledReason}
          icon={<Cpu weight="duotone" />}
          label={t("composer.model")}
          value={
            options.configLoading ? t("composer.loadingValue") : modelLabel
          }
        >
          <ComposerModelMenuSearch
            onChange={setModelQuery}
            placeholder={t("composer.searchModels")}
            value={modelQuery}
          />
          {filteredModelOptions.length > 0 ? (
            filteredModelOptions.map((model) => (
              <ComposerModelMenuItem
                key={model.value}
                label={model.label}
                onSelect={() => {
                  options.setModel(model.value);
                  setModelQuery("");
                }}
                selected={model.value === options.model}
              />
            ))
          ) : (
            <div className="px-2 py-5 text-center text-xs text-muted-foreground">
              {t("composer.noModelsFound")}
            </div>
          )}
        </ComposerModelMenuSub>
        <ComposerModelMenuSub
          disabled={effortDisabled}
          disabledReason={effortDisabledReason}
          icon={<Brain weight="duotone" />}
          label={t("composer.effort")}
          value={
            options.configLoading ? t("composer.loadingValue") : effortLabel
          }
        >
          {options.reasoningEffortOptions.map((effort) => (
            <ComposerModelMenuItem
              key={effort.value}
              label={effort.label}
              onSelect={() => options.setReasoningEffort(effort.value)}
              selected={effort.value === options.reasoningEffort}
            />
          ))}
        </ComposerModelMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComposerAgentSettingsMenu({
  disabled,
  options,
}: {
  disabled?: boolean;
  options: ChatOptionsContextValue;
}) {
  const { t } = useTranslation();
  const modeLabel = optionLabel(options.modeOptions, options.mode);
  const permissionModeLabel = optionLabel(
    options.permissionModeOptions,
    options.permissionMode,
  );
  const modeDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetMode ||
    options.modeOptionCount < 2;
  const permissionModeDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetPermissionMode ||
    options.permissionModeOptionCount < 2;
  const modeDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetMode,
        disabled,
        label: t("composer.settingLabels.agentMode"),
        optionCount: options.modeOptionCount,
        t,
      });
  const permissionModeDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetPermissionMode,
        disabled,
        label: t("composer.settingLabels.permissionMode"),
        optionCount: options.permissionModeOptionCount,
        t,
      });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("composer.agentSettings")}
          className={`
            ${composerModelMenuTriggerClassName}
            max-w-40
          `}
          size="sm"
          title={t("composer.agentSettings")}
          type="button"
          variant="ghost"
        >
          <SlidersHorizontal
            className="size-3.5 shrink-0 text-muted-foreground"
            weight="duotone"
          />
          <span className={composerModelMenuValueClassName}>
            {t("composer.agentSettings")}
          </span>
          <ComposerModelMenuChevron />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={`
          ${composerNativeMenuClassName}
          w-68 min-w-0
        `}
        align="start"
        sideOffset={4}
        variant="native"
      >
        <DropdownMenuLabel className={composerNativeMenuLabelClassName}>
          {t("composer.agentSettings")}
        </DropdownMenuLabel>
        <ComposerModelMenuSub
          disabled={modeDisabled}
          disabledReason={modeDisabledReason}
          icon={<SlidersHorizontal weight="duotone" />}
          label={t("composer.agentMode")}
          value={options.configLoading ? t("composer.loadingValue") : modeLabel}
        >
          {options.modeOptions.map((mode) => (
            <ComposerModelMenuItem
              key={mode.value}
              label={mode.label}
              onSelect={() => {
                void options.setMode(mode.value);
              }}
              selected={mode.value === options.mode}
            />
          ))}
        </ComposerModelMenuSub>
        <ComposerModelMenuSub
          disabled={permissionModeDisabled}
          disabledReason={permissionModeDisabledReason}
          icon={<ShieldCheck weight="duotone" />}
          label={t("composer.permissionMode")}
          value={
            options.configLoading
              ? t("composer.loadingValue")
              : permissionModeLabel
          }
        >
          {options.permissionModeOptions.map((mode) => (
            <ComposerModelMenuItem
              key={mode.value}
              label={mode.label}
              onSelect={() => {
                void options.setPermissionMode(mode.value);
              }}
              selected={mode.value === options.permissionMode}
            />
          ))}
        </ComposerModelMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComposerModelMenuChevron() {
  return (
    <ChevronDown
      className="
        size-3.5 shrink-0 text-muted-foreground/80 transition-transform
        duration-150
        group-data-[state=open]/button:rotate-180
      "
      weight="duotone"
    />
  );
}

function ComposerModelMenuSearch({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div
      className="
        sticky top-0 z-10 -mx-0.5 mb-1 bg-white/90 px-0.5 pb-1 backdrop-blur-xl
        dark:bg-card/95
      "
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      role="presentation"
    >
      <div className="relative">
        <Search
          className="
            pointer-events-none absolute top-1/2 left-2.5 size-3.5
            -translate-y-1/2 text-muted-foreground/70
          "
          weight="duotone"
        />
        <Input
          aria-label={placeholder}
          autoComplete="off"
          className="
            h-7 rounded-md border-0 bg-overlay-hover pr-2 pl-8 text-xs
            shadow-none
            focus-visible:ring-1 focus-visible:ring-ring/25
          "
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    </div>
  );
}

function ComposerModelMenuSub({
  children,
  disabled,
  disabledReason,
  icon,
  label,
  value,
}: {
  children: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const trigger = (
    <DropdownMenuSubTrigger
      className="
        min-h-7 w-full gap-2 rounded-sm px-2 py-1 text-[13px] font-normal
        focus:bg-overlay-hover focus:text-foreground
        data-open:bg-overlay-hover data-open:text-foreground
        [&>svg:last-child]:ml-1 [&>svg:last-child]:size-3.5
        [&>svg:last-child]:opacity-45
        focus:[&>svg:last-child]:opacity-65
        data-open:[&>svg:last-child]:opacity-65
      "
      disabled={disabled}
      title={disabledReason ?? label}
    >
      <span
        className="
          flex size-4 shrink-0 items-center justify-center text-muted-foreground
          [&_svg]:size-3.5
        "
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className="
          max-w-28 min-w-0 shrink truncate text-right text-[12px]
          text-muted-foreground
        "
      >
        {value}
      </span>
    </DropdownMenuSubTrigger>
  );

  return (
    <DropdownMenuSub>
      {disabled && disabledReason !== undefined ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block rounded-lg">{trigger}</span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {disabledReason}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuSubContent
        className={`
          ${composerNativeMenuClassName}
          max-h-72 w-68 min-w-0
        `}
        sideOffset={4}
        variant="native"
      >
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ComposerModelMenuItem({
  disabled,
  disabledReason,
  iconSvg,
  label,
  onSelect,
  selected,
}: {
  disabled?: boolean;
  disabledReason?: string;
  iconSvg?: string;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  const hasIcon = is.nonEmptyString(iconSvg);
  const item = (
    <DropdownMenuItem
      className="
        min-h-7 gap-2 rounded-sm px-2 py-1 text-[13px] font-normal
        focus:bg-overlay-hover focus:text-foreground
      "
      disabled={disabled}
      onSelect={(event) => {
        if (disabled || selected) {
          event.preventDefault();
          return;
        }
        onSelect();
      }}
      title={label}
    >
      {hasIcon ? (
        <span
          className="
            flex size-4 shrink-0 items-center justify-center
            text-muted-foreground
            [&_svg]:size-3.5 [&_svg]:shrink-0
          "
        >
          <span
            aria-hidden="true"
            className="flex size-3.5 items-center justify-center"
            // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
            // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
            dangerouslySetInnerHTML={{ __html: iconSvg ?? "" }}
          />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className="
          flex size-4 shrink-0 items-center justify-center text-primary
        "
      >
        {selected ? <Check className="size-3" weight="duotone" /> : null}
      </span>
    </DropdownMenuItem>
  );

  if (disabled && is.nonEmptyString(disabledReason)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">{item}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  return item;
}

export function ComposerOptionSelect({
  className,
  disabled,
  icon,
  label,
  onValueChange,
  options,
  title,
  value,
}: {
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: AgentValueOption[];
  title?: string;
  value: string;
}) {
  return (
    <div
      className={["relative w-fit max-w-36", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className="
          pointer-events-none absolute top-1/2 left-2 z-10 flex size-4
          -translate-y-1/2 items-center justify-center
          [&_svg]:size-3.5
        "
      >
        {icon}
      </span>
      <NativeSelect
        aria-label={label}
        className="max-w-36"
        disabled={disabled}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        selectClassName="h-8 max-w-36 rounded-md border border-border-subtle bg-background/55 py-0 pr-8 pl-8 text-xs focus-visible:!border-primary/35 focus-visible:!ring-0 dark:bg-card/60"
        size="sm"
        title={title ?? label}
        value={value}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
