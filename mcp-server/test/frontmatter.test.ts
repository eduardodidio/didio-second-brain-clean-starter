import { describe, expect, it } from "bun:test";
import { buildFrontmatter, parseFrontmatter } from "../src/lib/frontmatter";

describe("parseFrontmatter", () => {
  it("happy path: parses projects field and body", () => {
    const content =
      "---\nprojects: [claude-didio-config]\n---\n\n# Title\nbody text";
    const { data, body } = parseFrontmatter(content);
    expect(data.projects).toEqual(["claude-didio-config"]);
    expect(body).toBe("# Title\nbody text");
  });

  it("no frontmatter: returns empty data and full content as body", () => {
    const content = "# Just a title\nbody";
    const { data, body } = parseFrontmatter(content);
    expect(data).toEqual({});
    expect(body).toBe(content);
  });

  it("empty frontmatter block: returns empty data", () => {
    const content = "---\n---\n\nbody";
    const { data, body } = parseFrontmatter(content);
    expect(data).toEqual({});
    expect(body).toBe("body");
  });

  it("unclosed opening delimiter: returns empty data and full content as body", () => {
    const content = "---\nprojects: x\n\nbody without closing";
    const { data, body } = parseFrontmatter(content);
    expect(data).toEqual({});
    expect(body).toBe(content);
  });

  it("whitespace before opening delimiter: treated as no frontmatter", () => {
    const content = "  ---\nprojects: x\n---\n\nbody";
    const { data, body } = parseFrontmatter(content);
    expect(data).toEqual({});
    expect(body).toBe(content);
  });

  it("malformed YAML block: throws YAMLParseError", () => {
    const content = "---\n:invalid: [\n---\n\nbody";
    expect(() => parseFrontmatter(content)).toThrow();
  });

  it("body containing --- not at position 0: preserved as body content", () => {
    const content = "---\ntitle: hi\n---\n\nsome text\n---\nmore text";
    const { data, body } = parseFrontmatter(content);
    expect(data).toEqual({ title: "hi" });
    expect(body).toBe("some text\n---\nmore text");
  });
});

describe("buildFrontmatter", () => {
  it("round-trip preserves data and body", () => {
    const data = { a: 1, b: "x" };
    const body = "hello";
    const result = buildFrontmatter(data, body);
    const { data: parsedData, body: parsedBody } = parseFrontmatter(result);
    expect(parsedData).toEqual(data);
    expect(parsedBody).toBe(body);
  });

  it("output starts with --- delimiter", () => {
    const result = buildFrontmatter({ key: "val" }, "body");
    expect(result.startsWith("---\n")).toBe(true);
  });

  it("output has blank line between closing delimiter and body", () => {
    const result = buildFrontmatter({ key: "val" }, "body");
    expect(result).toContain("---\n\nbody");
  });
});
