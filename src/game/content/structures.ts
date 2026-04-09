// ============================================================
//  src/game/content/structures.ts
//  Pre-built structure blueprints placed by WorldGen.
//
//  Each StructureDef describes a named ruined building as a 2-D
//  grid of terrain tiles and optional pre-placed doodads.
//  WorldGen reads these from the Registry and stamps them into
//  chunks — the engine never hardcodes what a building looks like.
//
//  Layout notation used by the `layout()` helper:
//    W  = ruined_wall   (impassable)
//    .  = ruin_floor    (plain floor, passable)
//    A  = asphalt_cracked (loading bay / apron)
//    F  = ruin_floor + ruined_fabricator ORIGIN (2×2)
//    f  = ruin_floor    (fabricator footprint continuation — no doodad)
//    R  = ruin_floor + rusted_storage (1×1)
//
//  For multi-tile doodads, only the top-left (origin) cell carries
//  the doodadId.  The remaining footprint cells must be explicit
//  floor tiles so WorldGen writes the correct terrain beneath.
// ============================================================

import type { StructureDef, StructureTile } from "@t/content";

// ── Layout helper ─────────────────────────────────────────────
//  Converts a readable string grid into a flat StructureTile[].
//  Whitespace/unknown chars are ignored (treated as void).

type TileLegend = Record<string, Omit<StructureTile, "dx" | "dy">>;

function layout(rows: string[], legend: TileLegend): StructureTile[] {
  const tiles: StructureTile[] = [];
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx]!;
      const entry = legend[ch];
      if (entry === undefined) continue;
      tiles.push({ dx, dy, ...entry });
    }
  });
  return tiles;
}

// ── Shared legend entries ──────────────────────────────────────

const WALL:    Omit<StructureTile, "dx" | "dy"> = { terrain: "ruined_wall" };
const FLOOR:   Omit<StructureTile, "dx" | "dy"> = { terrain: "ruin_floor"  };
const APRON:   Omit<StructureTile, "dx" | "dy"> = { terrain: "asphalt_cracked" };
const FAB:     Omit<StructureTile, "dx" | "dy"> = { terrain: "ruin_floor", doodadId: "ruined_fabricator" };
const STORAGE: Omit<StructureTile, "dx" | "dy"> = { terrain: "ruin_floor", doodadId: "rusted_storage" };

// ── Blueprint definitions ──────────────────────────────────────

export const STRUCTURES: StructureDef[] = [

  // ──────────────────────────────────────────────────────────────
  //  Ruined Assembly Plant  (10 × 7)
  //
  //  A mid-size pre-collapse factory floor.  Two collapsed fabricator
  //  bays flank a central storage area.  The south face opens onto a
  //  cracked asphalt loading apron that aligns with road networks.
  //
  //  Layout (10 wide × 7 tall):
  //    WWWWWWWWWW
  //    W.Ff..Ff.W   ← two ruined fabricators (each 2×2)
  //    W.ff..ff.W   ← fabricator footprints
  //    W....RR..W   ← two rusted storage tanks
  //    W........W
  //    WWWWWWWWWW   ← south wall with gap
  //    AAAAAAAAAA   ← loading apron (asphalt)
  // ──────────────────────────────────────────────────────────────
  {
    id:           "ruined_assembly_plant",
    name:         "Ruined Assembly Plant",
    width:        10,
    height:       7,
    tags:         ["city", "industrial"],
    minCityNoise: 0.60,
    requiresRoad: true,
    tiles: layout([
      "WWWWWWWWWW",
      "W.Ff..Ff.W",
      "W.ff..ff.W",
      "W....RR..W",
      "W........W",
      "WWWWWWWWWW",
      "AAAAAAAAAA",
    ], {
      "W": WALL,
      ".": FLOOR,
      "F": FAB,
      "f": FLOOR,   // fabricator footprint — plain floor, doodad covers it
      "R": STORAGE,
      "A": APRON,
    }),
  },

  // ──────────────────────────────────────────────────────────────
  //  Abandoned Storage Depot  (6 × 5)
  //
  //  A squat warehouse, mostly stripped.  Three rusted tanks remain.
  //  Smaller footprint so it fits in tighter city blocks.
  //
  //  Layout (6 wide × 5 tall):
  //    WWWWWW
  //    W.R..W
  //    W...RW
  //    W.R..W
  //    WWWWWW
  // ──────────────────────────────────────────────────────────────
  {
    id:           "abandoned_storage_depot",
    name:         "Abandoned Storage Depot",
    width:        6,
    height:       5,
    tags:         ["city", "industrial"],
    minCityNoise: 0.55,
    requiresRoad: false,
    tiles: layout([
      "WWWWWW",
      "W.R..W",
      "W...RW",
      "W.R..W",
      "WWWWWW",
    ], {
      "W": WALL,
      ".": FLOOR,
      "R": STORAGE,
    }),
  },

  // ──────────────────────────────────────────────────────────────
  //  Collapsed Outpost  (4 × 4)
  //
  //  A tiny guard post or junction relay station.  One tank, minimal
  //  footprint.  Spawns in even light-city zones.
  //
  //  Layout (4 wide × 4 tall):
  //    WWWW
  //    W..W
  //    WR.W
  //    WWWW
  // ──────────────────────────────────────────────────────────────
  {
    id:           "collapsed_outpost",
    name:         "Collapsed Outpost",
    width:        4,
    height:       4,
    tags:         ["city"],
    minCityNoise: 0.52,
    requiresRoad: false,
    tiles: layout([
      "WWWW",
      "W..W",
      "WR.W",
      "WWWW",
    ], {
      "W": WALL,
      ".": FLOOR,
      "R": STORAGE,
    }),
  },

  // ──────────────────────────────────────────────────────────────
  //  Industrial Courtyard  (8 × 8)
  //
  //  An open-air compound — walls form a perimeter around a cracked
  //  asphalt yard with one large fabricator bay on the north end.
  //  Dense city zones only.
  //
  //  Layout (8 wide × 8 tall):
  //    WWWWWWWW
  //    W.Ff...W
  //    W.ff...W
  //    W......W
  //    W..RR..W
  //    W......W
  //    WAAAAAAW
  //    WWWWWWWW
  // ──────────────────────────────────────────────────────────────
  {
    id:           "industrial_courtyard",
    name:         "Industrial Courtyard",
    width:        8,
    height:       8,
    tags:         ["city", "industrial"],
    minCityNoise: 0.63,
    requiresRoad: true,
    tiles: layout([
      "WWWWWWWW",
      "W.Ff...W",
      "W.ff...W",
      "W......W",
      "W..RR..W",
      "W......W",
      "WAAAAAAW",
      "WWWWWWWW",
    ], {
      "W": WALL,
      ".": FLOOR,
      "F": FAB,
      "f": FLOOR,
      "R": STORAGE,
      "A": APRON,
    }),
  },
];
