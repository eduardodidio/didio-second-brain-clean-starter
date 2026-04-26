import type { DigestPendingInput } from "../types.ts";
import { execute } from "../tools/memory-digest-pending.ts";

function parseArgs(argv: string[]): DigestPendingInput & { verbose: boolean } {
  const input: DigestPendingInput & { verbose: boolean } = { verbose: false };

  for (const arg of argv) {
    switch (true) {
      case arg === "--dry-run":
        input.dryRun = true;
        break;
      case arg.startsWith("--project="):
        input.project = arg.slice("--project=".length);
        break;
      case arg.startsWith("--max="):
        input.maxEntries = parseInt(arg.slice("--max=".length), 10);
        break;
      case arg === "--verbose":
        input.verbose = true;
        break;
    }
  }

  return input;
}

async function main(): Promise<void> {
  const { verbose, ...input } = parseArgs(process.argv.slice(2));

  let result;
  try {
    result = await execute(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[digest-pending] fatal: ${message}`);
    process.exit(0);
  }

  const summary =
    `digest-pending done: processed=${result.processed} classified=${result.classified} ` +
    `filtered=${result.filtered} deduped=${result.deduped} absorbed=${result.absorbed} ` +
    `errors=${result.errors.length}` +
    (input.dryRun ? " [dry-run]" : "");

  console.log(summary);

  if (verbose) {
    console.log(JSON.stringify(result, null, 2));
  }

  process.exit(0);
}

main();
