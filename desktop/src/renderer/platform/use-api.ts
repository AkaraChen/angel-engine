import { useMemo } from "react";

import { getApiClient } from "@/platform/api-client";

export function useApi() {
  return useMemo(() => getApiClient(), []);
}
