import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedWebOrigin, isPrivateIpv4 } from "../src/lib/lan.ts";

const dev = { webOrigin: "http://localhost:5173", nodeEnv: "development" };

test("origin LAN privat diizinkan hanya pada port frontend", () => {
  assert.equal(isPrivateIpv4("192.168.0.104"), true);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(isPrivateIpv4("169.254.1.1"), false);
  assert.equal(isAllowedWebOrigin("http://localhost:5173", dev), true);
  assert.equal(isAllowedWebOrigin("http://127.0.0.1:5173", dev), true);
  assert.equal(isAllowedWebOrigin("http://192.168.0.104:5173", dev), true);
  assert.equal(isAllowedWebOrigin("http://10.0.0.8:5173", dev), true);
  assert.equal(isAllowedWebOrigin("http://192.168.0.104:3001", dev), false);
  assert.equal(isAllowedWebOrigin("https://192.168.0.104:5173", dev), false);
  assert.equal(isAllowedWebOrigin("http://8.8.8.8:5173", dev), false);
  assert.equal(isAllowedWebOrigin("http://evil.example:5173", dev), false);
});

test("di luar development hanya origin yang dikonfigurasi", () => {
  const locked = { webOrigin: "http://localhost:5173", nodeEnv: "production" };
  assert.equal(isAllowedWebOrigin("http://localhost:5173", locked), true);
  assert.equal(isAllowedWebOrigin("http://192.168.0.104:5173", locked), false);
});
