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

        // Quadrant — new names (design system 2026)
        quadrant: {
          health:        'var(--quadrant-health)',
          career:        'var(--quadrant-career)',
          relationships: 'var(--quadrant-relationships)',
          soul:          'var(--quadrant-soul)',
          // Legacy aliases for backward compat
          lifeforce:     'var(--quadrant-lifeforce)',
          industry:      'var(--quadrant-industry)',
          fellowship:    'var(--quadrant-fellowship)',
          essence:       'var(--quadrant-essence)',
        },

        // Surface colors
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },

        // Data Visualization — Okabe-Ito (color-blind safe)
        viz: {
          1: 'var(--viz-1)',
          2: 'var(--viz-2)',
          3: 'var(--viz-3)',
          4: 'var(--viz-4)',
          5: 'var(--viz-5)',
          6: 'var(--viz-6)',
          7: 'var(--viz-7)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:   ['12px', { lineHeight: '16px' }],
        sm:   ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg:   ['18px', { lineHeight: '28px' }],
        xl:   ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
      },
      transitionDuration: {
        '150': '150ms',
        'page':  'var(--duration-page)',
        'panel': 'var(--duration-panel)',
        'toast': 'var(--duration-toast)',
        'hover': 'var(--duration-hover)',
      },
      transitionTimingFunction: {
        'page':    'var(--ease-page)',
        'respond': 'var(--ease-respond)',
      },
      animation: {
        'skeleton-pulse': 'pulse 1500ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
