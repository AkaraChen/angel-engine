import {
  createDaemonClient,
  DaemonRequestError,
} from "@angel-engine/daemon-client";

import { fetchDaemon } from "./supervisor";

/**
 * The main process's daemon client. The transport resolves the supervised
 * connection per request; when no daemon is connected it fails with the
 * client's `unavailable` error.
 */
export const daemonClient = createDaemonClient({
  baseUrl: "",
  fetch: async (url, init) => {
    const response = await fetchDaemon(url, init);
    if (response === undefined) throw DaemonRequestError.unavailable();
    return response;
  },
});
