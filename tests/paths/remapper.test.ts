import { describe, it, expect } from "bun:test";
import { normalize, expand } from "../../src/paths/remapper";

describe("normalize", () => {
  it("replaces home directory with $HOME", () => {
    const home = process.env.HOME!;
    expect(normalize(`${home}/projects/mapier`)).toBe("$HOME/projects/mapier");
  });

  it("handles paths without home prefix", () => {
    expect(normalize("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("normalizes directory names encoded with dashes", () => {
    const home = process.env.HOME!;
    const parts = home.split("/").filter(Boolean);
    const encoded = `-${parts.join("-")}-projects-mapier`;
    const result = normalize(encoded);
    expect(result).toBe("-$HOME-projects-mapier");
  });
});

describe("expand", () => {
  it("replaces $HOME with local home directory", () => {
    const home = process.env.HOME!;
    expect(expand("$HOME/projects/mapier")).toBe(`${home}/projects/mapier`);
  });

  it("handles paths without $HOME", () => {
    expect(expand("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("expands encoded directory names", () => {
    const home = process.env.HOME!;
    const parts = home.split("/").filter(Boolean);
    const result = expand("-$HOME-projects-mapier");
    expect(result).toBe(`-${parts.join("-")}-projects-mapier`);
  });
});
