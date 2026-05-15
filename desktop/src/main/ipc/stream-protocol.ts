import type { IpcMainInvokeEvent } from "electron";

import { BrowserWindow, ipcMain } from "electron";

interface ActiveStream<EventT> {
  cancel: () => void;
  send: (event: EventT) => void;
  window: BrowserWindow | null;
}

interface CreateStreamProtocolOptions<StartRequest, EventT> {
  cancelChannel: string;
  eventChannel: (streamId: string) => string;
  getStreamId: (request: StartRequest) => string;
  onCancel?: (streamId: string) => void;
  onStart: (input: {
    activeStream: ActiveStream<EventT>;
    event: IpcMainInvokeEvent;
    request: StartRequest;
    streamId: string;
  }) => void | Promise<void>;
  startChannel: string;
}

export function createStreamProtocol<StartRequest, EventT>({
  cancelChannel,
  eventChannel,
  getStreamId,
  onCancel,
  onStart,
  startChannel,
}: CreateStreamProtocolOptions<StartRequest, EventT>) {
  const activeStreams = new Map<string, ActiveStream<EventT>>();

  ipcMain.handle(startChannel, async (event, request: StartRequest) => {
    const streamId = getStreamId(request);
    const sender = event.sender;
    let cancelled = false;

    const activeStream: ActiveStream<EventT> = {
      cancel: () => {
        cancelled = true;
        activeStreams.delete(streamId);
        onCancel?.(streamId);
      },
      send: (streamEvent: EventT) => {
        if (cancelled || sender.isDestroyed()) return;
        sender.send(eventChannel(streamId), streamEvent);
      },
      window: BrowserWindow.fromWebContents(sender),
    };

    activeStreams.set(streamId, activeStream);

    await onStart({ activeStream, event, request, streamId });

    return { started: true };
  });

  ipcMain.handle(cancelChannel, (_event, streamId: unknown) => {
    if (typeof streamId !== "string" || !streamId) {
      throw new Error("Stream id is required.");
    }
    const activeStream = activeStreams.get(streamId);
    activeStream?.cancel();
    return { cancelled: Boolean(activeStream) };
  });

  return {
    activeStreams,
    delete(streamId: string) {
      activeStreams.delete(streamId);
    },
    get(streamId: string) {
      return activeStreams.get(streamId);
    },
  };
}
