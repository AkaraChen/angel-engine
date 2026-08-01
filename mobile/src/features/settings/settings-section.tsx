import type { PropsWithChildren, ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
}

/**
 * A titled group of setting rows, styled as a mobile-friendly card list.
 */
export function SettingsSection({
  title,
  description,
  children,
}: PropsWithChildren<SettingsSectionProps>) {
  return (
    <section className="flex flex-col gap-2">
      {/* Group labels are the one place the DNA's mono voice belongs in this
          app: a section label, not eyebrow copy (KIT-479 §0). */}
      <h2 className="px-1 font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-card shadow-xs">
        {children}
      </div>
      {description != null ? (
        <p className="px-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </section>
  );
}

interface SettingsRowProps {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
}

/**
 * A single row inside a {@link SettingsSection}. The control sits below the
 * label so wide touch targets (e.g. a segmented control) get full width.
 */
export function SettingsRow({ title, description, control }: SettingsRowProps) {
  return (
    <div className="flex min-h-touch flex-col justify-center gap-2 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description != null ? (
          <span className="text-sm text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {control}
    </div>
  );
}
