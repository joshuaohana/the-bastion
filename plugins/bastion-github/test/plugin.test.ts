import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildPluginApp } from '../src/app';
import { GithubClient } from '../src/github-client';

const config = { name: 'github', port: 8101, owner: 'owner', credentials: { appId: '1', installationId: '2', privateKey: 'k' } };

describe('github plugin', () => {
  let app: ReturnType<typeof buildPluginApp>;
  const client = {
    createRepo: vi.fn(async () => ({ url: 'https://x', full_name: 'o/r' })),
    listRepos: vi.fn(async () => ({ repositories: [] }))
  } as unknown as GithubClient;

  beforeEach(() => {
    app = buildPluginApp(config, client);
  });

  it('manifest + health', async () => {
    const manifest = await request(app).get('/manifest');
    expect(manifest.status).toBe(200);
    expect(manifest.body.actions.create_repo).toBeTruthy();
    const health = await request(app).get('/health');
    expect(health.body.status).toBe('ok');
  });

  it('validate + preview', async () => {
    const bad = await request(app).post('/validate').send({ action: 'create_repo', params: { name: 'bad repo' } });
    expect(bad.body.valid).toBe(false);
    const ok = await request(app).post('/validate').send({ action: 'create_repo', params: { name: 'repo' } });
    expect(ok.body.valid).toBe(true);
    const preview = await request(app).get('/actions/create_repo/preview').query({ name: 'repo', private: true });
    expect(preview.body.summary).toContain('Create private repository');
  });

  it('execute', async () => {
    const execCreate = await request(app).post('/execute').send({ action: 'create_repo', params: { name: 'repo' } });
    expect(execCreate.body.success).toBe(true);
    const execList = await request(app).post('/execute').send({ action: 'list_repos', params: {} });
    expect(execList.body.success).toBe(true);
  });
});
