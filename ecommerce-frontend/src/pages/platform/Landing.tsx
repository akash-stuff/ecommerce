import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Check,
  CreditCard,
  Globe,
  ImageIcon,
  Menu,
  Package,
  Palette,
  Play,
  Puzzle,
  ShieldCheck,
  ShoppingCart,
  Store,
  SwatchBook,
  Wallet,
  X,
} from 'lucide-react';
import { Lockup } from '@/features/platform/brand';
import { contactService } from '@/services/platform.service';

/**
 * The product's own front door.
 *
 * Served at `/` on the platform and admin hostnames, where there is no tenant to
 * resolve — that address used to render "No store at this address", which is
 * accurate and useless. Tenant hostnames still get the storefront; see the root
 * route in routes/index.tsx.
 *
 * ## Its own green, not the tenant's
 *
 * Everything here is set in `leaf-*`, which is a fixed scale in the Tailwind
 * config rather than the `brand` CSS variables. `brand` is whatever store was
 * last loaded in the tab, and a marketing page that changes colour because a
 * visitor looked at a shop first is not a brand. The scale is light on purpose —
 * mint washes, pale tints behind the icons — with the darker steps reserved for
 * type and button fills, because those are the only ones that clear 4.5:1 on
 * white. See the contrast note in tailwind.config.js before reaching for a
 * lighter step for text.
 *
 * Depth comes from layered shadows and hairline borders rather than from a dark
 * backdrop, which is what stops a light page reading as an unstyled one.
 *
 * ## Every claim is one the software can keep
 *
 * A landing page that promises what the software does not do is a support
 * ticket written in advance. Two consequences worth knowing before editing:
 * there is no `Pricing` nav item because plan prices are super-admin-only and
 * the link would go nowhere, and every call to action lands on a real
 * destination — `#contact` or `/login` — because there is no public sign-up.
 */

const NAV = [
  { label: 'Home', href: '#top' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how' },
  { label: 'Contact', href: '#contact' },
];

/**
 * The four claims under the hero.
 *
 * The mockup's fourth was "24/7 Support". It is not here because it is a
 * promise about who is awake rather than about what the software does, and this
 * page cannot keep it on its own. Put it back the moment there is a rota.
 */
const ASSURANCES = [
  { icon: ShieldCheck, title: '100% White Label', body: 'Your brand, always' },
  { icon: Store, title: 'Unlimited Stores', body: 'Create & manage' },
  { icon: Wallet, title: 'Its Own Payments', body: 'Settles to the store' },
  { icon: Globe, title: 'Secure & Reliable', body: 'Isolated per tenant' },
];

/** The three things a shop keeps as its own, floated beside the hero shot. */
const WHITE_LABEL = [
  { icon: Globe, label: 'Your Domain', value: 'yourstore.com' },
  { icon: Store, label: 'Your Logo', value: 'YOUR BRAND' },
  { icon: SwatchBook, label: 'Your Theme', value: null },
];

/**
 * Six capabilities, with the mockup's titles and bodies that are true.
 *
 * The titles are the design's; the sentences under them name what this codebase
 * actually does, which is why "Powerful Integrations" lists the four it has
 * rather than gesturing at "third-party tools and services".
 *
 * `tint` is a pastel per card. Deliberately not six greens — a single hue
 * repeated six times reads as a table rather than as a set — but no blues
 * either, so nothing on the page competes with the green.
 */
const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'Store Management',
    body: 'Create unlimited online stores and manage every one of them from a single console.',
    tint: 'bg-leaf-100 text-leaf-700',
  },
  {
    icon: Palette,
    title: 'Custom Branding',
    body: 'Logo, favicon, colours, fonts and homepage layout, picked per store and changed at any time.',
    tint: 'bg-rose-100 text-rose-600',
  },
  {
    icon: Package,
    title: 'Product Management',
    body: 'Products, variants, categories and an append-only stock ledger that cannot be oversold.',
    tint: 'bg-emerald-100 text-emerald-700',
  },
  {
    icon: CreditCard,
    title: 'Multiple Payment Options',
    body: 'Cash on delivery and Razorpay, connected per store so takings settle into its own bank account.',
    tint: 'bg-teal-100 text-teal-700',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    body: 'Revenue, orders and best sellers — per store or across the platform, and exportable as CSV.',
    tint: 'bg-amber-100 text-amber-700',
  },
  {
    icon: Puzzle,
    title: 'Powerful Integrations',
    body: 'Razorpay, SMTP, SMS and WhatsApp connect per store, with every attempt logged and retryable.',
    tint: 'bg-lime-100 text-lime-700',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Create the store',
    body: 'Name, contact and currency. The address, theme and owner account are provisioned together, in one transaction.',
  },
  {
    n: '02',
    title: 'The owner takes over',
    body: 'They get a setup email, sign in to their own admin, and add products, shipping and payment keys.',
  },
  {
    n: '03',
    title: 'It trades',
    body: 'Shoppers register with an emailed code, pay through the store’s own gateway, and the store keeps its customers.',
  },
];

