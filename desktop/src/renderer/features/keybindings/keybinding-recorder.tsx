import type { KeymapPlatform } from "@shared/keybindings";
import {
  formatBinding,
  parseBinding,
  stringifyBinding,
  type ParsedSegment,
} from "@shared/keybindings";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { resolveCandidates } from "@/platform/keymap/resolve-candidates";

export function KeybindingRecorder({
  platform,
  onRecorded,
  onCancel,
}: {
  platform: KeymapPlatform;
  onRecorded: (canonicalKey: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string>("");
  const [prefix, setPrefix] = useState<ParsedSegment | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

      if (
        event.key === "Meta" ||
        event.key === "Control" ||
        event.key === "Alt" ||
        event.key === "Shift"
      ) {
        return;
      }

      const candidates = resolveCandidates(event, platform);
      const segment = candidates[0];
      if (!segment) return;

      if (!prefix) {
        // Wait briefly for possible chord; commit single-segment after short delay
        // unless user presses second key. For v1: commit immediately on first complete key.
        // Chord: if user holds and we want two segments, they press second within 5s —
        // design says first segment shows "then…". We support chord by storing prefix
        // when first key has modifiers (common for chords like mod+k).
        setPrefix(segment);
        const single = stringifyBinding({ segments: [segment] }, platform);
        setPreview(formatBinding({ segments: [segment] }, platform));

        // Commit as single-key after 600ms if no second segment
        window.setTimeout(() => {
          setPrefix((current) => {
            if (current && segmentsLooseEqual(current, segment)) {
              onRecorded(single);
              return null;
            }
            return current;
          });
        }, 600);
        return;
      }

      const chord = stringifyBinding({ segments: [prefix, segment] }, platform);
      const parsed = parseBinding(chord, platform);
      if (parsed.ok) {
        setPreview(formatBinding(parsed.value, platform));
        onRecorded(chord);
        setPrefix(null);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel, onRecorded, platform, prefix]);

  return (
    <div
      className="mt-2 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2 text-xs"
      aria-live="polite"
    >
      <p className="text-muted-foreground">
        {t("settings.keyboard.recordingHint")}
        {preview ? ` · ${preview}` : ""}
        {prefix && !preview.includes(" ")
          ? ` ${t("settings.keyboard.recordingChordThen")}`
          : ""}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => onRecorded("escape")}
        >
          {t("settings.keyboard.bindEscape")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

function segmentsLooseEqual(a: ParsedSegment, b: ParsedSegment) {
  return (
    a.key === b.key &&
    a.mod === b.mod &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}
