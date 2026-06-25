const SHIFT_ORDER_EARLY_LATE_MID = [
  { id: "EARLY", name: "早班", start: "09:00", end: "13:00", hours: ["09:00", "10:00", "11:00", "12:00"] },
  { id: "LATE", name: "晚班", start: "17:00", end: "21:00", hours: ["17:00", "18:00", "19:00", "20:00"] },
  { id: "MID", name: "中班", start: "13:00", end: "17:00", hours: ["13:00", "14:00", "15:00", "16:00"] }
];

function shiftForGroup(groupId, weekStart) {
  const order = rotatedOrderForWeek(weekStart);
  return SHIFT_ORDER_EARLY_LATE_MID[Math.max(0, order.indexOf(normalizeGroupId(groupId)))];
}

function visibleHours(weekStart) {
  return app.filterGroup === "ALL" ? SHIFT_ORDER_EARLY_LATE_MID.flatMap(shift => shift.hours) : shiftForGroup(app.filterGroup, weekStart).hours;
}

function rotationSummary(weekStart) {
  return rotatedOrderForWeek(weekStart).map((id, index) => `${groupById(id).name}${SHIFT_ORDER_EARLY_LATE_MID[index].name}`).join("，");
}
