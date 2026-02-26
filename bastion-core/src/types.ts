export type RequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CONFIRMED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'ERROR';

export interface BastionConfig {
  host: string;
  port: number;
  dbPath: string;
  password: string;
  agentApiKey: string;
  pluginUrls: Record<string, string>;
  defaultTtl: number;
}

export interface BastionRequest {
  id: string;
  plugin: string;
  action: string;
  params: string;
  preview: string;
  status: RequestStatus;
  otp_hash: string | null;
  otp_attempts: number;
  created_at: number;
  decided_at: number | null;
  confirmed_at: number | null;
  executed_at: number | null;
  result: string | null;
  error: string | null;
  ttl_seconds: number;
}

export interface PluginManifest {
  name: string;
  version: string;
  actions: Record<string, { description: string; risk: 'read' | 'write' | 'destructive'; params_schema: unknown }>;
}
