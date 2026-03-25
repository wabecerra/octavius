#!/usr/bin/env python3
"""
Rebuild nerve-center.json tilemap so each of the 12 rooms uses tiles from a
different themed tileset, making every room visually distinct.

Grid: 40 wide × 30 tall (1200 tiles).  12 rooms in a 4×3 layout.
Each cell is 10×10 tiles; room interior occupies tiles 1-8 within each cell.
2-tile corridors sit between rooms (the cell borders).

Theme assignments
─────────────────
Memory (0,0), Obsidian (0,1)          → 5_Classroom_and_library  firstgid=1073
Hub (1,1)                              → 13_Conference_Hall       firstgid=18397
Agents (1,0), Tasks (2,0),
  Industry (1,2), LCM (2,1)           → Modern_Office            firstgid=225
Health (3,0), Costs (3,1)             → 14_Basement              firstgid=1617
Lifeforce (0,2), Fellowship (2,2),
  Essence (3,2)                        → 2_LivingRoom             firstgid=15629
Corridors                             → Room_Builder_Office      firstgid=1
"""

import json, sys, os, copy

# ── paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_PATH = os.path.join(SCRIPT_DIR, "..", "public", "town", "maps", "nerve-center.json")

# ── constants ────────────────────────────────────────────────────────────────
W, H = 40, 30
CELL = 10          # each cell is 10×10 tiles
COLS, ROWS = 4, 3  # 4 columns, 3 rows of rooms

# Tileset first-gids
FG_ROOM_BUILDER  = 1
FG_MODERN_OFFICE = 225
FG_CLASSROOM     = 1073
FG_BASEMENT      = 1617
FG_LIVINGROOM    = 15629
FG_CONFERENCE    = 18397

# ── room grid (col, row) → name ─────────────────────────────────────────────
ROOM_NAMES = {
    (0,0): "Memory",   (1,0): "Agents",    (2,0): "Tasks",      (3,0): "Health",
    (0,1): "Obsidian", (1,1): "Hub",       (2,1): "LCM",        (3,1): "Costs",
    (0,2): "Lifeforce",(1,2): "Industry",  (2,2): "Fellowship", (3,2): "Essence",
}

# ── room → firstgid mapping ─────────────────────────────────────────────────
ROOM_THEME = {
    "Memory":     FG_CLASSROOM,
    "Obsidian":   FG_CLASSROOM,
    "Hub":        FG_CONFERENCE,
    "Agents":     FG_MODERN_OFFICE,
    "Tasks":      FG_MODERN_OFFICE,
    "Industry":   FG_MODERN_OFFICE,
    "LCM":        FG_MODERN_OFFICE,
    "Health":     FG_BASEMENT,
    "Costs":      FG_BASEMENT,
    "Lifeforce":  FG_LIVINGROOM,
    "Fellowship": FG_LIVINGROOM,
    "Essence":    FG_LIVINGROOM,
}


# ── floor tile local indices per tileset (pick a few for variety) ────────────
FLOOR_LOCALS = {
    FG_ROOM_BUILDER:  [91, 92, 93, 107, 108, 109],
    FG_MODERN_OFFICE: [0, 1, 2, 3, 4, 5, 6, 7],
    FG_CLASSROOM:     [0, 1, 2, 3, 4, 5, 6, 7],
    FG_BASEMENT:      [0, 1, 2, 3, 4, 5, 6, 7],
    FG_LIVINGROOM:    [0, 1, 2, 3, 4, 5, 6, 7],
    FG_CONFERENCE:    [0, 1, 2, 3, 4, 5, 6, 7],
}

# Corridor floor tile (Room_Builder light floor)
CORRIDOR_FLOOR = FG_ROOM_BUILDER + 91   # global 92

# ── wall tile globals (Room_Builder_Office) ──────────────────────────────────
WALL_TOP_LEFT     = FG_ROOM_BUILDER + 23   # 24
WALL_TOP          = FG_ROOM_BUILDER + 27   # 28
WALL_TOP_RIGHT    = FG_ROOM_BUILDER + 25   # 26
WALL_LEFT         = FG_ROOM_BUILDER + 39   # 40
WALL_RIGHT        = FG_ROOM_BUILDER + 41   # 42
WALL_BOT_LEFT     = FG_ROOM_BUILDER + 55   # 56
WALL_BOT          = FG_ROOM_BUILDER + 56   # 57
WALL_BOT_RIGHT    = FG_ROOM_BUILDER + 57   # 58

