import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/render';
import Register from './Register';

const apply = vi.fn();

vi.mock('@/services/platform.service', () => ({
  registerService: { apply: (...args: unknown[]) => apply(...args) },
}));

const field = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /send application/i });

const fill = (over: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    'Business name': 'Northwind Apparel',
    'First name': 'Priya',
    'Last name': 'Raman',
    Email: 'priya@northwind.example',
    Password: 'a-long-enough-one',
    ...over,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(field(new RegExp(`^${label}`, 'i')), { target: { value } });
  }
};

describe('applying for a store', () => {
  beforeEach(() => {
    apply.mockReset();
    apply.mockResolvedValue({ received: true });
  });

  /**
   * The address becomes a permanent hostname, so it is suggested from the
   * business name and then left alone — a later edit to the name must not
   * silently move an address the applicant has already read and approved.
   */
  it('suggests the address from the business name, then stops', () => {
    render(<Register />);
    fireEvent.change(field(/^business name/i), { target: { value: 'Northwind Apparel' } });
    expect(field(/^store address/i).value).toBe('northwind-apparel');

    fireEvent.change(field(/^business name/i), { target: { value: 'Something Else' } });
    expect(field(/^store address/i).value).toBe('northwind-apparel');
  });

  it('normalises whatever is typed into the address', () => {
    render(<Register />);
    fireEvent.change(field(/^store address/i), { target: { value: 'North Wind!! Apparel' } });
    expect(field(/^store address/i).value).toBe('north-wind-apparel');
  });

  it('will not send until every required field is right', () => {
    render(<Register />);
    expect(submit()).toBeDisabled();

    fill({ Password: 'short' });
    expect(submit()).toBeDisabled();

    fill();
    expect(submit()).toBeEnabled();
  });

  it('sends what was typed, trimmed, with the optional fields omitted', async () => {
    render(<Register />);
    fill({ 'Business name': '  Northwind Apparel  ' });
    fireEvent.click(submit());

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledWith({
      businessName: 'Northwind Apparel',
      slug: 'northwind-apparel',
      businessCategory: undefined,
      firstName: 'Priya',
      lastName: 'Raman',
      email: 'priya@northwind.example',
      phone: undefined,
      password: 'a-long-enough-one',
      message: undefined,
      honeypot: '',
    });
  });

  /**
   * The confirmation has to say that nothing exists yet. A form that looks like
   * a sign-up and behaves like an application is the one that produces "where
   * is my store" an hour later.
   */
  it('confirms it is an application, not a store', async () => {
    render(<Register />);
    fill();
    fireEvent.click(submit());

    expect(await screen.findByText(/we have your application/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is reserved until it is approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send application/i })).not.toBeInTheDocument();
  });

  it('shows the server’s own refusal and keeps what was typed', async () => {
    apply.mockRejectedValue({ message: 'That store address is already taken.' });
    render(<Register />);
    fill();
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That store address is already taken.',
    );
    expect(field(/^business name/i).value).toBe('Northwind Apparel');
  });

  /** It is a password field, and the reveal is opt-in. */
  it('hides the password until asked', () => {
    render(<Register />);
    expect(field(/^password/i)).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(field(/^password/i)).toHaveAttribute('type', 'text');
  });

  it('keeps the honeypot out of the tab order and off the screen', () => {
    render(<Register />);
    const honeypot = screen.getByLabelText(/leave this empty/i);
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
