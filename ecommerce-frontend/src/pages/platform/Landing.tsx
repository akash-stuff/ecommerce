import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Globe,
  Mail,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import { Wordmark } from '@/features/platform/brand';

/**
 * The product's own front door.
 *
 * Served at `/` on the platform and admin hostnames, where there is no tenant to
 * resolve — that address used to render "No store at this address", which is
 * accurate and useless. Tenant hostnames still get the storefront; see the root
 * route in routes/index.tsx.
 *
 * Light, and lit by the brand pair rather than by a dark backdrop: depth comes
 * from layered shadows and hairline borders, which is what stops a white page
 * reading as an unstyled one. `brand` and `brand-secondary` are used throughout
 * rather than hard-coded hex, so the platform's own colours stay in one place.
 *
 * Every claim below is a feature that exists in this codebase. A landing page
 * that promises what the software does not do is a support ticket written in
 * advance.
 */

const FEATURES = [
  {
    icon: Globe,
    title: 'Its own address',
    body: 'Each store runs on its own subdomain or its own domain, with certificates issued automatically. Shoppers never see the platform.',
  },
  {
    icon: Palette,
    title: 'Its own look',
    body: 'Colours, fonts, logo, backgrounds and homepage layout, picked per store from a template and changed at any time. One build; branding arrives at runtime.',
  },
  {
    icon: CreditCard,
    title: 'Its own money',
    body: 'Every store connects its own payment gateway, so takings settle into its own account. Keys are encrypted per store and readable by nobody, including platform staff.',
  },
  {
    icon: ShieldCheck,
    title: 'Separated at the database',
    body: 'Tenant isolation is enforced in the query layer, not screen by screen. A forgotten filter cannot leak another shop’s data, and a test suite proves it.',
  },
  {
    icon: Mail,
    title: 'Email under the store’s name',
    body: 'Verification codes, order confirmations and mailing-list signups all go out as the store, with every attempt recorded and retryable.',
  },
  {
    icon: BarChart3,
    title: 'Numbers you can take away',
    body: 'Revenue, orders and top products, per store or across the whole platform — on screen, and exportable as CSV.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Create the store',
    body: 'Name, contact and currency. The address, theme and owner account are provisioned together.',
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

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-ink-900 antialiased">
      {/* The page wash. Two soft radials — green from the top left, amber from
          the top right — so the white has a temperature instead of being flat. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[52rem] bg-brand-wash"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Wordmark className="text-brand" />
        <Link
          to="/login"
          className="rounded-full border border-ink-200 bg-white/80 px-4 py-2 text-sm font-medium text-ink-800 shadow-card backdrop-blur transition-all hover:border-brand/40 hover:text-brand hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-3 py-1 text-xs font-medium tracking-wide text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />
            White-label commerce
          </p>

          <h1 className="mt-6 max-w-3xl font-display text-4xl leading-[1.08] tracking-tight text-ink-950 sm:text-6xl">
            One platform.
            <br />
            <span className="text-brand">Every store its own.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
            Run many independent shops from one installation. Each gets its own
            address, its own branding, its own payment account and its own
            customers — and none of them can see the others.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-white shadow-glow transition-all hover:-translate-y-px hover:shadow-lifted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Sign in to your console
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how"
              className="rounded-full border border-transparent px-5 py-3 text-sm font-medium text-ink-700 transition-colors hover:border-ink-200 hover:text-ink-950"
            >
              How it works
            </a>
          </div>
        </section>

        {/* A hairline grid: the gap between cards is the parent's background
            showing through, so the dividers stay exactly one pixel at any zoom. */}
        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-ink-100 bg-ink-100 shadow-lifted sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="group relative bg-white p-7 transition-colors hover:bg-ink-50/50">
                {/* A brand rule that grows on hover: motion without movement,
                    so the grid never reflows under the cursor. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand to-brand-secondary transition-transform duration-300 group-hover:scale-x-100"
                />
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand/15 bg-brand/[0.06] text-brand transition-all group-hover:border-brand/30 group-hover:shadow-glow-sm">
                  <Icon size={17} strokeWidth={1.75} />
                </span>
                <h2 className="mt-4 font-display text-base font-medium tracking-tight text-ink-950">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-y border-ink-100 bg-ink-50/60">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="font-display text-2xl tracking-tight text-ink-950 sm:text-3xl">
              From nothing to trading
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {STEPS.map((step) => (
                <div
                  key={step.n}
                  className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-shadow hover:shadow-lifted"
                >
                  <span className="numeric inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-secondary/15 font-display text-xs font-semibold text-amber-800">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-display text-lg tracking-tight text-ink-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-brand/15 bg-brand/[0.04] p-8 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h2 className="font-display text-xl tracking-tight text-ink-950 sm:text-2xl">
                Already running stores here?
              </h2>
              <p className="mt-1.5 text-sm text-ink-600">
                Store owners and platform staff sign in at the same door.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-white shadow-glow transition-all hover:-translate-y-px hover:shadow-lifted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Sign in
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark className="text-ink-700" markSize={18} />
          <p>Everystore — white-label commerce.</p>
        </div>
      </footer>
    </div>
  );
}
