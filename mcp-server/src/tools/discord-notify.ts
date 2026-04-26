import type {
  DiscordNotifyInput,
  DiscordNotifyResult,
  DiscordConfig,
} from "../discord/types.ts";
import { DISCORD_LEVELS, LEVEL_TO_CHANNEL } from "../discord/types.ts";
import { loadDiscordConfig } from "../discord/config.ts";
import { buildDiscordEmbed } from "../discord/templates.ts";
import { postDiscordWebhook } from "../discord/webhook.ts";

export interface DiscordNotifyDeps {
  loadConfig?: () => DiscordConfig;
  buildEmbed?: typeof buildDiscordEmbed;
  post?: typeof postDiscordWebhook;
  now?: () => Date;
}

export async function execute(
  input: DiscordNotifyInput,
  deps: DiscordNotifyDeps = {}
): Promise<DiscordNotifyResult> {
  if (input.event.trim().length === 0) {
    throw new Error("event must be non-empty");
  }
  if (input.project.trim().length === 0) {
    throw new Error("project must be non-empty");
  }
  if (!DISCORD_LEVELS.includes(input.level)) {
    throw new Error(
      `invalid level: ${input.level}. Valid: [${DISCORD_LEVELS.join(", ")}]`
    );
  }

  const config = (deps.loadConfig ?? loadDiscordConfig)();

  if (!config.enabled) {
    return { ok: false, skipped: true, reason: "DISCORD_ENABLED=false" };
  }

  const channel = LEVEL_TO_CHANNEL[input.level];
  const url = config.webhooks[channel];

  if (url === null) {
    return {
      ok: false,
      skipped: true,
      reason: `webhook_not_configured:${channel}`,
    };
  }

  const buildEmbedFn = deps.buildEmbed ?? buildDiscordEmbed;
  const payload = buildEmbedFn(input, deps.now);

  const postFn = deps.post ?? postDiscordWebhook;
  const result = await postFn(url, payload);

  if (result.ok) {
    return { ok: true, channel, status: result.status };
  }

  console.error("[discord.notify] delivery failed", {
    level: input.level,
    event: input.event,
    project: input.project,
    error: result.error,
  });
  return { ok: false, skipped: false, error: result.error };
}
