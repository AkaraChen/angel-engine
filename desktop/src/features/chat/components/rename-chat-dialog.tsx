import {
  type FormEventHandler,
  type ReactElement,
  useId,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Chat } from "@/shared/chat";

type RenameChatDialogProps = {
  chat: Chat | null;
  isSaving: boolean;
  onClose: () => void;
  onRename: (chat: Chat, title: string) => Promise<void> | void;
};

export function RenameChatDialog({
  chat,
  isSaving,
  onClose,
  onRename,
}: RenameChatDialogProps): ReactElement {
  return (
    <Dialog open={Boolean(chat)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
        </DialogHeader>
        {chat ? (
          <RenameChatForm
            chat={chat}
            isSaving={isSaving}
            key={chat.id}
            onClose={onClose}
            onRename={onRename}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameChatForm({
  chat,
  isSaving,
  onClose,
  onRename,
}: {
  chat: Chat;
  isSaving: boolean;
  onClose: () => void;
  onRename: (chat: Chat, title: string) => Promise<void> | void;
}) {
  const titleInputId = useId();
  const [title, setTitle] = useState(() => chat.title);
  const normalizedTitle = normalizeTitleInput(title);
  const canSubmit = Boolean(normalizedTitle) && normalizedTitle !== chat.title;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (!canSubmit || isSaving) return;

    void Promise.resolve(onRename(chat, normalizedTitle))
      .then(onClose)
      .catch(() => {
        // The caller owns user-facing error reporting.
      });
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor={titleInputId}>
          Name
        </label>
        <Input
          autoFocus
          disabled={isSaving}
          id={titleInputId}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </div>
      <DialogFooter>
        <Button
          disabled={isSaving}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={!canSubmit || isSaving} type="submit">
          {isSaving ? "Saving" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function normalizeTitleInput(title: string) {
  return title.replace(/\s+/g, " ").trim();
}
