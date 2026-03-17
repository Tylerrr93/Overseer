# Digitized Overseer — Architecture Blueprint

> Phase 1: Project Foundation

---

## Quick Start

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # Production build → /dist  (deploy to GitHub Pages)
npm run typecheck  # tsc --noEmit
```

---

## File / Folder Structure

```
overseer/
├── index.html                    # Host page + boot screen
├── vite.config.ts                # Vite + path aliases
├── tsconfig.json                 # Strict TS config
├── package.json
│
└── src/
    ├── main.ts                   # ★ Entry point — wires everything, starts loop
    │
    ├── types/                    # Pure TypeScript interfaces (no logic)
    │   ├── content.ts            # ItemDef, RecipeDef, DoodadDef, SlotDef …
    │   └── state.ts              # GameState, DoodadState, PlayerState, Chunk …
    │
    ├── engine/                   # ★ Core engine — NEVER imports from src/game/
    │   ├── core/
    │   │   ├── Registry.ts       # Immutable content store; all lookups go here
    │   │   ├── StateManager.ts   # Single mutable state + save/load helpers
    │   │   ├── GameLoop.ts       # RAF loop, delta time, update → render
    │   │   ├── EventBus.ts       # Typed pub/sub; systems talk through events
    │   │   └── GameConfig.ts     # All magic numbers in one place
    │   │
    │   ├── rendering/
    │   │   └── Renderer.ts       # Canvas 2D; tiles → doodads → player → HUD
    │   │
    │   ├── systems/
    │   │   ├── DoodadSystem.ts   # Tick all placed doodads; runs crafting logic
    │   │   └── PlayerSystem.ts   # Keyboard input → player movement
    │   │
    │   └── world/
    │       └── WorldGen.ts       # Seeded LCG procedural chunk generation
    │
    └── game/                     # ★ Content layer — NEVER imported by engine
        └── content/
            ├── index.ts          # bootstrapContent() — registers everything
            ├── items.ts          # All ItemDef objects
            ├── recipes.ts        # All RecipeDef objects
            └── doodads.ts        # All DoodadDef objects
```

### The Dependency Hierarchy (enforced by TS path aliases)

```
index.html
    └── src/main.ts
            ├── @game/content  (registers content at boot, then done)
            └── @engine/*      (owns the running game)
                    └── @types/*  (shared interfaces only — no logic)
```

`@engine` **never** imports `@game`. The Registry is the only bridge.

---

## Core Systems

### Registry
A singleton `Map` store. Content files call `registry.register*()` at boot.
The engine calls `registry.get*()` at runtime. Content is **frozen** on registration.

### StateManager (`sm`)
The single mutable `GameState` object. All mutations go through typed helper
methods. The raw state is a plain JSON object at all times — `sm.save()` is
just `JSON.stringify(sm.state)`.

### EventBus (`bus`)
Zero-coupling typed pub/sub. Systems never call each other directly:
```
DoodadSystem ──emit("doodad:craft:finish")──► UI system / sound system / …
```

### GameLoop
```
RAF tick
  │
  ├── PlayerSystem.update(deltaMs)         ← input → move
  ├── WorldGen.ensureChunksAround(…)       ← generate terrain on demand
  ├── DoodadSystem.update(deltaMs)         ← tick all placed buildings
  │     └── per doodad:
  │           accumulate delta
  │           when accumulated ≥ tickInterval:
  │             resolveRecipe()
  │             canConsumeInputs() → consumeInputs()
  │             advance crafting timer
  │             on complete: canOutputItems() → writeOutputs()
  │             emit events
  └── Renderer.render()                    ← draw everything
```

### DoodadSystem — Tick Lifecycle
```
tick(doodad, deltaMs)
  │
  ├─ Accumulate deltaMs
  ├─ Guard: accumulated < interval → return (not yet)
  │
  └─ runTick()
        ├─ Guard: no machineTag → return (belt/power handled elsewhere)
        ├─ resolveRecipe() → first recipe whose inputs match current slots
        ├─ Guard: powerDraw > 0 && !powered → return (no power)
        │
        ├─ [no active crafting] →
        │     canConsumeInputs()  — check slot quantities
        │     consumeInputs()     — deduct from input slots (lock-in)
        │     crafting = { recipeId, elapsedMs: 0 }
        │     emit "doodad:craft:start"
        │
        ├─ crafting.elapsedMs += tickMs
        │
        └─ [elapsedMs ≥ craftingTime] →
              canOutputItems()  — check output slot capacity
              writeOutputs()    — insert into output slots
              crafting = null
              emit "doodad:craft:finish"
              (if output full → stall; backpressure propagates upstream)
```

---

## Adding New Content

### New Item
Open `src/game/content/items.ts`, add to the array:
```ts
{
  id: "titanium_plate", name: "Titanium Plate",
  description: "Aerospace-grade structural metal.",
  sprite: "#c0d8e0", stackSize: 50, tags: ["refined", "metal", "advanced"],
}
```
Done. No engine changes.

### New Recipe
Open `src/game/content/recipes.ts`, add to the array:
```ts
{
  id: "fab_titanium", name: "Fabricate Titanium Plate",
  inputs:  [{ itemId: "titanium_ore", qty: 3 }, { itemId: "coal", qty: 1 }],
  outputs: [{ itemId: "titanium_plate", qty: 1 }],
  craftingTime: 5000,
  machineTag: "advanced_fabricator",
}
```
Done. If `machineTag` matches an existing doodad, it works immediately.

### New Doodad
Open `src/game/content/doodads.ts`, add to the array:
```ts
{
  id: "advanced_fabricator", name: "Advanced Fabricator",
  description: "High-throughput precision assembly.",
  sprite: "#3a5a9a",
  footprint: { w: 4, h: 3 },
  slots: [
    { role: "input",  capacity: 200 },
    { role: "input",  capacity: 200 },
    { role: "output", capacity: 200 },
  ],
  ports: [
    { dx: 0, dy: 0, dir: "N", role: "input" },
    { dx: 1, dy: 0, dir: "N", role: "input" },
    { dx: 3, dy: 2, dir: "S", role: "output" },
  ],
  machineTag: "advanced_fabricator",
  powerDraw: 150,
}
```
Done. The DoodadSystem automatically picks up all recipes with `machineTag: "advanced_fabricator"`.

---

## Phase 2 Roadmap (suggested order)

| Phase | Feature | Key files to add |
|-------|---------|-----------------|
| 2a | Build mode UI + grid overlay | `engine/systems/BuildSystem.ts`, `game/ui/BuildUI.ts` |
| 2b | Belt / logistics system | `engine/systems/BeltSystem.ts` |
| 2c | Power grid | `engine/systems/PowerSystem.ts` |
| 2d | Extractor system | `engine/systems/ExtractorSystem.ts` |
| 2e | Player inventory UI | `game/ui/InventoryUI.ts` |
| 2f | Spatial hash / chunk culling | `engine/world/SpatialHash.ts` |
| 2g | AMI drone entities | `engine/entities/AMI.ts` |
| 2h | Spritesheet renderer | Replace placeholder rects in `Renderer.ts` |

---

## State Schema Version
Bump `SAVE_VERSION` in `GameConfig.ts` whenever `GameState` has a
breaking change. `StateManager.load()` rejects mismatched saves gracefully.
