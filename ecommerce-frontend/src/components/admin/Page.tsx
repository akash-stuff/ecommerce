/** Shared admin page chrome, so every screen has the same rhythm. */
export function Page({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink-950">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-card bg-ink-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-card border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
