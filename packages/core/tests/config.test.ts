import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("reads keys and applies defaults", () => {
    const cfg = loadConfig({ GOOGLE_PLACES_API_KEY: "k1" } as NodeJS.ProcessEnv);
    expect(cfg.googlePlacesApiKey).toBe("k1");
    expect(cfg.city).toBe("Bangalore");
    expect(cfg.rerankTopN).toBe(30);
  });

  it("overrides defaults from env", () => {
    const cfg = loadConfig({
      GOOGLE_PLACES_API_KEY: "k1",
      GIGPULL_CITY: "Pune",
      GIGPULL_RERANK_TOP_N: "10",
    } as NodeJS.ProcessEnv);
    expect(cfg.city).toBe("Pune");
    expect(cfg.rerankTopN).toBe(10);
  });

  it("leaves optional keys undefined rather than throwing", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.googlePlacesApiKey).toBeUndefined();
    expect(cfg.anthropicApiKey).toBeUndefined();
  });
});
