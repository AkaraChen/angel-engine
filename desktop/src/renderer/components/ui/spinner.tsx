import type { ComponentProps } from "react";
import { RiLoader4Line as Loader2Icon } from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/platform/utils";

function Spinner({ className, ...props }: ComponentProps<typeof Loader2Icon>) {
  const { t } = useTranslation();

  return (
    <Loader2Icon
      role="status"
      aria-label={t("common.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
