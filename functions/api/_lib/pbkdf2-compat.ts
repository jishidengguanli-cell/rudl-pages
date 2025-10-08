/**
 * Minimal PBKDF2-HMAC-SHA256 implementation adapted from
 * https://github.com/dchest/fast-sha256-js (public domain).
 * Only the pieces required for PBKDF2 are kept and rewritten in ESM style.
 */

const DIGEST_LEN = 32;
const BLOCK_SIZE = 64;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function hashBlocks(w: Int32Array, v: Int32Array, p: Uint8Array, pos: number, len: number): number {
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  let u: number, i: number, j: number, t1: number, t2: number;
  while (len >= 64) {
    a = v[0]; b = v[1]; c = v[2]; d = v[3];
    e = v[4]; f = v[5]; g = v[6]; h = v[7];
    for (i = 0; i < 16; i++) {
      j = pos + i * 4;
      w[i] = ((p[j] & 0xff) << 24) | ((p[j + 1] & 0xff) << 16) | ((p[j + 2] & 0xff) << 8) | (p[j + 3] & 0xff);
    }
    for (i = 16; i < 64; i++) {
      u = w[i - 2];
      t1 = ((u >>> 17) | (u << 15)) ^ ((u >>> 19) | (u << 13)) ^ (u >>> 10);
      u = w[i - 15];
      t2 = ((u >>> 7) | (u << 25)) ^ ((u >>> 18) | (u << 14)) ^ (u >>> 3);
      w[i] = (t1 + w[i - 7] + t2 + w[i - 16]) | 0;
    }
    for (i = 0; i < 64; i++) {
      t1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g));
      t1 = (h + ((K[i] + w[i]) | 0) + t1) | 0;
      t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c));
      h = g; g = f; f = e;
      e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    v[0] = (v[0] + a) | 0;
    v[1] = (v[1] + b) | 0;
    v[2] = (v[2] + c) | 0;
    v[3] = (v[3] + d) | 0;
    v[4] = (v[4] + e) | 0;
    v[5] = (v[5] + f) | 0;
    v[6] = (v[6] + g) | 0;
    v[7] = (v[7] + h) | 0;
    pos += 64;
    len -= 64;
  }
  return pos;
}

class Hash {
  readonly digestLength = DIGEST_LEN;
  readonly blockSize = BLOCK_SIZE;
  private state = new Int32Array(8);
  private temp = new Int32Array(64);
  private buffer = new Uint8Array(128);
  private bufferLength = 0;
  private bytesHashed = 0;
  private finished = false;

  constructor() {
    this.reset();
  }

  reset() {
    this.state[0] = 0x6a09e667;
    this.state[1] = 0xbb67ae85;
    this.state[2] = 0x3c6ef372;
    this.state[3] = 0xa54ff53a;
    this.state[4] = 0x510e527f;
    this.state[5] = 0x9b05688c;
    this.state[6] = 0x1f83d9ab;
    this.state[7] = 0x5be0cd19;
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
    return this;
  }

  clean() {
    this.state.fill(0);
    this.temp.fill(0);
    this.buffer.fill(0);
    this.reset();
  }

  update(data: Uint8Array, dataLength = data.length) {
    if (this.finished) throw new Error("SHA256: can't update because hash was finished.");
    let dataPos = 0;
    this.bytesHashed += dataLength;
    if (this.bufferLength > 0) {
      while (this.bufferLength < 64 && dataLength > 0) {
        this.buffer[this.bufferLength++] = data[dataPos++];
        dataLength--;
      }
      if (this.bufferLength === 64) {
        hashBlocks(this.temp, this.state, this.buffer, 0, 64);
        this.bufferLength = 0;
      }
    }
    if (dataLength >= 64) {
      dataPos = hashBlocks(this.temp, this.state, data, dataPos, dataLength);
      dataLength %= 64;
    }
    while (dataLength > 0) {
      this.buffer[this.bufferLength++] = data[dataPos++];
      dataLength--;
    }
    return this;
  }

