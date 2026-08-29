import { useEffect, useId, useRef, useState } from 'react';

/**
 * Six boxes that are secretly one field.
 *
 * The obvious way to build this is six `<input>` elements, and it is a trap.
 * Paste splits across them unevenly, backspace has to be reimplemented by hand,
 * arrow keys need their own handler, and a screen reader announces six
 * unlabelled fields instead of one. Worse, the feature that actually saves
 * typing — iOS and Android offering the code straight from the notification —
 * needs a single field carrying `autocomplete="one-time-code"`.
 *
 * So there is exactly one real input. It sits over the boxes, transparent, and
 * the boxes are drawn from its value. Everything the platform gives a text
 * field for free keeps working: paste, backspace, selection, autofill, the
 * numeric keypad, and one properly-labelled control in the accessibility tree.
 * The boxes are `aria-hidden` decoration.
 *
 * ## The details that make it hold up
 *
 * The input's font-size is 16px even though its text is invisible: below 16px,
 * iOS Safari zooms the page on focus and the shopper is left scrolled sideways
 * mid-code.
 *
 * Chrome paints an autofill background that no `background-color` can override.
 * The standard defeat is a transition delay long enough never to arrive, which
 * is in the stylesheet next to the rest of this component's CSS.
 *
 * `dir="ltr"` is forced on the row. A verification code is a number and reads
 * left to right even on a page that does not.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  invalid = false,
  /**
   * Bumped by the parent on each rejected attempt. A boolean cannot express
   * "wrong again": the second wrong code leaves `invalid` already true, so
   * nothing re-triggers and the shopper gets no feedback at all.
   */
  attempt = 0,
  label = 'Verification code',
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  attempt?: number;
  label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [shaking, setShaking] = useState(false);

  /**
   * True for the moment after all six digits land at once.
   *
   * A per-cell stagger is the right flourish when someone is typing and wrong
   * when the platform fills the whole code in one go — animating six cells in
   * sequence there reads as the form struggling rather than as polish. So the
   * two cases are told apart and the sweep is used deliberately for the second.
   */
  const [bulk, setBulk] = useState(false);
  const previous = useRef(value.length);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const grew = value.length - previous.current;
    previous.current = value.length;
    if (grew < 2) return;

    setBulk(true);
    const timer = window.setTimeout(() => setBulk(false), 600);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (attempt === 0) return;
    setShaking(true);
    const timer = window.setTimeout(() => setShaking(false), 420);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  const digits = value.split('');
  const complete = value.length === length;
  // When the code is full the last box stays lit rather than the caret running
  // off the end into a box that does not exist.
  const activeIndex = complete ? length - 1 : value.length;

  return (
    <div className="block text-sm">
      <label htmlFor={id} className="text-ink-700">
        {label}
      </label>

      <div
        dir="ltr"
        className={`otp relative mt-1.5 ${shaking ? 'otp-shake' : ''} ${
          bulk ? 'otp-bulk' : ''
        }`}
      >
        <input
          ref={input}
          id={id}
          required
          // `text` with a numeric hint, not `number`: a number input strips the
          // leading zero a code can start with, and shows spinner arrows.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          disabled={disabled}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-status`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Digits only, so a pasted "123 456" arrives clean.
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
          className="otp-input"
        />

        {/* Decoration. The input above carries the label, the value and the
            validity, so announcing these too would read the code twice. */}
        <div className="otp-cells" aria-hidden="true">
          {Array.from({ length }, (_, index) => {
            const char = digits[index];
            const isActive = focused && index === activeIndex && !disabled;

            return (
              <div
                key={index}
                style={{ ['--i' as string]: index }}
                className={[
                  'otp-cell',
                  char ? 'otp-cell-filled' : '',
                  isActive ? 'otp-cell-active' : '',
                  invalid ? 'otp-cell-invalid' : '',
                  complete && !invalid ? 'otp-cell-complete' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {/* Keyed by the character, so replacing a digit remounts the
                    span and the landing animation runs again. A CSS animation
                    on a persistent node only ever plays once. */}
                {char ? (
                  <span key={`${index}-${char}`} className="otp-digit">
                    {char}
                  </span>
                ) : (
                  isActive && <span className="otp-caret" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Polite, and deliberately terse: a live region that repeats the digits
          would read the code aloud in a room. */}
      <p id={`${id}-status`} className="sr-only" aria-live="polite">
        {value.length} of {length} digits entered
      </p>
    </div>
  );
}
