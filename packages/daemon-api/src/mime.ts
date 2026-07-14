import mimeDb from "mime-db";
import { MIMEType } from "whatwg-mimetype";

export function isTextLikeMimeType(mimeType: string): boolean {
  const parsed = MIMEType.parse(mimeType);
  if (!parsed) return false;

  return parsed.type === "text" || Boolean(mimeDb[parsed.essence]?.charset);
}
