import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startFixtureServer } from "../support/fixtureServer.js";
import { probeWebsite } from "../../src/enrich/webProbe.js";

let server: Awaited<ReturnType<typeof startFixtureServer>>;
beforeAll(async () => { server = await startFixtureServer(); });
afterAll(async () => { await server.close(); });

describe("probeWebsite", () => {
  it("finds console errors, a missing viewport and a stale copyright", async () => {
    const r = await probeWebsite(`${server.url}/broken.html`);
    expect(r.ok).toBe(true);
    expect(r.consoleErrors.join(" ")).toContain("boom");
    expect(r.hasViewportMeta).toBe(false);
    expect(r.copyrightYear).toBe(2019);
    expect(r.defects).toContain("console_errors");
    expect(r.defects).toContain("no_mobile_viewport");
    expect(r.defects).toContain("stale_copyright");
  }, 30_000);

  it("reports no defects on a healthy page", async () => {
    const r = await probeWebsite(`${server.url}/healthy.html`);
    expect(r.ok).toBe(true);
    expect(r.defects).toHaveLength(0);
    expect(r.hasViewportMeta).toBe(true);
  }, 30_000);

  it("returns ok:false with an error rather than throwing on an unreachable host", async () => {
    const r = await probeWebsite("http://127.0.0.1:1/nope", { timeoutMs: 3000 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.defects).toHaveLength(0);
  }, 30_000);
});
