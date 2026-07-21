/**
 * Parse a `ReadableStream` of an SSE (`text/event-stream`) response and yield
 * the JSON-decoded `data:` payload of each event. Per the SSE spec, events are
 * separated by a blank line and multiple `data:` lines within one event are
 * joined with `\n`. Tolerates chunk boundaries splitting a line. Exported for
 * testing the parser in isolation.
 */
export async function* readSseEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  function consumeLine(line: string): void {
    if (line.startsWith("data:"))
      dataLines.push(line.slice(5).replace(/^ /, ""));
    // Other SSE fields (`event:`, `id:`, comments) carry no payload we need;
    // the event type is redundant with the `type` inside the JSON `data`.
  }

  function* flush(): Generator<unknown> {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    if (payload.length > 0) yield JSON.parse(payload);
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length === 0) yield* flush();
        else consumeLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  // Handle a final event that was not terminated by a blank line.
  if (buffer.length > 0) consumeLine(buffer.replace(/\r$/, ""));
  yield* flush();
}
