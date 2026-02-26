import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { BastionConfig, BastionRequest } from './types';
import { BastionDb } from './db';
import { PluginRegistry } from './plugin-registry';
import { checkOtp, generateOtp, hashOtp } from './otp';

function now(): number { return Date.now(); }
function log(msg: string): void { console.log(`[${new Date().toISOString()}] ${msg}`); }

function sanitizeRequest(request: BastionRequest): Omit<BastionRequest, 'otp_hash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { otp_hash, ...safe } = request;
  return safe;
}

import bcrypt from 'bcryptjs';

function getBearerToken(req: express.Request): string | null {
  const auth = req.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export function buildApp(config: BastionConfig, db: BastionDb, registry: PluginRegistry): express.Express {
  const app = express();
  app.use(express.json());

  const requireAdminPassword: express.RequestHandler = async (req, res, next) => {
    const token = getBearerToken(req);
    if (!token || !await bcrypt.compare(token, config.passwordHash)) return res.status(401).json({ error: 'unauthorized' });
    return next();
  };

  const requireAgentApiKey: express.RequestHandler = (req, res, next) => {
    const token = getBearerToken(req);
    if (!token || token !== config.agentApiKey) return res.status(401).json({ error: 'unauthorized' });
    return next();
  };

  app.post('/request', requireAgentApiKey, async (req, res) => {
    const { plugin, action, params } = req.body as { plugin?: string; action?: string; params?: unknown };
    if (!plugin || !action || params === undefined) return res.status(400).json({ error: 'plugin/action/params required' });
    if (!registry.hasAction(plugin, action)) return res.status(400).json({ error: 'unknown plugin action' });

    const base = registry.getUrl(plugin);
    if (!base) return res.status(400).json({ error: 'plugin not configured' });

    const validation = await fetch(`${base}/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
    const validationJson = await validation.json() as { valid: boolean; errors?: string[] };
    if (!validationJson.valid) return res.status(400).json({ error: validationJson.errors ?? ['invalid params'] });

    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) query.set(k, String(v));
    const previewRes = await fetch(`${base}/actions/${action}/preview?${query.toString()}`);
    if (!previewRes.ok) return res.status(400).json({ error: 'preview required and failed' });
    const preview = await previewRes.json() as { summary: string; details?: string };

    const id = uuidv4();
    db.createRequest({
      id, plugin, action,
      params: JSON.stringify(params),
      preview: preview.details ? `${preview.summary}\n${preview.details}` : preview.summary,
      status: 'PENDING', otp_hash: null, otp_attempts: 0, created_at: now(), decided_at: null, confirmed_at: null, executed_at: null, result: null, error: null,
      ttl_seconds: config.defaultTtl
    });
    db.audit(id, 'REQUEST_CREATED', { plugin, action });
    log(`request ${id} created`);
    return res.json({ request_id: id, status: 'pending' });
  });

  app.post('/api/requests/:id/approve', requireAdminPassword, async (req, res) => {
    const request = db.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: 'not found' });
    if (request.status !== 'PENDING') return res.status(409).json({ error: 'invalid state' });
    const otp = generateOtp();
    if (!db.updateStatus(request.id, 'PENDING', 'APPROVED')) return res.status(409).json({ error: 'invalid state' });
    db.updateFields(request.id, { otp_hash: await hashOtp(otp), otp_attempts: 0, decided_at: now() });
    db.audit(request.id, 'REQUEST_APPROVED', { by: 'human' });
    return res.json({ otp });
  });

  app.post('/api/requests/:id/reject', requireAdminPassword, (req, res) => {
    const request = db.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: 'not found' });
    if (!db.updateStatus(request.id, 'PENDING', 'REJECTED')) return res.status(409).json({ error: 'invalid state' });
    db.updateFields(request.id, { decided_at: now() });
    db.audit(request.id, 'REQUEST_REJECTED', { reason: (req.body as { reason?: string }).reason ?? '' });
    return res.json({ status: 'rejected' });
  });

  app.post('/request/:id/confirm', requireAgentApiKey, async (req, res) => {
    const { otp } = req.body as { otp?: string };
    if (!otp) return res.status(400).json({ error: 'otp required' });
    const request = db.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: 'not found' });
    if (request.status !== 'APPROVED' || !request.otp_hash || !request.decided_at) return res.status(409).json({ error: 'invalid state' });
    if (request.otp_attempts >= 3) return res.status(403).json({ error: 'max attempts exceeded' });
    if (now() > request.decided_at + (request.ttl_seconds * 1000)) {
      db.updateStatus(request.id, 'APPROVED', 'EXPIRED');
      db.audit(request.id, 'REQUEST_EXPIRED', {});
      return res.status(410).json({ error: 'expired' });
    }

    const isValid = await checkOtp(otp, request.otp_hash);
    if (!isValid) {
      db.updateFields(request.id, { otp_attempts: request.otp_attempts + 1 });
      db.audit(request.id, 'OTP_FAILED', { attempts: request.otp_attempts + 1 });
      return res.status(401).json({ error: 'invalid otp' });
    }

    if (!db.updateStatus(request.id, 'APPROVED', 'CONFIRMED')) return res.status(409).json({ error: 'invalid state' });
    db.updateFields(request.id, { confirmed_at: now(), otp_hash: null });
    db.audit(request.id, 'REQUEST_CONFIRMED', {});
    if (!db.updateStatus(request.id, 'CONFIRMED', 'EXECUTING')) return res.status(409).json({ error: 'invalid state' });

    const base = registry.getUrl(request.plugin)!;
    try {
      const executeRes = await fetch(`${base}/execute`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: request.action, params: JSON.parse(request.params) })
      });
      const executeJson = await executeRes.json() as { success: boolean; result?: unknown; error?: string };

      if (executeJson.success) {
        if (!db.updateStatus(request.id, 'EXECUTING', 'COMPLETED')) return res.status(409).json({ error: 'invalid state' });
        db.updateFields(request.id, { result: JSON.stringify(executeJson.result), executed_at: now() });
        db.audit(request.id, 'REQUEST_COMPLETED', executeJson.result ?? {});
        return res.json({ status: 'completed', result: executeJson.result });
      }

      if (!db.updateStatus(request.id, 'EXECUTING', 'ERROR')) return res.status(409).json({ error: 'invalid state' });
      db.updateFields(request.id, { error: executeJson.error ?? 'execution failed', executed_at: now() });
      db.audit(request.id, 'REQUEST_ERROR', { error: executeJson.error ?? 'execution failed' });
      return res.status(500).json({ status: 'error', error: executeJson.error ?? 'execution failed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'execution failed';
      db.updateStatus(request.id, 'EXECUTING', 'ERROR');
      db.updateFields(request.id, { error: message, executed_at: now() });
      db.audit(request.id, 'REQUEST_ERROR', { error: message });
      return res.status(500).json({ status: 'error', error: message });
    }
  });

  app.get('/request/:id', requireAgentApiKey, (req, res) => {
    const request = db.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: 'not found' });
    return res.json(sanitizeRequest(request));
  });

  app.get('/api/requests/pending', requireAdminPassword, (_req, res) => res.json(db.pending().map(sanitizeRequest)));

  app.get('/api/requests/:id', requireAdminPassword, (req, res) => {
    const request = db.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: 'not found' });
    return res.json(sanitizeRequest(request));
  });

  app.get('/api/audit', requireAdminPassword, (req, res) => {
    const q = String(req.query.q ?? '');
    res.json(db.searchAudit(q));
  });

  return app;
}

export function startExpirationLoop(db: BastionDb): NodeJS.Timeout {
  return setInterval(() => {
    const allPending = db.pending();
    const current = now();
    for (const req of allPending) {
      if (current > req.created_at + req.ttl_seconds * 1000) {
        if (db.updateStatus(req.id, 'PENDING', 'EXPIRED')) {
          db.audit(req.id, 'REQUEST_EXPIRED', { from: 'PENDING' });
          continue;
        }
        if (db.updateStatus(req.id, 'APPROVED', 'EXPIRED')) {
          db.audit(req.id, 'REQUEST_EXPIRED', { from: 'APPROVED' });
        }
      }
    }
  }, 1000);
}
