export function writeFixedAscii(buffer: Buffer, offset: number, length: number, value?: string): void {
  if (!value) return;
  const encoded = Buffer.from(value, "ascii");
  encoded.copy(buffer, offset, 0, Math.min(encoded.length, length - 1));
}

export function readFixedAscii(buffer: Buffer, offset: number, length: number): string {
  const end = offset + length;
  const slice = buffer.subarray(offset, end);
  const nullIndex = slice.indexOf(0);
  return slice.subarray(0, nullIndex >= 0 ? nullIndex : slice.length).toString("ascii").trim();
}

export function finitePrice(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value >= Number.MAX_VALUE / 2) return undefined;
  return value;
}