/**
 * The photographs, named in one place.
 *
 * All four are in `public/marketing/`. Each slot still renders a labelled
 * placeholder rather than a broken image if its file goes missing, so a rename
 * or a bad deploy shows up as a panel naming the path it wanted instead of the
 * browser's torn-page icon in the middle of the hero.
 *
 * `width` and `height` are the intrinsic pixel size the slot is designed for.
 * They are set on the element as well, which is what reserves the space before
 * the image loads: without them the page reflows under the reader as each one
 * arrives. Supply images at roughly these proportions; anything else is cropped
 * to fit by `object-cover` rather than distorted.
 *
 * See `public/marketing/README.md`.
 */
interface Shot {
  src: string;
  alt: string;
  /** What to put here, shown in the placeholder until the file exists. */
  brief: string;
  width: number;
  height: number;
}

const SHOTS = {
  hero: {
    src: '/marketing/hero.jpg',
    alt: 'A laptop showing the platform console on a desk, with a plant and a mug',
    brief: 'The console on a laptop, on a desk',
    width: 1600,
    height: 897,
  },
  devices: {
    src: '/marketing/devices.jpg',
    alt: 'A storefront open on a laptop and the same storefront on a phone beside it',
    brief: 'One storefront on a laptop and a phone',
    width: 1200,
    height: 800,
  },
  storefront: {
    src: '/marketing/storefront.jpg',
    alt: "A storefront's own front page, with its categories and collections",
    brief: "A storefront's front page",
    width: 1440,
    height: 960,
  },
  brand: {
    src: '/marketing/brand.jpg',
    alt: 'A branded carrier bag, a shipping box and a trolley, all in a store’s own livery',
    brief: 'Branded bag, box and trolley',
    width: 1560,
    height: 790,
  },
} satisfies Record<string, Shot>;

/**
 * Notices a missing image, including one that failed before React was looking.
 *
 * `onError` alone is not enough. A 404 can resolve before the element is
 * mounted and the listener attached — reliably so for a cached failure — and
 * the handler then never runs, leaving the browser's own broken-image alt text
 * on the page, which is precisely the mess the fallback exists to avoid.
 *
 * The ref catches that case on attach: an `<img>` that is `complete` with a
 * `naturalWidth` of zero is one that has already finished failing.
 */
function useMissingImage() {
  const [missing, setMissing] = useState(false);

  const ref = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setMissing(true);
  };

  return { missing, ref, onError: () => setMissing(true) };
}

/**
 * One image slot.
 *
 * The fallback is decided at runtime rather than by a build-time check, because
 * whether the file exists is a fact about the deployed `public/` directory and
 * not about this bundle. A missing file therefore degrades to a deliberate
 * panel — dashed, tinted, naming the path it wants — instead of a broken image
 * icon and a torn layout.
 */
function Frame({
  shot,
  className = '',
  /**
   * Off for an image on a dark ground, where the pale border and the green
   * glow read as a smear around it rather than as a raised edge.
   */
  edged = true,
}: {
  shot: Shot;
  className?: string;
  edged?: boolean;
}) {
  const { missing, ref, onError } = useMissingImage();

  return (
    <div
      className={`relative overflow-hidden rounded-3xl ${
        edged ? 'border border-ink-100 bg-white shadow-glow-leaf-lg' : 'shadow-dialog'
      } ${className}`}
      style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
    >
      {missing ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-leaf-300 bg-leaf-50/70 p-6 text-center">
          <ImageIcon size={22} strokeWidth={1.5} className="text-leaf-500" />
          <p className="text-sm font-medium text-ink-800">{shot.brief}</p>
          <code className="font-mono text-[11px] text-ink-500">
            {shot.src} · {shot.width}×{shot.height}
          </code>
        </div>
      ) : (
        <img
          ref={ref}
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading="lazy"
          decoding="async"
          onError={onError}
          className="h-full w-full object-cover object-top"
        />
      )}
    </div>
  );
}

