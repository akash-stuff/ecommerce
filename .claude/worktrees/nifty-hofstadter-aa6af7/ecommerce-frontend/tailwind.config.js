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
        ink: {
          950: '#17150F', 900: '#221F17', 700: '#4A463B',
          500: '#77726A', 300: '#B0ABA1', 100: '#E5E1D8', 50: '#F7F5F0',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-heading)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '10px' },
    },
  },
  plugins: [],
};
