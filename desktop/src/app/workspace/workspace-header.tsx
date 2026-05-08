export function WorkspaceHeader({ title }: { title: string }) {
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 border-b px-4"
      data-electron-drag
    >
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>
    </header>
  );
}
