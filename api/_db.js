const { Pool } = require('pg');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result;
}

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function safeBranchCode(value) {
  const code = String(value || 'main').trim();
  return /^[a-zA-Z0-9_-]{1,40}$/.test(code) ? code : 'main';
}

function makeBranchCode() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 5);
}

async function ensureBranch(branchCode, branchName) {
  const code = safeBranchCode(branchCode);
  const name = branchName || (code === 'main' ? '主店' : code);
  await query(
    `insert into branches (branch_code, branch_name)
     values ($1, $2)
     on conflict (branch_code) do nothing`,
    [code, name]
  );
  await query(
    `insert into branch_settings (branch_code, rotation_base_order, rotation_base_monday)
     values ($1, '["A","B","D"]', current_date)
     on conflict (branch_code) do nothing`,
    [code]
  );
  return code;
}

function handleError(res, err) {
  console.error(err);
  sendJson(res, 500, { error: err.message || 'Server error' });
}

module.exports = { query, sendJson, readBody, safeBranchCode, makeBranchCode, ensureBranch, handleError };
