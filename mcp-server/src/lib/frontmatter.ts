import { parse as yamlParse, stringify as yamlStringify } from "yaml";

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
}

const DELIMITER = "---";

export function parseFrontmatter(content: string): ParsedMarkdown {
  if (!content.startsWith(DELIMITER + "\n") && content !== DELIMITER) {
    return { data: {}, body: content };
  }
  const afterOpen = content.slice(DELIMITER.length + 1); // skip "---\n"

  let yamlBlock: string;
  let afterClose: string;

  if (afterOpen === DELIMITER || afterOpen.startsWith(DELIMITER + "\n")) {
    // Closing delimiter is on the very next line (empty frontmatter)
    yamlBlock = "";
    afterClose = afterOpen.slice(DELIMITER.length);
  } else {
    const closeIdx = afterOpen.indexOf("\n" + DELIMITER);
    if (closeIdx === -1) {
      return { data: {}, body: content };
    }
    yamlBlock = afterOpen.slice(0, closeIdx);
    afterClose = afterOpen.slice(closeIdx + 1 + DELIMITER.length); // skip "\n---"
  }

  // afterClose starts with \n (terminates the --- line); skip it, then skip optional blank line
  const withoutNL = afterClose.startsWith("\n") ? afterClose.slice(1) : afterClose;
  const body = withoutNL.startsWith("\n") ? withoutNL.slice(1) : withoutNL;

  const parsed = yamlParse(yamlBlock);
  const data: Record<string, unknown> =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body };
}

export function buildFrontmatter(
  data: Record<string, unknown>,
  body: string
): string {
  const yamlStr = yamlStringify(data).trimEnd();
  return `${DELIMITER}\n${yamlStr}\n${DELIMITER}\n\n${body}`;
}
