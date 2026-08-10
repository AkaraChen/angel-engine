import type { FC } from "react";

import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import {
  chatAmbiguousRunQueryOptions,
  clearChatAmbiguousRunMutationOptions,
} from "@/features/chat/api/queries";
import { useApi } from "@/platform/use-api";

interface AmbiguousSendBannerProps {
  chatId: string;
}

export const AmbiguousSendBanner: FC<AmbiguousSendBannerProps> = ({
  chatId,
}) => {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const ambiguousRun = useQuery(chatAmbiguousRunQueryOptions({ api, chatId }));
  const clear = useMutation(
    clearChatAmbiguousRunMutationOptions({ api, chatId, queryClient }),
  );

  if (ambiguousRun.data?.run === null || ambiguousRun.data === undefined) {
    return null;
  }

  return (
    <div
      className="mx-3 mt-3 flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
      data-testid="ambiguous-send-banner"
      role="status"
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{t("workspace.ambiguousSend.title")}</div>
        <div className="mt-0.5 text-muted-foreground">
          {t("workspace.ambiguousSend.description")}
        </div>
        {clear.isError ? (
          <div className="mt-1 text-destructive">
            {getErrorMessage(clear.error)}
          </div>
        ) : null}
      </div>
      <Button
        data-testid="ambiguous-send-dismiss"
        disabled={clear.isPending}
        onClick={() => clear.mutate()}
        size="sm"
        variant="outline"
      >
        {t("workspace.ambiguousSend.dismiss")}
      </Button>
    </div>
  );
};
