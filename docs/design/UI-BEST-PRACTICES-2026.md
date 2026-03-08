# Octavius UI Best Practices: A Comprehensive Design & Development Reference for 2026

**Document Version:** 1.0
**Publication Date:** 2026-03-08
**Technology Stack:** Next.js 14 | React 18 | Tailwind CSS 4.0 | Recharts
**Theme:** Dark-First (`#12141a` base)

---

## Quick Reference

### Color Palette (Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| Background Page | `#12141a` | Main app background |
| Surface 1 | `#1a1d24` | Cards, widgets |
| Surface 2 | `#252932` | Modals, popovers, tooltips |
| Border Default | `#252932` | Standard borders |
| Border Subtle | `#1a1d24` | Subtle dividers |
| Text Primary | `#eef0f4` | Headings, primary content |
| Text Secondary | `#b0b6c3` | Body text, descriptions |
| Text Tertiary | `#8a91a0` | Timestamps, micro-copy |

### Quadrant Colors

| Quadrant | Hex |
|----------|-----|
| Health | `#34d399` (Emerald 400) |
| Career | `#60a5fa` (Blue 400) |
| Relationships | `#f87171` (Red 400) |
| Soul | `#c084fc` (Purple 400) |

### Data Visualization (Okabe-Ito)

1. `#56B4E9` Sky Blue
2. `#E69F00` Orange
3. `#009E73` Bluish Green
4. `#F0E442` Yellow
5. `#0072B2` Blue
6. `#D55E00` Vermillion
7. `#CC79A7` Reddish Purple

### Typography

- **Fonts:** Inter (UI) + JetBrains Mono (data/numbers)
- **Scale:** xs=12px, sm=14px, base=16px, lg=18px, xl=20px, 2xl=24px, 3xl=30px, 4xl=36px
- **Weights:** 400 body, 500 labels, 600 card titles, 700 headings

### Spacing

- 4px grid system
- Card padding: `p-4` (16px) or `p-6` (24px)
- Card gaps: `gap-4` (16px) or `gap-6` (24px)
- Internal ≤ External rule

### Animation Timing

| Type | Duration | Easing |
|------|----------|--------|
| Page Transition | 750ms | ease-in-out `cubic-bezier(0.42, 0, 0.58, 1.0)` |
| Panel Reveal | 300ms | ease-in-out |
| Toast Entry/Exit | 250ms | ease-out / ease-in |
| Hover State | 150-200ms | ease-out |
| Skeleton Pulse | 1500ms | ease-in-out |
| Target: 60fps, only animate `transform` + `opacity` |

### Component Library

- **shadcn/ui** (copy-paste, Radix UI + Tailwind)
- KPI cards must handle loading/empty/error states
- Command palette via `cmdk`
- Kanban via `dnd-kit`
- Focus trapping via `focus-trap-react`
- Force graphs via `react-force-graph`

### Layout

- CSS Grid for dashboard cards
- Collapsible sidebar (full → rail → overlay on mobile)
- `react-resizable-panels` for split-pane
- Sticky headers, full-height layouts
- `contain: content` on widgets
- `content-visibility: auto` for long lists

### Accessibility

- WCAG 2.2 AA (4.5:1 text, 3:1 UI components)
- `prefers-reduced-motion` mandatory
- Focus trapping in modals
- Screen reader tables for charts
- Roving tabindex for complex widgets

### Key Contrast Ratios

- Text Primary (#eef0f4) on Background (#12141a): 13.55:1 ✅
- Text Secondary (#b0b6c3) on Background (#12141a): 7.11:1 ✅
- Text Tertiary (#8a91a0) on Background (#12141a): 4.53:1 ✅
