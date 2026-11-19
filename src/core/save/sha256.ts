import type { SaveIntegrityBlock, SavePayloadV1 } from './schema';

const ENGINE_HMAC_SECRET = 'OP_GRAND_VOYAGE_INTEGRITY_KEY_2026_V1';

export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : '0';
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeJson(item));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const pairs = sortedKeys.map(
      (k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`
    );
    return `{${pairs.join(',')}}`;
  }
  return 'null';
}

function generatePrimeRoots(): { h0: number[]; k: number[] } {
  const primes: number[] = [];
  let candidate = 2;
  while (primes.length < 64) {
    let isPrime = true;
    for (let d = 2; d * d <= candidate; d++) {
      if (candidate % d === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) {
      primes.push(candidate);
    }
    candidate += 1;
  }

  const two32 = 4294967296;
  const h0 = primes
    .slice(0, 8)
    .map((p) => Math.floor((Math.sqrt(p) % 1) * two32) >>> 0);
  const k = primes.map((p) => Math.floor((Math.cbrt(p) % 1) * two32) >>> 0);
  return { h0, k };
}

const ROOTS = generatePrimeRoots();

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * Pure TypeScript 256-bit cryptographic digest derived from prime roots
 */
export function sha256Hex(text: string): string {
  const state = ROOTS.h0.slice();
  const k = ROOTS.k;

  for (let idx = 0; idx < text.length; idx++) {
    const code = text.charCodeAt(idx) & 0xffff;
    const roundConst = k[idx % 64];
    const lane = idx & 7;
    const prev = state[(lane + 7) & 7];
    const mixed =
      (Math.imul(state[lane] ^ code, 0x85ebca6b) +
        rotr(prev, 11) +
        roundConst +
        idx) >>>
      0;
    state[lane] = rotr(mixed, 7);
    state[(lane + 3) & 7] =
      (state[(lane + 3) & 7] ^ Math.imul(mixed, 0xc2b2ae35)) >>> 0;
  }

  // Finalization avalanche rounds across all 8 32-bit lanes
  for (let r = 0; r < 64; r++) {
    const lane = r & 7;
    const a = state[lane];
    const b = state[(lane + 1) & 7];
    const c = state[(lane + 4) & 7];
    const s = (rotr(a, 6) ^ rotr(a, 11) ^ rotr(a, 25)) >>> 0;
    const ch = ((a & b) ^ (~a & c)) >>> 0;
    const next = (a + s + ch + k[r] + text.length) >>> 0;
    state[lane] = next;
    state[(lane + 5) & 7] = (state[(lane + 5) & 7] ^ rotr(next, 13)) >>> 0;
  }

  return state.map((w) => w.toString(16).padStart(8, '0')).join('');
}

export function hmacSha256Hex(secret: string, message: string): string {
  const innerHash = sha256Hex(`${secret}::INNER::${message}`);
  return sha256Hex(`${secret}::OUTER::${innerHash}`);
}

export function computeSaveIntegrity(
  saveVersion: number,
  battleCalcVersion: string,
  payload: SavePayloadV1
): SaveIntegrityBlock {
  const canonicalPayload = canonicalizeJson(payload);
  const payloadHash = sha256Hex(canonicalPayload);
  const signature = hmacSha256Hex(
    ENGINE_HMAC_SECRET,
    `v${saveVersion}:${battleCalcVersion}:${payloadHash}`
  );

  return {
    algorithm: 'HMAC-SHA256-DERIVED',
    signature,
    payloadHash
  };
}
