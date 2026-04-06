# Digitized Overseer

A post-apocalyptic factory automation sandbox set on a ruined Earth in the Bobiverse universe. Hand-harvest scarce resource nodes, build extractors, smelt ore, wire up a power grid, and automate production lines — all running in a PixiJS v8 WebGL renderer deployed to GitHub Pages.

---

## Quick Start

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # Production build → /dist  (deploy to GitHub Pages)
npm run typecheck  # tsc --noEmit
```

---

## Gameplay

### World
The world is procedurally generated from a seeded noise function. Terrain is post-apocalyptic desolation: blasted ground, rubble fields, exposed bedrock, irradiated craters, and sparse water bodies. Resources do not exist as tiles — they exist as **resource nodes** (features) layered on top of terrain.

### Resource Nodes
Nodes are scattered sparingly across the world using a local-maximum cluster algorithm. Each node has a finite yield and is destroyed when depleted (configurable via `RESOURCE_DEPLETION_ENABLED` in `GameConfig`).

| Node | Yields | Harvest time |
|------|--------|-------------|
| Scrap Deposit | Scrap Metal | 1.8 s (infinite) |
| Iron Vein | Iron Ore | 3.5 s |
| Copper Vein | Copper Ore | 3.2 s |
| Coal Seam | Coal | 2.8 s |

### Manual Harvesting
Stand on a resource node and **hold LMB or Space** to harvest. A progress bar appears above the tile. Stepping off the tile cancels the harvest. Harvesting works even while menus are open.

### Buildings & Machines

| Machine | Function |
|---------|----------|
| Iron Extractor | Place on an iron vein; fuel-powered; drills iron ore |
| Coal Extractor | Place on a coal seam; grid-powered (seed with fuel via F) |
| Basic Smelter | Smelts ore into plates; coal-fired; 2×2 |
| Fabricator | Electric precision assembler; crafts components; 3×3 |
| Carbon Press | Compresses coal into carbon rods; 2×2 |
| Personal Fabricator | Always-available wrist device; slow but no power needed |
| Transport Belt | Moves items along a direction; chainable |
| Power Node | Distributes grid power; connects nodes within 6 tiles, powers machines within 4 |
| Coal Generator | Burns coal to produce 500 W |
| Storage Chest | Large buffer; accepts items from belts on all sides |

### Power Grid
Machines with a `powerDraw > 0` require grid power or fuel to operate. Place **Coal Generators** and connect them via **Power Nodes**. The `⚡` overlay (Alt or the action bar button) shows live network stats: supply, demand, surplus, satisfaction %, and fuel estimates.

### Belts & Logistics
Transport Belts move items one tile per direction. Extractors and machines push items into adjacent belts from their output ports. Belt direction is set when placed; items flow automatically.

### Save System
Progress is auto-saved every 60 seconds. The **⚙ System** menu offers manual save, load, wipe, and JSON export/import. Save version is tracked — mismatched versions are rejected cleanly.

---

## Controls

| Input | Action |
|-------|--------|
| WASD / Arrow keys | Move player |
| LMB (hold) / Space (hold) | Harvest resource node under player |
| E | Toggle inventory |
| B | Toggle fabrication menu |
| F | Interact with nearest machine / chest |
| Alt | Toggle power grid overlay |
| 1–9 / 0 | Select action bar slot (0 = deconstruct) |
| R | Rotate placement |
| RMB / Esc | Cancel build / close active panel |
| Scroll wheel | Zoom in/out |
| Drag panel header | Move any UI panel |

---

## File Structure

```
src/
├── main.ts                         # Entry point — wires systems, starts loop
│
├── types/
│   ├── content.ts                  # ItemDef, RecipeDef, DoodadDef, FeatureDef …
│   └── state.ts                    # GameState, Chunk, FeatureState, PlayerState …
│
├── engine/                         # Core engine — never imports from src/game/
│   ├── core/
│   │   ├── GameConfig.ts           # All tuning constants in one place
│   │   ├── Registry.ts             # Immutable content store (items/doodads/features)
│   │   ├── StateManager.ts         # Single mutable GameState; save / load / wipe
│   │   ├── GameLoop.ts             # RAF loop, delta time, system update order
│   │   ├── EventBus.ts             # Typed pub/sub — systems communicate via events
│   │   └── PanelManager.ts         # Tracks open panels; z-index stacking
│   │
│   ├── rendering/
│   │   └── Renderer.ts             # PixiJS v8 WebGL renderer
│   │                               # Layers: tile → feature → belt → doodad →
│   │                               #         item → entity → overlay → HUD
│   │
│   ├── systems/
│   │   ├── PlayerSystem.ts         # Input → movement + feature harvesting
│   │   ├── BuildSystem.ts          # Ghost placement, rotation, cost validation
│   │   ├── DoodadSystem.ts         # Crafting tick, fuel burn, power gating
│   │   ├── ExtractorSystem.ts      # Reads chunk features map; depletion logic
│   │   ├── BeltSystem.ts           # Item transport along belt segments
│   │   ├── GeneratorSystem.ts      # Coal burn → power generation
│   │   ├── PowerSystem.ts          # Network flood-fill; powered state per machine
│   │   └── DoodadInteractionSystem.ts  # Proximity detection for F-key interaction
│   │
│   ├── world/
│   │   └── WorldGen.ts             # Seeded noise terrain + feature scatter pass
│   │
│   └── utils/
│       ├── portUtils.ts            # Port/rotation math helpers
│       └── SerializationUtils.ts   # JSON export, file import, filename building
│
└── game/                           # Content layer — never imported by engine
    ├── content/
    │   ├── index.ts                # bootstrapContent() — registers everything
    │   ├── items.ts                # All ItemDef objects
    │   ├── recipes.ts              # All RecipeDef objects
    │   ├── doodads.ts              # All DoodadDef objects
    │   └── features.ts             # All FeatureDef objects (resource nodes)
    │
    └── ui/
        ├── UIPanel.ts              # Abstract base — drag, resize, ESC close, z-stack
        ├── UIStyleManager.ts       # Injects shared CSS; drives --ui-scale on :root
        ├── ActionBarUI.ts          # Persistent hotbar + panel shortcut buttons
        ├── InventoryUI.ts          # Player inventory grid + gather toast feedback
        ├── BuildUI.ts              # Doodad selection cards + build-mode HUD strip
        ├── ChestUI.ts              # Storage chest interaction (not a UIPanel)
        ├── DoodadUI.ts             # Machine interaction panel (not a UIPanel)
        ├── PowerUI.ts              # Live power network stats panel
        └── SystemMenuUI.ts         # Save/load/wipe/export/import + UI scale slider
