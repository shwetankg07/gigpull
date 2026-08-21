"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphPayload } from "@/lib/queries";

/**
 * Renders the precomputed layout.
 *
 * Positions arrive from the database, already settled — this file draws and
 * handles interaction, it never simulates. At ~1,400 nodes a redraw is well
 * under a frame, so pan and zoom stay smooth without any culling.
 */

export const SECTOR_COLOURS: Record<string, string> = {
  Deeptech: "#7c5cff", AI: "#4f8ff7", Fintech: "#1fa97a", SaaS: "#e0913a",
  Consumer: "#e0566b", Healthtech: "#25a8b8", D2C: "#c964c9", Logistics: "#8a8f2e",
  Edtech: "#d4762a", Gaming: "#5b6ef5", Other: "#8a8378",
};
const HUB_COLOUR = "#8a8378";
const fallback = "#8a8378";

interface Props {
  graph: GraphPayload;
  selectedCompanyId: number | null;
  onSelect: (companyId: number | null) => void;
  dimmed: Set<number> | null;
}

export function GraphCanvas({ graph, selectedCompanyId, onSelect, dimmed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0, ready: false });
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Adjacency, rebuilt only when the graph itself changes.
  const adjRef = useRef(new Map<string, Set<string>>());
  useEffect(() => {
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) =>
      (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    for (const e of graph.edges) { link(e.source, e.target); link(e.target, e.source); }
    adjRef.current = adj;
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const selectedId = selectedCompanyId === null ? null : `c:${selectedCompanyId}`;
    const neighbours = selectedId ? adjRef.current.get(selectedId) ?? new Set<string>() : null;

    // Two hops: the point of a hub is the companies on its far side.
    const lit = new Set<string>();
    if (selectedId) {
      lit.add(selectedId);
      for (const hub of neighbours!) {
        lit.add(hub);
        for (const far of adjRef.current.get(hub) ?? []) lit.add(far);
      }
    }

    const radiusOf = (n: GraphPayload["nodes"][number]) =>
      n.kind === "company" ? 3 + Math.min(4, n.degree * 0.7) : 4 + Math.min(9, n.degree * 0.5);

    function fit() {
      const xs = graph.nodes.map((n) => n.x);
      const ys = graph.nodes.map((n) => n.y);
      if (!xs.length) return;
      const w = canvas!.clientWidth || 1;
      const h = canvas!.clientHeight || 1;
      const spanX = Math.max(1, Math.max(...xs) - Math.min(...xs));
      const spanY = Math.max(1, Math.max(...ys) - Math.min(...ys));
      const scale = Math.min(w / spanX, h / spanY) * 0.9;
      viewRef.current = {
        scale,
        tx: w / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * scale,
        ty: h / 2 - ((Math.min(...ys) + Math.max(...ys)) / 2) * scale,
        ready: true,
      };
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      if (canvas!.width !== w * dpr || canvas!.height !== h * dpr) {
        canvas!.width = w * dpr;
        canvas!.height = h * dpr;
      }
      if (!viewRef.current.ready) fit();
      const { scale, tx, ty } = viewRef.current;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      ctx!.save();
      ctx!.translate(tx, ty);
      ctx!.scale(scale, scale);

      const px = 1 / scale;

      for (const e of graph.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const on = !selectedId || (lit.has(e.source) && lit.has(e.target));
        ctx!.strokeStyle = e.kind === "investor" ? "#8a837833" : "#8a837822";
        ctx!.globalAlpha = on ? 1 : 0.12;
        ctx!.lineWidth = (on && selectedId ? 1.4 : 0.8) * px;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      ctx!.globalAlpha = 1;
      for (const n of graph.nodes) {
        const isCompany = n.kind === "company";
        const filteredOut = dimmed && isCompany && n.companyId !== null && !dimmed.has(n.companyId);
        const on = (!selectedId || lit.has(n.id)) && !filteredOut;
        ctx!.globalAlpha = on ? 1 : 0.1;
        ctx!.fillStyle = isCompany
          ? SECTOR_COLOURS[n.sector ?? ""] ?? fallback
          : HUB_COLOUR;
        const r = radiusOf(n) * px * (n.id === selectedId ? 1.9 : 1);
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx!.fill();
        if (n.id === selectedId || n.id === hover) {
          ctx!.strokeStyle = "#00000055";
          ctx!.lineWidth = 1.5 * px;
          ctx!.stroke();
        }
      }

      // Labels only where they can be read: hubs when zoomed in, plus
      // whatever is selected or under the cursor. Drawing 1,400 at once is a
      // grey smear, not information.
      ctx!.globalAlpha = 1;
      ctx!.textAlign = "center";
      ctx!.font = `${11 * px}px ui-sans-serif, system-ui, sans-serif`;
      ctx!.fillStyle = getComputedStyle(canvas!).color;
      for (const n of graph.nodes) {
        const big = n.kind !== "company" && n.degree >= 6 && scale > 0.28;
        const near = n.kind !== "company" && scale > 0.75;
        if (!(big || near || n.id === selectedId || n.id === hover)) continue;
        if (selectedId && !lit.has(n.id) && n.id !== hover) continue;
        ctx!.fillText(n.label, n.x, n.y - radiusOf(n) * px - 4 * px);
      }
      ctx!.restore();
    }

    function toWorld(ev: { clientX: number; clientY: number }) {
      const rect = canvas!.getBoundingClientRect();
      const { scale, tx, ty } = viewRef.current;
      return {
        x: (ev.clientX - rect.left - tx) / scale,
        y: (ev.clientY - rect.top - ty) / scale,
      };
    }

    function pick(ev: { clientX: number; clientY: number }) {
      const p = toWorld(ev);
      const tolerance = 10 / viewRef.current.scale;
      let best: string | null = null;
      let bestD = Infinity;
      for (const n of graph.nodes) {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        const r = radiusOf(n) / viewRef.current.scale + tolerance;
        if (d < r && d < bestD) { bestD = d; best = n.id; }
      }
      return best;
    }

    const onDown = (ev: PointerEvent) => {
      dragRef.current = { x: ev.clientX, y: ev.clientY, moved: false };
      canvas!.setPointerCapture(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        const dx = ev.clientX - d.x;
        const dy = ev.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        viewRef.current.tx += dx;
        viewRef.current.ty += dy;
        d.x = ev.clientX; d.y = ev.clientY;
        draw();
        return;
      }
      const id = pick(ev);
      if (id !== hover) setHover(id);
      canvas!.style.cursor = id ? "pointer" : "grab";
    };
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && !d.moved) {
        const id = pick(ev);
        const n = id ? nodeById.get(id) : null;
        // Clicking a hub selects nothing but keeps the two-hop highlight
        // visible via hover; clicking empty space clears the selection.
        onSelect(n && n.kind === "company" && n.companyId !== null ? n.companyId : null);
      }
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const v = viewRef.current;
      const factor = Math.exp(-ev.deltaY * 0.0015);
      const next = Math.min(12, Math.max(0.08, v.scale * factor));
      v.tx = mx - ((mx - v.tx) / v.scale) * next;
      v.ty = my - ((my - v.ty) / v.scale) * next;
      v.scale = next;
      draw();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    draw();

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [graph, selectedCompanyId, hover, dimmed, onSelect]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
