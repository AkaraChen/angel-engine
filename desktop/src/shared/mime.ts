import { charset } from "mime-types";

export function isTextLikeMimeType(mimeType: string): boolean {
  return charset(mimeType) !== false;
}
