#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { desc, eq } from "drizzle-orm";
import { openDb, companies, leads, scores } from "../db/index.js";
import { loadConfig } from "../config.js";
import { runPipeline } from "../pipeline.js";
import { createPlacesCollector } from "../collect/places.js";
import { createOsmCollector } from "../collect/osm.js";
import { createBsmCollector } from "../collect/bsm.js";
import { syncStartups } from "../startup/sync.js";
import { createPgStartupStore } from "../startup/pgStore.js";
import { resolveRegions, REGIONS, METRO_GROUP } from "../core/regions.js";
import { createGeocoder } from "../core/geocode.js";
import { createFundingCollector } from "../collect/funding.js";
import { createInternshalaCollector } from "../collect/internshala.js";
import { createMetaAdsCollector, type AdTarget } from "../collect/metaAds.js";
import type { Collector } from "../collect/types.js";
import { createAnthropicClient, type LlmClient } from "../llm/client.js";
import { createGeminiClient } from "../llm/gemini.js";
import type { GigpullConfig } from "../config.js";

function makeLlm(config: GigpullConfig): LlmClient {
  return config.llmProvider === "anthropic"
    ? createAnthropicClient(config)
    : createGeminiClient(config);
}
import { setStatus, rateLead, dueForFollowUp, type LeadStatus } from "../track/leads.js";
import { startWebServer } from "../web/server.js";

// Load .env from the working directory if one exists. Node has this built in
// since 20.12; a missing file is normal (keys may come from the shell instead),
// so a failure here is not an error.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env present — fall back to whatever is already in the environment
}

const program = new Command();
program.name("gigpull").description("Find paid work by detecting unadvertised need");

program
  .command("run")
  .description("run the full pipeline")
  .option("--mode <mode>", "local | startup | both", "local")
  .option("--categories <list>", "comma-separated local categories", "restaurant,gym,salon,clinic")
  .option("--source <source>", "local discovery source: osm | places", "osm")
  .option("--region <spec>", "region(s): a preset, \"metros\", a PIN code, a place name, or a raw bbox", "bangalore")
  .option("--ad-targets <file>", "JSON file of {identityKey,name,pageId} to check for active ads")
  .option("--internship-categories <list>", "internshala categories", "computer-science")
  .option("--internship-city <city>", "restrict internships to one city (blank = all India)", "")
  .action(async (o: {
    mode: string; categories: string; source: string; region: string;
    adTargets?: string; internshipCategories: string; internshipCity: string;
  }) => {
    const db = openDb();
    const config = loadConfig(process.env);
    const categories = o.categories.split(",");
    const llm = makeLlm(config);

    const collectors: Collector[] = [];

    if (o.mode === "local" || o.mode === "both") {
      const regions = await resolveRegions(o.region, createGeocoder(config.userAgent));
      console.log(`searching ${regions.length} region(s): ${regions.map((r) => r.name).join(", ")}`);
      collectors.push(
        o.source === "places"
          ? createPlacesCollector(categories)
          : createOsmCollector(categories, regions),
      );
      if (o.adTargets) {
        const targets = JSON.parse(readFileSync(o.adTargets, "utf8")) as AdTarget[];
        collectors.push(createMetaAdsCollector(targets));
      }
    }

    if (o.mode === "startup" || o.mode === "both") {
      collectors.push(createFundingCollector(config.fundingFeeds, llm));
      collectors.push(
        createInternshalaCollector(
          o.internshipCategories.split(","),
          o.internshipCity || null,
        ),
      );
    }

    if (collectors.length === 0) {
      throw new Error(`unknown --mode "${o.mode}" — use local, startup, or both`);
    }

    const summary = await runPipeline(db, {
      config,
      collectors,
      llm,
      now: new Date(),
    });
    console.log(summary);
    if (!summary.rerankAvailable) {
      console.warn("rerank unavailable — shortlist ranked on deterministic scores only");
    }
  });

