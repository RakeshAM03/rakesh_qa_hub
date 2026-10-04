import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

import ipaddr from "ipaddr.js";

/**
 * SSRF protection for the API Playground's outbound requests.
 * Allow-list approach: only plain public unicast addresses may be contacted.
 * Blocks loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16,
 * incl. cloud metadata), CGNAT, multicast, broadcast, reserved/documentation
 * ranges, and their IPv6 equivalents (::1, fc00::/7, fe80::/10, IPv4-mapped,
 * 6to4, Teredo, NAT64).
 */
export function isBlockedAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address.replace(/^\[|\]$/g, "").split("%")[0]);
  } catch {
    return true;
  }
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return isBlockedAddress(v6.toIPv4Address().toString());
  }
  return parsed.range() !== "unicast";
}

const BLOCKED_NAMES = [/^localhost$/, /\.localhost$/, /\.local$/, /\.internal$/, /\.home\.arpa$/, /^metadata(\.google)?(\.internal)?$/];

export class BlockedError extends Error {}

/** Checks a URL before sending: http(s) only, no credentials, no internal hostnames or IP literals. */
export function validateTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedError("Enter a valid absolute URL, e.g. https://api.example.com/users");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedError("Only http and https URLs are allowed.");
  if (url.username || url.password) throw new BlockedError("Put credentials in the Auth tab, not in the URL.");
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!host) throw new BlockedError("The URL has no host.");
  if (BLOCKED_NAMES.some((re) => re.test(host))) throw new BlockedError("Requests to local or internal hosts are blocked.");
  const literal = host.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(literal) && isBlockedAddress(literal)) {
    throw new BlockedError("Requests to private, loopback or internal addresses are blocked.");
  }
  return url;
}

type Resolver = (hostname: string, cb: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

const systemResolver: Resolver = (hostname, cb) => dnsLookup(hostname, { all: true, verbatim: true }, cb);

/**
 * A socket `lookup` that resolves the host and refuses if ANY returned address
 * is blocked. Because the socket connects to the address checked here, a DNS
 * answer can't change between the check and the connection (no rebinding gap).
 */
export function guardedLookup(isBlocked: (address: string) => boolean = isBlockedAddress, resolve: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, (err, addresses) => {
      if (err) return callback(err, "", 4);
      if (!addresses.length) return callback(Object.assign(new Error(`Couldn't resolve ${hostname}`), { code: "ENOTFOUND" }), "", 4);
      const bad = addresses.find((a) => isBlocked(a.address));
      if (bad) return callback(new BlockedError("This host resolves to a private, loopback or internal address — blocked."), "", 4);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}
