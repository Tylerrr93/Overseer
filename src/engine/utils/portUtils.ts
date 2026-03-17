// ============================================================
//  src/engine/utils/portUtils.ts
//
//  All rotation + port math lives here so it's written once
//  and tested once.  Three systems import from this file.
//
//  Coordinate system:
//    rotation 0 = N up  (default, as authored in DoodadDef)
//    rotation 1 = 90° CW  (E up)
//    rotation 2 = 180°    (S up)
//    rotation 3 = 270° CW (W up)
//
//  Port offset rotation:
//    A port at (dx, dy) on an unrotated W×H doodad moves to a
//    new local position when the doodad is rotated.  The
//    formulas below apply the standard 2D CW rotation matrix
//    to integer tile offsets, adjusted for the new bounding box.
// ============================================================

import type { DoodadPort, CardinalDir } from "@t/content";
import type { DoodadState, TilePos }    from "@t/state";

// ── Direction helpers ─────────────────────────────────────────

/** One step in a cardinal direction → tile delta. */
export const DIR_DELTA: Record<CardinalDir, { dx: number; dy: number }> = {
  N: { dx:  0, dy: -1 },
  E: { dx:  1, dy:  0 },
  S: { dx:  0, dy:  1 },
  W: { dx: -1, dy:  0 },
};

/** Rotate a cardinal direction CW by `steps` × 90°. */
export function rotateDir(dir: CardinalDir, steps: number): CardinalDir {
  const order: CardinalDir[] = ["N", "E", "S", "W"];
  return order[((order.indexOf(dir) + steps) % 4 + 4) % 4]!;
}

/** Map placementRotation index (0-3) to cardinal direction of belt travel. */
export function rotationToDir(rot: number): CardinalDir {
  const dirs: CardinalDir[] = ["N", "E", "S", "W"];
  return dirs[((rot % 4) + 4) % 4]!;
}

// ── Footprint after rotation ──────────────────────────────────

export function rotatedFootprint(w: number, h: number, rotation: number) {
  return (rotation % 2 === 0) ? { w, h } : { w: h, h: w };
}

// ── Port absolute position ─────────────────────────────────────

/**
 * Returns the absolute tile position of a port on a placed doodad,
 * accounting for the doodad's rotation.
 *
 * Also returns the `facingDir` — the rotated direction the port
 * points outward — and the adjacent tile it connects to.
 */
export function getAbsolutePort(
  doodad: DoodadState,
  port:   DoodadPort,
  defW:   number,
  defH:   number,
): {
  portTile:    TilePos;   // tile the port itself sits on
  adjacentTile: TilePos;  // tile just outside the port (where a belt connects)
  facingDir:   CardinalDir;
} {
  const rot = doodad.rotation;

  // Rotate the local port offset (dx,dy) around the footprint centre.
  // For CW rotation by `rot` steps on a W×H grid:
  //   rot=0: (dx, dy)           new bounds: W × H
  //   rot=1: (H-1-dy, dx)       new bounds: H × W
  //   rot=2: (W-1-dx, H-1-dy)   new bounds: W × H
  //   rot=3: (dy, W-1-dx)       new bounds: H × W
  let rdx: number, rdy: number;
  const w = defW, h = defH;

  switch (rot) {
    case 1:  rdx = h - 1 - port.dy; rdy = port.dx;         break;
    case 2:  rdx = w - 1 - port.dx; rdy = h - 1 - port.dy; break;
    case 3:  rdx = port.dy;          rdy = w - 1 - port.dx; break;
    default: rdx = port.dx;          rdy = port.dy;          break; // rot=0
  }

  const portTile: TilePos = {
    tx: doodad.origin.tx + rdx,
    ty: doodad.origin.ty + rdy,
  };

  const facingDir   = rotateDir(port.dir, rot);
  const delta       = DIR_DELTA[facingDir];
  const adjacentTile: TilePos = {
    tx: portTile.tx + delta.dx,
    ty: portTile.ty + delta.dy,
  };

  return { portTile, adjacentTile, facingDir };
}
