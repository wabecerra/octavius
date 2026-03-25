# Tileset Art Generation Prompt — Nerve Center

Use this prompt with an image generation AI (Midjourney, DALL-E, Stable Diffusion, etc.) to create fresh 48×48 pixel art tilesets for the Octavius Nerve Center.

---

## Base Prompt

> Generate a top-down 48×48 pixel art tileset sprite sheet for a "living pixel archive" themed facility. The aesthetic combines warm amber lighting, visible data streams (glowing blue/cyan lines running along floors and walls), holographic accents (translucent cyan/teal overlays on furniture), and distinct room personalities. Style: top-down RPG, 2-bit depth shading with a warm palette (amber, copper, dark wood tones as base; cyan, teal, soft blue as accent). Each tile is exactly 48×48 pixels. The sheet is arranged in a 16-column × 16-row grid (768×768 pixels total). Include: floor tiles (wood, stone, carpet variants), wall tiles (top, side, corner, T-junction), furniture, decorative objects, and transition tiles between room types.

---

## Per-Theme Sheets

Generate one sheet per theme. Each sheet is 768×768 px (16 cols × 16 rows of 48×48 tiles).

### 1. `nerve-tileset-library.png` — Memory / Obsidian rooms

> Top-down 48×48 pixel art tileset. Dark wood library theme. Tall bookshelves with glowing spines (cyan, amber). Reading desks with floating data particles above them. Stone floor with embedded glowing circuit lines. Scroll racks, crystal orbs on pedestals, card catalog drawers. Warm amber lantern lighting. Include: floor (4 variants), walls (8 directional), bookshelves (front, side, corner), desks (2 sizes), chairs, glowing book stacks, floating particle decorations, carpet tiles, doorway arch tiles.

### 2. `nerve-tileset-conference.png` — Hub room

> Top-down 48×48 pixel art tileset. Conference hall / command center theme. Large central holographic table (3×2 tile footprint, glowing cyan surface). High-backed chairs around table. Wall-mounted display screens showing data visualizations. Polished dark floor with subtle grid pattern. Podium, status board, communication console. Include: floor (polished dark, grid overlay), walls (reinforced, with screen mounts), conference table pieces (corners, edges, center), chairs (4 rotations), screens, podium, ambient glow tiles.

### 3. `nerve-tileset-office.png` — Agents / Tasks / Industry / LCM rooms

> Top-down 48×48 pixel art tileset. Modern tech office theme. Standing desks with dual monitors showing code. Cable runs along floor (thin cyan lines). Server status LEDs on wall panels. Ergonomic chairs, whiteboards with diagrams, coffee mugs, potted desk plants. Warm overhead lighting with cool monitor glow. Include: floor (industrial carpet, cable channel), walls (with LED strips), desks (L-shaped, straight), monitors, chairs, whiteboards, filing cabinets, cable tiles, keyboard/mouse details.

### 4. `nerve-tileset-utility.png` — Health / Costs rooms

> Top-down 48×48 pixel art tileset. Server room / utility theme. Server racks with blinking LEDs (green, amber, red). Pipeline tubes along walls (translucent with flowing data particles). Gauge panels, cooling vents, cable trays overhead. Metal grate flooring. Monitoring stations with multiple small screens. Include: floor (metal grate, raised floor tiles), walls (with pipe mounts), server racks (front, side), gauge panels, cooling units, cable trays, monitoring desks, warning stripe tiles.

### 5. `nerve-tileset-living.png` — Lifeforce / Fellowship / Essence rooms

> Top-down 48×48 pixel art tileset. Cozy living space theme. Soft couches and armchairs. Indoor plants (ferns, succulents, hanging vines). Warm rug patterns. Soft ambient glow from floor lamps and string lights. Tea/coffee station, meditation cushions, small fountain. Wood and fabric textures. Include: floor (hardwood, area rugs), walls (warm plaster, with shelves), couches (2-tile, corner), armchairs, plants (5+ varieties), lamps, coffee table, meditation mat, fountain, string light tiles.

---

## Technical Specifications

| Property | Value |
|---|---|
| Tile size | 48 × 48 pixels |
| Sheet grid | 16 columns × 16 rows |
| Sheet dimensions | 768 × 768 pixels |
| Color depth | 32-bit RGBA (PNG) |
| Style | Top-down RPG pixel art |
| Shading | 2-bit depth (3-4 shade levels per hue) |
| Outline | 1px dark outline on furniture/objects |
| Background | Transparent (alpha channel) for object tiles |

## Naming Convention

```
nerve-tileset-library.png      → Memory, Obsidian rooms
nerve-tileset-conference.png   → Hub room
nerve-tileset-office.png       → Agents, Tasks, Industry, LCM rooms
nerve-tileset-utility.png      → Health, Costs rooms
nerve-tileset-living.png       → Lifeforce, Fellowship, Essence rooms
```

## Color Palette Reference

| Role | Hex | Usage |
|---|---|---|
| Base dark | `#1a1a2e` | Darkest shadows, outlines |
| Base warm | `#3d2b1f` | Wood, warm surfaces |
| Amber glow | `#c9a227` | Warm lighting, lanterns |
| Copper accent | `#b87333` | Metal fixtures, frames |
| Cyan data | `#4ae0e0` | Data streams, holograms |
| Teal accent | `#2a9d8f` | Screen glow, status LEDs |
| Soft blue | `#6bb7c9` | Ambient light, reflections |
| Cream | `#f0e6d3` | Light surfaces, paper |
| Error red | `#e63946` | Warning indicators |
| Success green | `#4ade80` | Status LEDs, healthy |

## Tile Layout Guide (per sheet)

```
Row 0-1:   Floor tiles (base, variants, transitions)
Row 2-4:   Wall tiles (top, bottom, left, right, corners, T-junctions, doorways)
Row 5-7:   Primary furniture (desks, tables, shelves — multi-tile pieces)
Row 8-9:   Secondary furniture (chairs, small objects)
Row 10-11: Decorative objects (plants, lamps, screens, books)
Row 12-13: Interactive objects (doors, switches, consoles)
Row 14:    Ambient/overlay tiles (glow effects, particles, shadows)
Row 15:    Transition tiles (room-to-corridor, theme blending)
```

## Notes

- Each tileset should be self-contained — all tiles needed for one room theme in a single sheet
- Wall tiles need all 8 directions: N, S, E, W, NE, NW, SE, SW corners
- Doorway tiles should be 1-tile wide openings in walls
- Multi-tile furniture (desks, tables) should have clear top-left, top-right, bottom-left, bottom-right pieces
- Floor tiles should tile seamlessly when repeated
- The existing tilesets use the "Modern Interior" asset pack style — the new art should feel like a natural evolution, not a jarring replacement
