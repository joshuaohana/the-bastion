import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp, startExpirationLoop } from '../src/app';
import { BastionDb } from '../src/db';
import { PluginRegistry } from '../src/plugin-registry';

function mkConfig() {
  return {
    host: '127.0.0.1',
    port: 8100,
    dbPath: ':memory:',
    password: 'secret',
    agentApiKey: 'agent-key',
    pluginUrls: { github: 'http://plugin' },
    defaultTtl: 2
  };
}

describe('bastion core', () => {
  let db: BastionDb;
  let registry: PluginRegistry;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    db = new BastionDb(':memory:');
    registry = new PluginRegistry({ github: 'http://plugin' });
    registry.manifests.set('github', { name: 'github', version: '0.1', actions: { create_repo: { description: '', risk: 'write', params_schema: {} } } });
    app = buildApp(mkConfig(), db, registry);

    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith('/validate')) return new Response(JSON.stringify({ valid: true }));
      if (input.includes('/preview')) return new Response(JSON.stringify({ summary: 'preview' }));
      if (input.endsWith('/execute') && init?.body) return new Response(JSON.stringify({ success: true, result: { ok: true } }));
      throw new Error(`Unhandled fetch: ${input}`);
    }) as unknown as typeof fetch);
  });

  function adminAuth() {
    return 'Bearer secret';
  }

  it('admin endpoints require bearer password', async () => {
    const pending = await request(app).get('/api/requests/pending');
    expect(pending.status).toBe(401);

    const wrong = await request(app).get('/api/requests/pending').set('Authorization', 'Bearer wrong');
    expect(wrong.status).toBe(401);

    const ok = await request(app).get('/api/requests/pending').set('Authorization', adminAuth());
    expect(ok.status).toBe(200);
  });

  it('agent endpoints without api key return 401', async () => {
    const submit = await request(app).post('/request').send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    expect(submit.status).toBe(401);

    const withKey = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    expect(withKey.status).toBe(200);

    const id = withKey.body.request_id;
    const getMissingKey = await request(app).get(`/request/${id}`);
    expect(getMissingKey.status).toBe(401);
  });

  it('request lifecycle submit approve confirm execute', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    expect(submit.status).toBe(200);
    const id = submit.body.request_id;

    const approve = await request(app).post(`/api/requests/${id}/approve`).set('Authorization', adminAuth());
    expect(approve.status).toBe(200);
    const otp = approve.body.otp;

    const confirm = await request(app)
      .post(`/request/${id}/confirm`)
      .set('Authorization', 'Bearer agent-key')
      .send({ otp });
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('completed');
  });

  it('otp wrong then max attempts', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;
    await request(app).post(`/api/requests/${id}/approve`).set('Authorization', adminAuth());

    for (let i = 0; i < 3; i += 1) {
      const wrong = await request(app)
        .post(`/request/${id}/confirm`)
        .set('Authorization', 'Bearer agent-key')
        .send({ otp: 'BAD111' });
      expect(wrong.status).toBe(401);
    }
    const blocked = await request(app)
      .post(`/request/${id}/confirm`)
      .set('Authorization', 'Bearer agent-key')
      .send({ otp: 'BAD111' });
    expect(blocked.status).toBe(403);
  });

  it('reject flow transitions to rejected', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;

    const reject = await request(app)
      .post(`/api/requests/${id}/reject`)
      .set('Authorization', adminAuth())
      .send({ reason: 'nope' });

    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('rejected');
    expect(db.getRequest(id)?.status).toBe('REJECTED');
  });

  it('expired otp on confirm returns 410', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;

    const approve = await request(app).post(`/api/requests/${id}/approve`).set('Authorization', adminAuth());
    const otp = approve.body.otp;

    db.updateFields(id, { decided_at: Date.now() - 10_000, ttl_seconds: 1 });

    const confirm = await request(app)
      .post(`/request/${id}/confirm`)
      .set('Authorization', 'Bearer agent-key')
      .send({ otp });
    expect(confirm.status).toBe(410);
  });

  it('get request strips otp_hash', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;

    await request(app).post(`/api/requests/${id}/approve`).set('Authorization', adminAuth());

    const detail = await request(app)
      .get(`/request/${id}`)
      .set('Authorization', 'Bearer agent-key');

    expect(detail.status).toBe(200);
    expect(detail.body.otp_hash).toBeUndefined();
  });

  it('admin can fetch request details', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;

    const detail = await request(app)
      .get(`/api/requests/${id}`)
      .set('Authorization', adminAuth());

    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(id);
    expect(detail.body.otp_hash).toBeUndefined();
  });

  it('ttl expiration loop expires pending request', async () => {
    const submit = await request(app)
      .post('/request')
      .set('Authorization', 'Bearer agent-key')
      .send({ plugin: 'github', action: 'create_repo', params: { name: 'repo' } });
    const id = submit.body.request_id;
    db.updateFields(id, { created_at: Date.now() - 10_000, ttl_seconds: 1 });
    const timer = startExpirationLoop(db);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    clearInterval(timer);
    const req = db.getRequest(id);
    expect(req?.status).toBe('EXPIRED');
  });
});
