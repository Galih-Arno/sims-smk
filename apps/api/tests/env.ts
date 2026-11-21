import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(apiRoot, ".env") });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl?.includes("sims_smk_test")) {
  throw new Error("TEST_DATABASE_URL wajib mengarah ke database sims_smk_test.");
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
