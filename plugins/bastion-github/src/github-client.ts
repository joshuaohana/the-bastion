import jwt from 'jsonwebtoken';
import { PluginConfig } from './types';

export class GithubClient {
  private tokenCache: { token: string; expiresAt: number } | null = null;
  constructor(private config: PluginConfig) {}

  private appJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({ iat: now - 60, exp: now + 540, iss: this.config.credentials.appId }, this.config.credentials.privateKey, { algorithm: 'RS256' });
  }

  async installationToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 5000) return this.tokenCache.token;
    const res = await fetch(`https://api.github.com/app/installations/${this.config.credentials.installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.appJwt()}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28'
      }
    });
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
    const body = await res.json() as { token: string; expires_at: string };
    this.tokenCache = { token: body.token, expiresAt: new Date(body.expires_at).getTime() };
    return body.token;
  }

  async createRepo(params: { name: string; private?: boolean; description?: string; org?: string }): Promise<unknown> {
    const token = await this.installationToken();
    const endpoint = params.org ? `https://api.github.com/orgs/${params.org}/repos` : 'https://api.github.com/user/repos';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `token ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({ name: params.name, private: params.private ?? true, description: params.description })
    });
    const body = await res.json() as { html_url?: string; full_name?: string; id?: number; message?: string };
    if (!res.ok) throw new Error(body.message ?? 'create repo failed');
    return { url: body.html_url, full_name: body.full_name, id: body.id };
  }

  async listRepos(params: { org?: string }): Promise<unknown> {
    const token = await this.installationToken();
    const endpoint = params.org ? `https://api.github.com/orgs/${params.org}/repos` : 'https://api.github.com/installation/repositories';
    const res = await fetch(endpoint, {
      headers: {
        authorization: `token ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28'
      }
    });
    const body = await res.json() as unknown;
    if (!res.ok) throw new Error('list repos failed');
    return body;
  }
}
