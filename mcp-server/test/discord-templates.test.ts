import { describe, test, expect } from "bun:test";
import { buildDiscordEmbed, truncate } from "../src/discord/templates.ts";
import { LEVEL_EMOJI } from "../src/discord/types.ts";

const FIXED_NOW = () => new Date("2026-04-17T12:00:00Z");

describe("truncate", () => {
  test("returns string unchanged when within limit", () => {
    expect(truncate("abc", 5)).toBe("abc");
  });

  test("truncates to exactly max chars ending with ellipsis", () => {
    const result = truncate("abcdef", 5);
    expect(result).toBe("abcd…");
    expect(result.length).toBe(5);
  });

  test("does not truncate when length equals max", () => {
    expect(truncate("abcde", 5)).toBe("abcde");
  });
});

describe("LEVEL_EMOJI coverage", () => {
  test("has exactly 4 entries", () => {
    const entries = Object.keys(LEVEL_EMOJI);
    expect(entries.length).toBe(4);
    expect(entries).toContain("progress");
    expect(entries).toContain("warn");
    expect(entries).toContain("error");
    expect(entries).toContain("done");
  });
});

describe("buildDiscordEmbed", () => {
  test("happy path — progress level", () => {
    const result = buildDiscordEmbed(
      {
        event: "wave-2 done",
        level: "progress",
        project: "claude-didio-config",
        details: "3/3 tasks",
      },
      FIXED_NOW
    );

    expect(result.embeds).toHaveLength(1);
    const embed = result.embeds[0];
    expect(embed.title).toBe("⚙️ wave-2 done");
    expect(embed.description).toBe("3/3 tasks");
    expect(embed.color).toBe(0x3498db);
    expect(embed.timestamp).toBe("2026-04-17T12:00:00.000Z");
    expect(embed.fields).toHaveLength(3);
    expect(embed.fields[0]).toEqual({ name: "project", value: "claude-didio-config", inline: true });
    expect(embed.fields[1]).toEqual({ name: "level", value: "progress", inline: true });
    expect(embed.fields[2]).toEqual({ name: "event", value: "wave-2 done", inline: true });
  });

  test("details absent => description is empty string", () => {
    const result = buildDiscordEmbed(
      { event: "test", level: "progress", project: "proj" },
      FIXED_NOW
    );
    expect(result.embeds[0].description).toBe("");
  });

  test("level error => correct color and emoji", () => {
    const result = buildDiscordEmbed(
      { event: "crash", level: "error", project: "proj" },
      FIXED_NOW
    );
    const embed = result.embeds[0];
    expect(embed.color).toBe(0xe74c3c);
    expect(embed.title).toBe("❌ crash");
  });

  test("level done => correct color and emoji", () => {
    const result = buildDiscordEmbed(
      { event: "shipped", level: "done", project: "proj" },
      FIXED_NOW
    );
    const embed = result.embeds[0];
    expect(embed.color).toBe(0x2ecc71);
    expect(embed.title).toBe("✅ shipped");
  });

  test("level warn => correct color and emoji", () => {
    const result = buildDiscordEmbed(
      { event: "slow query", level: "warn", project: "proj" },
      FIXED_NOW
    );
    const embed = result.embeds[0];
    expect(embed.color).toBe(0xf1c40f);
    expect(embed.title).toBe("⚠️ slow query");
  });

  test("no now arg => timestamp is valid ISO8601 near Date.now()", () => {
    const before = Date.now();
    const result = buildDiscordEmbed({ event: "e", level: "progress", project: "p" });
    const after = Date.now();
    const ts = new Date(result.embeds[0].timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 2000);
    expect(ts).toBeLessThanOrEqual(after + 2000);
  });

  test("long event => title truncated to 256 chars", () => {
    const longEvent = "x".repeat(500);
    const result = buildDiscordEmbed(
      { event: longEvent, level: "progress", project: "proj" },
      FIXED_NOW
    );
    const title = result.embeds[0].title;
    expect(title.length).toBe(256);
    expect(title.endsWith("…")).toBe(true);
  });

  test("long details => description truncated to 4096 chars", () => {
    const longDetails = "d".repeat(5000);
    const result = buildDiscordEmbed(
      { event: "e", level: "progress", project: "proj", details: longDetails },
      FIXED_NOW
    );
    const desc = result.embeds[0].description;
    expect(desc.length).toBe(4096);
    expect(desc.endsWith("…")).toBe(true);
  });

  test("long project => field value truncated to 1024 chars", () => {
    const longProject = "p".repeat(2000);
    const result = buildDiscordEmbed(
      { event: "e", level: "progress", project: longProject },
      FIXED_NOW
    );
    const projectField = result.embeds[0].fields[0];
    expect(projectField.value.length).toBe(1024);
    expect(projectField.value.endsWith("…")).toBe(true);
  });

  test("empty event => title is emoji + space", () => {
    const result = buildDiscordEmbed(
      { event: "", level: "progress", project: "proj" },
      FIXED_NOW
    );
    expect(result.embeds[0].title).toBe("⚙️ ");
  });

  test("all fields are inline: true", () => {
    const result = buildDiscordEmbed(
      { event: "e", level: "done", project: "p" },
      FIXED_NOW
    );
    for (const field of result.embeds[0].fields) {
      expect(field.inline).toBe(true);
    }
  });

  test("fields always has exactly 3 entries", () => {
    const result = buildDiscordEmbed(
      { event: "e", level: "warn", project: "p", details: "d" },
      FIXED_NOW
    );
    expect(result.embeds[0].fields).toHaveLength(3);
  });
});
