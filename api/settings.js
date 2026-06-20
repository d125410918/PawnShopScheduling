const db = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const branch = db.safeBranchCode(req.query.branch || 'main');
    await db.ensureBranch(branch);
    if (req.method !== 'PATCH') return db.sendJson(res, 405, { error: 'Method not allowed' });
    const body = await db.readBody(req);
    const raw = Array.isArray(body.rotationBaseOrder) ? body.rotationBaseOrder : ['A', 'B', 'D'];
    const order = [];
    raw.forEach(id => { if (['A', 'B', 'D'].includes(id) && !order.includes(id)) order.push(id); });
    ['A', 'B', 'D'].forEach(id => { if (!order.includes(id)) order.push(id); });
    const finalOrder = order.slice(0, 3);
    await db.query('update branch_settings set rotation_base_order=$1::jsonb, updated_at=now() where branch_code=$2', [JSON.stringify(finalOrder), branch]);
    const result = await db.query('select rotation_base_order, rotation_base_monday from branch_settings where branch_code=$1', [branch]);
    return db.sendJson(res, 200, { settings: { rotationBaseOrder: result.rows[0].rotation_base_order, rotationBaseMonday: result.rows[0].rotation_base_monday ? result.rows[0].rotation_base_monday.toISOString().slice(0, 10) : '' } });
  } catch (err) {
    db.handleError(res, err);
  }
};
