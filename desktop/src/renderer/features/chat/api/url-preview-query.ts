import { queryOptions } from "@tanstack/react-query";
import { ipc } from "@/platform/ipc";
import { queryKeys } from "@/platform/query-keys";

interface UrlPreviewQueryParams {
  url: string;
}

export function urlPreviewQueryOptions({ url }: UrlPreviewQueryParams) {
  return queryOptions({
    gcTime: 10 * 60_000,
    queryFn: () => ipc.appFetchUrlPreview({ url }),
    queryKey: queryKeys.urlPreviews.detail(url),
    retry: 1,
    staleTime: Infinity,
  });
}
