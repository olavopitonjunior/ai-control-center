import { loadConfig, isLoopback } from "./config";
import { buildServer } from "./server";
import { advertise, unadvertise } from "./mdns";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildServer(config);

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const exposure = isLoopback(config.host)
    ? "loopback only (not reachable from the LAN)"
    : "LAN-exposed (bearer token required)";
  const scheme = config.tls ? "https" : "http";
  app.log.info(
    {
      host: config.host,
      port: config.port,
      scheme,
      machineId: config.machineId,
    },
    `AI Monitor Agent listening on ${scheme} — ${exposure}`,
  );

  // Advertise on mDNS so Surfaces can discover this agent — only when LAN-exposed.
  if (!isLoopback(config.host)) {
    advertise(config, scheme);
    app.log.info("advertising on mDNS as _ai-control._tcp");
  }

  const shutdown = async () => {
    await unadvertise();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
