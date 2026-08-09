import type { ComponentProps, FC } from "react";

import is from "@sindresorhus/is";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useKeybindingHintsStore } from "@/features/keybindings/keybinding-hints-store";
import { cn } from "@/platform/utils";

type KeybindingHintProps = Omit<ComponentProps<typeof KbdGroup>, "children"> & {
  binding?: string;
  respectPreference?: boolean;
};

const KeybindingHint: FC<KeybindingHintProps> = ({
  binding,
  className,
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

  const chords = binding.trim().split(/\s+/);

  return (
    <KbdGroup
      aria-hidden="true"
      className={cn("shrink-0", className)}
      data-slot="keybinding-hint"
      {...props}
    >
      {chords.map((chord, index) => (
        <Kbd key={`${chord}-${index}`}>{chord}</Kbd>
      ))}
    </KbdGroup>
  );
};

export { KeybindingHint };
export type { KeybindingHintProps };
