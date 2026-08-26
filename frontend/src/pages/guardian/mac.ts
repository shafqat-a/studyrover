// Guardian — client-side MAC address helpers.
//
// The server normalises MACs itself (lower-case, colon-separated), but
// validating and normalising in the form gives immediate feedback and keeps
// the devices table consistent before the round-trip completes.

const MAC_SEPARATORS = /[\s:.-]/g;

/**
 * Normalise any common MAC format to `aa:bb:cc:dd:ee:ff`. Accepts
 * `AA:BB:CC:DD:EE:FF`, `aa-bb-cc-dd-ee-ff`, `aabb.ccdd.eeff`, `aabbccddeeff`
 * and mixed case. Returns `null` when the input is not a 48-bit MAC.
 */
export function normalizeMac(input: string): string | null {
  const hex = input.trim().replace(MAC_SEPARATORS, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g)?.join(':') ?? null;
}

/** True when `input` normalises to a valid MAC. */
export function isValidMac(input: string): boolean {
  return normalizeMac(input) !== null;
}
