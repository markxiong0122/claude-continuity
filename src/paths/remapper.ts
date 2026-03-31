import { homedir } from "os";

export function normalize(input: string): string {
  if (!input) return input;
  const home = homedir();

  let result = input.replaceAll(home, "$HOME");

  const encodedHome = home.split("/").filter(Boolean).join("-");
  result = result.replaceAll(encodedHome, "$HOME");

  return result;
}

export function expand(input: string): string {
  if (!input) return input;
  const home = homedir();
  const encodedHome = home.split("/").filter(Boolean).join("-");

  return input.replace(/\$HOME/g, (match, offset) => {
    const before = input[offset - 1];
    const after = input[offset + match.length];
    if (before === "-" || after === "-") return encodedHome;
    return home;
  });
}
