import { useState } from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@/test/render';
import { CodeInput } from './CodeInput';

/**
 * The component is controlled, so the tests drive it through a small stateful
 * host rather than asserting on a value that can never change.
 */
function Harness({ attempt = 0, invalid = false }: { attempt?: number; invalid?: boolean }) {
  const [code, setCode] = useState('');
  return <CodeInput value={code} onChange={setCode} attempt={attempt} invalid={invalid} />;
}

const field = () => screen.getByLabelText('Verification code') as HTMLInputElement;
const cells = (container: HTMLElement) => container.querySelectorAll('.otp-cell');

describe('the verification code field', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  /**
   * The whole reason this is one input behind six boxes. A screen reader must
   * find a single labelled field, not six anonymous ones, and iOS and Android
   * only offer the code from the notification to a field that asks for it.
   */
  it('is one labelled field, not six', () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(field()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field()).toHaveAttribute('inputmode', 'numeric');
  });

  it('draws one box per digit', () => {
    const { container } = render(<Harness />);
    expect(cells(container)).toHaveLength(6);
  });

  it('shows each digit in its own box as it is typed', () => {
    const { container } = render(<Harness />);
    fireEvent.change(field(), { target: { value: '408' } });

    const boxes = cells(container);
    expect(boxes[0]).toHaveTextContent('4');
    expect(boxes[1]).toHaveTextContent('0');
    expect(boxes[2]).toHaveTextContent('8');
    expect(boxes[3]).toHaveTextContent('');
  });

  /** A code copied out of an email arrives with a space in the middle. */
  it('accepts a pasted code that has been spaced for reading', () => {
    const { container } = render(<Harness />);
    fireEvent.change(field(), { target: { value: '408 215' } });

    expect(field().value).toBe('408215');
    expect(cells(container)[5]).toHaveTextContent('5');
  });

  it('ignores anything that is not a digit, and stops at six', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: 'abc4d0e8x2y1z5s9' } });
    expect(field().value).toBe('408215');
  });

  /**
   * Backspace is the platform's, not ours. The test is really asserting that
   * nothing in the component intercepts it.
   */
  it('deletes from the end without any handling of its own', () => {
    const { container } = render(<Harness />);
    fireEvent.change(field(), { target: { value: '408215' } });
    fireEvent.change(field(), { target: { value: '40821' } });

    expect(field().value).toBe('40821');
    expect(cells(container)[5]).toHaveTextContent('');
  });

  it('keeps a leading zero, which a number input would eat', () => {
    const { container } = render(<Harness />);
    fireEvent.change(field(), { target: { value: '019473' } });
    expect(field().value).toBe('019473');
    expect(cells(container)[0]).toHaveTextContent('0');
  });

  describe('the caret', () => {
    it('marks the box being typed into, once the field has focus', () => {
      const { container } = render(<Harness />);
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: '40' } });

      expect(cells(container)[2]).toHaveClass('otp-cell-active');
      expect(container.querySelectorAll('.otp-caret')).toHaveLength(1);
    });

    /** Otherwise it would run off the end into a box that does not exist. */
    it('stays on the last box when the code is full', () => {
      const { container } = render(<Harness />);
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: '408215' } });

      expect(cells(container)[5]).toHaveClass('otp-cell-active');
      // No caret: the box has a digit in it.
      expect(container.querySelectorAll('.otp-caret')).toHaveLength(0);
    });

    it('goes away when the field loses focus', () => {
      const { container } = render(<Harness />);
      // The field takes focus on mount: the shopper has just been told to enter
      // a code, so the box they must type into is the one that should be lit.
      expect(container.querySelectorAll('.otp-caret')).toHaveLength(1);

      fireEvent.blur(field());
      expect(container.querySelectorAll('.otp-caret')).toHaveLength(0);
      expect(cells(container)[0]).not.toHaveClass('otp-cell-active');
    });
  });

  describe('the sweep when a code arrives all at once', () => {
    /**
     * Typing and autofill are told apart deliberately: the staggered sweep is a
     * flourish when the platform catches a code, and reads as lag when applied
     * to somebody's own keystrokes.
     */
    it('runs when six digits land in one change', () => {
      const { container } = render(<Harness />);
      fireEvent.change(field(), { target: { value: '408215' } });
      expect(container.querySelector('.otp')).toHaveClass('otp-bulk');
    });

    it('does not run while a digit is typed at a time', () => {
      const { container } = render(<Harness />);
      for (const value of ['4', '40', '408']) {
        fireEvent.change(field(), { target: { value } });
      }
      expect(container.querySelector('.otp')).not.toHaveClass('otp-bulk');
    });

    it('clears itself so a later edit is not still sweeping', () => {
      const { container } = render(<Harness />);
      fireEvent.change(field(), { target: { value: '408215' } });
      act(() => vi.advanceTimersByTime(700));
      expect(container.querySelector('.otp')).not.toHaveClass('otp-bulk');
    });
  });

  describe('a refused code', () => {
    it('shakes the boxes', () => {
      const { container, rerender } = render(<Harness attempt={0} />);
      expect(container.querySelector('.otp')).not.toHaveClass('otp-shake');

      rerender(<Harness attempt={1} />);
      expect(container.querySelector('.otp')).toHaveClass('otp-shake');
    });

    /**
     * The reason the parent passes a count rather than a boolean: on a second
     * wrong code an `invalid` flag is already true, nothing changes, and the
     * shopper gets no acknowledgement that the retry failed too.
     */
    it('shakes again when the next attempt also fails', () => {
      const { container, rerender } = render(<Harness attempt={1} />);
      act(() => vi.advanceTimersByTime(500));
      expect(container.querySelector('.otp')).not.toHaveClass('otp-shake');

      rerender(<Harness attempt={2} />);
      expect(container.querySelector('.otp')).toHaveClass('otp-shake');
    });

    it('marks the field invalid for assistive technology', () => {
      render(<Harness invalid />);
      expect(field()).toHaveAttribute('aria-invalid', 'true');
    });

    it('reddens every box rather than only the last one', () => {
      const { container } = render(<Harness invalid />);
      for (const cell of cells(container)) {
        expect(cell).toHaveClass('otp-cell-invalid');
      }
    });
  });

  /** Terse on purpose: a live region that read the digits back would say the
      code out loud in a room. */
  it('reports progress without reading the code aloud', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '408' } });

    const status = screen.getByText('3 of 6 digits entered');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).not.toHaveTextContent('408');
  });

  it('hides the decorative boxes from assistive technology', () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('.otp-cells')).toHaveAttribute('aria-hidden', 'true');
  });
});
