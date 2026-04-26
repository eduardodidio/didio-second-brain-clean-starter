export type DiscordLevel = "progress" | "warn" | "error" | "done";

export const DISCORD_LEVELS: readonly DiscordLevel[] = [
  "progress",
  "warn",
  "error",
  "done",
] as const;

export type DiscordChannelKey = "progress" | "alerts" | "done";

export const LEVEL_TO_CHANNEL: Record<DiscordLevel, DiscordChannelKey> = {
  progress: "progress",
  warn: "alerts",
  error: "alerts",
  done: "done",
};

export const LEVEL_COLOR: Record<DiscordLevel, number> = {
  progress: 0x3498db,
  warn: 0xf1c40f,
  error: 0xe74c3c,
  done: 0x2ecc71,
};

export const LEVEL_EMOJI: Record<DiscordLevel, string> = {
  progress: "⚙️",
  warn: "⚠️",
  error: "❌",
  done: "✅",
};

export interface DiscordConfig {
  enabled: boolean;
  webhooks: {
    progress: string | null;
    alerts: string | null;
    done: string | null;
  };
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  timestamp: string; // ISO 8601
}

export interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

export interface DiscordNotifyInput {
  event: string;
  level: DiscordLevel;
  project: string;
  details?: string;
}

export type DiscordNotifyResult =
  | { ok: true; channel: DiscordChannelKey; status: number }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };
