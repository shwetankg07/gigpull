import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("config anchors", () => {
  it("reads anchors from the environment", () => {
    const c = loadConfig({ GIGPULL_ANCHORS: "12.97,77.64;12.90,77.60" } as NodeJS.ProcessEnv);
    expect(c.anchors).toHaveLength(2);
    expect(c.anchors[0]).toEqual({ lat: 12.97, lon: 77.64 });
  });

  it("defaults to none, so the tool works without them", () => {
    // Anchors are personal data and optional. Requiring them would push
    // someone into putting their home coordinates somewhere to get started.
    expect(loadConfig({} as NodeJS.ProcessEnv).anchors).toEqual([]);
  });

  it("keeps DATABASE_URL optional for local-only use", () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).databaseUrl).toBeUndefined();
  });
});
