import type { GraphEdge, GraphNode } from "./edges.js";

/**
 * Force-directed layout, computed once where the data is prepared.
 *
 * The browser never runs this. At ~1,400 nodes a naive simulation is roughly
 * two million interactions per frame, which is a slideshow on a laptop and
 * worse on a phone. Precomputing means the page paints immediately, the
 * layout is identical for every viewer, and the physics is testable — none of
 * which is true of a simulation that anneals in the client while you watch.
 *
 * Determinism comes from a seeded generator rather than Math.random: stored
 * positions that drifted between runs would make every re-collection look
 * like the entire map had moved.
 */

export interface Position {
  x: number;
  y: number;
}

export interface LayoutOptions {
  iterations?: number;
  /** Nodes further apart than this exert no repulsion on each other. */
  cutoff?: number;
  seed?: number;
  repulsion?: number;
  springStrength?: number;
  springLength?: number;
}

/** mulberry32 — small, fast, and reproducible across machines. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = {},
): Map<string, Position> {
  const {
    // Tuned against the live 1,433-node graph, scored on how far each hub
    // sits from its own members and how many unrelated companies fall inside
    // that radius. The first guess left the 'satellites' hub sitting nearer a
    // coffee chain than to Pixxel:
    //
    //   300 iters, spring 0.03, repulsion 6000 -> mean 240, 43.8 intruders
    //   600 iters, spring 0.30, repulsion 1500 -> mean  74, 13.4
    //   900 iters, spring 0.45, repulsion 1200 -> mean  61, 11.9
    //
    // Past this it stops improving. ~3s in a worker, paid once per collection.
    iterations = 900, cutoff = 320, seed = 0x9e3779b9,
    repulsion = 1_200, springStrength = 0.45, springLength = 20,
  } = options;
  const n = nodes.length;
  const out = new Map<string, Position>();
  if (n === 0) return out;

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  // Seeded ring start: spreading nodes around a circle rather than dropping
  // them all at the origin avoids the degenerate first step where every
  // repulsion vector is zero-length and the layout has no direction to move in.
  const rand = seeded(seed);
  const radius = 30 * Math.sqrt(n);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + rand() * 0.5;
    const r = radius * (0.35 + rand() * 0.65);
    x[i] = Math.cos(angle) * r;
    y[i] = Math.sin(angle) * r;
  }

  const links = edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);

  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ox = x[i]! - x[j]!;
        let oy = y[i]! - y[j]!;
        let d2 = ox * ox + oy * oy;
        if (d2 > cutoff * cutoff) continue;
        // Two nodes at the same point have no direction to separate along.
        // Nudge them apart deterministically rather than dividing by zero.
        if (d2 < 0.01) {
          ox = (i % 7) - 3 + 0.5;
          oy = (j % 7) - 3 + 0.5;
          d2 = ox * ox + oy * oy;
        }
        const force = repulsion / d2;
        const d = Math.sqrt(d2);
        const fx = (ox / d) * force;
        const fy = (oy / d) * force;
        dx[i] = dx[i]! + fx; dy[i] = dy[i]! + fy;
        dx[j] = dx[j]! - fx; dy[j] = dy[j]! - fy;
      }
    }

    for (const [a, b] of links) {
      const ox = x[b]! - x[a]!;
      const oy = y[b]! - y[a]!;
      const d = Math.hypot(ox, oy) || 0.01;
      const force = (d - springLength) * springStrength;
      const fx = (ox / d) * force;
      const fy = (oy / d) * force;
      dx[a] = dx[a]! + fx; dy[a] = dy[a]! + fy;
      dx[b] = dx[b]! - fx; dy[b] = dy[b]! - fy;
    }

    // Cooling: large early moves to untangle, small late ones to settle.
    const cool = 1 - step / iterations;
    const maxStep = 8 * cool + 0.5;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i]!, dy[i]!);
      if (d > 0) {
        const scale = Math.min(d, maxStep) / d;
        x[i] = x[i]! + dx[i]! * scale;
        y[i] = y[i]! + dy[i]! * scale;
      }
      // Weak pull to the centre so disconnected nodes drift into frame
      // instead of being flung out by repulsion alone.
      x[i] = x[i]! * 0.999;
      y[i] = y[i]! * 0.999;
    }
  }

  for (let i = 0; i < n; i++) {
    out.set(nodes[i]!.id, { x: Math.round(x[i]! * 100) / 100, y: Math.round(y[i]! * 100) / 100 });
  }
  return out;
}
