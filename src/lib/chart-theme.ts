/**
 * Unified chart theming for Recharts.
 * Uses CSS custom properties for theme-aware colors.
 * Categorical palette is Okabe-Ito (color-blind safe).
 */

export const CHART_THEME = {
  grid: {
    stroke: 'rgba(255,255,255,0.08)',
    strokeDasharray: '3 3',
  },
  axis: {
    stroke: 'var(--text-tertiary)',
    tick: { fill: 'var(--text-tertiary)', fontSize: 11 },
  },
  tooltip: {
    contentStyle: {
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-primary)',
      borderRadius: '8px',
      color: 'var(--text-primary)',
      fontSize: '12px',
      boxShadow: 'var(--shadow-md)',
    } as React.CSSProperties,
  },
  colors: {
    /** Okabe-Ito color-blind safe categorical palette */
    categorical: [
      '#56B4E9', // Sky Blue
      '#E69F00', // Orange
      '#009E73', // Bluish Green
      '#F0E442', // Yellow
      '#0072B2', // Blue
      '#D55E00', // Vermillion
      '#CC79A7', // Reddish Purple
    ],
    /** Semantic quadrant colors (CSS variables) */
    quadrant: {
      health: 'var(--quadrant-lifeforce)',
      career: 'var(--quadrant-industry)',
      relationships: 'var(--quadrant-fellowship)',
      soul: 'var(--quadrant-essence)',
    },
    accent: 'var(--accent)',
  },
} as const
