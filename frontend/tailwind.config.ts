import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        'primary-dark': '#1D4ED8',
        background: '#F8FAFC',
        surface: '#FFFFFF',
        ink: '#0F172A',
        secondary: '#475569',
        border: '#E2E8F0',
        success: '#16A34A',
        warning: '#D97706',
        error: '#DC2626',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
