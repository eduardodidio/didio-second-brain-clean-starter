import {
  LEVEL_COLOR,
  LEVEL_EMOJI,
  type DiscordNotifyInput,
  type DiscordWebhookPayload,
} from "./types.ts";

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function buildDiscordEmbed(
  input: DiscordNotifyInput,
  now: () => Date = () => new Date()
): DiscordWebhookPayload {
  const emoji = LEVEL_EMOJI[input.level];
  const color = LEVEL_COLOR[input.level];
  const title = truncate(`${emoji} ${input.event}`, 256);
  const description = truncate(input.details ?? "", 4096);
  const fields = [
    { name: "project", value: truncate(input.project, 1024), inline: true as const },
    { name: "level", value: input.level, inline: true as const },
    { name: "event", value: truncate(input.event, 1024), inline: true as const },
  ];
  const timestamp = now().toISOString();
  return { embeds: [{ title, description, color, fields, timestamp }] };
}
