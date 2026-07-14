import type { ChatOptionsContextValue } from "@/features/chat/runtime/chat-options-context";
import { AGENT_OPTIONS } from "@angel-engine/daemon-api/agents";
import {
  Robot as Bot,
  Brain,
  Cpu,
  ShieldCheck,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { agentRuntimeIconSvg } from "@/features/agents/agent-runtime-icons";
import {
  composerSettingDisabledReason,
  filterComposerOptions,
  optionLabel,
  shortEffortLabel,
} from "./composer-helpers";
import {
  ComposerModelMenuChevron,
  ComposerModelMenuItem,
  ComposerModelMenuSearch,
  ComposerModelMenuSub,
  composerModelMenuTriggerClassName,
  composerModelMenuValueClassName,
  composerNativeMenuClassName,
  composerNativeMenuLabelClassName,
} from "./composer-model-menu-primitives";

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
