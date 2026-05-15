import type { SendTextRequest } from "@angel-engine/client-napi";
import { ClientInputType } from "@angel-engine/client-napi";

export type ClientInput = NonNullable<SendTextRequest["input"]>[number];
export { ClientInputType };
