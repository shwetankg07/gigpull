import { Tabs } from "@/components/Tabs";
import { StartupBoard } from "@/components/StartupBoard";
import { getGraph, getStartupLeads } from "@/lib/queries";

// Always read live: the worker rewrites scores and the graph on every run,
// and a cached board would quietly show yesterday's ranking.
export const dynamic = "force-dynamic";

export default async function Startups() {
  const [leads, graph] = await Promise.all([getStartupLeads(), getGraph()]);

  return (
    <div className="shell">
      <Tabs active="startups" />
      {leads.length === 0 ? (
        <div className="empty">
          <p><strong>No startups collected yet.</strong></p>
          <p>Run the worker against this database:</p>
          <p><code>gigpull run --mode startup --source bsm</code></p>
        </div>
      ) : (
        <StartupBoard leads={leads} graph={graph} />
      )}
    </div>
  );
}
