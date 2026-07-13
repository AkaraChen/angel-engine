import type { ReactNode } from "react";
import {
  Check,
  CaretDown as ChevronDown,
  MagnifyingGlass as Search,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const composerModelMenuTriggerClassName =
  "h-8 min-w-0 gap-1.5 rounded-md px-2 text-xs font-medium text-foreground focus-visible:!border-transparent focus-visible:!ring-0 hover:bg-overlay-hover aria-expanded:bg-overlay-active";
export const composerModelMenuValueClassName =
  "min-w-0 max-w-28 truncate text-muted-foreground";
export const composerNativeMenuClassName =
  "flex flex-col p-1 data-open:zoom-in-100 data-closed:zoom-out-100 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0 data-[side=top]:slide-in-from-bottom-0";
export const composerNativeMenuLabelClassName =
  "px-2 pb-1 pt-1 text-[11px] font-medium leading-4 text-muted-foreground/80";

export function ComposerModelMenuChevron() {
  return (
    <ChevronDown
      className="
        size-3.5 shrink-0 text-muted-foreground/80 transition-transform
        duration-150
        group-data-[state=open]/button:rotate-180
      "
      weight="regular"
    />
  );
}

export function ComposerModelMenuSearch({
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

export function ComposerModelMenuSub({
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

export function ComposerModelMenuItem({
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
        {selected ? <Check className="size-3" weight="regular" /> : null}
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