const PRIMARY_BUTTON =
  'cta-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-600 focus-visible:ring-offset-2';

const GHOST_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-full border border-ink-200 bg-white px-6 py-3 text-sm font-medium text-ink-800 shadow-card transition-all hover:-translate-y-px hover:border-leaf-400 hover:text-leaf-700 hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-600 focus-visible:ring-offset-2';

function SiteHeader() {
  const [open, setOpen] = useState(false);

  // Escape closes it, like every other dismissible surface in this app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <a href="#top" aria-label="Everystore, back to top">
          <Lockup tagline />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-leaf-50 hover:text-leaf-700"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login" className={`hidden sm:inline-flex ${GHOST_BUTTON} !py-2.5`}>
            Sign in
          </Link>
          <a href="#contact" className={`${PRIMARY_BUTTON} !py-2.5`}>
            Get Started
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="-mr-1 rounded-card p-2 text-ink-700 transition-colors hover:bg-ink-50 lg:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Main, expanded"
          className="border-t border-ink-100 bg-white px-5 pb-4 pt-2 lg:hidden"
        >
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-card px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-leaf-50 hover:text-leaf-700"
            >
              {item.label}
            </a>
          ))}
          <Link
            to="/login"
            className="mt-1 block rounded-card px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-leaf-50 hover:text-leaf-700 sm:hidden"
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}

const blankEnquiry = {
  name: '',
  email: '',
  phone: '',
  company: '',
  message: '',
  honeypot: '',
};

/**
 * The contact form.
 *
 * Kept in this file rather than in `components/`, because it is the only place
 * it appears and its markup is the landing page's own — the admin form controls
 * are built for a dense console and read as borrowed here.
 *
 * Success replaces the form rather than sitting above it: leaving a filled-in
 * form under a "thank you" invites a second send of the same message, which is
 * the commonest way one enquiry becomes three.
 */
function ContactForm() {
  const [enquiry, setEnquiry] = useState(blankEnquiry);

  const send = useMutation({
    mutationFn: () =>
      contactService.send({
        name: enquiry.name.trim(),
        email: enquiry.email.trim(),
        phone: enquiry.phone.trim() || undefined,
        company: enquiry.company.trim() || undefined,
        message: enquiry.message.trim(),
        honeypot: enquiry.honeypot,
      }),
  });

  const set = (field: keyof typeof blankEnquiry) => (value: string) =>
    setEnquiry((current) => ({ ...current, [field]: value }));

  // Mirrors the DTO, so the button is not a dead end that fails at the server.
  const ready =
    enquiry.name.trim().length >= 2 &&
    /.+@.+\..+/.test(enquiry.email.trim()) &&
    enquiry.message.trim().length >= 10;

  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-3xl border border-leaf-200 bg-leaf-50 p-8 shadow-card">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-leaf-600 text-white shadow-glow-leaf">
          <Check size={20} strokeWidth={2.5} />
        </span>
        <h3 className="font-display text-lg tracking-tight text-ink-950">Thank you — it's sent.</h3>
        <p className="text-sm leading-relaxed text-ink-700">
          We have your message and will reply to{' '}
          <strong className="font-medium text-ink-950">{enquiry.email.trim()}</strong>.
        </p>
        <button
          type="button"
          onClick={() => {
            setEnquiry(blankEnquiry);
            send.reset();
          }}
          className="text-sm text-leaf-700 underline underline-offset-2 hover:text-ink-950"
        >
          Send another
        </button>
      </div>
    );
  }

  const error = send.error as { message?: string; details?: string[] } | null;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !send.isPending) send.mutate();
      }}
      className="relative rounded-3xl border border-ink-100 bg-white p-6 shadow-lifted sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <LandingField label="Your name" value={enquiry.name} onChange={set('name')} required />
        <LandingField
          label="Email"
          type="email"
          value={enquiry.email}
          onChange={set('email')}
          required
        />
        <LandingField label="Mobile" type="tel" value={enquiry.phone} onChange={set('phone')} />
        <LandingField label="Business" value={enquiry.company} onChange={set('company')} />

        <label className="sm:col-span-2">
          <span className="text-xs font-medium text-ink-700">
            How can we help? <span className="text-leaf-600">*</span>
          </span>
          <textarea
            required
            rows={4}
            maxLength={2000}
            value={enquiry.message}
            onChange={(e) => set('message')(e.target.value)}
            placeholder="How many shops, what you sell, and what you are trying to move away from."
            className="field-leaf mt-1.5 w-full resize-y rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400"
          />
        </label>
      </div>

      {/* Not a field. Off-screen rather than `display:none`, which some form
          fillers skip — and out of the tab order and the accessibility tree, so
          nobody using a keyboard or a screen reader ever lands in it. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden="true">
        <label>
          Leave this empty
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={enquiry.honeypot}
            onChange={(e) => set('honeypot')(e.target.value)}
          />
        </label>
      </div>

      {send.isError && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error?.message ?? 'Something went wrong. Please try again.'}
          {error?.details?.length ? ` ${error.details.join(' · ')}` : ''}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={!ready || send.isPending} className={PRIMARY_BUTTON}>
          {send.isPending ? 'Sending…' : 'Send message'}
          {!send.isPending && <ArrowRight size={15} />}
        </button>
        <p className="text-xs text-ink-500">
          We reply to the address you give us. Nothing else is done with it.
        </p>
      </div>
    </form>
  );
}

function LandingField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">
        {label} {required && <span className="text-leaf-600">*</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-leaf mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900"
      />
    </label>
  );
}

/** A section heading and its one-line subtitle, centred. */
function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">{subtitle}</p>
    </div>
  );
}

