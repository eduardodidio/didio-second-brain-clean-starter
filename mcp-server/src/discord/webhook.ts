import type { DiscordWebhookPayload } from "./types.ts";

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export interface PostDiscordWebhookOptions {
  timeoutMs?: number;
  fetch?: FetchLike;
}

export type PostDiscordWebhookResult =
  | { ok: true; status: number }
  | { ok: false; error: string };

export async function postDiscordWebhook(
  url: string,
  payload: DiscordWebhookPayload,
  opts: PostDiscordWebhookOptions = {}
): Promise<PostDiscordWebhookResult> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "didio-second-brain-mcp/0.1.0 (+discord.notify)",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    console.error("[discord.notify] webhook returned", response.status);
    return { ok: false, error: `http_${response.status}` };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e.name === "AbortError") {
      console.error(
        "[discord.notify] webhook timed out after",
        timeoutMs,
        "ms"
      );
      return { ok: false, error: "timeout" };
    }
    console.error(
      "[discord.notify] webhook network error:",
      e.message ?? String(err)
    );
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}
