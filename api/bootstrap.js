const { query, sendJson, safeBranchCode, ensureBranch, handleError } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const branch = safeBranchCode(req.query.branch || 'main');
    await ensureBranch(branch);
    const currentMondayResult = await query(`select date_trunc('week', current_date)::date as current_monday`);
    const currentMonday = currentMondayResult.rows[0].current_monday;
    await query(`delete from schedules where branch_code = $1 and schedule_date < $2`, [branch, currentMonday]);

    const branchResult = await query(`select branch_code, branch_name, created_at from branches where branch_code = $1`, [branch]);
    const settingsResult = await query(`select rotation_base_order, rotation_base_monday from branch_settings where branch_code = $1`, [branch]);
    const branchesResult = branch === 'main'
      ? await query(`select branch_code, branch_name, created_at from branches order by created_at asc`)
      : { rows: [] };
    const peopleResult = await query(
      `select id, name, group_id, join_order, active, created_at from people where branch_code = $1 order by group_id asc, join_order asc, created_at asc`,
      [branch]
    );
    const schedulesResult = await query(
      `select id, schedule_date, hour, hour_text, group_id, group_name, shift_id, shift_name, shift_text, person_id, person_name, slot_order, random_seed from schedules where branch_code = $1 order by schedule_date asc, hour asc, group_id asc`,
      [branch]
    );

    const schedules = {};
    schedulesResult.rows.forEach(row => {
      const date = row.schedule_date.toISOString().slice(0, 10);
      if (!schedules[date]) schedules[date] = [];
      schedules[date].push({
        id: row.id,
        date,
        hour: row.hour,
        hourText: row.hour_text,
        groupId: row.group_id,
        groupName: row.group_name,
        shiftId: row.shift_id,
        shiftName: row.shift_name,
        shiftText: row.shift_text,
        personId: row.person_id,
        personName: row.person_name,
        order: row.slot_order,
        randomSeed: row.random_seed
      });
    });

    sendJson(res, 200, {
      branch: branchResult.rows[0],
      branches: branchesResult.rows,
      people: peopleResult.rows.map(row => ({ id: row.id, name: row.name, groupId: row.group_id, joinOrder: row.join_order, active: row.active, createdAt: row.created_at })),
      schedules,
      settings: {
        rotationBaseOrder: settingsResult.rows[0]?.rotation_base_order || ['A', 'B', 'D'],
        rotationBaseMonday: settingsResult.rows[0]?.rotation_base_monday ? settingsResult.rows[0].rotation_base_monday.toISOString().slice(0, 10) : ''
      }
    });
  } catch (err) {
    handleError(res, err);
  }
};
