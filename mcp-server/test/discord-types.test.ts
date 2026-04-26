import { describe, expect, it } from "bun:test";
import {
  DISCORD_LEVELS,
  LEVEL_COLOR,
  LEVEL_TO_CHANNEL,
} from "../src/discord/types";

describe("LEVEL_TO_CHANNEL", () => {
  it("routes all 4 levels to the correct channels", () => {
    expect(LEVEL_TO_CHANNEL.progress).toBe("progress");
    expect(LEVEL_TO_CHANNEL.warn).toBe("alerts");
    expect(LEVEL_TO_CHANNEL.error).toBe("alerts");
    expect(LEVEL_TO_CHANNEL.done).toBe("done");
  });
});

describe("DISCORD_LEVELS", () => {
  it("contains exactly the 4 valid levels", () => {
    expect([...DISCORD_LEVELS].sort()).toEqual(["done", "error", "progress", "warn"]);
  });

  it("is readonly (length is 4)", () => {
    expect(DISCORD_LEVELS.length).toBe(4);
  });
});

describe("LEVEL_COLOR", () => {
  it("each color is a valid 24-bit RGB value", () => {
    for (const level of DISCORD_LEVELS) {
      const color = LEVEL_COLOR[level];
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
