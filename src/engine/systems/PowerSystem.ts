// ============================================================
//  src/engine/systems/PowerSystem.ts
//
//  Runs each frame AFTER GeneratorSystem, BEFORE DoodadSystem.
//
//  Step A — Networking:
//    Find all power_nodes. Union-find groups them into distinct
//    networks based on connectRadius tile distance.
//
//  Step B — Attachment:
//    For every machine (powerDraw > 0) and every generator
//    (powerGeneration > 0), find the nearest power_node within
//    powerRadius tiles. Attach to that node's network.
//
//  Step C — Calculation:
//    Per network: sum active generator output (watts).
//    Sum machine demand (watts).
//
//  Step D — Distribution:
//    supply >= demand → set powered = true for all machines.
//    supply < demand  → set powered = false (DoodadSystem
//                        fuel fallback kicks in).
//    No network       → powered = false.
//
//  Exposes connection data for Renderer to visualise.
// ============================================================

import { sm }              from "@engine/core/StateManager";
import { registry }        from "@engine/core/Registry";
import { GameConfig }      from "@engine/core/GameConfig";
import { GeneratorSystem } from "@engine/systems/GeneratorSystem";

const T = GameConfig.TILE_SIZE;

// ── Public interface for Renderer ────────────────────────────

export interface PowerConnection {
  ax: number; ay: number;
  bx: number; by: number;
}

export interface PowerAttachment {
  mx: number; my: number;
  nx: number; ny: number;
  powered: boolean;
}

/** Per-network stats exposed for the UI panel. */
export interface NetworkSummary {
  id:               number;
  supplyW:          number;   // total active generation watts
  demandW:          number;   // total machine draw watts
  nodeCount:        number;
  generatorCount:   number;
  activeGenerators: number;
  machineCount:     number;
  poweredMachines:  number;
  satisfied:        boolean;  // supply >= demand && supply > 0
}

// ─────────────────────────────────────────────────────────────

export class PowerSystem {
  nodeConnections:  PowerConnection[]  = [];
  attachments:      PowerAttachment[]  = [];
  /** Per-network stats for the power UI panel. */
  networkSummaries: NetworkSummary[]   = [];
  /** Unconnected machines (powerDraw > 0, no node in range). */
  unconnectedMachines: number = 0;

