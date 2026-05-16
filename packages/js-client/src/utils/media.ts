export interface ParsedDataUrl {
  data: string;
  mimeType: string;
}

export function imageDataUrl(data: string, mimeType: string): string {
  return `data:${mimeType};base64,${data}`;
}

export function parseDataUrl(value: string): ParsedDataUrl | undefined {
  const match = /^data:([^;,]+)(?:;[^,]*)*;base64,(.*)$/i.exec(value);
  if (!match) return undefined;
  const [, mimeType, data] = match;
  if (!mimeType || !data) return undefined;
  return { data, mimeType };
}

export function parseImageDataUrl(value: string): ParsedDataUrl | undefined {
  const parsed = parseDataUrl(value);
  if (!parsed) return undefined;
  const { data, mimeType } = parsed;
  if (!mimeType.startsWith("image/") || !data) return undefined;
  return { data, mimeType };
}
