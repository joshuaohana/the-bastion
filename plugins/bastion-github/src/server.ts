import { loadPluginConfig } from './config';
import { GithubClient } from './github-client';
import { buildPluginApp } from './app';

function log(msg: string): void { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main(): Promise<void> {
  const config = loadPluginConfig(process.env.PLUGIN_CONFIG ?? 'plugin.json');
  const client = new GithubClient(config);
  const app = buildPluginApp(config, client);
  app.listen(config.port, () => log(`plugin running on http://127.0.0.1:${config.port}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
