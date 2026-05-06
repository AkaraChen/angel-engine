export function ChatRestoreLoading() {
  return (
    <div
      aria-label="Restoring chat"
      className="flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-background text-foreground"
      role="status"
    >
      <svg
        aria-hidden="true"
        className="chat-restore-mark h-24 w-64 max-w-[72vw]"
        fill="none"
        viewBox="0 0 300 112"
      >
        <text
          className="chat-restore-signature"
          dominantBaseline="middle"
          textAnchor="middle"
          x="150"
          y="58"
        >
          loading
        </text>
      </svg>
      <span className="sr-only">Restoring chat</span>
    </div>
  );
}
