"use client";

import { useCallback, useMemo, useState } from "react";
import { buildLinks } from "@core/core/links.js";
import type { GraphPayload, StartupLead } from "@/lib/queries";
import { GraphCanvas, SECTOR_COLOURS } from "./GraphCanvas";

const INTENTS = ["job", "gig", "interesting"] as const;
const STATUSES = ["new", "shortlisted", "contacted", "replied", "dead"] as const;

const AXIS_LABEL: Record<string, string> = {
  receptivity: "would reply",
  pay_capacity: "can pay",
  reachability: "reachable",
  latency: "not advertising",
  proximity: "nearby",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function StartupBoard({
  leads: initial, graph,
}: { leads: StartupLead[]; graph: GraphPayload }) {
  const [leads, setLeads] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [intent, setIntent] = useState("");
  const [hideDead, setHideDead] = useState(true);

  const options = useMemo(() => {
    const s = new Set<string>(), st = new Set<string>();
    for (const l of leads) {
      const a = str(l.signals.sector); if (a) s.add(a);
      const b = str(l.signals.stage); if (b) st.add(b);
    }
    return { sectors: [...s].sort(), stages: [...st].sort() };
  }, [leads]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (hideDead && l.status === "dead") return false;
      if (sector && str(l.signals.sector) !== sector) return false;
      if (stage && str(l.signals.stage) !== stage) return false;
      if (intent && !l.intent.includes(intent)) return false;
      if (!needle) return true;
      return (
        l.name.toLowerCase().includes(needle) ||
        (str(l.signals.tagline) ?? "").toLowerCase().includes(needle) ||
        (l.area ?? "").toLowerCase().includes(needle)
      );
    });
  }, [leads, q, sector, stage, intent, hideDead]);

  // Only narrow the graph when a filter is actually on: passing a set every
  // time would dim the whole map on first paint for no reason.
  const anyFilter = Boolean(q || sector || stage || intent);
  const dimmed = useMemo(
    () => (anyFilter ? new Set(visible.map((l) => l.companyId)) : null),
    [anyFilter, visible],
  );

  const patch = useCallback(async (companyId: number, body: Record<string, unknown>) => {
    setLeads((prev) => prev.map((l) => (l.companyId === companyId ? { ...l, ...body } as StartupLead : l)));
    const res = await fetch(`/api/leads/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Optimistic update, corrected on failure rather than left lying.
    if (!res.ok) setLeads(initial);
  }, [initial]);

  const toggleIntent = (l: StartupLead, want: string) =>
    patch(l.companyId, {
      intent: l.intent.includes(want)
        ? l.intent.filter((i) => i !== want)
        : [...l.intent, want].sort(),
    });

  return (
    <div className="split">
      <div className="listpane">
        <div className="filters">
          <input placeholder={`search ${leads.length} companies`} value={q}
                 onChange={(e) => setQ(e.target.value)} />
          <select value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">sector</option>
            {options.sectors.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">stage</option>
            {options.stages.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="">intent</option>
            {INTENTS.map((i) => <option key={i}>{i}</option>)}
          </select>
          <button onClick={() => setHideDead((v) => !v)}>
            {hideDead ? "dead hidden" : "dead shown"}
          </button>
        </div>

        {visible.length === 0 && <div className="empty">Nothing matches those filters.</div>}

        {visible.map((l, i) => {
          const isOpen = selected === l.companyId;
          return (
            <div key={l.companyId}>
              <div className="lead" data-selected={isOpen}
                   onClick={() => setSelected(isOpen ? null : l.companyId)}>
                <div className="rank">{i + 1}</div>
                <div>
                  <h3>{l.name}</h3>
                  <div className="meta">
                    {[str(l.signals.stage), str(l.signals.team_size), l.area]
                      .filter(Boolean).join(" · ")}
                  </div>
                  {str(l.signals.tagline) && <div className="meta">{str(l.signals.tagline)}</div>}
                  <div className="chips">
                    {str(l.signals.sector) && (
                      <span className="chip" style={{
                        color: SECTOR_COLOURS[str(l.signals.sector)!] ?? undefined,
                      }}>{str(l.signals.sector)}</span>
                    )}
                    {l.intent.map((it) => <span key={it} className="chip" data-on="true">{it}</span>)}
                    {l.status !== "new" && <span className="chip">{l.status}</span>}
                  </div>
                </div>
              </div>
              {isOpen && <Detail lead={l} onIntent={toggleIntent} onStatus={patch} />}
            </div>
          );
        })}
      </div>

      <div className="graphpane">
        <GraphCanvas graph={graph} selectedCompanyId={selected}
                     onSelect={setSelected} dimmed={dimmed} />
        <div className="hint">drag to pan · scroll to zoom · click a node</div>
        <div className="legend">
          <strong>sector</strong>
          {Object.entries(SECTOR_COLOURS).slice(0, 6).map(([k, v]) => (
            <div key={k}><i style={{ background: v }} />{k}</div>
          ))}
          <div style={{ marginTop: 6, opacity: .8 }}>grey = investor or niche hub</div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  lead, onIntent, onStatus,
}: {
  lead: StartupLead;
  onIntent: (l: StartupLead, i: string) => void;
  onStatus: (id: number, body: Record<string, unknown>) => void;
}) {
  const links = buildLinks({
    name: lead.name, lat: lead.lat, lon: lead.lon,
    sourceUrl: lead.sourceUrl, website: lead.website,
  });
  const axes = Object.entries(lead.breakdown).filter(([, v]) => typeof v === "number");
  const max = Math.max(1, ...axes.map(([, v]) => v));
  const founders = str(lead.signals.founders);

  return (
    <div className="detail">
      <h4>why it ranks here</h4>
      {axes.map(([k, v]) => (
        <div className="axis" key={k}>
          <span>{AXIS_LABEL[k] ?? k.replace(/_/g, " ")}</span>
          <span className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></span>
          <span style={{ textAlign: "right", opacity: .7 }}>{Math.round(v)}</span>
        </div>
      ))}

      {lead.rerankReason && <p className="reason">“{lead.rerankReason}”</p>}
      {str(lead.signals.description) && (
        <p className="reason" style={{ fontStyle: "normal" }}>{str(lead.signals.description)}</p>
      )}
      {founders && <p className="meta" style={{ marginTop: 8 }}>Founders: {founders}</p>}

      <h4 style={{ marginTop: 14 }}>look at it first</h4>
      <div className="links">
        {links.website && <a href={links.website} target="_blank" rel="noreferrer">website</a>}
        {links.maps && <a href={links.maps} target="_blank" rel="noreferrer">maps</a>}
        {links.streetView && <a href={links.streetView} target="_blank" rel="noreferrer">street view</a>}
        {links.source && <a href={links.source} target="_blank" rel="noreferrer">profile</a>}
        {lead.contacts.filter((c) => c.value.startsWith("http")).map((c) => (
          <a key={c.value} href={c.value} target="_blank" rel="noreferrer">{c.type.replace(/_/g, " ")}</a>
        ))}
      </div>

      <h4 style={{ marginTop: 14 }}>why you care</h4>
      <div className="chips">
        {INTENTS.map((i) => (
          <button key={i} className="chip" data-on={lead.intent.includes(i)}
                  onClick={() => onIntent(lead, i)}>{i}</button>
        ))}
      </div>

      <div className="chips" style={{ marginTop: 10 }}>
        {STATUSES.map((s) => (
          <button key={s} className="chip" data-on={lead.status === s}
                  onClick={() => onStatus(lead.companyId, { status: s })}>{s}</button>
        ))}
      </div>
    </div>
  );
}
