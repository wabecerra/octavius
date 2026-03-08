/**
 * Unified chart theming for Recharts.
 * Design System 2026 — uses semantic CSS custom properties.
 * Categorical palette is Okabe-Ito (color-blind safe).
 */

export const CHART_THEME = {
  grid: {
    stroke: 'rgba(255,255,255,0.15)',
    strokeDasharray: '3 3',
  },
  axis: {
    stroke: '#b0b6c3',
    tick: { fill: '#b0b6c3', fontSize: 11 },
  },
  tooltip: {
    contentStyle: {
      backgroundColor: '#252932',
      border: '1px solid #444',
      borderRadius: '8px',
      color: '#eee',
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
      health: 'var(--quadrant-health)',
      career: 'var(--quadrant-career)',
      relationships: 'var(--quadrant-relationships)',
      soul: 'var(--quadrant-soul)',
    },
    accent: 'var(--accent)',
  },
} as const
