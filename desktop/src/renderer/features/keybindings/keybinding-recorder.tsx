import {
  formatBinding,
  getCommandDescriptor,
  parseBinding,
  stringifyBinding,
  type CommandId,
  type KeybindingRule,
  type KeymapPlatform,
  type ParsedSegment,
} from "@shared/keybindings";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { KeybindingHint } from "@/features/keybindings/components/keybinding-hint";
import { findCandidateConflicts } from "@/features/keybindings/keybinding-editor-utils";
import { resolveCandidates } from "@/platform/keymap/resolve-candidates";

type Candidate = {
  canonical: string;
  formatted: string;
  segments: [ParsedSegment] | [ParsedSegment, ParsedSegment];
};

export function KeybindingRecorder({
  commandId,
  onCancel,
  onJumpToConflict,
  onRecorded,
  platform,
  rules,
  when,
}: {
  commandId: CommandId;
  onCancel: () => void;
  onJumpToConflict: (commandId: CommandId) => void;
  onRecorded: (canonicalKey: string) => void;
  platform: KeymapPlatform;
  rules: readonly KeybindingRule[];
  when?: string;
}) {
  const { t } = useTranslation();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [awaitingChord, setAwaitingChord] = useState(false);
  const recorderRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const conflicts = candidate
    ? findCandidateConflicts({
        commandId,
        key: candidate.canonical,
        platform,
        rules,
        when,
      })
    : [];
  const conflictCommandId = conflicts
    .flatMap((conflict) => conflict.rules)
    .find((rule) => rule.command !== commandId)?.command;
  const conflictDescriptor = conflictCommandId
    ? getCommandDescriptor(conflictCommandId)
    : undefined;

  useEffect(() => {
    if (candidate && !awaitingChord) confirmRef.current?.focus();
  }, [awaitingChord, candidate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const recorderAction =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-recorder-action]")
          : null;
      if (recorderAction && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        recorderAction.click();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (
        event.key === "Escape" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        onCancel();
        return;
      }

      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return;

      const segment = resolveCandidates(event, platform)[0];
      if (!segment) return;
      const segments: [ParsedSegment] | [ParsedSegment, ParsedSegment] =
        awaitingChord && candidate
          ? [candidate.segments[0], segment]
          : [segment];
      const canonical = stringifyBinding({ segments }, platform);
      const parsed = parseBinding(canonical, platform);
      if (!parsed.ok) return;

      setCandidate({
        canonical,
        formatted: formatBinding(parsed.value, platform),
        segments,
      });
      setAwaitingChord(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [awaitingChord, candidate, onCancel, platform]);

  const announcement = candidate
    ? conflicts.length > 0
      ? t("settings.keyboard.recordingConflictAnnouncement", {
          command: conflictDescriptor
            ? t(conflictDescriptor.titleKey)
            : conflictCommandId,
          shortcut: candidate.formatted,
        })
      : t("settings.keyboard.recordingCandidateAnnouncement", {
          shortcut: candidate.formatted,
        })
    : t("settings.keyboard.recordingHint");

  return (
    <div
      className="mx-5 mb-3 rounded-lg border border-border-strong bg-muted/40 px-3 py-3 text-xs outline-hidden focus-visible:ring-3 focus-visible:ring-primary/25"
      ref={recorderRef}
      tabIndex={-1}
    >
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          {candidate
            ? t("settings.keyboard.recordingCandidate")
            : t("settings.keyboard.recordingHint")}
        </span>
        {candidate ? (
          <KeybindingHint
            binding={candidate.formatted}
            respectPreference={false}
            state={conflicts.length > 0 ? "conflict" : "default"}
          />
        ) : null}
      </div>
      {conflictDescriptor ? (
        <div className="mt-2 rounded-md bg-status-danger-soft px-2.5 py-2 text-status-danger">
          <p>
            {t("settings.keyboard.conflictWith", {
              command: t(conflictDescriptor.titleKey),
            })}
          </p>
          <button
            className="mt-1 underline underline-offset-2"
            data-recorder-action
            onClick={() => onJumpToConflict(conflictDescriptor.id)}
            type="button"
          >
            {t("settings.keyboard.jumpToConflict")}
          </button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {candidate ? (
          <>
            <Button
              data-recorder-action
              onClick={() => onRecorded(candidate.canonical)}
              ref={confirmRef}
              size="sm"
            >
              {conflicts.length > 0
                ? t("settings.keyboard.saveAnyway")
                : t("settings.keyboard.saveShortcut")}
            </Button>
            {candidate.segments.length === 1 ? (
              <Button
                data-recorder-action
                onClick={() => {
                  setAwaitingChord(true);
                  requestAnimationFrame(() => recorderRef.current?.focus());
                }}
                size="sm"
                variant="outline"
              >
                {t("settings.keyboard.addChord")}
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            data-recorder-action
            onClick={() => {
              const parsed = parseBinding("escape", platform);
              if (!parsed.ok) return;
              setCandidate({
                canonical: "escape",
                formatted: formatBinding(parsed.value, platform),
                segments: parsed.value.segments,
              });
            }}
            size="sm"
            variant="ghost"
          >
            {t("settings.keyboard.bindEscape")}
          </Button>
        )}
        <Button
          data-recorder-action
          onClick={onCancel}
          size="sm"
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
