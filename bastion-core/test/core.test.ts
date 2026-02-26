import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { buildApp, startExpirationLoop } from '../src/app';
import { BastionDb } from '../src/db';
import { PluginRegistry } from '../src/plugin-registry';

function mkConfig(passwordHash: string) {
  return { host: '127.0.0.1', port: 8100, dbPath: ':memory:', passwordHash, pluginUrls: { github: 'http://plugin' }, defaultTtl: 2 };
}

describe('bastion core', () => {
  let db: BastionDb;
  let registry: PluginRegistry;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    db = new BastionDb(':memory:');
    registry = new PluginRegistry({ github: 'http://plugin' });
    registry.manifests.set('github', { name: 'github', version: '0.1', actions: { create_repo: { description: '', risk: 'write', params_schema: {} } } });
    const passwordHash = await bcrypt.hash('secret', 4);
    app = buildApp(mkConfig(passwordHash), db, registry);

    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith('/validate')) return new Response(JSON.stringify({ valid: true }));
      if (input.includes('/preview')) return new Response(JSON.stringify({ summary: 'preview' }));
      if (input.endsWith('/execute') && init?.body) return new Response(JSON.stringify({ success: true, result: { ok: true } }));
      throw new Error(`Unhandled fetch: ${input}`);
    }) as unknown as typeof fetch);
  });

  it('request lifecycle submit approve confirm execute', async () => {
    const submit = await request(app).post('/request').send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    expect(submit.status).toBe(200);
    const id = submit.body.request_id;

    const approve = await request(app).post(`/api/request/${id}/approve`).set('Cookie', 'bastion_session=ok');
    expect(approve.status).toBe(200);
    const otp = approve.body.otp;

    const confirm = await request(app).post(`/request/${id}/confirm`).send({ otp });
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('completed');
  });

  it('otp wrong then max attempts', async () => {
    const submit = await request(app).post('/request').send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;
    await request(app).post(`/api/request/${id}/approve`).set('Cookie', 'bastion_session=ok');

    for (let i = 0; i < 3; i += 1) {
      const wrong = await request(app).post(`/request/${id}/confirm`).send({ otp: 'BAD111' });
      expect(wrong.status).toBe(401);
    }
    const blocked = await request(app).post(`/request/${id}/confirm`).send({ otp: 'BAD111' });
    expect(blocked.status).toBe(403);
  });

  it('ttl expiration loop expires pending request', async () => {
    const submit = await request(app).post('/request').send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;
    db.updateFields(id, { created_at: Date.now() - 10_000, ttl_seconds: 1 });
    const timer = startExpirationLoop(db);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    clearInterval(timer);
    const req = db.getRequest(id);
    expect(req?.status).toBe('EXPIRED');
  });
});
