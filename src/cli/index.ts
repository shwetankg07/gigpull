#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { desc, eq } from "drizzle-orm";
import { openDb, companies, leads, scores } from "../db/index.js";
import { loadConfig } from "../config.js";
import { runPipeline } from "../pipeline.js";
import { createPlacesCollector } from "../collect/places.js";
import { createMetaAdsCollector, type AdTarget } from "../collect/metaAds.js";
import { createAnthropicClient } from "../llm/client.js";
import { setStatus, rateLead, dueForFollowUp, type LeadStatus } from "../track/leads.js";

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
  .option("--categories <list>", "comma-separated local categories", "restaurant,gym,salon,clinic")
  .option("--ad-targets <file>", "JSON file of {identityKey,name,pageId} to check for active ads")
  .action(async (o: { categories: string; adTargets?: string }) => {
    const db = openDb();
    const config = loadConfig(process.env);

    const collectors = [createPlacesCollector(o.categories.split(","))];
    if (o.adTargets) {
      const targets = JSON.parse(readFileSync(o.adTargets, "utf8")) as AdTarget[];
      collectors.push(createMetaAdsCollector(targets));
    }

    const summary = await runPipeline(db, {
      config,
      collectors,
      llm: createAnthropicClient(config),
      now: new Date(),
    });
    console.log(summary);
    if (!summary.rerankAvailable) {
      console.warn("rerank unavailable — shortlist ranked on deterministic scores only");
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
  .command("followups")
  .description("leads due for a nudge")
  .action(() => {
    const db = openDb();
    console.log(dueForFollowUp(db, new Date()));
  });

program.parseAsync(process.argv);
