import type { ComponentProps } from "react";
import { SpinnerGap as Loader2Icon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/platform/utils";

function Spinner({ className, ...props }: ComponentProps<typeof Loader2Icon>) {
  const { t } = useTranslation();

  return (
    <Loader2Icon
      role="status"
      aria-label={t("common.loading")}
      // Azure stroke standalone, but inside a button it has to inherit the
      // button's own foreground or it disappears against a filled CTA.
      className={cn(
        `
          size-4 animate-spin text-primary
          in-data-[slot=button]:text-current
        `,
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
