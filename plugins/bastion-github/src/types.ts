export interface PluginConfig {
  name: string;
  port: number;
  owner: string;
  credentials: {
    appId: string;
    installationId: string;
    privateKey: string;
  };
}

export interface ActionResult { success: boolean; result?: unknown; error?: string }
