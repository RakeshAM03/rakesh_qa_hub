import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanHeaders, MAX_RESPONSE_BYTES, sendOutbound } from "./send";
import { guardedLookup, isBlockedAddress, validateTarget } from "./ssrf";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "127.10.20.30",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.2.10",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "2002:7f00:1::1", // 6to4 of 127.0.0.1
    "64:ff9b::a9fe:a9fe", // NAT64
    "2001::1", // Teredo
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe("validateTarget", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateTarget("https://api.example.com/users?x=1").hostname).toBe("api.example.com");
    expect(validateTarget("http://8.8.8.8:8080/").port).toBe("8080");
  });
  it.each([
    ["ftp://example.com/", /Only http and https/],
    ["file:///etc/passwd", /Only http and https/],
    ["javascript:alert(1)", /Only http and https/],
    ["not a url", /valid absolute URL/],
    ["http://user:pw@example.com/", /credentials/],
    ["http://localhost:3000/", /local or internal/],
    ["http://LOCALHOST./", /local or internal/],
    ["http://app.localhost/", /local or internal/],
    ["http://printer.local/", /local or internal/],
    ["http://metadata.google.internal/computeMetadata/v1/", /local or internal/],
    ["http://127.0.0.1/", /private, loopback or internal/],
    ["http://2130706433/", /private, loopback or internal/], // decimal 127.0.0.1
    ["http://0177.0.0.1/", /private, loopback or internal/], // octal
    ["http://0x7f.1/", /private, loopback or internal/], // hex
    ["http://169.254.169.254/latest/meta-data/", /private, loopback or internal/],
    ["http://[::1]:8080/", /private, loopback or internal/],
    ["http://[::ffff:7f00:1]/", /private, loopback or internal/],
    ["http://[fd00::1]/", /private, loopback or internal/],
    ["http://10.1.2.3/", /private, loopback or internal/],
  ])("rejects %s", (url, msg) => expect(() => validateTarget(url)).toThrow(msg));
});

describe("guardedLookup", () => {
  const fake = (map: Record<string, string[]>) => (host: string, cb: (e: NodeJS.ErrnoException | null, a: { address: string; family: number }[]) => void) =>
    cb(null, (map[host] ?? []).map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));

  const run = (lookup: ReturnType<typeof guardedLookup>, host: string) =>
    new Promise<{ err: Error | null; address: string }>((resolve) => lookup(host, {}, (err, address) => resolve({ err, address: address as string })));

  it("refuses hosts that resolve to blocked addresses (DNS rebinding / internal names)", async () => {
    const lookup = guardedLookup(undefined, fake({ "rebind.example": ["127.0.0.1"], "mixed.example": ["93.184.216.34", "10.0.0.5"], "meta.example": ["169.254.169.254"] }));
    for (const host of ["rebind.example", "mixed.example", "meta.example"]) {
      const { err } = await run(lookup, host);
      expect(err?.message).toMatch(/private, loopback or internal address — blocked/);
    }
  });

  it("returns the checked public address for the socket to connect to", async () => {
    const lookup = guardedLookup(undefined, fake({ "api.example": ["93.184.216.34"] }));
    expect(await run(lookup, "api.example")).toEqual({ err: null, address: "93.184.216.34" });
  });
});

