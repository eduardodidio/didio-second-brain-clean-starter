import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { execute } from "../src/tools/discord-notify.ts";
import type { DiscordConfig } from "../src/discord/types.ts";
import type { PostDiscordWebhookResult } from "../src/discord/webhook.ts";
import type { DiscordWebhookPayload } from "../src/discord/types.ts";

const DONE_URL =
  "https://discord.com/api/webhooks/111111111111111111/done-token-abc123";
const PROGRESS_URL =
  "https://discord.com/api/webhooks/222222222222222222/progress-token-abc123";
const ALERTS_URL =
  "https://discord.com/api/webhooks/333333333333333333/alerts-token-abc123";

function makeConfig(overrides: Partial<DiscordConfig> = {}): DiscordConfig {
  return {
    enabled: true,
    webhooks: {
      progress: PROGRESS_URL,
      alerts: ALERTS_URL,
      done: DONE_URL,
    },
    ...overrides,
  };
}

function makePostMock(result: PostDiscordWebhookResult) {
  return mock(
    async (_url: string, _payload: DiscordWebhookPayload): Promise<PostDiscordWebhookResult> =>
      result
  );
}

// --- Happy path ---

describe("happy path", () => {
  it("routes done level to done channel and returns ok", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });

    const result = await execute(
      { event: "wave done", level: "done", project: "claude-didio-config" },
      {
        loadConfig: () => makeConfig(),
        post: postMock,
      }
    );

    expect(result).toEqual({ ok: true, channel: "done", status: 204 });
    expect(postMock.mock.calls.length).toBe(1);
    // Called with done URL
    expect(postMock.mock.calls[0][0]).toBe(DONE_URL);
  });

  it("calls post exactly once — not the other channel URLs", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });

    await execute(
      { event: "wave done", level: "done", project: "claude-didio-config" },
      { loadConfig: () => makeConfig(), post: postMock }
    );

    const calledUrls = postMock.mock.calls.map((c) => c[0]);
    expect(calledUrls).not.toContain(PROGRESS_URL);
    expect(calledUrls).not.toContain(ALERTS_URL);
  });
});

// --- Edge cases ---

describe("edge cases — routing", () => {
  it("level progress routes to progress channel", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const result = await execute(
      { event: "tick", level: "progress", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );
    expect(result).toMatchObject({ ok: true, channel: "progress" });
    expect(postMock.mock.calls[0][0]).toBe(PROGRESS_URL);
  });

  it("level warn routes to alerts channel", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const result = await execute(
      { event: "slow", level: "warn", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );
    expect(result).toMatchObject({ ok: true, channel: "alerts" });
    expect(postMock.mock.calls[0][0]).toBe(ALERTS_URL);
  });

  it("level error routes to alerts channel", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const result = await execute(
      { event: "crash", level: "error", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );
    expect(result).toMatchObject({ ok: true, channel: "alerts" });
    expect(postMock.mock.calls[0][0]).toBe(ALERTS_URL);
  });

  it("level done routes to done channel", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const result = await execute(
      { event: "ship", level: "done", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );
    expect(result).toMatchObject({ ok: true, channel: "done" });
    expect(postMock.mock.calls[0][0]).toBe(DONE_URL);
  });

  it("DISCORD_ENABLED=false skips without calling post", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const result = await execute(
      { event: "tick", level: "done", project: "p" },
      {
        loadConfig: () => makeConfig({ enabled: false }),
        post: postMock,
      }
    );
    expect(result).toEqual({
      ok: false,
      skipped: true,
      reason: "DISCORD_ENABLED=false",
    });
    expect(postMock.mock.calls.length).toBe(0);
  });

  it("webhook for target channel null returns skipped with channel name", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const result = await execute(
      { event: "tick", level: "done", project: "p" },
      {
        loadConfig: () =>
          makeConfig({ webhooks: { progress: PROGRESS_URL, alerts: ALERTS_URL, done: null } }),
        post: postMock,
      }
    );
    expect(result).toMatchObject({ ok: false, skipped: true });
    if (result.ok === false && result.skipped === true) {
      expect(result.reason).toContain("webhook_not_configured");
      expect(result.reason).toContain("done");
    }
    expect(postMock.mock.calls.length).toBe(0);
  });

  it("details absent yields embed with description empty string", async () => {
    let capturedPayload: DiscordWebhookPayload | undefined;
    const postMock = mock(
      async (_url: string, payload: DiscordWebhookPayload): Promise<PostDiscordWebhookResult> => {
        capturedPayload = payload;
        return { ok: true, status: 204 };
      }
    );

    await execute(
      { event: "tick", level: "done", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );

    expect(capturedPayload?.embeds[0].description).toBe("");
  });
});

