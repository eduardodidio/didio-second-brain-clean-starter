// One-shot smoke for discord.notify — invokes execute() three times
// with level=progress/warn/done. Used by F03-T13 step 5.
// Usage: cd mcp-server && DISCORD_ENABLED=true bun run scripts/smoke-discord.ts
import { execute } from "../src/tools/discord-notify.ts";

const calls = [
  { level: "progress" as const, event: "F03 smoke step 5", channel: "#claude-progress" },
  { level: "warn" as const, event: "F03 smoke step 5", channel: "#claude-alerts" },
  { level: "done" as const, event: "F03 smoke step 5", channel: "#claude-done" },
];

for (const c of calls) {
  const ts = new Date().toISOString();
  const result = await execute({
    event: c.event,
    level: c.level,
    project: "didio-second-brain-claude",
    details: `T13 smoke @ ${ts} (target: ${c.channel})`,
  });
  console.log(JSON.stringify({ ts, level: c.level, channel: c.channel, result }));
}
