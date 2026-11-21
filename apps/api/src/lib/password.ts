import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const ARGON_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyHash: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

async function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHash;
}

export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  const target = passwordHash ?? (await getDummyHash());
  try {
    return await verify(target, password);
  } catch {
    return false;
  }
}

export async function warmPasswordHasher(): Promise<void> {
  await getDummyHash();
}

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}
