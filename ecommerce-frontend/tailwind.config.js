/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tenant-controlled. These read CSS custom properties written at runtime
        // by ThemeProvider — never a build-time value.
        brand: {
          DEFAULT: 'rgb(var(--brand-primary) / <alpha-value>)',
          soft: 'rgb(var(--brand-primary) / 0.08)',
          secondary: 'rgb(var(--brand-secondary) / <alpha-value>)',
        },
        // Admin chrome. Warm neutrals, deliberately desaturated so that the one
        // saturated thing on any admin screen is the tenant's own brand colour.
        //
        // The full ten-step ramp is defined rather than the seven that were
        // needed at first: a missing step is not a compile error in Tailwind,
        // it is a class that silently produces no colour at all, which is how
        // `border-ink-800` on the platform sidebar ended up invisible.
        ink: {
          950: '#17150F', 900: '#221F17', 800: '#2E2A20', 700: '#4A463B',
          600: '#5F5A50', 500: '#77726A', 400: '#948F86', 300: '#B0ABA1',
          200: '#CFCAC0', 100: '#E5E1D8', 50: '#F7F5F0',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-heading)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '10px' },
      boxShadow: {
        // Warm-tinted rather than neutral black, so a raised surface reads as
        // lifted off the ink-50 page instead of dirty against it.
        //
        // Each step is two layers: a tight contact shadow that grounds the edge
        // and a wider ambient one that gives it height. A single blurred layer
        // reads as a smudge at this lightness, which is what made the flat
        // cards look cheap rather than calm.
        card: '0 1px 2px rgb(23 21 15 / 0.04), 0 1px 3px rgb(23 21 15 / 0.06)',
        raised: '0 4px 12px -2px rgb(23 21 15 / 0.10), 0 2px 6px -2px rgb(23 21 15 / 0.06)',
        lifted:
          '0 1px 2px rgb(23 21 15 / 0.04), 0 8px 20px -6px rgb(23 21 15 / 0.10), 0 18px 36px -12px rgb(23 21 15 / 0.08)',
        dialog: '0 24px 48px -12px rgb(23 21 15 / 0.28)',
        /**
         * Named `glow*` rather than `brand*` on purpose.
         *
         * `brand` is a colour in theme.colors, and Tailwind resolves
         * `shadow-<colour>` to the shadow-COLOUR utility — so a boxShadow key
         * called `brand` is shadowed by it: `shadow-brand` set
         * `--tw-shadow-color` to solid green instead of applying these layers,
         * and every button wore an opaque green slab. Any key here that shares
         * a name with a colour will do the same.
         */
        glow: '0 1px 2px rgb(22 101 52 / 0.08), 0 10px 24px -8px rgb(22 101 52 / 0.22)',
        /** The resting state of a primary button: sits back down. */
        'glow-sm': '0 1px 2px rgb(22 101 52 / 0.16)',
        /** An amber cast, for the secondary's own highlights. */
        'glow-amber': '0 1px 2px rgb(180 118 12 / 0.10), 0 10px 24px -8px rgb(245 165 36 / 0.30)',
      },
      backgroundImage: {
        /** The page wash behind both consoles: a hint of green, then nothing. */
        'brand-wash':
          'radial-gradient(60rem 32rem at 12% -8%, rgb(22 101 52 / 0.07), transparent 60%),' +
          'radial-gradient(44rem 26rem at 92% 0%, rgb(245 165 36 / 0.08), transparent 60%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'rise-in': 'rise-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
