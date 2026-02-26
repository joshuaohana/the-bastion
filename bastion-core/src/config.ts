import fs from 'node:fs';
import path from 'node:path';
import { BastionConfig } from './types';

export function loadConfig(configPath = 'bastion.json'): BastionConfig {
  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as Partial<BastionConfig>;
  if (!parsed.host || !parsed.port || !parsed.dbPath || !parsed.password || !parsed.agentApiKey || !parsed.pluginUrls) {
    throw new Error('Invalid bastion config');
  }

  return {
    host: parsed.host,
    port: parsed.port,
    dbPath: parsed.dbPath,
    password: parsed.password,
    agentApiKey: parsed.agentApiKey,
    pluginUrls: parsed.pluginUrls,
    defaultTtl: parsed.defaultTtl ?? 300
  };
}