# ── furniture local indices per tileset ──────────────────────────────────────
# We pick 3 distinct items per tileset from the furniture range (48-128).
FURNITURE_LOCALS = {
    FG_CLASSROOM:     [48, 64, 80],
    FG_CONFERENCE:    [48, 64, 80],
    FG_MODERN_OFFICE: [48, 64, 80],
    FG_BASEMENT:      [48, 64, 80],
    FG_LIVINGROOM:    [48, 64, 80],
}


# ── helpers ──────────────────────────────────────────────────────────────────
def idx(x, y):
    """Convert (x, y) tile coords to flat array index."""
    return y * W + x


def room_rect(col, row):
    """Return (x0, y0, x1, y1) inclusive tile coords for the room interior."""
    x0 = col * CELL + 1
    y0 = row * CELL + 1
    return x0, y0, x0 + 7, y0 + 7   # 8 tiles wide/tall


def is_in_room(x, y):
    """Return (col, row) if tile is inside a room interior, else None."""
    for col in range(COLS):
        for row in range(ROWS):
            x0, y0, x1, y1 = room_rect(col, row)
            if x0 <= x <= x1 and y0 <= y <= y1:
                return (col, row)
    return None


def is_corridor(x, y):
    """Return True if tile is in a corridor (between rooms, not outside map)."""
    # Corridors are the 2-tile gaps between room cells.
    # Horizontal corridors: columns 8-9, 18-19, 28-29 (between col pairs)
    # Vertical corridors:   rows 8-9, 18-19, 28-29 (between row pairs)
    # But also the wall row/col 0 of each cell that isn't room interior.
    # Simpler: a tile is corridor if it's within the 38-wide usable area
    # (cols 0-37, rows 0-29) and not inside any room and not in the
    # rightmost 2 columns (38-39) which are empty border.
    if x >= 38 or y >= 30:
        return False
    # Must be adjacent to at least one room (within the grid area)
    # The grid spans cols 0-37 (4 cells × 10 = 40, but last 2 cols are border)
    # Actually the grid is 4×10 = 40 wide, but the user says cols 38-39 are 0.
    # Let's check: is the tile within the bounding box of all rooms+corridors?
    # That's cols 0-37, rows 0-29.  But the last row of cells goes to row 29.
    # Corridors are the spaces between cells that aren't room interiors.
    # Cell boundaries: col 0-9, 10-19, 20-29, 30-39
    # Room interiors: 1-8, 11-18, 21-28, 31-38 ... wait, 31+7=38, so col 38
    # is the last room tile in col 3.  Cols 38-39 would be cell border.
    # But the user says cols 38-39 are empty (0).  Let me re-check.
    # Cell 3 starts at col 30.  Interior is 31-38.  Col 39 is the cell border.
    # So the usable area is 0-38 for rooms, and col 39 is always empty.
    # Actually looking at the original data, cols 38-39 are 0 in floor.
    # So the grid only uses cols 0-37 for rooms (4 cells of 10, but last cell
    # interior goes to col 37).  Wait: cell 3 col starts at 30, interior 31-38.
    # That's 8 tiles: 31,32,33,34,35,36,37,38 — but 38 < 40 so it's valid.
    # Hmm, but the original data shows cols 38-39 as 0.  Let me reconsider.
    # Looking at original floor data row 0: 8 tiles of 108, then 92,92 (corridor),
    # then 8×108, 92,92, 8×108, 92,92, 8×108, 0,0.
    # So the pattern per row is: [8 room][2 corridor][8 room][2 corridor]
    #                             [8 room][2 corridor][8 room][2 empty]
    # That means rooms start at col 0 (not col 1!).
    # Room 0: cols 0-7, Room 1: cols 10-17, Room 2: cols 20-27, Room 3: cols 30-37
    # Corridors: cols 8-9, 18-19, 28-29
    # Cols 38-39: empty
    # Similarly for rows: rows 0-7 room, 8-9 corridor, 10-17 room, 18-19 corridor,
    # 20-27 room, 28-29 empty.
    # This means the cell structure is different from what I assumed!
    # Let me re-derive: each cell is 10 tiles. Room interior is the first 8 tiles
    # of each cell, corridor is the last 2 tiles. The last cell's corridor is empty.
    return False  # placeholder, will be replaced below


