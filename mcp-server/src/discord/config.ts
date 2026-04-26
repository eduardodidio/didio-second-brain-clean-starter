// Bun auto-loads .env / .env.local from cwd when invoked via `bun run` —
// process.env is already populated by the time this module is imported.
// Do NOT add dotenv here.
import type { DiscordConfig } from "./types.ts";

const WEBHOOK_RE =
  /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/;

const CHANNEL_KEYS = ["progress", "alerts", "done"] as const;

export function validateWebhookUrl(url: string): boolean {
  return WEBHOOK_RE.test(url);
}

export function loadDiscordConfig(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >
): DiscordConfig {
  const enabledRaw = (env.DISCORD_ENABLED ?? "true").trim().toLowerCase();
  const enabled = enabledRaw !== "false";

  const webhooks: DiscordConfig["webhooks"] = {
    progress: null,
    alerts: null,
    done: null,
  };

  for (const channel of CHANNEL_KEYS) {
    const key = `DISCORD_WEBHOOK_${channel.toUpperCase()}`;
    const raw = env[key]?.trim();
    if (!raw) {
      webhooks[channel] = null;
    } else if (!WEBHOOK_RE.test(raw)) {
      throw new Error(`${key} has invalid URL shape`);
    } else {
      webhooks[channel] = raw;
    }
  }

  return { enabled, webhooks };
}
