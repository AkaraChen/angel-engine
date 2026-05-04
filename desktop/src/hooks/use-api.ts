import { useMemo } from 'react';

import { getApiClient } from '@/requests/client';

export function useApi() {
  return useMemo(() => getApiClient(), []);
}
