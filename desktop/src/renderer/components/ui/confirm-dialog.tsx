import type * as React from "react";

import is from "@sindresorhus/is";
import { create } from "zustand";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./button";

/**
 * One in-app replacement for `window.confirm` and the main process'
 * `dialog.showMessageBox`. Native message boxes freeze the renderer, ignore the
 * app's theme, and cannot be styled or tested; this keeps every prompt inside
 * the same shadcn `Dialog` surface as the rest of the product.
 *
 * The queue lives in a module-level store rather than React context so that
 * plain async helpers outside the component tree (window-close guards, store
 * actions) can await a prompt without threading a hook through their callers.
 */
export interface ConfirmDialogAction<Value extends string = string> {
  /** Rendered as a plain `Button`; the last action is the primary one. */
  label: string;
  tone?: "danger" | "default" | "neutral";
  value: Value;
}

export interface ConfirmDialogRequest<Value extends string = string> {
  actions: ConfirmDialogAction<Value>[];
  /**
   * Returned when the user dismisses with Escape, the overlay, or the close
   * button — the equivalent of a native message box' `cancelId`.
   */
  cancelValue: Value;
  description?: React.ReactNode;
  title: string;
}

interface PendingConfirm {
  id: string;
  request: ConfirmDialogRequest;
  resolve: (value: string) => void;
}

interface ConfirmDialogStore {
  pending: PendingConfirm[];
  push: (entry: PendingConfirm) => void;
  settle: (id: string, value: string) => void;
}

const useConfirmDialogStore = create<ConfirmDialogStore>((set) => ({
  pending: [],
  push: (entry) => {
    set((state) => ({ pending: [...state.pending, entry] }));
  },
  settle: (id, value) => {
    set((state) => {
      const entry = state.pending.find((candidate) => candidate.id === id);
      if (entry === undefined) return state;

      entry.resolve(value);
      return {
        pending: state.pending.filter((candidate) => candidate.id !== id),
      };
    });
  },
}));

/**
 * Prompts the user and resolves with the chosen action value. Prompts raised
 * while another is open queue up instead of stacking overlays.
 */
export function requestConfirm<Value extends string>(
  request: ConfirmDialogRequest<Value>,
): Promise<Value> {
  return new Promise<Value>((resolve) => {
    useConfirmDialogStore.getState().push({
      id: crypto.randomUUID(),
      request: request as ConfirmDialogRequest,
      resolve: resolve as (value: string) => void,
    });
  });
}

/** `window.confirm` shaped helper for the common two-button case. */
export async function confirmAction({
  cancelLabel,
  confirmLabel,
  description,
  title,
  tone = "default",
}: {
  cancelLabel: string;
  confirmLabel: string;
  description?: React.ReactNode;
  title: string;
  tone?: "danger" | "default";
}) {
  const value = await requestConfirm({
    actions: [
      { label: cancelLabel, tone: "neutral", value: "cancel" },
      { label: confirmLabel, tone, value: "confirm" },
    ],
    cancelValue: "cancel",
    description,
    title,
  });

  return value === "confirm";
}

function actionButtonVariant(action: ConfirmDialogAction, isPrimary: boolean) {
  if (action.tone === "danger") return "destructive" as const;
  if (action.tone === "neutral" || !isPrimary) return "outline" as const;
  return "default" as const;
}

/**
 * Renders the currently pending prompt. Mounted once per window, next to
 * `ToastProvider`.
 */
export function ConfirmDialogHost() {
  const pending = useConfirmDialogStore((state) => state.pending);
  const settle = useConfirmDialogStore((state) => state.settle);
  const current = pending.at(0);

  if (current === undefined) return null;

  const { actions, cancelValue, description, title } = current.request;

  return (
    <Dialog
      key={current.id}
      onOpenChange={(open) => {
        if (!open) settle(current.id, cancelValue);
      }}
      open
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {is.falsy(description) ? null : (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          {actions.map((action, index) => (
            <Button
              autoFocus={index === actions.length - 1}
              key={action.value}
              onClick={() => {
                settle(current.id, action.value);
              }}
              type="button"
              variant={actionButtonVariant(
                action,
                index === actions.length - 1,
              )}
            >
              {action.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
