import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Shared admin page chrome, so every screen has the same rhythm.
 *
 * The header sticks. Admin screens are long — a 90-row product table, a theme
 * editor — and the primary action lives up here, so scrolling it away means
 * scrolling back up to save.
 */
export function Page({
  title,
  subtitle,
  action,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Where "up" is, for a detail screen reached from a list. */
  back?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* `top-14` clears the mobile topbar in both admin layouts, which is
          exactly that tall; from lg up the sidebar is permanent and there is no
          bar to clear. */}
      <div className="sticky top-14 z-20 border-b border-ink-100 bg-ink-50/85 backdrop-blur lg:top-0">
        <div className="mx-auto flex page-container flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-6 sm:py-6">
          <div className="min-w-0">
            {back && (
              <Link
                to={back.to}
                className="-ml-1 mb-1.5 inline-flex items-center gap-1 rounded px-1 text-xs text-ink-500 transition-colors hover:text-ink-950"
              >
                <ChevronLeft size={13} />
                {back.label}
              </Link>
            )}
            <h1 className="truncate font-display text-xl tracking-tight text-ink-950 sm:text-2xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      </div>

      <div className="mx-auto page-container px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}

/**
 * One class string for every button, so a secondary button and a destructive
 * one differ in colour and in nothing else — same height, same radius, same
 * focus treatment. Getting that wrong is what makes a toolbar look assembled
 * from parts.
 */
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-card text-sm font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-40';

const SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4',
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: keyof typeof SIZES;
};

export function PrimaryButton({ children, size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} ${SIZES[size]} bg-brand text-white shadow-glow transition-all hover:-translate-y-px hover:shadow-lifted disabled:translate-y-0 disabled:shadow-glow-sm ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} ${SIZES[size]} border border-ink-200 bg-white text-ink-900 shadow-card transition-all hover:border-brand/40 hover:bg-brand/[0.04] hover:text-brand hover:shadow-raised ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * For deletes. Outlined until hovered rather than solid red: a permanently red
 * button next to Cancel is the one people click by reflex, and the colour is
 * more useful as confirmation of what is about to happen than as decoration.
 */
export function DangerButton({ children, size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} ${SIZES[size]} border border-red-200 bg-white text-red-700 hover:border-red-600 hover:bg-red-600 hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

/** A card surface. Every panel on every admin screen should be this one. */
export function Card({
  title,
  description,
  action,
  className = '',
  children,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-card border border-ink-100 bg-white shadow-card transition-shadow hover:shadow-lifted ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-medium text-ink-950">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/**
 * The "nothing here yet" state, with the action that would change that.
 *
 * An empty screen with no next step is where an owner decides the software is
 * broken, so the call to action is not optional decoration.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
      {icon && (
        // Tinted with the store's own colour rather than left grey: an empty
        // screen is where an owner decides the software is broken, and a
        // washed-out mark reads as one more thing that has not loaded.
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/[0.08] text-brand ring-1 ring-inset ring-brand/10">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