  update(_deltaMs: number): void {
    this.nodeConnections    = [];
    this.attachments        = [];
    this.networkSummaries   = [];
    this.unconnectedMachines = 0;

    const allDoodads = sm.allDoodads();

    // ── Separate doodad types ──────────────────────────────

    const nodes      = allDoodads.filter(d => {
      if (d.construction) return false;
      const def = registry.findDoodad(d.defId);
      return def && (def.powerRadius ?? 0) > 0;
    });

    const generators = allDoodads.filter(d => {
      if (d.construction) return false;
      const def = registry.findDoodad(d.defId);
      return def && (def.powerGeneration ?? 0) > 0;
    });

    const machines   = allDoodads.filter(d => {
      if (d.construction) return false;
      const def = registry.findDoodad(d.defId);
      return def && def.powerDraw > 0;
    });

    // Under-construction doodads are never powered
    for (const d of allDoodads) {
      if (d.construction) d.powered = false;
    }

    if (nodes.length === 0) {
      // No nodes — all machines use fuel fallback
      for (const m of machines) m.powered = false;
      return;
    }

    // ── Step A: Build node networks (union-find) ───────────

    // networkId[i] = which network node i belongs to (index into nodes[])
    const networkId = nodes.map((_, i) => i);

    const find = (i: number): number => {
      while (networkId[i] !== i) {
        networkId[i] = networkId[networkId[i]!]!; // path compression
        i = networkId[i]!;
      }
      return i;
    };

    const union = (a: number, b: number): void => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) networkId[ra] = rb;
    };

    for (let i = 0; i < nodes.length; i++) {
      const ni = nodes[i]!;
      const defI = registry.getDoodad(ni.defId);
      const cx = (ni.origin.tx + defI.footprint.w / 2) * T;
      const cy = (ni.origin.ty + defI.footprint.h / 2) * T;
      const connectRadiusPx = (defI.connectRadius ?? 6) * T;

      for (let j = i + 1; j < nodes.length; j++) {
        const nj = nodes[j]!;
        const defJ = registry.getDoodad(nj.defId);
        const dx = (nj.origin.tx + defJ.footprint.w / 2) * T - cx;
        const dy = (nj.origin.ty + defJ.footprint.h / 2) * T - cy;
        if (Math.hypot(dx, dy) <= connectRadiusPx) {
          union(i, j);
          // Record for renderer
          const cjx = (nj.origin.tx + defJ.footprint.w / 2) * T;
          const cjy = (nj.origin.ty + defJ.footprint.h / 2) * T;
          this.nodeConnections.push({ ax: cx, ay: cy, bx: cjx, by: cjy });
        }
      }
    }

    // Map root network id → full stats
    const networks = new Map<number, {
      supply:          number;
      demand:          number;
      machineIds:      string[];
      nodeCount:       number;
      genCount:        number;
      activeGenCount:  number;
    }>();

    const getNet = (root: number) => {
      if (!networks.has(root)) {
        networks.set(root, {
          supply: 0, demand: 0, machineIds: [],
          nodeCount: 0, genCount: 0, activeGenCount: 0,
        });
      }
      return networks.get(root)!;
    };

    // Count nodes per network
    for (let i = 0; i < nodes.length; i++) {
      getNet(find(i)).nodeCount += 1;
    }

    // Precompute node centres
    const nodeCentres = nodes.map(n => {
      const def = registry.getDoodad(n.defId);
      return {
        x: (n.origin.tx + def.footprint.w / 2) * T,
        y: (n.origin.ty + def.footprint.h / 2) * T,
      };
    });

    // ── Step B: Attach generators ──────────────────────────

    for (const gen of generators) {
      const defG = registry.getDoodad(gen.defId);
      const gcx  = (gen.origin.tx + defG.footprint.w / 2) * T;
      const gcy  = (gen.origin.ty + defG.footprint.h / 2) * T;
      const nodeIdx = this.nearestNodeIdx(gcx, gcy, nodes, nodeCentres, defG.powerRadius ?? 4);

      if (nodeIdx === -1) continue;

      const root = find(nodeIdx);
      const net  = getNet(root);
      const nodeDef = registry.getDoodad(nodes[nodeIdx]!.defId);
      const nc = nodeCentres[nodeIdx]!;

      net.genCount += 1;
      if (GeneratorSystem.isActive(gen)) {
        net.supply           += defG.powerGeneration ?? 0;
        net.activeGenCount   += 1;
      }

      this.attachments.push({
        mx: gcx, my: gcy,
        nx: nc.x, ny: nc.y,
        powered: GeneratorSystem.isActive(gen),
      });
      // Suppress unused
      void nodeDef;
    }

    // ── Step B: Attach machines ───────────────────────────

    for (const machine of machines) {
      const defM = registry.getDoodad(machine.defId);
      const mcx  = (machine.origin.tx + defM.footprint.w / 2) * T;
      const mcy  = (machine.origin.ty + defM.footprint.h / 2) * T;
      const nodeIdx = this.nearestNodeIdx(mcx, mcy, nodes, nodeCentres, defM.powerRadius ?? 4);

      if (nodeIdx === -1) {
        machine.powered = false;
        this.unconnectedMachines += 1;
        continue;
      }

      const root = find(nodeIdx);
      const net  = getNet(root);
      net.demand     += defM.powerDraw;
      net.machineIds.push(machine.id);

      const nc = nodeCentres[nodeIdx]!;
      this.attachments.push({
        mx: mcx, my: mcy,
        nx: nc.x, ny: nc.y,
        powered: false, // filled in Step D
      });
    }

    // ── Steps C & D: Calculate and distribute ─────────────

    for (const [, net] of networks) {
      const powered = net.supply >= net.demand && net.supply > 0;
      for (const id of net.machineIds) {
        const d = sm.getDoodad(id);
        if (d) d.powered = powered;
      }
    }

    // Build public summaries for UI panel
    for (const [id, net] of networks) {
      const satisfied = net.supply >= net.demand && net.supply > 0;
      const poweredCount = satisfied ? net.machineIds.length : 0;
      this.networkSummaries.push({
        id,
        supplyW:          net.supply,
        demandW:          net.demand,
        nodeCount:        net.nodeCount,
        generatorCount:   net.genCount,
        activeGenerators: net.activeGenCount,
        machineCount:     net.machineIds.length,
        poweredMachines:  poweredCount,
        satisfied,
      });
    }
    this.networkSummaries.sort((a, b) => b.supplyW - a.supplyW);

    // Refresh attachment powered flags for renderer
    for (const att of this.attachments) {
      // Find the machine at this position and read its powered state
      // (approximate — close enough for rendering)
      for (const d of machines) {
        const def = registry.getDoodad(d.defId);
        const cx  = (d.origin.tx + def.footprint.w / 2) * T;
        const cy  = (d.origin.ty + def.footprint.h / 2) * T;
        if (Math.abs(cx - att.mx) < 1 && Math.abs(cy - att.my) < 1) {
          att.powered = d.powered;
          break;
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private nearestNodeIdx(
    wx: number, wy: number,
    nodes: ReturnType<typeof sm.allDoodads>,
    centres: { x: number; y: number }[],
    maxRadiusTiles: number,
  ): number {
    const maxPx = maxRadiusTiles * T;
    let best = -1;
    let bestDist = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const c = centres[i]!;
      const dist = Math.hypot(wx - c.x, wy - c.y);
      if (dist <= maxPx && dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }
}
