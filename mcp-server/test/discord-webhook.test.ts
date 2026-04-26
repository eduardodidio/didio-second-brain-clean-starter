import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { postDiscordWebhook } from "../src/discord/webhook.ts";
import type { DiscordWebhookPayload } from "../src/discord/types.ts";

const TEST_URL = "https://discord.com/api/webhooks/fake/token123";
const PAYLOAD: DiscordWebhookPayload = {
  embeds: [
    {
      title: "Test",
      description: "desc",
      color: 0x3498db,
      fields: [],
      timestamp: new Date().toISOString(),
    },
  ],
};

function makeFetch(response: Partial<Response> & { ok: boolean; status: number }) {
  return mock(async () => response as Response);
}

function makeSlowFetch(delayMs: number) {
  return mock(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve({ ok: true, status: 204 } as Response),
          delayMs
        );
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const err = Object.assign(new Error("aborted"), { name: "AbortError" });
          reject(err);
        });
      })
  );
}

function makeErrorFetch(err: Error) {
  return mock(async (): Promise<Response> => {
    throw err;
  });
}

describe("postDiscordWebhook", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("happy path", () => {
    it("returns { ok: true, status: 204 } when Discord responds 204", async () => {
      const fakeFetch = makeFetch({ ok: true, status: 204 });
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: fakeFetch });

      expect(result).toEqual({ ok: true, status: 204 });
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it("calls fetch with POST method and JSON body containing embeds", async () => {
      const fakeFetch = makeFetch({ ok: true, status: 204 });
      await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: fakeFetch });

      const [calledUrl, calledInit] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(calledUrl).toBe(TEST_URL);
      expect(calledInit.method).toBe("POST");

      const body = JSON.parse(calledInit.body as string) as DiscordWebhookPayload;
      expect(body).toHaveProperty("embeds");
      expect(Array.isArray(body.embeds)).toBe(true);
    });

    it("sets Content-Type and User-Agent headers", async () => {
      const fakeFetch = makeFetch({ ok: true, status: 204 });
      await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: fakeFetch });

      const [, calledInit] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
      const headers = calledInit.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json; charset=utf-8");
      expect(headers["User-Agent"]).toContain("didio-second-brain-mcp");
    });
  });

  describe("edge cases", () => {
    it("returns { ok: false, error: 'http_429' } on rate-limit response", async () => {
      const fakeFetch = makeFetch({ ok: false, status: 429 });
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: fakeFetch });

      expect(result).toEqual({ ok: false, error: "http_429" });
    });

    it("does not leak the URL in console.error on HTTP error", async () => {
      const fakeFetch = makeFetch({ ok: false, status: 429 });
      await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: fakeFetch });

      expect(consoleErrorSpy).toHaveBeenCalled();
      for (const call of consoleErrorSpy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(TEST_URL);
          expect(String(arg)).not.toContain("token123");
        }
      }
    });

    it("returns { ok: false, error: 'timeout' } when fetch takes longer than timeoutMs", async () => {
      const slowFetch = makeSlowFetch(200);
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, {
        fetch: slowFetch,
        timeoutMs: 50,
      });

      expect(result).toEqual({ ok: false, error: "timeout" });
    });

    it("uses the custom fetch implementation instead of global", async () => {
      const customFetch = makeFetch({ ok: true, status: 200 });
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: customFetch });

      expect(result).toEqual({ ok: true, status: 200 });
      expect(customFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("error scenarios", () => {
    it("resolves (does not reject) when fetch throws ENOTFOUND", async () => {
      const errorFetch = makeErrorFetch(new Error("ENOTFOUND"));
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: errorFetch });

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("calls console.error with 'network' message (no URL) on network error", async () => {
      const errorFetch = makeErrorFetch(new Error("ENOTFOUND"));
      await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: errorFetch });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const allArgs = consoleErrorSpy.mock.calls.flat().map(String).join(" ");
      expect(allArgs).toContain("network");
      expect(allArgs).not.toContain(TEST_URL);
      expect(allArgs).not.toContain("token123");
    });

    it("returns { ok: false, error: 'timeout' } when error name is AbortError", async () => {
      const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
      const errorFetch = makeErrorFetch(abortErr);
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, { fetch: errorFetch });

      expect(result).toEqual({ ok: false, error: "timeout" });
    });
  });

  describe("boundary values", () => {
    it("aborts immediately with timeoutMs: 0", async () => {
      const slowFetch = makeSlowFetch(100);
      const result = await postDiscordWebhook(TEST_URL, PAYLOAD, {
        fetch: slowFetch,
        timeoutMs: 0,
      });

      expect(result).toEqual({ ok: false, error: "timeout" });
    });

    it("sends request with empty embeds array without throwing", async () => {
      const emptyPayload: DiscordWebhookPayload = { embeds: [] };
      const fakeFetch = makeFetch({ ok: true, status: 204 });
      const result = await postDiscordWebhook(TEST_URL, emptyPayload, { fetch: fakeFetch });

      expect(result).toEqual({ ok: true, status: 204 });
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it("passes URL with unicode path to fetch without modification", async () => {
      const unicodeUrl = "https://discord.com/api/webhooks/\u4e2d\u6587/token";
      const fakeFetch = makeFetch({ ok: true, status: 204 });
      await postDiscordWebhook(unicodeUrl, PAYLOAD, { fetch: fakeFetch });

      const [calledUrl] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(calledUrl).toBe(unicodeUrl);
    });
  });
});