describe("sendOutbound", () => {
  // A local server stands in for a public API. The test policy allows 127.0.0.1 only via
  // the fake public hostname, so the real block list still applies everywhere else.
  let server: http.Server;
  let port = 0;
  const allowLoopback = (a: string) => a !== "127.0.0.1" && isBlockedAddress(a);
  const resolver = (host: string, cb: (e: NodeJS.ErrnoException | null, a: { address: string; family: number }[]) => void) =>
    cb(null, host === "public.test" ? [{ address: "127.0.0.1", family: 4 }] : host === "evil.test" ? [{ address: "10.0.0.5", family: 4 }] : []);
  const deps = () => ({ isBlocked: allowLoopback, lookup: guardedLookup(allowLoopback, resolver) });
  const base = () => `http://public.test:${port}`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      if (u.pathname === "/json") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, cookie: req.headers.cookie ?? null, host: req.headers.host, auth: req.headers.authorization ?? null }));
      } else if (u.pathname === "/to-metadata") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      } else if (u.pathname === "/to-evil") {
        res.writeHead(301, { location: "http://evil.test/" }).end();
      } else if (u.pathname === "/to-json") {
        res.writeHead(302, { location: "/json" }).end();
      } else if (u.pathname === "/loop") {
        res.writeHead(302, { location: "/loop" }).end();
      } else if (u.pathname === "/big") {
        res.end(Buffer.alloc(MAX_RESPONSE_BYTES + 1000, 97));
      } else if (u.pathname === "/gzip-bomb") {
        res.setHeader("content-encoding", "gzip");
        res.end(zlib.gzipSync(Buffer.alloc(MAX_RESPONSE_BYTES * 3, 0)));
      } else if (u.pathname === "/slow") {
        setTimeout(() => res.end("late"), 2000);
      } else if (u.pathname === "/echo") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => res.end(JSON.stringify({ method: req.method, body, contentType: req.headers["content-type"] })));
      } else res.writeHead(404).end("nope");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("sends a request and returns status, headers, body, time and size", async () => {
    const r = await sendOutbound({ method: "GET", url: `${base()}/json`, headers: [{ key: "Accept", value: "application/json" }] }, deps());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ ok: true, cookie: null });
    expect(r.headers).toContainEqual(["content-type", "application/json"]);
    expect(r.sizeBytes).toBe(Buffer.byteLength(r.body));
    expect(r.timeMs).toBeGreaterThanOrEqual(0);
  });

  it("sends bodies for POST", async () => {
    const r = await sendOutbound({ method: "POST", url: `${base()}/echo`, headers: [{ key: "Content-Type", value: "application/json" }], body: '{"a":1}' }, deps());
    expect(JSON.parse(r.body)).toEqual({ method: "POST", body: '{"a":1}', contentType: "application/json" });
  });

  it("re-checks every redirect hop: blocks redirects to metadata IPs and to hosts resolving internally", async () => {
    await expect(sendOutbound({ method: "GET", url: `${base()}/to-metadata`, headers: [] }, deps())).rejects.toThrow(/Redirect blocked: Requests to private/);
    await expect(sendOutbound({ method: "GET", url: `${base()}/to-evil`, headers: [] }, deps())).rejects.toThrow(/blocked/);
  });

  it("follows safe redirects and caps them at 5", async () => {
    const r = await sendOutbound({ method: "GET", url: `${base()}/to-json`, headers: [] }, deps());
    expect(r.status).toBe(200);
    expect(r.redirects).toEqual([`${base()}/to-json`]);
    await expect(sendOutbound({ method: "GET", url: `${base()}/loop`, headers: [] }, deps())).rejects.toThrow(/Too many redirects/);
  });

  it("blocks direct private targets with the default policy", async () => {
    await expect(sendOutbound({ method: "GET", url: `http://127.0.0.1:${port}/json`, headers: [] })).rejects.toThrow(/private, loopback or internal/);
    await expect(sendOutbound({ method: "GET", url: `http://localhost:${port}/json`, headers: [] })).rejects.toThrow(/local or internal/);
  });

  it("truncates responses over 2 MB, including decompressed gzip bombs", async () => {
    const big = await sendOutbound({ method: "GET", url: `${base()}/big`, headers: [] }, deps());
    expect(big.truncated).toBe(true);
    expect(big.sizeBytes).toBe(MAX_RESPONSE_BYTES);
    const bomb = await sendOutbound({ method: "GET", url: `${base()}/gzip-bomb`, headers: [] }, deps());
    expect(bomb.truncated).toBe(true);
    expect(bomb.sizeBytes).toBe(MAX_RESPONSE_BYTES);
  });

  it("times out", async () => {
    await expect(sendOutbound({ method: "GET", url: `${base()}/slow`, headers: [] }, { ...deps(), timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });

  it("rejects request bodies over 1 MB", async () => {
    await expect(sendOutbound({ method: "POST", url: `${base()}/echo`, headers: [], body: "x".repeat(1024 * 1024 + 1) }, deps())).rejects.toThrow(/larger than 1 MB/);
  });

  it("strips hop-by-hop headers and only forwards what the user set", () => {
    expect(
      cleanHeaders([
        { key: "Connection", value: "keep-alive" },
        { key: "Host", value: "evil" },
        { key: "Transfer-Encoding", value: "chunked" },
        { key: "Proxy-Authorization", value: "x" },
        { key: "Authorization", value: "Bearer t" },
        { key: "X-Ok", value: "a\r\nInjected: 1" },
        { key: "bad header", value: "x" },
      ]),
    ).toEqual({ Authorization: "Bearer t", "X-Ok": "a  Injected: 1" });
  });
});
