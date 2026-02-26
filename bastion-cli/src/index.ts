#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import chalk from 'chalk';
import bcrypt from 'bcryptjs';

type RequestItem = {
  id: string;
  plugin: string;
  action: string;
  status: string;
  preview: string;
  created_at: number;
  params: string;
  ttl_seconds: number;
};

type AuditItem = { id: number; request_id: string; event: string; timestamp: number; details: string };

type Config = { url: string; password: string };

function readConfigFile(): Partial<Config> {
  const configPath = path.join(os.homedir(), '.bastion', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<Config>;
}

function loadConfig(): Config {
  const fileConfig = readConfigFile();
  const url = process.env.BASTION_URL ?? fileConfig.url;
  const password = process.env.BASTION_PASSWORD ?? fileConfig.password;
  if (!url || !password) {
    throw new Error('Missing Bastion config. Set BASTION_URL + BASTION_PASSWORD or create ~/.bastion/config.json');
  }
  return { url: url.replace(/\/$/, ''), password };
}

async function api<T>(config: Config, endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.url}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.password}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function printRequestSummary(r: RequestItem): void {
  const created = new Date(r.created_at).toISOString();
  console.log(`${chalk.cyan(r.id)}  ${chalk.yellow(r.plugin + ':' + r.action)}  ${chalk.gray(created)}`);
  console.log(`  ${r.preview.split('\n')[0]}`);
}

function printOtp(otp: string): void {
  const line = '═'.repeat(24);
  console.log(chalk.green(`\n╔${line}╗`));
  console.log(chalk.green(`║       OTP: ${chalk.bold.white(otp)}       ║`));
  console.log(chalk.green(`╚${line}╝\n`));
}

async function main(): Promise<void> {
  const program = new Command();
  program.name('bastion').description('Bastion approval CLI');

  program.command('pending').description('List pending requests with previews').action(async () => {
    const config = loadConfig();
    const requests = await api<RequestItem[]>(config, '/api/requests/pending');
    if (requests.length === 0) {
      console.log(chalk.gray('No pending requests.'));
      return;
    }
    requests.forEach(printRequestSummary);
  });

  program.command('show').argument('<request_id>').description('Show full request detail + preview').action(async (id: string) => {
    const config = loadConfig();
    const req = await api<RequestItem>(config, `/api/requests/${id}`);
    console.log(chalk.cyan(req.id));
    console.log(`${chalk.yellow(req.plugin + ':' + req.action)}  ${chalk.magenta(req.status)}`);
    console.log(chalk.gray(`created: ${new Date(req.created_at).toISOString()}`));
    console.log(chalk.gray(`ttl: ${req.ttl_seconds}s`));
    console.log('\nPreview:\n' + req.preview);
    console.log('\nParams:\n' + JSON.stringify(JSON.parse(req.params), null, 2));
  });

  program.command('approve').argument('<request_id>').description('Approve, prints OTP').action(async (id: string) => {
    const config = loadConfig();
    const result = await api<{ otp: string }>(config, `/api/requests/${id}/approve`, { method: 'POST', body: '{}' });
    console.log(chalk.green(`Approved ${id}`));
    printOtp(result.otp);
  });

  program.command('reject').argument('<request_id>').option('--reason <reason>', 'Optional rejection reason').description('Reject request').action(async (id: string, opts: { reason?: string }) => {
    const config = loadConfig();
    await api<{ status: string }>(config, `/api/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: opts.reason ?? '' })
    });
    console.log(chalk.red(`Rejected ${id}${opts.reason ? ` (${opts.reason})` : ''}`));
  });

  program.command('audit').description('Show recent audit log').action(async () => {
    const config = loadConfig();
    const events = await api<AuditItem[]>(config, '/api/audit');
    for (const event of events) {
      console.log(`${chalk.gray(new Date(event.timestamp).toISOString())} ${chalk.cyan(event.request_id)} ${chalk.yellow(event.event)}`);
      if (event.details && event.details !== '{}') console.log(`  ${event.details}`);
    }
  });

  program.command('hash-password').argument('<password>').description('Hash a password for use in bastion.json').action(async (password: string) => {
    const hash = await bcrypt.hash(password, 10);
    console.log(chalk.gray('Add this to your bastion.json as "passwordHash":'));
    console.log(chalk.green(hash));
  });

  program.command('live').description('Interactive mode — live feed of requests, approve/reject inline').action(async () => {
    const config = loadConfig();
    const seen = new Set<string>();
    const rl = readline.createInterface({ input, output });
    console.log(chalk.green('Watching for pending requests (polling every 2s). Press q + Enter or Ctrl+C to exit.\n'));

    let running = true;
    process.on('SIGINT', () => { running = false; rl.close(); });

    while (running) {
      const pending = await api<RequestItem[]>(config, '/api/requests/pending');
      for (const req of pending) {
        if (seen.has(req.id)) continue;
        seen.add(req.id);
        console.log('\n' + chalk.bold('New request:'));
        printRequestSummary(req);
        console.log(req.preview.includes('\n') ? req.preview.split('\n').slice(1).join('\n') : '');
        const answer = (await rl.question(chalk.bold('Action [a]pprove / [r]eject / [s]kip / [q]uit: '))).trim().toLowerCase();
        if (answer === 'q' || answer === 'quit') { running = false; break; }
        if (answer === 'a' || answer === 'approve') {
          const result = await api<{ otp: string }>(config, `/api/requests/${req.id}/approve`, { method: 'POST', body: '{}' });
          console.log(chalk.green(`Approved ${req.id}`));
          printOtp(result.otp);
        } else if (answer === 'r' || answer === 'reject') {
          const reason = await rl.question('Reason (optional): ');
          await api(config, `/api/requests/${req.id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason })
          });
          console.log(chalk.red(`Rejected ${req.id}`));
        } else {
          console.log(chalk.gray(`Skipped ${req.id}`));
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    rl.close();
    console.log(chalk.gray('\nStopped watching.'));
  });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Error: ${message}`));
  process.exit(1);
});