export default function Landing() {
  /**
   * Smooth scrolling, applied to the scrolling element and taken off again.
   *
   * `scroll-behavior` has to be on `<html>` — the class on the wrapper below
   * would do nothing, because that div is not what scrolls. Scoped to this page
   * rather than set globally in index.css: the two consoles are full of lists
   * that jump to a row, and animating those is a delay, not a flourish.
   *
   * The whole thing sits behind the reduced-motion check, because a page that
   * slides for half a second is exactly what that setting is asking us not to
   * do — and anchors still work, they simply arrive at once.
   */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    root.style.scrollBehavior = 'smooth';
    return () => {
      root.style.scrollBehavior = '';
    };
  }, []);

  return (
    <div id="top" className="min-h-screen bg-white text-ink-900 antialiased">
      <SiteHeader />

      <main>
        {/* --- Hero ------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-leaf-wash">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-leaf-600/20 bg-white/70 px-3 py-1 text-xs font-medium tracking-wide text-leaf-700 backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" />
                  White-label commerce
                </p>

                <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink-950 sm:text-5xl lg:text-[3.4rem]">
                  Launch Your Branded
                  <br />
                  eCommerce Store
                  <br />
                  <span className="text-leaf-600">in Minutes.</span>
                </h1>

                <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-600">
                  everystore is a white-label eCommerce platform that lets you create, manage and
                  scale unlimited online stores under your own brand — each with its own address,
                  its own branding, its own payment account and its own customers.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <a href="#contact" className={PRIMARY_BUTTON}>
                    Get Started Now
                    <ArrowRight size={15} />
                  </a>
                  <a href="#how" className={GHOST_BUTTON}>
                    <Play size={14} className="fill-leaf-600 text-leaf-600" />
                    See How It Works
                  </a>
                </div>
              </div>

              {/* The device shot, with the three white-label cards beside it on
                  a wide screen and stacked underneath on anything narrower —
                  one block of markup, positioned differently, so the cards are
                  never announced twice to a screen reader. */}
              <div className="relative">
                <div className="xl:pr-36">
                  <Frame shot={SHOTS.hero} />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 xl:absolute xl:right-0 xl:top-1/2 xl:mt-0 xl:w-32 xl:-translate-y-1/2 xl:grid-cols-1 xl:gap-4">
                  {WHITE_LABEL.map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-ink-100 bg-white/95 p-3 shadow-lifted backdrop-blur"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-800">
                        <Icon size={13} strokeWidth={2} className="shrink-0 text-leaf-600" />
                        {label}
                      </span>
                      {value ? (
                        <p className="mt-1.5 truncate font-mono text-[10px] text-ink-500">{value}</p>
                      ) : (
                        <span className="mt-2 flex gap-1" aria-hidden="true">
                          {['bg-leaf-600', 'bg-teal-400', 'bg-amber-400', 'bg-rose-400'].map((c) => (
                            <span key={c} className={`h-3.5 w-3.5 rounded-full ${c}`} />
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* --- The four assurances, on one rule ------------------------ */}
            <div className="mt-14 grid grid-cols-2 gap-x-4 gap-y-6 border-t border-ink-100 pt-8 sm:grid-cols-4 sm:divide-x sm:divide-ink-100">
              {ASSURANCES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-center gap-3 sm:justify-center sm:px-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-leaf-600 shadow-card">
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight text-ink-950">
                      {title}
                    </span>
                    <span className="block truncate text-xs text-ink-500">{body}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Features --------------------------------------------------- */}
        <section id="features" className="scroll-mt-24 border-t border-ink-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <SectionHead
              title="Everything You Need to Build & Grow"
              subtitle="A complete eCommerce solution under your own brand."
            />

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body, tint }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-ink-100 bg-white p-7 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-leaf-200 hover:shadow-lifted"
                >
                  <span
                    className={`inline-flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${tint}`}
                  >
                    <Icon size={22} strokeWidth={1.8} />
                  </span>
                  <h3 className="mt-5 font-display text-base font-semibold tracking-tight text-ink-950">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- How it works ----------------------------------------------- */}
        <section id="how" className="scroll-mt-24 border-t border-ink-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <SectionHead
              title="From Nothing to Trading"
              subtitle="Three steps, and the shop is taking orders under its own name."
            />

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {STEPS.map((step) => (
                <div
                  key={step.n}
                  className="relative rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-shadow hover:shadow-lifted"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-leaf-500 to-leaf-300"
                  />
                  <span className="numeric inline-flex h-9 w-9 items-center justify-center rounded-full bg-leaf-100 font-display text-xs font-bold text-leaf-800">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- What the shopper gets -------------------------------------
            The hero already showed the console, so this pair is entirely the
            shopper's side: the same shop on two screens, and the front page its
            owner arranged. Between them they make the white-label argument
            without the page having to assert it again. */}
        <section className="border-t border-ink-100 bg-leaf-50/50">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <SectionHead
              title="Every Store, Entirely Its Own"
              subtitle="A shopper sees the shop — its address, its branding, its products. Never the platform underneath."
            />
            <div className="mt-12 grid gap-8 sm:grid-cols-2">
              <figure>
                <Frame shot={SHOTS.devices} />
                <figcaption className="mt-4 text-sm leading-relaxed text-ink-600">
                  <span className="font-semibold text-ink-950">On every screen.</span> One
                  storefront, laid out for a laptop and for a phone, in the store's own colours and
                  type.
                </figcaption>
              </figure>
              <figure>
                <Frame shot={SHOTS.storefront} />
                <figcaption className="mt-4 text-sm leading-relaxed text-ink-600">
                  <span className="font-semibold text-ink-950">Its own front page.</span>{' '}
                  Categories, collections and promotions, in the order the owner puts them in.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* --- The brand band --------------------------------------------
            The one dark section on the page, and the only place the green is
            the ground rather than an accent. It earns that by being where the
            argument lands: everything a shopper touches carries the shop's
            name, down to the box it arrives in. */}
        <section className="bg-leaf-900">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-leaf-300">
                  Launch limitless stores
                </p>
                <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                  Launch Limitless Stores.
                  <br />
                  Deliver <span className="text-leaf-300">Exceptional Experiences.</span>
                </h2>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-leaf-100/85">
                  Create a different shopping experience for every brand you run — the storefront,
                  the emails, the invoices and the packing slip all carry that shop's name, not
                  ours. All from one platform.
                </p>
                <a
                  href="#contact"
                  className="cta-on-dark mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-leaf-900"
                >
                  Get Started
                  <ArrowRight size={15} />
                </a>
              </div>

              <Frame shot={SHOTS.brand} edged={false} />
            </div>
          </div>
        </section>

        {/* --- Contact ---------------------------------------------------- */}
        <section id="contact" className="scroll-mt-24 border-t border-ink-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-leaf-600/20 bg-leaf-50 px-3 py-1 text-xs font-medium tracking-wide text-leaf-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" />
                  Talk to us
                </p>
                <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
                  Tell us about your shops
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-600">
                  Whether it is one shop or forty, tell us what you sell and how you run it now. We
                  read every message and answer it ourselves.
                </p>
                <p className="mt-6 text-sm leading-relaxed text-ink-600">
                  Already a customer?{' '}
                  <Link to="/login" className="text-leaf-700 underline underline-offset-2">
                    Sign in
                  </Link>{' '}
                  and use the console — this form is for people who are not set up yet.
                </p>
              </div>

              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Lockup tagline />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-leaf-700">
                {item.label}
              </a>
            ))}
            <Link to="/login" className="hover:text-leaf-700">
              Sign in
            </Link>
          </nav>
        </div>
        <div className="border-t border-ink-100">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-ink-500 sm:px-8">
            Everystore — white-label commerce.
          </p>
        </div>
      </footer>
    </div>
  );
}
