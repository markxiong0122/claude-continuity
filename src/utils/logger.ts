let quiet = false;

export function setQuiet(value: boolean): void {
  quiet = value;
}

export function log(message: string): void {
  if (!quiet) console.log(message);
}

export function warn(message: string): void {
  if (!quiet) console.warn(`⚠ ${message}`);
}

export function error(message: string): void {
  console.error(`✗ ${message}`);
}
