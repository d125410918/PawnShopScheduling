const STORE_KEY = "pawnshop-scheduling-v5";
const OLD_STORE_KEYS = ["pawnshop-scheduling-v4", "pawnshop-scheduling-v3", "pawnshop-scheduling-v2", "pawnshop-scheduling-v1"];

const GROUPS = [
  { id: "A", name: "A組" },
  { id: "B", name: "B組" },
  { id: "D", name: "D組" }
];

const SHIFTS = [
  { id: "EARLY", name: "早班", start: "09:00", end: "13:00", hours: ["09:00", "10:00", "11:00", "12:00"] },
  { id: "MID", name: "中班", start: "13:00", end: "17:00", hours: ["13:00", "14:00", "15:00", "16:00"] },
  { id: "LATE", name: "晚班", start: "17:00", end: "21:00", hours: ["17:00", "18:00", "19:00", "20:00"] }
];

const DAYS = ["一", "二", "三", "四", "五", "六"];
const ALL_HOURS = SHIFTS.flatMap(s => s.hours);
const State = Object.freeze({ Idle: "Idle", ManagingPeople: "ManagingPeople", GeneratingSchedule: "GeneratingSchedule", ViewingSchedule: "ViewingSchedule", Error: "Error" });

const app = {
  state: State.Idle,
  data: loadData(),
  filterGroup: "ALL",
  peopleFilterGroup: "ALL",
  els: {},
  transition(nextState, payload) {
    exitState(this.state);
    this.state = nextState;
    enterState(nextState, payload);
    render();
  }
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  app.els = {
    stateLabel: document.getElementById("stateLabel"),
    personForm: document.getElementById("personForm"),
    personName: document.getElementById("personName"),
    peopleList: document.getElementById("peopleList"),
    scheduleDate: document.getElementById("scheduleDate"),
    weekLabel: document.getElementById("weekLabel"),
    rotationLabel: document.getElementById("rotationLabel"),
    rotateGroupButton: document.getElementById("rotateGroupButton"),
    generateButton: document.getElementById("generateButton"),
    copyButton: document.getElementById("copyButton"),
    exportButton: document.getElementById("exportButton"),
    clearScheduleButton: document.getElementById("clearScheduleButton"),
    prevWeekButton: document.getElementById("prevWeekButton"),
    nextWeekButton: document.getElementById("nextWeekButton"),
    seedButton: document.getElementById("seedButton"),
    clearPeopleButton: document.getElementById("clearPeopleButton"),
    messageBox: document.getElementById("messageBox"),
    scheduleTable: document.getElementById("scheduleTable"),
    filterButtons: [...document.querySelectorAll(".filter-btn")],
    peopleFilterButtons: [...document.querySelectorAll(".people-filter-btn")]
  };

  app.els.scheduleDate.value = todayText();
  normalizeData();
  cleanupEndedWeeks();
  setInterval(cleanupEndedWeeks, 60000);

  app.els.personForm.addEventListener("submit", onAddPerson);
  app.els.rotateGroupButton.addEventListener("click", onRotateGroupOrder);
  app.els.generateButton.addEventListener("click", onGenerateCurrentWeekSchedule);
  app.els.copyButton.addEventListener("click", onCopySchedule);
  app.els.exportButton.addEventListener("click", onExportCsv);
  app.els.clearScheduleButton.addEventListener("click", onClearWeekSchedule);
  app.els.prevWeekButton.addEventListener("click", () => moveWeek(-7));
  app.els.nextWeekButton.addEventListener("click", () => moveWeek(7));
  app.els.seedButton.addEventListener("click", onSeedPeople);
  app.els.clearPeopleButton.addEventListener("click", onClearPeople);
  app.els.scheduleDate.addEventListener("change", () => app.transition(State.ViewingSchedule));
  app.els.filterButtons.forEach(btn => btn.addEventListener("click", () => { app.filterGroup = btn.dataset.filter; app.transition(State.ViewingSchedule); }));
  app.els.peopleFilterButtons.forEach(btn => btn.addEventListener("click", () => { app.peopleFilterGroup = btn.dataset.peopleFilter; app.transition(State.ManagingPeople); }));

  app.transition(State.Idle);
}

function enterState(state, payload) {
  if (state === State.Error) setMessage(payload || "發生錯誤。", true);
  if (state === State.GeneratingSchedule) app.els.generateButton.disabled = true;
}

function exitState(state) {
  if (state === State.GeneratingSchedule) app.els.generateButton.disabled = false;
}

