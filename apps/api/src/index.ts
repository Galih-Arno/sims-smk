import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.ts";
import { config } from "./config.ts";
import { lanFrontendUrls } from "./lib/lan.ts";
import { warmPasswordHasher } from "./lib/password.ts";

const prisma = new PrismaClient();
const app = await buildApp({ prisma });

await warmPasswordHasher();

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ port: config.apiPort, host: "0.0.0.0" });
app.log.info(`API SIMS berjalan di http://127.0.0.1:${config.apiPort}`);
for (const url of lanFrontendUrls()) {
  app.log.info(`Frontend LAN ${url}`);
}
