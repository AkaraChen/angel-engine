import type { ComponentProps, FC } from "react";

import is from "@sindresorhus/is";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useKeybindingHintsStore } from "@/features/keybindings/keybinding-hints-store";
import { cn } from "@/platform/utils";

type KeybindingHintProps = Omit<ComponentProps<typeof KbdGroup>, "children"> & {
  binding?: string;
  state?: "conflict" | "default" | "modified";
  respectPreference?: boolean;
};

const KeybindingHint: FC<KeybindingHintProps> = ({
  binding,
  className,
  state = "default",
  respectPreference = true,
  ...props
}) => {
  const keybindingHintsEnabled = useKeybindingHintsStore(
    (state) => state.enabled,
  );

  if (
    !is.nonEmptyString(binding) ||
    (respectPreference && !keybindingHintsEnabled)
  ) {
    return null;
  }

  const chords = splitKeybindingDisplay(binding);
  const isWindowsStyle = binding.includes("+");

  return (
    <KbdGroup
      aria-hidden="true"
      className={cn("shrink-0", className)}
      data-slot="keybinding-hint"
      {...props}
    >
      {chords.map((chord, chordIndex) => (
        <span
          className="inline-flex items-center gap-1.5"
          key={`${chord.join("-")}-${chordIndex}`}
        >
          {chord.map((key, keyIndex) => (
            <span
              className="inline-flex items-center gap-1.5"
              key={`${key}-${keyIndex}`}
            >
              {isWindowsStyle && keyIndex > 0 ? (
                <span className="text-[0.65rem] text-muted-foreground">+</span>
              ) : null}
              <Kbd
                className={cn(
                  state === "conflict" &&
                    "border-status-danger bg-status-danger-soft text-status-danger",
                  state === "modified" &&
                    "border-status-warning-border bg-status-warning-soft",
                )}
              >
                {key}
              </Kbd>
            </span>
          ))}
          {chordIndex < chords.length - 1 ? (
            <span className="px-0.5 text-[0.65rem] text-muted-foreground">
              →
            </span>
          ) : null}
        </span>
      ))}
    </KbdGroup>
  );
};

const MAC_MODIFIERS = new Set(["⌃", "⌥", "⇧", "⌘"]);

export function splitKeybindingDisplay(binding: string): string[][] {
  return binding
    .trim()
    .split(/\s+/)
    .map((chord) => {
      if (chord.includes("+")) return chord.split("+").filter(Boolean);

      const characters = Array.from(chord);
      const keys: string[] = [];
      let index = 0;
      while (
        index < characters.length &&
        MAC_MODIFIERS.has(characters[index]!)
      ) {
        keys.push(characters[index]!);
        index += 1;
      }
      const key = characters.slice(index).join("");
      if (key) keys.push(key);
      return keys.length > 0 ? keys : [chord];
    });
}

export { KeybindingHint };
export type { KeybindingHintProps };
