export function hasLeadingZeroBits(
  digest: Uint8Array,
  difficulty: number,
): boolean {
  let remaining = difficulty;
  for (const byte of digest) {
    if (remaining <= 0) return true;
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
      continue;
    }
    return (byte >>> (8 - remaining)) === 0;
  }
  return remaining <= 0;
}
