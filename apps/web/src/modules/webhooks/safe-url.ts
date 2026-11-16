import { BlockList, isIP } from "node:net";
import dns from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";

/**
 * Webhook URLs are entered by admins but requested by our servers, so they must never reach
 * internal networks or cloud metadata endpoints (SSRF). The address check runs again at connect
 * time (see safeLookup), so a hostname that later resolves to a private address is still refused.
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** Local testing only: WEBHOOKS_ALLOW_PRIVATE=1 permits http:// and private addresses. */
export function allowPrivateTargets(): boolean {
  return process.env.WEBHOOKS_ALLOW_PRIVATE === "1" && process.env.VERCEL_ENV !== "production";
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d): judge the embedded IPv4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    if (lower.startsWith("::ffff:")) return true;
    return blocked.check(lower, "ipv6");
  }
  return true;
}

export class WebhookUrlError extends Error {}

/** Validates an endpoint URL when it's saved. Returns the normalized URL. */
export function validateWebhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebhookUrlError("Enter a full URL, starting with https://");
  }
  const lenient = allowPrivateTargets();
  if (url.protocol !== "https:" && !(lenient && url.protocol === "http:"))
    throw new WebhookUrlError("The URL must start with https://");
  if (url.username || url.password)
    throw new WebhookUrlError("Remove the username and password from the URL.");
  if (url.hash) throw new WebhookUrlError("Remove the #fragment from the URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!lenient) {
    if (isIP(host) && isBlockedAddress(host))
      throw new WebhookUrlError("That address is private and can't receive webhooks.");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      host.endsWith(".local") ||
      !host.includes(".")
    )
      throw new WebhookUrlError("Use a public hostname.");
  }
  if (url.toString().length > 2000) throw new WebhookUrlError("The URL is too long.");
  return url.toString();
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** `lookup` for http(s).request: resolves normally, then refuses private addresses. */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!allowPrivateTargets() && list.some((a) => isBlockedAddress(a.address))) {
      const e: NodeJS.ErrnoException = new Error(`${hostname} resolves to a private address`);
      e.code = "EBLOCKED";
      return callback(e, []);
    }
    if (options.all) return callback(null, list);
    const first = list[0];
    if (!first) return callback(Object.assign(new Error("No address"), { code: "ENOTFOUND" }), []);
    callback(null, first.address, first.family);
  });
}
