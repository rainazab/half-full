import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
export function publicAddress(ip: string) {
  if (!isIP(ip)) return false;
  if (ip.includes(":"))
    return !/^(?:::|::1$|::ffff:|f[cd]|fe[89ab]|ff)/i.test(ip);
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  return !(
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && (p[1] === 168 || p[1] === 0)) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19))
  );
}
export type HostResolver = (hostname: string) => Promise<boolean>;
export const resolvePublicHost: HostResolver = async (hostname) => {
  if (isIP(hostname)) return publicAddress(hostname);
  try {
    const records = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(Error("DNS deadline")), 2000);
        timer.unref();
      }),
    ]);
    return records.length > 0 && records.every((r) => publicAddress(r.address));
  } catch {
    return false;
  }
};
