import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/render';
import Landing from './Landing';

const send = vi.fn();

vi.mock('@/services/platform.service', () => ({
  contactService: { send: (...args: unknown[]) => send(...args) },
}));

const field = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /send message/i });

const fill = (values: { name?: string; email?: string; message?: string; phone?: string; business?: string }) => {
  if (values.name !== undefined) fireEvent.change(field(/your name/i), { target: { value: values.name } });
  if (values.email !== undefined) fireEvent.change(field(/^email/i), { target: { value: values.email } });
  if (values.phone !== undefined) fireEvent.change(field(/mobile/i), { target: { value: values.phone } });
  if (values.business !== undefined) fireEvent.change(field(/business/i), { target: { value: values.business } });
  if (values.message !== undefined) {
    fireEvent.change(screen.getByLabelText(/how can we help/i), { target: { value: values.message } });
  }
};

const valid = {
  name: 'Priya Raman',
  email: 'priya@northwind.example',
  message: 'We run four shops and would like a demo.',
};

describe('the contact form on the landing page', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ sent: true });
  });

  /**
   * The server refuses a short message and a malformed address. The button
   * mirroring that is what stops the first thing a visitor does on this page
   * being read an error.
   */
  it('will not send until there is a name, an address and something to say', () => {
    render(<Landing />);
    expect(submit()).toBeDisabled();

    fill({ name: 'Priya Raman', email: 'priya@' , message: 'too short' });
    expect(submit()).toBeDisabled();

    fill({ email: valid.email, message: valid.message });
    expect(submit()).toBeEnabled();
  });

  it('sends what was typed, trimmed', async () => {
    render(<Landing />);
    fill({ ...valid, name: '  Priya Raman  ', phone: ' +91 80 4000 1234 ' });
    fireEvent.click(submit());

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith({
      name: 'Priya Raman',
      email: valid.email,
      phone: '+91 80 4000 1234',
      company: undefined,
      message: valid.message,
      honeypot: '',
    });
  });

  /**
   * Replaced, not appended. A filled form left under a "thank you" is how one
   * enquiry becomes three.
   */
  it('replaces the form with a confirmation naming the address it will reply to', async () => {
    render(<Landing />);
    fill(valid);
    fireEvent.click(submit());

    expect(await screen.findByText(/thank you/i)).toBeInTheDocument();
    expect(screen.getByText(valid.email)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();
  });

  it('shows the server’s own refusal and keeps what was typed', async () => {
    send.mockRejectedValue({ message: 'We could not send that just now.' });
    render(<Landing />);
    fill(valid);
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send that just now.');
    expect(field(/your name/i).value).toBe(valid.name);
  });

  it('keeps the honeypot out of the tab order and off the screen', () => {
    render(<Landing />);
    const honeypot = screen.getByLabelText(/leave this empty/i);
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

/**
 * The images are dropped into `public/marketing/` after this code ships, so the
 * page has to be presentable while they are absent — a broken-image icon in the
 * hero is worse than no image at all.
 */
describe('the landing page image slots', () => {
  const hero = () => screen.getByAltText(/laptop showing the platform console/i);

  it('falls back to a labelled panel naming the file it wants', () => {
    render(<Landing />);
    fireEvent.error(hero());

    expect(screen.getByText('The console on a laptop, on a desk')).toBeInTheDocument();
    expect(screen.getByText(/\/marketing\/hero\.jpg/)).toBeInTheDocument();
  });

  it('reserves each slot’s space before the file loads', () => {
    render(<Landing />);
    expect(hero()).toHaveAttribute('width', '1600');
    expect(hero()).toHaveAttribute('height', '897');
  });

  /**
   * Every photograph on the page is a file in `public/marketing/`. A slot
   * pointing at a name nobody shipped renders a placeholder in production, so
   * the four are pinned here by the paths they load.
   */
  it('asks for exactly the four files that are in the repository', () => {
    render(<Landing />);
    const sources = screen
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'))
      .filter((src) => src?.startsWith('/marketing/') && !src.includes('/customers/'));

    expect(sources).toEqual([
      '/marketing/hero.jpg',
      '/marketing/devices.jpg',
      '/marketing/storefront.jpg',
      '/marketing/brand.jpg',
    ]);
  });

  /**
   * The "Trusted by Businesses Worldwide" band is gone. It was five empty logo
   * slots, and an empty proof band is worse than no proof band — it advertises
   * that there is nothing to show.
   */
  it('makes no claim about who the customers are', () => {
    render(<Landing />);
    expect(screen.queryByText(/trusted by/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/business trading on the platform/i)).not.toBeInTheDocument();
  });
});

/**
 * The logo drew itself in `text-white` on a `bg-leaf-600` tile once, and every
 * state where that one background class was missing — a stale Tailwind build, a
 * CSS chunk that did not load — rendered it white on white and it was simply
 * gone. It now paints itself, and these pin that it stays that way.
 */
describe('the logo', () => {
  const bags = () => document.querySelectorAll('svg rect[mask]');

  it('carries its own colour rather than inheriting one', () => {
    const { container } = render(<Landing />);
    expect(bags().length).toBeGreaterThan(0);
    bags().forEach((bag) => {
      expect(bag.getAttribute('fill')).toMatch(/^#[0-9a-f]{6}$/i);
    });
    // And the wordmark's coloured half agrees with it, inline for the same reason.
    const store = container.querySelector('span[style*="color"]');
    expect(store).toHaveTextContent('store');
  });

  /**
   * Same failure, the other control it can hit. A Tailwind class the config has
   * not generated produces no declarations at all, so `bg-leaf-700` on a white
   * page is an invisible button rather than an error. The primary action and
   * the fields take their colour from index.css instead — these pin that.
   */
  it('colours the primary action from the stylesheet, not a theme class', () => {
    render(<Landing />);
    const buttons = screen.getAllByRole('link', { name: /get started/i });

    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      // Two variants: green on light, and its inverse on the dark band.
      expect(button.className).toMatch(/\bcta-(primary|on-dark)\b/);
      // Neither may go back to taking its colour from the generated palette.
      expect(button.className).not.toMatch(/\b(bg|text)-leaf-\d/);
    });
  });

  it('gives the fields the class that carries the green focus ring', () => {
    render(<Landing />);
    [/your name/i, /^email/i, /mobile/i, /business/i, /how can we help/i].forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveClass('field-leaf');
    });
  });

  it('gives every instance its own mask, with no colon in the id', () => {
    render(<Landing />);
    const ids = [...document.querySelectorAll('svg mask')].map((m) => m.id);

    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
    // `url(#:r1:)` is not a valid reference; the mask is ignored and the bag
    // loses its smile without anything erroring.
    ids.forEach((id) => expect(id).not.toContain(':'));
  });
});

describe('the landing page navigation', () => {
  /**
   * Every destination on this page has to exist.
   *
   * "Get Started" now goes to the application form — registering asks for a
   * store and a person decides it, which is a real destination where a sign-up
   * would not have been. Pricing is still absent: plan prices are
   * super-admin-only and the link would go nowhere.
   */
  it('points Get Started at the application form', () => {
    render(<Landing />);
    const links = screen.getAllByRole('link', { name: /get started/i });

    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/register'));
  });

  it('offers no link to a page that is not there', () => {
    render(<Landing />);
    expect(screen.queryByRole('link', { name: /^pricing$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^resources$/i })).not.toBeInTheDocument();
  });

  it('keeps sign-in reachable for people who already have a store', () => {
    render(<Landing />);
    const signIn = screen.getAllByRole('link', { name: /^sign in$/i });
    expect(signIn.length).toBeGreaterThan(0);
    signIn.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('opens and closes the small-screen menu', () => {
    render(<Landing />);
    const toggle = screen.getByRole('button', { name: /open menu/i });

    expect(screen.queryByRole('navigation', { name: /expanded/i })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('navigation', { name: /expanded/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    expect(screen.queryByRole('navigation', { name: /expanded/i })).not.toBeInTheDocument();
  });
});
