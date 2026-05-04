import { useCallback, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SettingsTab = 'danger';

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'danger', label: 'Danger Area' },
];

export function SettingsPage({
  isDeletingChats,
  onDeleteAllChats,
}: {
  isDeletingChats: boolean;
  onDeleteAllChats: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('danger');

  const deleteAllChats = useCallback(async () => {
    const confirmed = window.confirm(
      'Delete all chats? This cannot be undone.'
    );
    if (!confirmed) return;

    await onDeleteAllChats();
  }, [onDeleteAllChats]);

  return (
    <main className="flex min-h-0 flex-1 overflow-auto">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure desktop workspace behavior.
          </p>
        </div>

        <div className="flex gap-2 border-b">
          {settingsTabs.map((tab) => (
            <button
              className={cn(
                'border-b-2 px-1 pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent'
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'danger' ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-destructive">
                  Delete all chats
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Removes every chat from the local desktop database and closes
                  active chat sessions.
                </p>
              </div>
              <Button
                disabled={isDeletingChats}
                onClick={() => void deleteAllChats()}
                type="button"
                variant="destructive"
              >
                <Trash2 />
                {isDeletingChats ? 'Deleting' : 'Delete all chats'}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
