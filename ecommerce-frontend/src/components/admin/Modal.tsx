import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const WIDTHS = {
  md: 'max-w-xl',
  lg: 'max-w-3xl',
} as const;

/**
 * Create/edit dialog.
 *
 * Focus is moved in on open, cycled inside while open, and returned to whatever
 * opened it on close. The browser gives none of that for a div with
 * `role="dialog"` — without it, Tab walks straight out of the form and into the
 * page behind, where the invisible sidebar links still take keyboard focus.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: keyof typeof WIDTHS;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  /**
   * The latest `onClose`, without making the effect depend on it.
   *
   * Callers pass an inline arrow — `onClose={() => setDraft(null)}` — so the
   * prop is a new function on every render. An effect that listed it as a
   * dependency re-ran on every keystroke: the cleanup returned focus to
   * whatever opened the dialog, and the re-run put it back on the *first*
   * field. Typing one character in the second field bounced the caret to the
   * first, which is the bug this ref exists to prevent.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    // First real control *in the body*, so a one-field dialog is typeable
    // immediately. Searching the whole panel would find the header's close
    // button first, since it comes earlier in the DOM — landing the caret on
    // "Close" the moment a form opens. Falls back to the panel so focus is at
    // least inside the trap.
    const first = body.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
    );
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;

      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const edge = e.shiftKey ? focusable[0] : focusable[focusable.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      opener?.focus?.();
    };
    // Mount and unmount only. Everything the handler needs that can change is
    // read through a ref, so re-running this is never necessary — and doing so
    // would move the user's caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-[2px] animate-fade-in sm:p-8"
      // Clicking the backdrop closes; clicking inside the panel must not, which
      // is why this checks the target rather than stopping propagation upward.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${WIDTHS[width]} rounded-card bg-white shadow-dialog animate-rise-in`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <div>
            <h2 className="font-display text-base text-ink-950">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded p-1 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-950"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={body} className="max-h-[68vh] overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const controlClass =
  'mt-1.5 w-full rounded-card border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 ' +
  'transition-colors placeholder:text-ink-400 hover:border-ink-300 ' +
  'focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950 ' +
  'disabled:bg-ink-50 disabled:text-ink-500';

export function Field({
  label,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium text-ink-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const Input = ({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${controlClass} ${className}`} />
);

export const Select = ({
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`${controlClass} ${className}`} />
);

export const Textarea = ({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`${controlClass} ${className}`} />
);

export const FormGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

/** Server-side failures shown verbatim: the API's reason beats a generic one. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as { message?: string; details?: string[] };
  return (
    <div
      role="alert"
      className="mt-4 rounded-card border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <p>{e.message ?? 'Something went wrong.'}</p>
      {e.details && e.details.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs">
          {e.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
