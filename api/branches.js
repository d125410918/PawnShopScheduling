const { query, sendJson, readBody, makeBranchCode, ensureBranch, handleError } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await ensureBranch('main', '主店');
      const result = await query('select branch_code, branch_name, created_at from branches order by created_at asc');
      return sendJson(res, 200, { branches: result.rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.branchName || '').trim();
      if (!name) return sendJson(res, 400, { error: '請輸入分店名稱' });
      const code = makeBranchCode();
      await ensureBranch(code, name);
      const result = await query('select branch_code, branch_name, created_at from branches where branch_code = $1', [code]);
      return sendJson(res, 200, { branch: result.rows[0] });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    handleError(res, err);
  }
};