function onAddPerson(event) {
  event.preventDefault();
  app.transition(State.ManagingPeople);
  const name = app.els.personName.value.trim();
  const groupId = document.querySelector("input[name='group']:checked").value;
  if (!name) { app.transition(State.Error, "請輸入人員姓名。"); return; }
  const exists = app.data.people.some(p => p.name === name && normalizeGroupId(p.groupId) === groupId && p.active);
  if (exists) { app.transition(State.Error, "同一組已有相同姓名的啟用人員。"); return; }
  app.data.people.push({ id: cryptoId(), name, groupId, joinOrder: nextJoinOrder(), active: true });
  app.els.personName.value = "";
  saveData();
  setMessage("已新增人員。");
  app.transition(State.Idle);
}

function onRotateGroupOrder() {
  const order = validRotationOrder();
  app.data.rotationBaseOrder = order.slice(1).concat(order[0]);
  saveData();
  setMessage(`已整組輪調：${rotationOrderText()}。`);
  app.transition(State.ViewingSchedule);
}

function onGenerateCurrentWeekSchedule() {
  app.transition(State.GeneratingSchedule);
  try {
    normalizeData();
    const dates = weekDates();
    const groupsToGenerate = app.filterGroup === "ALL" ? GROUPS.map(g => g.id) : [app.filterGroup];
    const hasExisting = weekHasSchedules(dates, groupsToGenerate);
    const confirmText = app.filterGroup === "ALL" ? "本週已有班表，是否重新產生完整班表？" : `本週已有${filterLabel()}班表，是否只重新產生該組？`;
    if (hasExisting && !confirm(confirmText)) { app.transition(State.ViewingSchedule); return; }
    dates.forEach(date => {
      const existing = Array.isArray(app.data.schedules[date]) ? app.data.schedules[date] : [];
      const kept = existing.filter(slot => !groupsToGenerate.includes(normalizeGroupId(slot.groupId)));
      const generated = groupsToGenerate.flatMap(groupId => generateGroupDaySchedule(date, dates[0], groupId));
      app.data.schedules[date] = [...kept, ...generated].sort((a, b) => a.hour.localeCompare(b.hour));
    });
    saveData();
    setMessage(app.filterGroup === "ALL" ? "已產生本週完整班表。" : `已產生本週${filterLabel()}班表。`);
    app.transition(State.ViewingSchedule);
  } catch (err) {
    app.transition(State.Error, err.message);
  }
}

function generateGroupDaySchedule(date, weekStartDate, groupId) {
  const group = groupById(groupId);
  const shift = shiftForGroup(group.id, weekStartDate);
  const members = shuffle(app.data.people.filter(p => normalizeGroupId(p.groupId) === group.id && p.active));
  if (members.length === 0) throw new Error(`${group.name} 沒有啟用人員，無法排班。`);
  return shift.hours.map((hour, index) => {
    const selected = members[index % members.length];
    return { id: cryptoId(), date, hour, hourText: `${hour}～${addOneHour(hour)}`, groupId: group.id, groupName: group.name, shiftId: shift.id, shiftName: shift.name, shiftText: `${shift.name} ${shift.start}～${shift.end}`, personId: selected.id, personName: selected.name, order: index + 1, randomSeed: Math.random() };
  });
}

function onCopySchedule() {
  const slots = getVisibleWeekSlots();
  if (!slots.length) { setMessage("目前畫面沒有班表可複製。", true); return; }
  navigator.clipboard.writeText(buildScheduleText(slots)).then(() => setMessage("已複製目前畫面班表文字。"));
}

