import Database from 'better-sqlite3';
import { BastionRequest, RequestStatus } from './types';

export class BastionDb {
  db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        plugin TEXT NOT NULL,
        action TEXT NOT NULL,
        params TEXT NOT NULL,
        preview TEXT NOT NULL,
        status TEXT NOT NULL,
        otp_hash TEXT,
        otp_attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        decided_at INTEGER,
        confirmed_at INTEGER,
        executed_at INTEGER,
        result TEXT,
        error TEXT,
        ttl_seconds INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        event TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        details TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
      CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id);
    `);
  }

  createRequest(req: BastionRequest): void {
    this.db.prepare(`INSERT INTO requests (id, plugin, action, params, preview, status, otp_hash, otp_attempts, created_at, ttl_seconds)
      VALUES (@id, @plugin, @action, @params, @preview, @status, @otp_hash, @otp_attempts, @created_at, @ttl_seconds)`).run(req);
  }

  getRequest(id: string): BastionRequest | undefined {
    return this.db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as BastionRequest | undefined;
  }

  updateStatus(id: string, from: RequestStatus, to: RequestStatus): boolean {
    const res = this.db.prepare('UPDATE requests SET status = ? WHERE id = ? AND status = ?').run(to, id, from);
    return res.changes === 1;
  }

  updateFields(id: string, fields: Record<string, unknown>): void {
    const entries = Object.entries(fields);
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE requests SET ${setClause} WHERE id = ?`).run(...entries.map(([, v]) => v), id);
  }

  pending(): BastionRequest[] {
    return this.db.prepare("SELECT * FROM requests WHERE status IN ('PENDING','APPROVED') ORDER BY created_at ASC").all() as BastionRequest[];
  }

  audit(requestId: string, event: string, details: unknown): void {
    this.db.prepare('INSERT INTO audit_log (request_id, event, timestamp, details) VALUES (?, ?, ?, ?)')
      .run(requestId, event, Date.now(), JSON.stringify(details));
  }

  searchAudit(query: string): Array<{ id: number; request_id: string; event: string; timestamp: number; details: string }> {
    return this.db.prepare('SELECT * FROM audit_log WHERE event LIKE ? OR details LIKE ? ORDER BY timestamp DESC LIMIT 100')
      .all(`%${query}%`, `%${query}%`) as Array<{ id: number; request_id: string; event: string; timestamp: number; details: string }>;
  }
}
