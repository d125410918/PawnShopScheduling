const { query, sendJson, readBody, safeBranchCode, ensureBranch, handleError } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const branch = safeBranchCode(req.query.branch || 'main');
    await ensureBranch(branch);

    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const groupId = String(body.groupId || 'A').trim();
      if (!name) return sendJson(res, 400, { error: '請輸入人員姓名' });
      if (!['A', 'B', 'D'].includes(groupId)) return sendJson(res, 400, { error: '組別錯誤' });
      const orderResult = await query('select coalesce(max(join_order), 0) + 1 as next_order from people where branch_code = $1', [branch]);
      const result = await query(
        'insert into people (branch_code, name, group_id, join_order, active) values ($1, $2, $3, $4, true) returning id, name, group_id, join_order, active, created_at',
        [branch, name, groupId, orderResult.rows[0].next_order]
      );
      return sendJson(res, 200, { person: mapPerson(result.rows[0]) });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = body.id;
      const active = !!body.active;
      const result = await query(
        'update people set active = $1 where id = $2 and branch_code = $3 returning id, name, group_id, join_order, active, created_at',
        [active, id, branch]
      );
      return sendJson(res, 200, { person: result.rows[0] ? mapPerson(result.rows[0]) : null });
    }

    if (req.method === 'DELETE') {
      const body = await readBody(req);
      await query('delete from people where id = $1 and branch_code = $2', [body.id, branch]);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    handleError(res, err);
  }
};

function mapPerson(row) {
  return { id: row.id, name: row.name, groupId: row.group_id, joinOrder: row.join_order, active: row.active, createdAt: row.created_at };
}