// --- Error scenarios ---

describe("error scenarios — input validation", () => {
  it("throws on empty event string", async () => {
    await expect(
      execute(
        { event: "", level: "done", project: "p" },
        { loadConfig: () => makeConfig() }
      )
    ).rejects.toThrow(/non-empty/);
  });

  it("throws on whitespace-only event", async () => {
    await expect(
      execute(
        { event: "   ", level: "done", project: "p" },
        { loadConfig: () => makeConfig() }
      )
    ).rejects.toThrow(/non-empty/);
  });

  it("throws on empty project string", async () => {
    await expect(
      execute(
        { event: "ok", level: "done", project: "" },
        { loadConfig: () => makeConfig() }
      )
    ).rejects.toThrow(/non-empty/);
  });

  it("throws on invalid level with message listing valid values", async () => {
    await expect(
      execute(
        { event: "tick", level: "info" as never, project: "p" },
        { loadConfig: () => makeConfig() }
      )
    ).rejects.toThrow(/progress.*warn.*error.*done|done.*error.*warn.*progress/);
  });
});

describe("error scenarios — post failures", () => {
  let consoleErrorSpy: ReturnType<typeof mock>;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    consoleErrorSpy = mock((..._args: unknown[]) => {});
    console.error = consoleErrorSpy as unknown as typeof console.error;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("http_429 from post returns ok:false skipped:false with error", async () => {
    const postMock = makePostMock({ ok: false, error: "http_429" });
    const result = await execute(
      { event: "tick", level: "done", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );
    expect(result).toEqual({ ok: false, skipped: false, error: "http_429" });
  });

  it("console.error is called on post failure without URL", async () => {
    const postMock = makePostMock({ ok: false, error: "http_429" });
    await execute(
      { event: "tick", level: "done", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );

    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThan(0);

    const allArgs = consoleErrorSpy.mock.calls.flat().map(String);
    // Verify no arg contains the webhook URL fragment
    for (const arg of allArgs) {
      expect(arg).not.toContain("discord.com/api/webhooks");
    }
  });

  it("timeout error from post returns ok:false skipped:false error:timeout", async () => {
    const postMock = makePostMock({ ok: false, error: "timeout" });
    const result = await execute(
      { event: "tick", level: "done", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );
    expect(result).toEqual({ ok: false, skipped: false, error: "timeout" });
  });
});

// --- Boundary values ---

describe("boundary values", () => {
  it("details with 10000 chars: post receives payload with description of length 4096", async () => {
    let capturedPayload: DiscordWebhookPayload | undefined;
    const postMock = mock(
      async (_url: string, payload: DiscordWebhookPayload): Promise<PostDiscordWebhookResult> => {
        capturedPayload = payload;
        return { ok: true, status: 204 };
      }
    );

    const details = "x".repeat(10_000);
    await execute(
      { event: "tick", level: "done", project: "p", details },
      { loadConfig: () => makeConfig(), post: postMock }
    );

    expect(capturedPayload?.embeds[0].description.length).toBe(4096);
  });

  it("two consecutive calls produce two POSTs (stateless)", async () => {
    const postMock = makePostMock({ ok: true, status: 204 });
    const input = { event: "tick", level: "done" as const, project: "p" };
    const deps = { loadConfig: () => makeConfig(), post: postMock };

    await execute(input, deps);
    await execute(input, deps);

    expect(postMock.mock.calls.length).toBe(2);
  });

  it("unicode event passes through without corruption", async () => {
    let capturedPayload: DiscordWebhookPayload | undefined;
    const postMock = mock(
      async (_url: string, payload: DiscordWebhookPayload): Promise<PostDiscordWebhookResult> => {
        capturedPayload = payload;
        return { ok: true, status: 204 };
      }
    );

    const event = "🚀 部署完成 — wave 3";
    await execute(
      { event, level: "done", project: "p" },
      { loadConfig: () => makeConfig(), post: postMock }
    );

    const title = capturedPayload?.embeds[0].title ?? "";
    expect(title).toContain(event);
  });

  it("security: source of discord-notify.ts must not log URLs", async () => {
    // Static assertion: read the tool source and confirm no console.log/console.error with URL
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../src/tools/discord-notify.ts", import.meta.url),
      "utf8"
    );
    // Must not contain console.log or console.error followed by a URL variable like `url`
    const dangerPattern = /console\.(log|error)\s*\([^)]*\burl\b/i;
    expect(dangerPattern.test(src)).toBe(false);
  });
});
