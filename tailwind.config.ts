import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic background tokens
        primary:   'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        tertiary:  'var(--bg-tertiary)',
        hover:     'var(--bg-hover)',
        active:    'var(--bg-active)',

        // Semantic text tokens
        foreground: {
          DEFAULT:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary:  'var(--text-tertiary)',
          disabled:  'var(--text-disabled)',
        },

        // Border tokens
        border: {
          DEFAULT:   'var(--border-primary)',
          secondary: 'var(--border-secondary)',
          focus:     'var(--border-focus)',
        },

        // Accent
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          muted:   'var(--accent-muted)',
        },

        // Semantic status
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error:   'var(--color-error)',
        info:    'var(--color-info)',

        // Quadrant
        quadrant: {
          health:        'var(--quadrant-health)',
          career:        'var(--quadrant-career)',
          relationships: 'var(--quadrant-relationships)',
          soul:          'var(--quadrant-soul)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      transitionDuration: {
        '150': '150ms',
      },
    },
  },
  plugins: [],
}
export default config
