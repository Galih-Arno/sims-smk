import { networkInterfaces } from "node:os";

export const FRONTEND_PORT = 5173;

const VIRTUAL_INTERFACE = /vethernet|wsl|hyper-v|virtualbox|vmware|loopback|bluetooth|teredo|isatap|npcap|tun|tap/i;

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return false;
  const first = nums[0];
  const second = nums[1];
  if (first === undefined || second === undefined) return false;
  if (first === 10) return true;
  if (first === 192 && second === 168) return true;
  return first === 172 && second >= 16 && second <= 31;
}

export function isAllowedWebOrigin(origin: string, options: { webOrigin: string; nodeEnv: string }): boolean {
  if (origin === options.webOrigin) return true;
  if (options.nodeEnv !== "development") return false;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== "http:") return false;
  if (url.port !== String(FRONTEND_PORT)) return false;
  if (url.username || url.password) return false;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  return isPrivateIpv4(url.hostname);
}

export function lanFrontendUrls(port = FRONTEND_PORT): string[] {
  const urls: string[] = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_INTERFACE.test(name)) continue;
    for (const address of addresses ?? []) {
      const ipv4 = address.family === "IPv4";
      if (!ipv4 || address.internal || !isPrivateIpv4(address.address)) continue;
      urls.push(`http://${address.address}:${port}`);
    }
  }
  return [...new Set(urls)];
}
