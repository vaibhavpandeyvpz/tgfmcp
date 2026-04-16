export function parseFiniteNumber(
  value: string | null | undefined,
  name: string,
): number | undefined {
  if (value === null || value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${name} must be a finite number`);
  }

  return parsedValue;
}
