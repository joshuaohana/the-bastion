import fs from 'node:fs';
import path from 'node:path';
import { BastionConfig } from './types';

export function loadConfig(configPath = 'bastion.json'): BastionConfig {
  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as Partial<BastionConfig>;
  if (!parsed.host || !parsed.port || !parsed.dbPath || !parsed.passwordHash || !parsed.agentApiKey || !parsed.pluginUrls) {
    throw new Error('Invalid bastion config — required: host, port, dbPath, passwordHash, agentApiKey, pluginUrls');
  }

  return {
    host: parsed.host,
    port: parsed.port,
    dbPath: parsed.dbPath,
    passwordHash: parsed.passwordHash,
    agentApiKey: parsed.agentApiKey,
    pluginUrls: parsed.pluginUrls,
    defaultTtl: parsed.defaultTtl ?? 300
  };
}
