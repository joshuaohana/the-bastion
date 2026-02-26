import fs from 'node:fs';
import path from 'node:path';
import { PluginConfig } from './types';

export function loadPluginConfig(configPath = 'plugin.json'): PluginConfig {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8')) as PluginConfig;
  if (!parsed.credentials?.appId || !parsed.credentials.installationId || !parsed.credentials.privateKey) {
    throw new Error('Invalid plugin config');
  }
  return parsed;
}
