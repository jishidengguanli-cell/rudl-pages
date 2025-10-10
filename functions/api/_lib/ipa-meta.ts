// functions/api/_lib/ipa-meta.ts

export interface IpaMeta {
  bundle_id: string;
  version: string;
  display_name: string;
}

const IPA_CDN_BASE = "https://cdn.rudownload.win/";

const tdUtf8 = new TextDecoder("utf-8");
const tdUtf16le = new TextDecoder("utf-16le");
const tdUtf16be = new TextDecoder("utf-16be");

export async function ensureIpaMeta(ipaKey: string): Promise<IpaMeta | null> {
  const key = ipaKey.replace(/^\/+/, "").trim();
  if (!key) return null;
  const url = IPA_CDN_BASE + encodePath(key);
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error("fetch ipa failed");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return extractIpaMeta(bytes);
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()),
    )
    .join("/");
}

export async function extractIpaMeta(ipaBytes: Uint8Array): Promise<IpaMeta> {
  const entries = parseZipEntries(ipaBytes);
  const entryMap = new Map<string, ZipEntryInfo>();
  for (const entry of entries) entryMap.set(normalizePath(entry.name), entry);

  const infoEntry = entries.find((e) => /Payload\/[^/]+\.app\/Info\.plist$/i.test(e.name));
  if (!infoEntry) throw new Error("Info.plist not found");
  const infoBuf = await readZipEntry(ipaBytes, infoEntry);
  const info: any = parsePlist(infoBuf);
  if (!info) throw new Error("Info.plist parse failed");

  const bundle_id = asString(info.CFBundleIdentifier);
  const version = asString(info.CFBundleShortVersionString) || asString(info.CFBundleVersion);

  let display_name =
    asString(info.CFBundleDisplayName) ||
    asString(info.CFBundleName) ||
    asString(info.CFBundleExecutable);
  display_name = display_name.trim();

  if (!display_name || /\$\(|%[@{]/.test(display_name)) {
    const devRegion = asString(info.CFBundleDevelopmentRegion) || "en";
    const appDir = infoEntry.name.slice(0, infoEntry.name.lastIndexOf("/") + 1);
    const candidates = [
      normalizePath(appDir + `${devRegion}.lproj/InfoPlist.strings`),
      normalizePath(appDir + "Base.lproj/InfoPlist.strings"),
    ];
    for (const key of candidates) {
      const entry = entryMap.get(key);
      if (!entry) continue;
      const dict = parsePlistOrStrings(await readZipEntry(ipaBytes, entry));
      const v =
        asString(dict?.CFBundleDisplayName) ||
        asString(dict?.CFBundleName) ||
        asString(dict?.CFBundleExecutable);
      if (v.trim()) {
        display_name = v.trim();
        break;
      }
    }
  }

  return { bundle_id, version, display_name };
}

function parsePlist(bytes: Uint8Array) {
  const binary = parseBinaryPlist(bytes);
  if (binary) return binary;
  const text = decodeText(bytes);
  if (!text) return null;
  return parsePlistXml(text);
}

function parsePlistOrStrings(buf: Uint8Array): any {
  const asPlist = parsePlist(buf);
  if (asPlist && typeof asPlist === "object" && !Array.isArray(asPlist)) return asPlist;
  const text = decodeText(buf);
  if (!text) return {};
  const out: Record<string, string> = {};
  text.replace(/"([^"]+)"\s*=\s*"([^"]*)"\s*;/g, (_, k, v) => {
    out[decodeStringsToken(k)] = decodeStringsToken(v);
    return "";
  });
  return out;
}

function decodeText(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return "";
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return tdUtf16le.decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return tdUtf16be.decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return tdUtf8.decode(bytes.subarray(3));
  }
  return tdUtf8.decode(bytes);
}

function parsePlistXml(xml: string) {
  const obj: Record<string, unknown> = {};
  const keyRe = /<key>([^<]+)<\/key>\s*(<[^>]+>[\s\S]*?(?:<\/[^>]+>|\/>))/gi;
  let match: RegExpExecArray | null;
  while ((match = keyRe.exec(xml))) {
    const key = decodeXml(match[1].trim());
    const valueNode = match[2];
    const value = parsePlistXmlValue(valueNode);
    if (value !== undefined) obj[key] = value;
  }
  return obj;
}

function parsePlistXmlValue(node: string): unknown {
  const trimmed = node.trim();
  if (/^<string/i.test(trimmed)) {
    return decodeXml(trimmed.replace(/^<string[^>]*>/i, "").replace(/<\/string>$/i, "").trim());
  }
  if (/^<integer/i.test(trimmed)) {
    return parseInt(trimmed.replace(/^<integer[^>]*>/i, "").replace(/<\/integer>$/i, "").trim(), 10);
  }
  if (/^<real/i.test(trimmed)) {
    return parseFloat(trimmed.replace(/^<real[^>]*>/i, "").replace(/<\/real>$/i, "").trim());
  }
  if (/^<true\/?>/i.test(trimmed)) return true;
  if (/^<false\/?>/i.test(trimmed)) return false;
  if (/^<dict/i.test(trimmed)) {
    const inner = trimmed.replace(/^<dict[^>]*>/i, "").replace(/<\/dict>$/i, "");
    return parsePlistXml(inner);
  }
  if (/^<array/i.test(trimmed)) {
    const inner = trimmed.replace(/^<array[^>]*>/i, "").replace(/<\/array>$/i, "");
    const items: unknown[] = [];
    const valueRe = /<[^>]+>[\s\S]*?(?:<\/[^>]+>|\/>)/gi;
    let valueMatch: RegExpExecArray | null;
    while ((valueMatch = valueRe.exec(inner))) {
      const val = parsePlistXmlValue(valueMatch[0]);
      if (val !== undefined) items.push(val);
    }
    return items;
  }
  return undefined;
}

function parseBinaryPlist(bytes: Uint8Array): any {
  try {
    if (bytes.length < 8) return null;
    const head = tdUtf8.decode(bytes.subarray(0, 8));
    if (!head.startsWith("bplist")) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const trailerOffset = bytes.byteLength - 32;
    if (trailerOffset < 0) return null;
    const trailer = new DataView(bytes.buffer, bytes.byteOffset + trailerOffset, 32);
    const offsetSize = trailer.getUint8(6);
    const objRefSize = trailer.getUint8(7);
    const numObjects = Number(readUIntBE(trailer, 8, 8));
    const topObject = Number(readUIntBE(trailer, 16, 8));
    const offsetTableOffset = Number(readUIntBE(trailer, 24, 8));
    const offsets: number[] = [];
    for (let i = 0; i < numObjects; i++) {
      offsets.push(Number(readUIntBE(view, offsetTableOffset + i * offsetSize, offsetSize)));
    }
    const readObj = (idx: number): any => {
      const off = offsets[idx];
      const t = bytes[off];
      const type = (t & 0xf0) >> 4;
      const info = t & 0x0f;
      const readLength = (position: number, infoField: number) => {
        if (infoField !== 0x0f) return { length: infoField, ptr: position + 1 };
        const t2 = bytes[position + 1];
        const type2 = (t2 & 0xf0) >> 4;
        const info2 = t2 & 0x0f;
        if (type2 !== 0x1) throw new Error("binary plist length not int");
        const nBytes = 1 << info2;
        const val = Number(readUIntBE(view, position + 2, nBytes));
        return { length: val, ptr: position + 2 + nBytes };
      };
      if (type === 0x0) {
        if (info === 0x8) return false;
        if (info === 0x9) return true;
        return null;
      }
      if (type === 0x1) {
        const nBytes = 1 << info;
        return Number(readUIntBE(view, off + 1, nBytes));
      }
      if (type === 0x2) {
        const nBytes = 1 << info;
        if (nBytes === 4) return view.getFloat32(off + 1, false);
        if (nBytes === 8) return view.getFloat64(off + 1, false);
        return null;
      }
      if (type === 0x4) {
        const { length, ptr } = readLength(off, info);
        return bytes.slice(ptr, ptr + length);
      }
      if (type === 0x5) {
        const { length, ptr } = readLength(off, info);
        return tdUtf8.decode(bytes.subarray(ptr, ptr + length));
      }
      if (type === 0x6) {
        const { length, ptr } = readLength(off, info);
        const chars: number[] = [];
        for (let i = 0; i < length; i++) chars.push(view.getUint16(ptr + i * 2, false));
        return String.fromCharCode(...chars);
      }
      if (type === 0xa) {
        const { length, ptr } = readLength(off, info);
        const arr: any[] = [];
        for (let i = 0; i < length; i++) {
          const objRef = Number(readUIntBE(view, ptr + i * objRefSize, objRefSize));
          arr.push(readObj(objRef));
        }
        return arr;
      }
      if (type === 0xd) {
        const { length, ptr } = readLength(off, info);
        const keys: any[] = [];
        const vals: any[] = [];
        for (let i = 0; i < length; i++) {
          const keyRef = Number(readUIntBE(view, ptr + i * objRefSize, objRefSize));
          keys.push(readObj(keyRef));
        }
        const valuesPtr = ptr + length * objRefSize;
        for (let i = 0; i < length; i++) {
          const valRef = Number(readUIntBE(view, valuesPtr + i * objRefSize, objRefSize));
          vals.push(readObj(valRef));
        }
        const out: Record<string, any> = {};
        for (let i = 0; i < length; i++) out[String(keys[i])] = vals[i];
        return out;
      }
      return null;
    };
    return readObj(topObject) ?? null;
  } catch {
    return null;
  }
}

function readUIntBE(view: DataView, offset: number, length: number): bigint {
  let n = 0n;
  for (let i = 0; i < length; i++) {
    n = (n << 8n) | BigInt(view.getUint8(offset + i));
  }
  return n;
}

interface ZipEntryInfo {
  name: string;
  compression: number;
  compSize: number;
  localOffset: number;
}

function parseZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdSig = 0x06054b50;
  const maxBack = Math.min(bytes.length, 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxBack; i--) {
    if (view.getUint32(i, true) === eocdSig) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP EOCD not found");
  const cdCount = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOff = view.getUint32(eocd + 16, true);
  const entries: ZipEntryInfo[] = [];
  let ptr = cdOff;
  const end = cdOff + cdSize;
  for (let i = 0; i < cdCount && ptr + 46 <= end; i++) {
    const sig = view.getUint32(ptr, true);
    if (sig !== 0x02014b50) break;
    const compression = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + nameLen);
    const name = tdUtf8.decode(nameBytes);
    entries.push({ name, compression, compSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntryInfo): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = view.getUint32(entry.localOffset, true);
  if (sig !== 0x04034b50) throw new Error("ZIP local header mismatch");
  const nameLen = view.getUint16(entry.localOffset + 26, true);
  const extraLen = view.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + nameLen + extraLen;
  const compData = bytes.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compression === 0) return compData.slice();
  if (entry.compression === 8) return inflateRaw(compData);
  throw new Error("Unsupported ZIP compression method: " + entry.compression);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Deflate not supported in this runtime");
  }
  const ds = new DecompressionStream("deflate-raw");
  const ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "true" : "";
  if (v instanceof Uint8Array) return decodeText(v);
  return "";
}

function decodeStringsToken(token: string) {
  return token.replace(/\\([\\nrt"'\\])/g, (_, ch) => {
    switch (ch) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case '"': return '"';
      case "'": return "'";
      case "\\": return "\\";
      default: return ch;
    }
  });
}

function decodeXml(input: string) {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_, code) => {
      const isHex = /^x/i.test(code);
      const num = isHex ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      if (Number.isNaN(num)) return "";
      return String.fromCodePoint(num);
    });
}