  finish(out: Uint8Array) {
    if (!this.finished) {
      const bytesHashed = this.bytesHashed;
      const left = this.bufferLength;
      const bitLenHi = (bytesHashed / 0x20000000) | 0;
      const bitLenLo = bytesHashed << 3;
      const padLength = (bytesHashed % 64 < 56) ? 64 : 128;
      this.buffer[left] = 0x80;
      for (let i = left + 1; i < padLength - 8; i++) this.buffer[i] = 0;
      this.buffer[padLength - 8] = (bitLenHi >>> 24) & 0xff;
      this.buffer[padLength - 7] = (bitLenHi >>> 16) & 0xff;
      this.buffer[padLength - 6] = (bitLenHi >>> 8) & 0xff;
      this.buffer[padLength - 5] = bitLenHi & 0xff;
      this.buffer[padLength - 4] = (bitLenLo >>> 24) & 0xff;
      this.buffer[padLength - 3] = (bitLenLo >>> 16) & 0xff;
      this.buffer[padLength - 2] = (bitLenLo >>> 8) & 0xff;
      this.buffer[padLength - 1] = bitLenLo & 0xff;
      hashBlocks(this.temp, this.state, this.buffer, 0, padLength);
      this.finished = true;
    }
    for (let i = 0; i < 8; i++) {
      const s = this.state[i];
      out[i * 4 + 0] = (s >>> 24) & 0xff;
      out[i * 4 + 1] = (s >>> 16) & 0xff;
      out[i * 4 + 2] = (s >>> 8) & 0xff;
      out[i * 4 + 3] = s & 0xff;
    }
    return out;
  }

  digest(): Uint8Array {
    const out = new Uint8Array(this.digestLength);
    this.finish(out);
    return out;
  }
}

class Hmac {
  private inner = new Hash();
  private outer = new Hash();
  private ipad: Uint8Array;
  private opad: Uint8Array;

  constructor(key: Uint8Array) {
    const blockSize = this.inner.blockSize;
    const pad = new Uint8Array(blockSize);
    if (key.length > blockSize) {
      const hash = new Hash();
      hash.update(key).finish(pad);
      hash.clean();
    } else {
      pad.set(key);
    }

    this.ipad = new Uint8Array(blockSize);
    this.opad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      const k = pad[i];
      this.ipad[i] = k ^ 0x36;
      this.opad[i] = k ^ 0x5c;
    }

    this.inner.update(this.ipad);
    this.outer.update(this.opad);
    pad.fill(0);
  }

  reset() {
    this.inner.reset().update(this.ipad);
    this.outer.reset().update(this.opad);
    return this;
  }

  update(data: Uint8Array) {
    this.inner.update(data);
    return this;
  }

  finish(out: Uint8Array) {
    const innerHash = this.inner.digest();
    this.outer.reset().update(this.opad).update(innerHash).finish(out);
    innerHash.fill(0);
    return out;
  }

  clean() {
    this.inner.clean();
    this.outer.clean();
    this.ipad.fill(0);
    this.opad.fill(0);
  }
}

export function pbkdf2Compat(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number): Uint8Array {
  const prf = new Hmac(password);
  const len = DIGEST_LEN;
  const ctr = new Uint8Array(4);
  const t = new Uint8Array(len);
  const u = new Uint8Array(len);
  const dk = new Uint8Array(dkLen);

  for (let block = 0; block * len < dkLen; block++) {
    const c = block + 1;
    ctr[0] = (c >>> 24) & 0xff;
    ctr[1] = (c >>> 16) & 0xff;
    ctr[2] = (c >>> 8) & 0xff;
    ctr[3] = c & 0xff;

    prf.reset();
    prf.update(salt);
    prf.update(ctr);
    prf.finish(u);
    t.set(u);

    for (let j = 2; j <= iterations; j++) {
      prf.reset();
      prf.update(u);
      prf.finish(u);
      for (let k = 0; k < len; k++) t[k] ^= u[k];
    }

    for (let j = 0; j < len && block * len + j < dkLen; j++) {
      dk[block * len + j] = t[j];
    }
  }

  t.fill(0);
  u.fill(0);
  ctr.fill(0);
  prf.clean();
  return dk;
}
