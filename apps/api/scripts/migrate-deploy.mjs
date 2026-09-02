import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const PRISMA_MIGRATE_LOCK = 72707369;
const RETRIES = 5;
const RETRY_MS = 8_000;

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));
loadEnvFile(join(apiRoot, '../../.env'));

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function withoutNeonPooler(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('-pooler.')) {
      parsed.hostname = parsed.hostname.replace('-pooler.', '.');
    }
    return parsed.toString();
  } catch {
    return url.replace('-pooler.', '.');
  }
}

function localMigrationNames() {
  return readdirSync(join(apiRoot, 'prisma/migrations')).filter(
    (name) => name !== 'migration_lock.toml' && !name.startsWith('.'),
  );
}

function runPrismaMigrate() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['exec', '--', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appliedNames(client) {
  try {
    const result = await client.query(
      `SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL`,
    );
    return new Set(result.rows.map((row) => row.migration_name));
  } catch {
    return null;
  }
}

async function clearStaleMigrateLock(client) {
  const result = await client.query(
    `SELECT l.pid, a.state, left(coalesce(a.query, ''), 120) AS query
     FROM pg_locks l
     JOIN pg_stat_activity a ON a.pid = l.pid
     WHERE l.locktype = 'advisory'
       AND l.granted
       AND l.classid = 0
       AND l.objid = $1
       AND a.pid <> pg_backend_pid()`,
    [PRISMA_MIGRATE_LOCK],
  );

  let killed = 0;
  for (const row of result.rows) {
    const runningDdl =
      row.state === 'active' &&
      /(_prisma_migrations|CREATE INDEX|ALTER TABLE|CREATE TABLE|DROP )/i.test(row.query);
    if (runningDdl) continue;
    await client.query('SELECT pg_terminate_backend($1)', [row.pid]);
    killed += 1;
    console.log(`Released stale Prisma migrate lock held by pid ${row.pid} (${row.state})`);
  }
  return killed;
}

async function withClient(url, work) {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DIRECT_URL or DATABASE_URL is required for migrate');
  }
  const url = withoutNeonPooler(raw);
  process.env.DIRECT_URL = url;
  process.env.DATABASE_URL = withoutNeonPooler(process.env.DATABASE_URL || url);

  const local = localMigrationNames();
  const applied = await withClient(url, appliedNames);
  if (applied && local.every((name) => applied.has(name))) {
    console.log(`No pending Prisma migrations (${local.length} already applied).`);
    return;
  }

  await withClient(url, clearStaleMigrateLock);

  let lastCode = 1;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    lastCode = await runPrismaMigrate();
    if (lastCode === 0) return;
    console.warn(`prisma migrate deploy failed (exit ${lastCode}), attempt ${attempt}/${RETRIES}`);
    if (attempt < RETRIES) {
      await withClient(url, clearStaleMigrateLock);
      await sleep(RETRY_MS);
    }
  }

  process.exit(lastCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
