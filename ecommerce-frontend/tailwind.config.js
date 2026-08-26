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
        card: '0 1px 2px rgb(23 21 15 / 0.04), 0 1px 3px rgb(23 21 15 / 0.06)',
        raised: '0 4px 12px -2px rgb(23 21 15 / 0.10), 0 2px 6px -2px rgb(23 21 15 / 0.06)',
        dialog: '0 24px 48px -12px rgb(23 21 15 / 0.28)',
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