# ── Re-derive room positions from original data ─────────────────────────────
# Based on the original floor data analysis:
# Room interiors (8×8 tiles):
#   Col 0: x=0..7,   Col 1: x=10..17,  Col 2: x=20..27,  Col 3: x=30..37
#   Row 0: y=0..7,   Row 1: y=10..17,  Row 2: y=20..27
# Corridors (2 tiles wide):
#   Vertical: x=8..9, x=18..19, x=28..29
#   Horizontal: y=8..9, y=18..19, y=28..29 (but y=28..29 is empty for last row)
# Empty: x=38..39, y=28..29

def room_rect_v2(col, row):
    """Return (x0, y0, x1, y1) inclusive for room interior."""
    x0 = col * CELL
    y0 = row * CELL
    return x0, y0, x0 + 7, y0 + 7


def get_room_at(x, y):
    """Return (col, row) if (x,y) is inside a room, else None."""
    for c in range(COLS):
        for r in range(ROWS):
            x0, y0, x1, y1 = room_rect_v2(c, r)
            if x0 <= x <= x1 and y0 <= y <= y1:
                return (c, r)
    return None


def is_corridor_v2(x, y):
    """True if tile is in a corridor between rooms."""
    if x >= 38 or y >= 28:
        return False
    if get_room_at(x, y) is not None:
        return False
    # Must be in the corridor strips
    # Vertical corridors: x in {8,9,18,19,28,29} and y in 0..27
    # Horizontal corridors: y in {8,9,18,19} and x in 0..37
    # Intersection tiles count too
    in_v_strip = x in (8, 9, 18, 19, 28, 29)
    in_h_strip = y in (8, 9, 18, 19)
    return in_v_strip or in_h_strip


# ── build floor layer ────────────────────────────────────────────────────────
def build_floor():
    data = [0] * (W * H)
    for y in range(H):
        for x in range(W):
            room = get_room_at(x, y)
            if room is not None:
                name = ROOM_NAMES[room]
                fg = ROOM_THEME[name]
                locals_ = FLOOR_LOCALS[fg]
                # Pick a floor tile based on position for slight variety
                local = locals_[(x + y) % len(locals_)]
                data[idx(x, y)] = fg + local
            elif is_corridor_v2(x, y):
                data[idx(x, y)] = CORRIDOR_FLOOR
            # else: 0 (empty)
    return data


# ── build walls layer ────────────────────────────────────────────────────────
def build_walls():
    """Place wall tiles around each room boundary with doorway openings."""
    data = [0] * (W * H)

    for c in range(COLS):
        for r in range(ROWS):
            x0, y0, x1, y1 = room_rect_v2(c, r)

            # ── top wall (y0 - 1 doesn't exist for row 0, so put wall ON y0) ──
            # Actually walls go on the room boundary tiles themselves.
            # Looking at original: walls are at the room edges.
            # Top row of room: top wall
            # Bottom row: bottom wall
            # Left col: left wall
            # Right col: right wall

            # Top wall
            for x in range(x0, x1 + 1):
                if x == x0:
                    data[idx(x, y0)] = WALL_TOP_LEFT
                elif x == x1:
                    data[idx(x, y0)] = WALL_TOP_RIGHT
                else:
                    data[idx(x, y0)] = WALL_TOP

            # Bottom wall
            for x in range(x0, x1 + 1):
                if x == x0:
                    data[idx(x, y1)] = WALL_BOT_LEFT
                elif x == x1:
                    data[idx(x, y1)] = WALL_BOT_RIGHT
                else:
                    data[idx(x, y1)] = WALL_BOT

            # Left wall (excluding corners already placed)
            for y in range(y0 + 1, y1):
                data[idx(x0, y)] = WALL_LEFT

            # Right wall (excluding corners already placed)
            for y in range(y0 + 1, y1):
                data[idx(x1, y)] = WALL_RIGHT

            # ── doorway openings ──
            # Each room gets doorways toward adjacent rooms/corridors.
            # Place openings at the midpoint of each wall that faces a corridor.

            mid_x = (x0 + x1) // 2  # tile 3 or 4 from room left
            mid_y = (y0 + y1) // 2

            # Right doorway (if not rightmost column, i.e. corridor exists)
            if c < COLS - 1:
                data[idx(x1, mid_y)] = 0
                data[idx(x1, mid_y + 1)] = 0

            # Bottom doorway (if not bottom row)
            if r < ROWS - 1:
                data[idx(mid_x, y1)] = 0
                data[idx(mid_x + 1, y1)] = 0

            # Left doorway (if not leftmost column)
            if c > 0:
                data[idx(x0, mid_y)] = 0
                data[idx(x0, mid_y + 1)] = 0

            # Top doorway (if not top row)
            if r > 0:
                data[idx(mid_x, y0)] = 0
                data[idx(mid_x + 1, y0)] = 0

    return data


