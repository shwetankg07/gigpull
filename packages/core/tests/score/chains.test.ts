import { describe, it, expect } from "vitest";
import { isKnownChain } from "../../src/score/chains.js";

describe("isKnownChain", () => {
  it("matches well-known national and global chains", () => {
    for (const name of [
      "KFC", "Pizza Hut", "Domino's Pizza", "McDonald's", "Starbucks",
      "Cafe Coffee Day", "Subway", "Burger King", "Third Wave Coffee",
    ]) {
      expect(isKnownChain(name), name).toBe(true);
    }
  });

  it("matches regardless of case, punctuation and outlet suffix", () => {
    expect(isKnownChain("kfc indiranagar")).toBe(true);
    expect(isKnownChain("DOMINOS PIZZA - 100 Ft Road")).toBe(true);
    expect(isKnownChain("Cafe Coffee Day, Koramangala")).toBe(true);
  });

  it("leaves independent businesses alone", () => {
    for (const name of [
      "Burma Burma Restaurant & Tea Room", "Aurah Spa And Salon",
      "Baking Bad", "Paratha Plaza", "Example Tiffin Room",
    ]) {
      expect(isKnownChain(name), name).toBe(false);
    }
  });

  it("does not match a substring inside an unrelated word", () => {
    // "Subway" must not fire on "Subwaycraft"; "Kfc" must not fire inside a word.
    expect(isKnownChain("Subwaycraft Studios")).toBe(false);
    expect(isKnownChain("Kfcatering Solutions")).toBe(false);
  });

  it("handles an empty name safely", () => {
    expect(isKnownChain("")).toBe(false);
  });
});
