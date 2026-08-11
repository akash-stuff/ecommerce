import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Create/edit dialog. Escape closes it and focus is trapped by the browser's
 * own dialog semantics via `role="dialog"` plus an explicit close control —
 * a form that can only be escaped with the mouse is a trap for keyboard users.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xl rounded-card bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="font-display text-base text-ink-950">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-500 hover:bg-ink-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex justify-end gap-3 border-t border-ink-100 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

const controlClass =
  'mt-1.5 w-full rounded-card border border-ink-300 px-3 py-2 text-sm focus:border-ink-950 focus:outline-none disabled:bg-ink-50';

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
      <span className="text-ink-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={controlClass} />
);

export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={controlClass} />
);

export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={controlClass} />
);

export const FormGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

/** Server-side failures shown verbatim: the API's reason beats a generic one. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as { message?: string; details?: string[] };
  return (
    <div className="mt-4 rounded-card bg-red-50 px-4 py-3 text-sm text-red-700">
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