# ── build furniture layer ────────────────────────────────────────────────────
def build_furniture():
    """Place 2-3 furniture items per room from the themed tileset."""
    data = [0] * (W * H)

    for c in range(COLS):
        for r in range(ROWS):
            x0, y0, x1, y1 = room_rect_v2(c, r)
            name = ROOM_NAMES[(c, r)]
            fg = ROOM_THEME[name]
            furn = FURNITURE_LOCALS[fg]

            # Place furniture at fixed interior positions (avoiding walls)
            # Interior safe zone: x0+1..x1-1, y0+1..y1-1
            ix, iy = x0 + 2, y0 + 2
            data[idx(ix, iy)] = fg + furn[0]

            ix2, iy2 = x0 + 5, y0 + 2
            data[idx(ix2, iy2)] = fg + furn[1]

            ix3, iy3 = x0 + 3, y0 + 5
            data[idx(ix3, iy3)] = fg + furn[2]

    return data


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    with open(MAP_PATH, "r") as f:
        tilemap = json.load(f)

    # Validate basic structure
    assert tilemap["width"] == W, f"Expected width {W}, got {tilemap['width']}"
    assert tilemap["height"] == H, f"Expected height {H}, got {tilemap['height']}"

    # Build new tile data
    new_floor = build_floor()
    new_walls = build_walls()
    new_furniture = build_furniture()

    assert len(new_floor) == W * H, f"Floor data length {len(new_floor)} != {W*H}"
    assert len(new_walls) == W * H, f"Walls data length {len(new_walls)} != {W*H}"
    assert len(new_furniture) == W * H, f"Furniture data length {len(new_furniture)} != {W*H}"

    # Update layers
    for layer in tilemap["layers"]:
        if layer.get("type") == "tilelayer":
            name = layer["name"]
            if name == "floor":
                layer["data"] = new_floor
            elif name == "walls":
                layer["data"] = new_walls
            elif name == "furniture":
                layer["data"] = new_furniture
            elif name in ("ground", "objects", "overhead"):
                # Clear these generic layers (they had minimal content)
                layer["data"] = [0] * (W * H)
        # objectgroup layers (props, collisions, spawns, pois) are left untouched

    # Write output
    with open(MAP_PATH, "w") as f:
        json.dump(tilemap, f, indent=1)
        f.write("\n")

    print(f"✓ Wrote {MAP_PATH}")
    print(f"  floor:     {sum(1 for t in new_floor if t != 0)} non-empty tiles")
    print(f"  walls:     {sum(1 for t in new_walls if t != 0)} non-empty tiles")
    print(f"  furniture: {sum(1 for t in new_furniture if t != 0)} non-empty tiles")

    # Quick sanity checks
    layer_names = [l["name"] for l in tilemap["layers"]]
    print(f"  layers:    {layer_names}")

    obj_layers = [l["name"] for l in tilemap["layers"] if l.get("type") == "objectgroup"]
    print(f"  objectgroups preserved: {obj_layers}")

    tile_layers = [l for l in tilemap["layers"] if l.get("type") == "tilelayer"]
    for tl in tile_layers:
        assert len(tl["data"]) == W * H, f"Layer {tl['name']} has {len(tl['data'])} tiles, expected {W*H}"

    print("  All data arrays are 1200 elements ✓")
    print(f"  Tilesets count: {len(tilemap['tilesets'])}")


if __name__ == "__main__":
    main()
