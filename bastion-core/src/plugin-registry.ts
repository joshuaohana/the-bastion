import { PluginManifest } from './types';

export class PluginRegistry {
  manifests = new Map<string, PluginManifest>();
  constructor(private urls: Record<string, string>) {}

  async load(): Promise<void> {
    for (const [name, url] of Object.entries(this.urls)) {
      const res = await fetch(`${url}/manifest`);
      if (!res.ok) throw new Error(`Failed to load manifest for ${name}`);
      const manifest = await res.json() as PluginManifest;
      this.manifests.set(name, manifest);
    }
  }

  hasAction(plugin: string, action: string): boolean {
    return Boolean(this.manifests.get(plugin)?.actions[action]);
  }

  getUrl(plugin: string): string | undefined {
    return this.urls[plugin];
  }
}
