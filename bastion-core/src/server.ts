import path from 'node:path';
import { loadConfig } from './config';
import { BastionDb } from './db';
import { PluginRegistry } from './plugin-registry';
import { buildApp, startExpirationLoop } from './app';

async function main(): Promise<void> {
  const config = loadConfig(process.env.BASTION_CONFIG ?? 'bastion.json');
  const db = new BastionDb(path.resolve(config.dbPath));
  const registry = new PluginRegistry(config.pluginUrls);
  await registry.load();

  const app = buildApp(config, db, registry);
  startExpirationLoop(db);
  app.listen(config.port, config.host, () => {
    console.log(`[${new Date().toISOString()}] bastion-core listening on http://${config.host}:${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
