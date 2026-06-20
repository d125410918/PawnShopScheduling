const db = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const branch = db.safeBranchCode(req.query.branch || 'main');
    await db.ensureBranch(branch);
    const body = await db.readBody(req);

    if (req.method === 'PUT') {
      const slots = Array.isArray(body.slots) ? body.slots : [];
      const dates = Array.isArray(body.dates) ? body.dates : [];
      const groups = Array.isArray(body.groups) ? body.groups : [];
      await db.query('delete from schedules where branch_code=$1 and schedule_date=any($2::date[]) and group_id=any($3::text[])', [branch, dates, groups]);
      for (const s of slots) {
        await db.query('insert into schedules (branch_code,schedule_date,hour,hour_text,group_id,group_name,shift_id,shift_name,shift_text,person_id,person_name,slot_order,random_seed) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [branch, s.date, s.hour, s.hourText, s.groupId, s.groupName, s.shiftId, s.shiftName, s.shiftText, s.personId, s.personName, s.order || 0, s.randomSeed || Math.random()]);
      }
      return db.sendJson(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      await db.query('update schedules set person_id=$1, person_name=$2, updated_at=now() where id=$3 and branch_code=$4', [body.personId, body.personName, body.slotId, branch]);
      return db.sendJson(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      const dates = Array.isArray(body.dates) ? body.dates : [];
      const groups = Array.isArray(body.groups) ? body.groups : [];
      await db.query('delete from schedules where branch_code=$1 and schedule_date=any($2::date[]) and group_id=any($3::text[])', [branch, dates, groups]);
      return db.sendJson(res, 200, { ok: true });
    }

    return db.sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    db.handleError(res, err);
  }
};