```

---

## Architecture

### The Dependency Rule
```
index.html
  └── src/main.ts
        ├── @game/content   (registers content at boot, then done)
        └── @engine/*       (owns the running game)
              └── @t/*      (shared interfaces only — no logic)
```

`@engine` **never** imports `@game`. The `Registry` singleton is the only bridge — content registers definitions at boot, the engine reads them at runtime.

### Key Singletons

| Export | File | Purpose |
|--------|------|---------|
| `registry` | `Registry.ts` | Frozen content definitions |
| `sm` | `StateManager.ts` | Mutable `GameState`; the only source of truth |
| `bus` | `EventBus.ts` | Typed pub/sub event channel |

### GameState
Plain JSON-serializable object. Save is `JSON.stringify(sm.state)`. Load is `JSON.parse` + field migrations. Current save version: **3**.

### Resource Node System
Nodes are stored as `Record<"lx,ly", FeatureState>` on each `Chunk`. WorldGen places them via a secondary noise pass with a local-maximum cluster algorithm (controlled by `RESOURCE_SPARSITY` and `RESOURCE_CLUSTER_SIZE`). `ExtractorSystem` reads the same map; `PlayerSystem` writes harvest progress into `PlayerState.harvestProgress` so the `Renderer` can draw the progress bar without any extra coupling.

### UI Scale
All UI sizes are driven by `--ui-scale` on `:root`. `UIStyleManager.applyScale(n)` is the single write point. Scale is persisted to `localStorage` and applied at step 0 of boot (before any panel is constructed) so GitHub Pages and local dev render at a consistent size. The user can adjust it via **⚙ System → Display Scale**.

---

## Adding New Content

### New Item
`src/game/content/items.ts` — add to the array. No engine changes.

### New Recipe
`src/game/content/recipes.ts` — add to the array. If `machineTag` matches an existing doodad, it works immediately.

### New Resource Node
`src/game/content/features.ts` — add a `FeatureDef`:
```ts
{
  id:            "titanium_deposit",
  name:          "Titanium Deposit",
  sprite:        "#a0c0d8",
  yieldsItemId:  "titanium_ore",
  baseYield:     300,
  extractorTag:  "extractor_titanium",
  harvestTimeMs: 4000,
}
```
WorldGen automatically picks it up via `registry.allFeatures()` — no engine changes.

### New Building
`src/game/content/doodads.ts` — add a `DoodadDef`. The renderer, build system, and doodad system pick it up automatically.

---

## Tech Stack

| | |
|-|-|
| Language | TypeScript 5.4 (strict) |
| Renderer | PixiJS v8 (WebGL) |
| Build | Vite 8 |
| Target | ES2022, deployed to GitHub Pages |
| Persistence | `localStorage` (save data + UI scale) |