program
  .command("startup-sync")
  .description("collect Bangalore startups into Postgres and rebuild the graph")
  .action(async () => {
    const config = loadConfig(process.env);
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is not set — this command writes to Supabase, not SQLite");
    }
    // Imported here rather than at module load so the SQLite-only commands
    // never need the Postgres driver present.
    const { default: postgres } = await import("postgres");
    const sql = postgres(config.databaseUrl, { prepare: false, max: 4 });
    try {
      const summary = await syncStartups(
        createBsmCollector(),
        createPgStartupStore(sql),
        { now: new Date(), config },
        { anchors: config.anchors },
      );
      console.log(summary);
      if (config.anchors.length === 0) {
        console.warn("no GIGPULL_ANCHORS set — proximity scored 0 for every company");
      }
    } finally {
      await sql.end();
    }
  });

program
  .command("list")
  .description("show the ranked shortlist")
  .option("-n, --limit <n>", "how many", "20")
  .action((o: { limit: string }) => {
    const db = openDb();
    const rows = db.select({
      companyId: companies.id, name: companies.name, status: leads.status,
      total: scores.adjustedTotal, reason: scores.rerankReason,
    })
      .from(scores)
      .innerJoin(companies, eq(scores.companyId, companies.id))
      .leftJoin(leads, eq(leads.companyId, companies.id))
      .orderBy(desc(scores.adjustedTotal))
      .limit(Number(o.limit))
      .all();
    for (const r of rows) {
      if (r.status === "dead") continue;
      console.log(
        `${String(r.companyId).padStart(4)}  ${(r.total ?? 0).toFixed(0).padStart(5)}  ${r.name}`,
      );
    }
  });

program
  .command("show <companyId>")
  .description("print a lead's brief")
  .action((companyId: string) => {
    const db = openDb();
    const lead = db.select().from(leads).where(eq(leads.companyId, Number(companyId))).get();
    console.log(lead?.briefMd ?? "no brief for that company");
  });

program
  .command("mark <companyId> <status>")
  .description("set lead status: shortlisted | contacted | replied | dead")
  .action((companyId: string, status: string) => {
    const db = openDb();
    setStatus(db, Number(companyId), status as LeadStatus, new Date());
    console.log(`${companyId} → ${status}`);
  });

program
  .command("rate <companyId> <updown>")
  .description("thumbs up (1) or down (-1) to feed weight tuning")
  .action((companyId: string, updown: string) => {
    const db = openDb();
    rateLead(db, Number(companyId), updown === "-1" ? -1 : 1);
  });

program
  .command("regions")
  .description("list the built-in regions")
  .action(() => {
    console.log("presets:");
    for (const name of Object.keys(REGIONS).sort()) console.log("  " + name);
    console.log(`\ngroups:\n  metros -> ${METRO_GROUP.join(", ")}`);
    console.log(
      "\nAnything else is geocoded: a PIN code (483225), a place name",
      "(\"Kochi\"), or a raw bbox (south,west,north,east).",
    );
    console.log(
      "\nThere is no all-India region on purpose — Overpass would time out,",
      "and the result would be more leads than anyone can work. Search city by city.",
    );
  });

program
  .command("rescore")
  .description("re-score and re-rank what is already collected (no new fetching)")
  .action(async () => {
    const db = openDb();
    const config = loadConfig(process.env);
    const summary = await runPipeline(db, {
      config, collectors: [], llm: makeLlm(config),
      now: new Date(), skipCollect: true, skipWebProbe: true,
    });
    console.log(summary);
    if (!summary.rerankAvailable) {
      console.warn("rerank unavailable — see rerank_reason in the scores table");
    }
  });

program
  .command("web")
  .description("open the lead board in a browser")
  .option("-p, --port <port>", "port to listen on", "4321")
  .action(async (o: { port: string }) => {
    const db = openDb();
    await startWebServer(db, Number(o.port));
    console.log(`gigpull board: http://127.0.0.1:${o.port}`);
  });

program
  .command("followups")
  .description("leads due for a nudge")
  .action(() => {
    const db = openDb();
    console.log(dueForFollowUp(db, new Date()));
  });

program.parseAsync(process.argv);
