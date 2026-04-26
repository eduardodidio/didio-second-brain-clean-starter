import { describe, it, expect } from "bun:test";
import { loadDiscordConfig, validateWebhookUrl } from "../src/discord/config.ts";

const VALID_PROGRESS = "https://discord.com/api/webhooks/123456789/abcDEF_-token";
const VALID_ALERTS = "https://discord.com/api/webhooks/987654321/tokenABC_123";
const VALID_DONE = "https://discordapp.com/api/webhooks/111222333/legacyToken-ok";

function baseEnv(): Record<string, string | undefined> {
  return {
    DISCORD_ENABLED: "true",
    DISCORD_WEBHOOK_PROGRESS: VALID_PROGRESS,
    DISCORD_WEBHOOK_ALERTS: VALID_ALERTS,
    DISCORD_WEBHOOK_DONE: VALID_DONE,
  };
}

describe("loadDiscordConfig — happy path", () => {
  it("returns enabled:true and all three URLs when env is fully populated", () => {
    const cfg = loadDiscordConfig(baseEnv());
    expect(cfg.enabled).toBe(true);
    expect(cfg.webhooks.progress).toBe(VALID_PROGRESS);
    expect(cfg.webhooks.alerts).toBe(VALID_ALERTS);
    expect(cfg.webhooks.done).toBe(VALID_DONE);
  });

  it("accepts discordapp.com legacy domain as valid shape", () => {
    const cfg = loadDiscordConfig({
      ...baseEnv(),
      DISCORD_WEBHOOK_DONE: VALID_DONE, // discordapp.com
    });
    expect(cfg.webhooks.done).toBe(VALID_DONE);
  });

  it("accepts token with underscores and dashes", () => {
    const url = "https://discord.com/api/webhooks/999/aB_c-D_e-f";
    const cfg = loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_PROGRESS: url });
    expect(cfg.webhooks.progress).toBe(url);
  });
});

describe("loadDiscordConfig — DISCORD_ENABLED edge cases", () => {
  it("DISCORD_ENABLED absent ⇒ enabled:true", () => {
    const env = { ...baseEnv() };
    delete env.DISCORD_ENABLED;
    expect(loadDiscordConfig(env).enabled).toBe(true);
  });

  it('DISCORD_ENABLED="false" (lowercase) ⇒ enabled:false', () => {
    expect(loadDiscordConfig({ ...baseEnv(), DISCORD_ENABLED: "false" }).enabled).toBe(false);
  });

  it('DISCORD_ENABLED="FALSE" (uppercase) ⇒ enabled:false', () => {
    expect(loadDiscordConfig({ ...baseEnv(), DISCORD_ENABLED: "FALSE" }).enabled).toBe(false);
  });

  it('DISCORD_ENABLED="  false  " (trailing spaces) ⇒ enabled:false', () => {
    expect(loadDiscordConfig({ ...baseEnv(), DISCORD_ENABLED: "  false  " }).enabled).toBe(false);
  });

  it('DISCORD_ENABLED="0" ⇒ enabled:true (only "false" literal disables)', () => {
    expect(loadDiscordConfig({ ...baseEnv(), DISCORD_ENABLED: "0" }).enabled).toBe(true);
  });

  it('DISCORD_ENABLED="no" ⇒ enabled:true', () => {
    expect(loadDiscordConfig({ ...baseEnv(), DISCORD_ENABLED: "no" }).enabled).toBe(true);
  });
});

describe("loadDiscordConfig — missing/empty webhooks ⇒ null", () => {
  it("DISCORD_WEBHOOK_PROGRESS absent ⇒ webhooks.progress === null", () => {
    const env = { ...baseEnv() };
    delete env.DISCORD_WEBHOOK_PROGRESS;
    const cfg = loadDiscordConfig(env);
    expect(cfg.webhooks.progress).toBeNull();
    expect(cfg.webhooks.alerts).toBe(VALID_ALERTS);
    expect(cfg.webhooks.done).toBe(VALID_DONE);
  });

  it("all webhook vars absent ⇒ all null", () => {
    const env: Record<string, string | undefined> = { DISCORD_ENABLED: "true" };
    const cfg = loadDiscordConfig(env);
    expect(cfg.webhooks.progress).toBeNull();
    expect(cfg.webhooks.alerts).toBeNull();
    expect(cfg.webhooks.done).toBeNull();
  });

  it("whitespace-only string ⇒ null (treated as absent)", () => {
    const cfg = loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_PROGRESS: "   " });
    expect(cfg.webhooks.progress).toBeNull();
  });

  it("empty string ⇒ null", () => {
    const cfg = loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_ALERTS: "" });
    expect(cfg.webhooks.alerts).toBeNull();
  });
});

describe("loadDiscordConfig — invalid URL shape ⇒ throw", () => {
  it("http:// URL for PROGRESS ⇒ throws with var name in message", () => {
    expect(() =>
      loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_PROGRESS: "http://example.com/" })
    ).toThrow("DISCORD_WEBHOOK_PROGRESS");
  });

  it("random string for ALERTS ⇒ throws with var name in message", () => {
    expect(() =>
      loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_ALERTS: "not-a-url" })
    ).toThrow("DISCORD_WEBHOOK_ALERTS");
  });

  it("incomplete webhook path (no id/token) for DONE ⇒ throws", () => {
    expect(() =>
      loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_DONE: "https://discord.com/api/webhooks/" })
    ).toThrow("DISCORD_WEBHOOK_DONE");
  });

  it("URL with extra path segments ⇒ throws (must match exactly)", () => {
    const url = "https://discord.com/api/webhooks/123/abc/extra";
    expect(() =>
      loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_PROGRESS: url })
    ).toThrow("DISCORD_WEBHOOK_PROGRESS");
  });
});

describe("loadDiscordConfig — boundary values", () => {
  it("token with only underscores and dashes is valid", () => {
    const url = "https://discord.com/api/webhooks/1/_-_-_";
    const cfg = loadDiscordConfig({ ...baseEnv(), DISCORD_WEBHOOK_PROGRESS: url });
    expect(cfg.webhooks.progress).toBe(url);
  });
});

describe("validateWebhookUrl", () => {
  it("returns true for valid discord.com URL", () => {
    expect(validateWebhookUrl(VALID_PROGRESS)).toBe(true);
  });

  it("returns true for valid discordapp.com URL", () => {
    expect(validateWebhookUrl(VALID_DONE)).toBe(true);
  });

  it("returns false for http:// URL", () => {
    expect(validateWebhookUrl("http://discord.com/api/webhooks/1/abc")).toBe(false);
  });

  it("returns false for incomplete path", () => {
    expect(validateWebhookUrl("https://discord.com/api/webhooks/")).toBe(false);
  });

  it("returns false for random string", () => {
    expect(validateWebhookUrl("not-a-url")).toBe(false);
  });
});
