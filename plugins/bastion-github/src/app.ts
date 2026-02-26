import express from 'express';
import { GithubClient } from './github-client';
import { PluginConfig } from './types';

export function buildPluginApp(config: PluginConfig, client: GithubClient): express.Express {
  const app = express();
  app.use(express.json());

  const manifest = {
    name: config.name,
    version: '0.1.0',
    description: 'GitHub operations via GitHub App',
    actions: {
      create_repo: {
        description: 'Create repository',
        risk: 'write',
        params_schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            private: { type: 'boolean', default: true },
            description: { type: 'string' },
            org: { type: 'string' }
          },
          required: ['name']
        }
      },
      list_repos: {
        description: 'List repositories',
        risk: 'read',
        params_schema: {
          type: 'object',
          properties: { org: { type: 'string' } }
        }
      }
    }
  };

  app.get('/manifest', (_req, res) => res.json(manifest));

  app.post('/validate', (req, res) => {
    const { action, params } = req.body as { action?: string; params?: Record<string, unknown> };
    if (action === 'create_repo') {
      const name = params?.name;
      if (typeof name !== 'string' || !name.trim() || /\s/.test(name)) return res.json({ valid: false, errors: ['name is required and cannot contain spaces'] });
      return res.json({ valid: true });
    }
    if (action === 'list_repos') return res.json({ valid: true });
    return res.json({ valid: false, errors: ['unknown action'] });
  });

  app.get('/actions/:action/preview', (req, res) => {
    const action = req.params.action;
    if (action === 'create_repo') {
      const name = String(req.query.name ?? '');
      const isPrivate = String(req.query.private ?? 'true') !== 'false';
      const owner = String(req.query.org ?? config.owner);
      return res.json({ summary: `Create ${isPrivate ? 'private' : 'public'} repository '${name}' under ${owner}`, details: `Will create ${owner}/${name} on GitHub.` });
    }
    if (action === 'list_repos') {
      const owner = String(req.query.org ?? config.owner);
      return res.json({ summary: `List repositories for ${owner}`, details: `Fetches repository metadata visible to installation.` });
    }
    return res.status(404).json({ error: 'unknown action' });
  });

  app.post('/execute', async (req, res) => {
    const { action, params } = req.body as { action?: string; params?: { name?: string; private?: boolean; description?: string; org?: string } };
    try {
      if (action === 'create_repo' && params?.name) return res.json({ success: true, result: await client.createRepo(params as { name: string; private?: boolean; description?: string; org?: string }) });
      if (action === 'list_repos') return res.json({ success: true, result: await client.listRepos(params ?? {}) });
      return res.json({ success: false, error: 'unknown action' });
    } catch (error) {
      return res.json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', name: config.name, version: '0.1.0' }));
  return app;
}
