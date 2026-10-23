// TEST MODE helper: prints the current TOTP code for a base32 secret.  npx tsx scripts/totp.ts <SECRET>
import { createHmac } from "node:crypto";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const s = (process.argv[2] ?? "").toUpperCase().replace(/\s/g, "");
let bits = 0, v = 0; const out: number[] = [];
for (const ch of s) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
const h = createHmac("sha1", Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
console.log(String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0"));
