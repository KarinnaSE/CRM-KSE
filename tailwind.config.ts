import type { Config } from "tailwindcss";

/**
 * Los valores reales viven como CSS custom properties en app/globals.css
 * (portados del design system KSE CRM). Aquí solo los exponemos como
 * utilidades de Tailwind para poder escribir clases como `bg-surface`,
 * `text-primary`, `rounded-md`, etc. y que se adapten a claro/oscuro.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Alias semánticos (usar SIEMPRE estos en componentes)
        page: "var(--bg-page)",
        surface: "var(--bg-surface)",
        "surface-2": "var(--bg-surface-2)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-on-brand": "var(--text-on-brand)",
        interactive: "var(--interactive)",
        "interactive-hover": "var(--interactive-hover)",
        "interactive-active": "var(--interactive-active)",
        "focus-ring": "var(--focus-ring)",
        // Primitivos (para casos puntuales)
        brand: {
          50: "var(--brand-50)", 100: "var(--brand-100)", 200: "var(--brand-200)",
          300: "var(--brand-300)", 400: "var(--brand-400)", 500: "var(--brand-500)",
          600: "var(--brand-600)", 700: "var(--brand-700)", 800: "var(--brand-800)",
          900: "var(--brand-900)", 950: "var(--brand-950)",
        },
        success: {
          50: "var(--success-50)", 100: "var(--success-100)", 200: "var(--success-200)",
          500: "var(--success-500)", 600: "var(--success-600)", 700: "var(--success-700)",
        },
        error: {
          50: "var(--error-50)", 100: "var(--error-100)", 200: "var(--error-200)",
          500: "var(--error-500)", 600: "var(--error-600)", 700: "var(--error-700)",
        },
        warning: {
          50: "var(--warning-50)", 100: "var(--warning-100)",
          500: "var(--warning-500)", 600: "var(--warning-600)",
        },
        info: {
          50: "var(--info-50)", 100: "var(--info-100)",
          500: "var(--info-500)", 600: "var(--info-600)",
        },
      },
      fontFamily: {
        sans: "var(--font-family)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        md: "var(--text-md)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      spacing: {
        1: "var(--space-1)", 2: "var(--space-2)", 3: "var(--space-3)",
        4: "var(--space-4)", 5: "var(--space-5)", 6: "var(--space-6)",
        8: "var(--space-8)", 10: "var(--space-10)", 12: "var(--space-12)",
        16: "var(--space-16)", 20: "var(--space-20)",
      },
    },
  },
  plugins: [],
};

export default config;