function onExportCsv() {
  const slots = getVisibleWeekSlots();
  if (!slots.length) { setMessage("目前畫面沒有班表可下載。", true); return; }
  const rows = [["日期", "星期", "時段", "組別", "班別", "人員"]].concat(slots.map(s => [s.date, dayName(s.date), s.hourText, s.groupName, s.shiftText, s.personName]));
  const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dates = weekDates();
  link.href = url;
  link.download = `當鋪週排班_${dates[0]}_${dates[5]}_${filterLabel()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setMessage("已下載 CSV。");
}

function onClearWeekSchedule() {
  const dates = weekDates();
  const groupsToClear = app.filterGroup === "ALL" ? GROUPS.map(g => g.id) : [app.filterGroup];
  if (!weekHasSchedules(dates, groupsToClear)) { setMessage("本週沒有可清除的班表。", true); return; }
  if (!confirm(app.filterGroup === "ALL" ? "確定清除本週完整班表？" : `確定清除本週${filterLabel()}班表？`)) return;
  dates.forEach(date => {
    app.data.schedules[date] = (app.data.schedules[date] || []).filter(slot => !groupsToClear.includes(normalizeGroupId(slot.groupId)));
    if (app.data.schedules[date].length === 0) delete app.data.schedules[date];
  });
  saveData();
  setMessage("已清除本週班表。");
  app.transition(State.Idle);
}

function onSeedPeople() {
  app.transition(State.ManagingPeople);
  if (app.data.people.length > 0 && !confirm("會加入範例人員，不會清除原資料。是否繼續？")) { app.transition(State.Idle); return; }
  const names = { A: ["小明", "阿華", "小美", "大雄"], B: ["美玲", "雅婷", "家豪", "宗翰"], D: ["建宏", "佩君", "冠宇", "怡萱"] };
  Object.entries(names).forEach(([groupId, list]) => list.forEach(name => app.data.people.push({ id: cryptoId(), name, groupId, joinOrder: nextJoinOrder(), active: true })));
  saveData();
  setMessage("已建立範例人員。");
  app.transition(State.Idle);
}

function onClearPeople() {
  app.transition(State.ManagingPeople);
  if (!confirm("確定清除所有人員與所有班表資料？")) { app.transition(State.Idle); return; }
  app.data.people = [];
  app.data.schedules = {};
  saveData();
  setMessage("已清除所有資料。");
  app.transition(State.Idle);
}

function togglePerson(id) {
  const person = app.data.people.find(p => p.id === id);
  if (!person) return;
  person.active = !person.active;
  saveData();
  setMessage(person.active ? "已啟用人員。" : "已停用人員。");
  app.transition(State.Idle);
}

function deletePerson(id) {
  const person = app.data.people.find(p => p.id === id);
  if (!person) return;
  if (!confirm(`確定刪除 ${person.name}？既有班表文字會保留。`)) return;
  app.data.people = app.data.people.filter(p => p.id !== id);
  saveData();
  setMessage("已刪除人員。");
  app.transition(State.Idle);
}

function changeSlotPerson(date, slotId) {
  const slots = app.data.schedules[date] || [];
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;
  const members = app.data.people.filter(p => p.active && normalizeGroupId(p.groupId) === normalizeGroupId(slot.groupId));
  if (!members.length) { setMessage("該組沒有啟用人員可更換。", true); return; }
  const menu = members.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
  const input = prompt(`選擇 ${slot.groupName} ${slot.hourText} 值班人員：\n${menu}`, "1");
  if (input === null) return;
  const index = Number(input) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= members.length) { setMessage("選擇無效，未更換。", true); return; }
  slot.personId = members[index].id;
  slot.personName = members[index].name;
  saveData();
  setMessage(`已將 ${slot.hourText} 改為 ${slot.personName}。`);
  app.transition(State.ViewingSchedule);
}

function moveWeek(days) { const date = parseDate(currentDate()); date.setDate(date.getDate() + days); app.els.scheduleDate.value = formatDate(date); app.transition(State.ViewingSchedule); }
function render() { app.els.stateLabel.textContent = app.state; renderFilterButtons(); renderPeopleFilterButtons(); renderRotationLabel(); renderPeople(); renderSchedule(); }
function renderFilterButtons() { app.els.filterButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.filter === app.filterGroup)); }
function renderPeopleFilterButtons() { app.els.peopleFilterButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.peopleFilter === app.peopleFilterGroup)); }
function renderRotationLabel() { app.els.rotationLabel.textContent = rotationOrderText(); }

function renderPeople() {
  const filtered = app.data.people.filter(p => app.peopleFilterGroup === "ALL" || normalizeGroupId(p.groupId) === app.peopleFilterGroup).sort((a, b) => normalizeGroupId(a.groupId).localeCompare(normalizeGroupId(b.groupId)) || (a.joinOrder || 0) - (b.joinOrder || 0));
  if (!filtered.length) { app.els.peopleList.innerHTML = `<div class="empty-box">目前篩選沒有可顯示的人員。</div>`; return; }
  app.els.peopleList.innerHTML = filtered.map(person => {
    const group = groupById(person.groupId);
    return `<div class="person-row"><div><div class="person-name">${escapeHtml(person.name)} ${person.active ? "" : "（停用）"}</div><div class="person-meta"><span class="badge">${group.name}</span><span>加入序：${person.joinOrder || "-"}</span></div></div><div class="row-actions"><button type="button" onclick="togglePerson('${person.id}')">${person.active ? "停用" : "啟用"}</button><button type="button" class="danger-text" onclick="deletePerson('${person.id}')">刪除</button></div></div>`;
  }).join("");
}

function renderSchedule() {
  const dates = weekDates();
  const weekStart = dates[0];
  app.els.weekLabel.textContent = `${dates[0].replaceAll("-", "/")} - ${dates[5].replaceAll("-", "/")}（週一至週六）｜${rotationSummary(weekStart)}`;
  const rows = visibleHours(weekStart);
  const duplicateMap = buildDuplicateMap(dates);
  const header = dates.map((date, index) => `<th><div class="day-head"><strong>${shortDate(date)}</strong><span>${DAYS[index]}</span></div></th>`).join("");
  const body = rows.map(hour => `<tr><td>${hour}～${addOneHour(hour)}</td>${dates.map(date => renderCell(date, hour, duplicateMap)).join("")}</tr>`).join("");
  app.els.scheduleTable.innerHTML = `<table class="week-table"><thead><tr><th>成員 / 時段</th>${header}</tr></thead><tbody>${body}</tbody></table><div class="schedule-note">目前查看：${filterLabel()}。點擊已排班人員可直接更換該時段值班人員；黃色圓點代表同日同組重複值班。</div>`;
}

function renderCell(date, hour, duplicateMap) {
  const slot = (app.data.schedules[date] || []).find(s => s.hour === hour && (app.filterGroup === "ALL" || normalizeGroupId(s.groupId) === app.filterGroup));
  if (!slot) return `<td><span class="cell-empty">—</span></td>`;
  const groupId = normalizeGroupId(slot.groupId);
  const dupKey = `${date}|${groupId}|${slot.personId}`;
  const dot = duplicateMap[dupKey] > 1 ? `<span class="duplicate-dot" title="重複值班"></span>` : "";
  return `<td><button type="button" class="cell-button" onclick="changeSlotPerson('${date}', '${slot.id}')"><span class="cell-card group-${groupId}">${dot}${escapeHtml(slot.personName)}<small>${slot.groupName} ${slot.shiftName || ""}</small></span></button></td>`;
}

function visibleHours(weekStart) { return app.filterGroup === "ALL" ? ALL_HOURS : shiftForGroup(app.filterGroup, weekStart).hours; }
function buildDuplicateMap(dates) { const map = {}; dates.forEach(date => (app.data.schedules[date] || []).forEach(slot => { const key = `${date}|${normalizeGroupId(slot.groupId)}|${slot.personId}`; map[key] = (map[key] || 0) + 1; })); return map; }
function getVisibleWeekSlots() { const dates = weekDates(); const visible = new Set(visibleHours(dates[0])); return dates.flatMap(date => (app.data.schedules[date] || []).filter(slot => (app.filterGroup === "ALL" || normalizeGroupId(slot.groupId) === app.filterGroup) && visible.has(slot.hour))); }
function buildScheduleText(slots) { const dates = weekDates(); return [`當鋪週排班 ${dates[0]}～${dates[5]} ${filterLabel()}`].concat(slots.map(s => `${s.date} ${dayName(s.date)} ${s.hourText} ${s.groupName} ${s.shiftName || ""}：${s.personName}`)).join("\n"); }
function shiftForGroup(groupId, weekStartDate) { const order = rotatedOrderForWeek(weekStartDate); const index = order.indexOf(normalizeGroupId(groupId)); return SHIFTS[index >= 0 ? index : 0]; }
function rotatedOrderForWeek(weekStartDate) { const order = validRotationOrder(); const offset = weekRotationIndex(weekStartDate); return order.slice(offset).concat(order.slice(0, offset)); }
function weekRotationIndex(weekStartDate) { const base = parseDate(app.data.rotationBaseMonday || mondayText(todayText())); const target = mondayOf(parseDate(weekStartDate)); const diffDays = Math.round((target - base) / 86400000); return mod(Math.floor(diffDays / 7), SHIFTS.length); }
function validRotationOrder() { const raw = Array.isArray(app.data.rotationBaseOrder) ? app.data.rotationBaseOrder.map(normalizeGroupId) : []; const cleaned = raw.filter((id, index) => GROUPS.some(g => g.id === id) && raw.indexOf(id) === index); GROUPS.forEach(g => { if (!cleaned.includes(g.id)) cleaned.push(g.id); }); return cleaned.slice(0, 3); }
function rotationOrderText() { return validRotationOrder().map(id => groupById(id).name).join(" → "); }
function rotationSummary(weekStart) { return rotatedOrderForWeek(weekStart).map((id, i) => `${groupById(id).name}${SHIFTS[i].name}`).join("，"); }
function weekHasSchedules(dates, groupIds) { return dates.some(date => (app.data.schedules[date] || []).some(slot => groupIds.includes(normalizeGroupId(slot.groupId)))); }
function filterLabel() { return app.filterGroup === "ALL" ? "所有人" : groupById(app.filterGroup).name; }
function weekDates() { return weekDatesFrom(mondayOf(parseDate(currentDate()))); }
function weekDatesFrom(monday) { const d0 = typeof monday === "string" ? parseDate(monday) : new Date(monday); return Array.from({ length: 6 }, (_, i) => { const d = new Date(d0); d.setDate(d0.getDate() + i); return formatDate(d); }); }
function currentDate() { return app.els.scheduleDate.value || todayText(); }
function mondayText(dateText) { return formatDate(mondayOf(parseDate(dateText))); }
function mondayOf(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d; }
function parseDate(text) { const [y, m, d] = text.split("-").map(Number); return new Date(y, m - 1, d); }
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function todayText() { return formatDate(new Date()); }
function shortDate(dateText) { const [, m, d] = dateText.split("-"); return `${m}/${d}`; }
function dayName(dateText) { return `星期${"日一二三四五六"[parseDate(dateText).getDay()]}`; }
function addOneHour(text) { const [h, m] = text.split(":").map(Number); return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
function nextJoinOrder() { return app.data.people.reduce((max, p) => Math.max(max, p.joinOrder || 0), 0) + 1; }
function normalizeGroupId(id) { return id === "C" ? "D" : id; }
function groupById(id) { return GROUPS.find(g => g.id === normalizeGroupId(id)) || GROUPS[0]; }
function mod(value, divisor) { return ((value % divisor) + divisor) % divisor; }
function shuffle(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function setMessage(text, isError = false) { app.els.messageBox.textContent = text || ""; app.els.messageBox.style.color = isError ? "#d92d20" : "#172554"; }
function cleanupEndedWeeks() { const currentMonday = mondayText(todayText()); let removed = false; Object.keys(app.data.schedules).forEach(date => { if (mondayText(date) < currentMonday) { delete app.data.schedules[date]; removed = true; } }); if (removed) { app.data.lastCleanupAt = new Date().toISOString(); saveData(); } }
function normalizeData() { app.data.people = Array.isArray(app.data.people) ? app.data.people.map((p, i) => ({ ...p, id: p.id || cryptoId(), groupId: normalizeGroupId(p.groupId), joinOrder: p.joinOrder || i + 1, active: typeof p.active === "boolean" ? p.active : true })) : []; app.data.schedules = app.data.schedules && typeof app.data.schedules === "object" ? app.data.schedules : {}; app.data.rotationBaseOrder = validRotationOrder(); app.data.rotationBaseMonday = app.data.rotationBaseMonday || mondayText(todayText()); Object.values(app.data.schedules).forEach(slots => Array.isArray(slots) && slots.forEach(slot => { slot.groupId = normalizeGroupId(slot.groupId); slot.groupName = groupById(slot.groupId).name; if (!slot.id) slot.id = cryptoId(); if (!slot.hourText) slot.hourText = `${slot.hour}～${addOneHour(slot.hour)}`; if (!slot.shiftName) { const shift = SHIFTS.find(s => s.hours.includes(slot.hour)) || SHIFTS[0]; slot.shiftId = shift.id; slot.shiftName = shift.name; slot.shiftText = `${shift.name} ${shift.start}～${shift.end}`; } })); }
function saveData() { normalizeData(); localStorage.setItem(STORE_KEY, JSON.stringify(app.data)); }
function loadData() { const fallback = { people: [], schedules: {}, rotationBaseOrder: ["A", "B", "D"], rotationBaseMonday: "", lastCleanupAt: "" }; try { const raw = localStorage.getItem(STORE_KEY) || OLD_STORE_KEYS.map(key => localStorage.getItem(key)).find(Boolean); if (!raw) return fallback; const parsed = JSON.parse(raw); return { people: Array.isArray(parsed.people) ? parsed.people : [], schedules: parsed.schedules && typeof parsed.schedules === "object" ? parsed.schedules : {}, rotationBaseOrder: parsed.rotationBaseOrder || ["A", "B", "D"], rotationBaseMonday: parsed.rotationBaseMonday || "", lastCleanupAt: parsed.lastCleanupAt || "" }; } catch { return fallback; } }
function cryptoId() { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function escapeCsv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
