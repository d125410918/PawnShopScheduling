const GROUPS = [{ id: "A", name: "A組" }, { id: "B", name: "B組" }, { id: "D", name: "D組" }];
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
  branchCode: branchFromUrl(),
  branch: null,
  branches: [],
  data: { people: [], schedules: {}, rotationBaseOrder: ["A", "B", "D"], rotationBaseMonday: "" },
  filterGroup: "ALL",
  peopleFilterGroup: "ALL",
  els: {},
  transition(nextState, payload) { this.state = nextState; enterState(nextState, payload); render(); }
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  simplifyHeader();
  injectBranchPanel();
  app.els = {
    stateLabel: document.getElementById("stateLabel"), personForm: document.getElementById("personForm"), personName: document.getElementById("personName"), peopleList: document.getElementById("peopleList"),
    scheduleDate: document.getElementById("scheduleDate"), weekLabel: document.getElementById("weekLabel"), rotationLabel: document.getElementById("rotationLabel"), rotateGroupButton: document.getElementById("rotateGroupButton"),
    generateButton: document.getElementById("generateButton"), copyButton: document.getElementById("copyButton"), exportButton: document.getElementById("exportButton"), clearScheduleButton: document.getElementById("clearScheduleButton"),
    prevWeekButton: document.getElementById("prevWeekButton"), nextWeekButton: document.getElementById("nextWeekButton"), seedButton: document.getElementById("seedButton"), clearPeopleButton: document.getElementById("clearPeopleButton"),
    messageBox: document.getElementById("messageBox"), scheduleTable: document.getElementById("scheduleTable"), filterButtons: [...document.querySelectorAll(".filter-btn")], peopleFilterButtons: [...document.querySelectorAll(".people-filter-btn")],
    currentBranchName: document.getElementById("currentBranchName"), currentBranchCode: document.getElementById("currentBranchCode"), branchNameInput: document.getElementById("branchNameInput"), createBranchButton: document.getElementById("createBranchButton"), copyBranchUrlButton: document.getElementById("copyBranchUrlButton"), branchList: document.getElementById("branchList")
  };
  app.els.scheduleDate.value = todayText();
  bindEvents();
  await loadCloudData();
  app.transition(State.Idle);
}

function simplifyHeader() {
  const heroText = document.querySelector(".hero > div:first-child");
  if (heroText) heroText.innerHTML = `<h1>排班表</h1>`;
}

function injectBranchPanel() {
  if (document.getElementById("branchList")) return;
  const hero = document.querySelector(".hero");
  const section = document.createElement("section");
  section.className = "branch-panel panel compact-card";
  section.innerHTML = `<div class="branch-head"><div><strong>目前分店：<span id="currentBranchName">讀取中</span></strong><span id="currentBranchCode" class="muted-text"></span></div><button id="copyBranchUrlButton" type="button">複製目前分店連結</button></div><div class="branch-tools"><input id="branchNameInput" type="text" maxlength="40" placeholder="輸入分店名稱，例如高雄三多" /><button id="createBranchButton" type="button" class="primary-btn">新增分店</button></div><div id="branchList" class="branch-list"></div>`;
  hero.insertAdjacentElement("afterend", section);
}

function bindEvents() {
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
  app.els.createBranchButton.addEventListener("click", onCreateBranch);
  app.els.copyBranchUrlButton.addEventListener("click", () => copyText(branchUrl(app.branchCode), "已複製目前分店連結。"));
  app.els.scheduleDate.addEventListener("change", () => app.transition(State.ViewingSchedule));
  app.els.filterButtons.forEach(btn => btn.addEventListener("click", () => { app.filterGroup = btn.dataset.filter; app.transition(State.ViewingSchedule); }));
  app.els.peopleFilterButtons.forEach(btn => btn.addEventListener("click", () => { app.peopleFilterGroup = btn.dataset.peopleFilter; app.transition(State.ManagingPeople); }));
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "API 錯誤");
  return json;
}

async function loadCloudData() {
  setMessage("讀取雲端資料中...");
  const json = await api(`/api/bootstrap?branch=${encodeURIComponent(app.branchCode)}`);
  app.branch = json.branch;
  app.branches = json.branches || [];
  app.data.people = json.people || [];
  app.data.schedules = json.schedules || {};
  app.data.rotationBaseOrder = json.settings?.rotationBaseOrder || ["A", "B", "D"];
  app.data.rotationBaseMonday = json.settings?.rotationBaseMonday || mondayText(todayText());
  setMessage("已讀取雲端資料。");
}

function enterState(state, payload) { if (state === State.Error) setMessage(payload || "發生錯誤。", true); app.els.stateLabel.textContent = state; }

async function onAddPerson(event) {
  event.preventDefault();
  app.transition(State.ManagingPeople);
  try {
    const name = app.els.personName.value.trim();
    const groupId = document.querySelector("input[name='group']:checked").value;
    const json = await api(`/api/people?branch=${app.branchCode}`, { method: "POST", body: JSON.stringify({ name, groupId }) });
    app.data.people.push(json.person);
    app.els.personName.value = "";
    setMessage("已新增人員。"); app.transition(State.Idle);
  } catch (err) { app.transition(State.Error, err.message); }
}

async function onRotateGroupOrder() {
  try {
    const order = validRotationOrder();
    const next = order.slice(1).concat(order[0]);
    const json = await api(`/api/settings?branch=${app.branchCode}`, { method: "PATCH", body: JSON.stringify({ rotationBaseOrder: next }) });
    app.data.rotationBaseOrder = json.settings.rotationBaseOrder;
    setMessage(`已整組輪調：${rotationOrderText()}。`); app.transition(State.ViewingSchedule);
  } catch (err) { app.transition(State.Error, err.message); }
}

async function onGenerateCurrentWeekSchedule() {
  app.transition(State.GeneratingSchedule);
  try {
    const dates = weekDates();
    const groups = app.filterGroup === "ALL" ? GROUPS.map(g => g.id) : [app.filterGroup];
    if (weekHasSchedules(dates, groups) && !confirm(app.filterGroup === "ALL" ? "本週已有班表，是否重新產生完整班表？" : `本週已有${filterLabel()}班表，是否只重新產生該組？`)) { app.transition(State.ViewingSchedule); return; }
    const slots = dates.flatMap(date => groups.flatMap(groupId => generateGroupDaySchedule(date, dates[0], groupId)));
    await api(`/api/schedules?branch=${app.branchCode}`, { method: "PUT", body: JSON.stringify({ dates, groups, slots }) });
    dates.forEach(date => {
      const kept = (app.data.schedules[date] || []).filter(slot => !groups.includes(normalizeGroupId(slot.groupId)));
      app.data.schedules[date] = [...kept, ...slots.filter(slot => slot.date === date)].sort((a, b) => a.hour.localeCompare(b.hour));
    });
    setMessage(app.filterGroup === "ALL" ? "已產生本週完整班表。" : `已產生本週${filterLabel()}班表。`); app.transition(State.ViewingSchedule);
  } catch (err) { app.transition(State.Error, err.message); }
}

function generateGroupDaySchedule(date, weekStartDate, groupId) {
  const group = groupById(groupId); const shift = shiftForGroup(group.id, weekStartDate); const members = shuffle(app.data.people.filter(p => normalizeGroupId(p.groupId) === group.id && p.active));
  if (!members.length) throw new Error(`${group.name} 沒有啟用人員，無法排班。`);
  return shift.hours.map((hour, index) => { const selected = members[index % members.length]; return { id: cryptoId(), date, hour, hourText: `${hour}～${addOneHour(hour)}`, groupId: group.id, groupName: group.name, shiftId: shift.id, shiftName: shift.name, shiftText: `${shift.name} ${shift.start}～${shift.end}`, personId: selected.id, personName: selected.name, order: index + 1, randomSeed: Math.random() }; });
}

async function onSeedPeople() { for (const [groupId, names] of Object.entries({ A: ["小明", "阿華", "小美", "大雄"], B: ["美玲", "雅婷", "家豪", "宗翰"], D: ["建宏", "佩君", "冠宇", "怡萱"] })) for (const name of names) await api(`/api/people?branch=${app.branchCode}`, { method: "POST", body: JSON.stringify({ name, groupId }) }); await loadCloudData(); app.transition(State.Idle); }
async function onClearPeople() { if (!confirm("確定清除人員？目前版本請到 Neon 管理大量刪除，或逐筆刪除。")) return; }
async function togglePerson(id) { const p = app.data.people.find(x => x.id === id); if (!p) return; const json = await api(`/api/people?branch=${app.branchCode}`, { method: "PATCH", body: JSON.stringify({ id, active: !p.active }) }); Object.assign(p, json.person); app.transition(State.Idle); }
async function deletePerson(id) { if (!confirm("確定刪除此人員？")) return; await api(`/api/people?branch=${app.branchCode}`, { method: "DELETE", body: JSON.stringify({ id }) }); app.data.people = app.data.people.filter(p => p.id !== id); app.transition(State.Idle); }
async function onClearWeekSchedule() { const dates = weekDates(); const groups = app.filterGroup === "ALL" ? GROUPS.map(g => g.id) : [app.filterGroup]; if (!weekHasSchedules(dates, groups)) return setMessage("本週沒有可清除的班表。", true); if (!confirm("確定清除目前範圍班表？")) return; await api(`/api/schedules?branch=${app.branchCode}`, { method: "DELETE", body: JSON.stringify({ dates, groups }) }); dates.forEach(date => { app.data.schedules[date] = (app.data.schedules[date] || []).filter(slot => !groups.includes(normalizeGroupId(slot.groupId))); }); app.transition(State.Idle); }
async function onSlotPersonChange(slotId, personId) { const found = findSlotById(slotId); if (!found) return; const person = app.data.people.find(p => p.id === personId); if (!person) return; found.slot.personId = person.id; found.slot.personName = person.name; await api(`/api/schedules?branch=${app.branchCode}`, { method: "PATCH", body: JSON.stringify({ slotId, personId: person.id, personName: person.name }) }); app.transition(State.ViewingSchedule); }
async function onCreateBranch() { if (app.branchCode !== "main") return setMessage("分店頁面不能新增或查看其他分店。", true); const branchName = app.els.branchNameInput.value.trim(); if (!branchName) return setMessage("請輸入分店名稱。", true); const json = await api('/api/branches', { method: "POST", body: JSON.stringify({ branchName }) }); location.href = branchUrl(json.branch.branch_code); }

function render() { app.els.stateLabel.textContent = app.state; renderBranch(); renderFilterButtons(); renderPeopleFilterButtons(); renderRotationLabel(); renderPeople(); renderSchedule(); }
function renderBranch() {
  app.els.currentBranchName.textContent = app.branch?.branch_name || "主店";
  app.els.currentBranchCode.textContent = ` ${app.branchCode}`;
  if (app.branchCode !== "main") {
    app.els.branchNameInput.style.display = "none";
    app.els.createBranchButton.style.display = "none";
    app.els.branchList.innerHTML = "";
    return;
  }
  app.els.branchNameInput.style.display = "block";
  app.els.createBranchButton.style.display = "inline-block";
  app.els.branchList.innerHTML = app.branches.map(b => `<button type="button" onclick="location.href='${branchUrl(b.branch_code)}'">${escapeHtml(b.branch_name)}</button><button type="button" onclick="copyText('${branchUrl(b.branch_code)}','已複製分店連結。')">複製</button>`).join(" ");
}
function renderFilterButtons() { app.els.filterButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.filter === app.filterGroup)); }
function renderPeopleFilterButtons() { app.els.peopleFilterButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.peopleFilter === app.peopleFilterGroup)); }
function renderRotationLabel() { app.els.rotationLabel.textContent = rotationOrderText(); }
function renderPeople() { const filtered = app.data.people.filter(p => app.peopleFilterGroup === "ALL" || normalizeGroupId(p.groupId) === app.peopleFilterGroup).sort((a, b) => normalizeGroupId(a.groupId).localeCompare(normalizeGroupId(b.groupId)) || (a.joinOrder || 0) - (b.joinOrder || 0)); app.els.peopleList.innerHTML = filtered.length ? filtered.map(p => `<div class="person-row"><div><div class="person-name">${escapeHtml(p.name)} ${p.active ? "" : "（停用）"}</div><div class="person-meta"><span class="badge">${groupById(p.groupId).name}</span><span>加入序：${p.joinOrder || "-"}</span></div></div><div class="row-actions"><button type="button" onclick="togglePerson('${p.id}')">${p.active ? "停用" : "啟用"}</button><button type="button" class="danger-text" onclick="deletePerson('${p.id}')">刪除</button></div></div>`).join("") : `<div class="empty-box">目前篩選沒有可顯示的人員。</div>`; }
function renderSchedule() { const dates = weekDates(); const weekStart = dates[0]; app.els.weekLabel.textContent = `${dates[0].replaceAll("-", "/")} - ${dates[5].replaceAll("-", "/")}（週一至週六）｜${rotationSummary(weekStart)}`; const rows = visibleHours(weekStart); const dup = buildDuplicateMap(dates); const header = dates.map((d, i) => `<th><div class="day-head"><strong>${shortDate(d)}</strong><span>${DAYS[i]}</span></div></th>`).join(""); const body = rows.map(hour => `<tr><td>${hour}～${addOneHour(hour)}</td>${dates.map(date => renderCell(date, hour, dup)).join("")}</tr>`).join(""); app.els.scheduleTable.innerHTML = `<table class="week-table"><thead><tr><th>成員 / 時段</th>${header}</tr></thead><tbody>${body}</tbody></table><div class="schedule-note">目前查看：${filterLabel()}。下拉選單可直接更換人員；黃色圓點代表同日同組重複值班。</div>`; }
function renderCell(date, hour, dup) { const slot = (app.data.schedules[date] || []).find(s => s.hour === hour && (app.filterGroup === "ALL" || normalizeGroupId(s.groupId) === app.filterGroup)); if (!slot) return `<td><span class="cell-empty">—</span></td>`; const groupId = normalizeGroupId(slot.groupId); const dot = dup[`${date}|${groupId}|${slot.personId}`] > 1 ? `<span class="duplicate-dot"></span>` : ""; const members = app.data.people.filter(p => p.active && normalizeGroupId(p.groupId) === groupId); const options = members.map(p => `<option value="${p.id}" ${p.id === slot.personId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join(""); return `<td><span class="cell-card group-${groupId}">${dot}<select class="slot-select" onchange="onSlotPersonChange('${slot.id}', this.value)">${options}</select><small>${slot.groupName} ${slot.shiftName || ""}</small></span></td>`; }

function findSlotById(id) { for (const [date, slots] of Object.entries(app.data.schedules)) { const slot = (slots || []).find(s => s.id === id); if (slot) return { date, slot }; } return null; }
function onCopySchedule() { copyText(buildScheduleText(getVisibleWeekSlots()), "已複製目前畫面班表文字。"); }
function onExportCsv() { const slots = getVisibleWeekSlots(); if (!slots.length) return setMessage("目前畫面沒有班表可下載。", true); const rows = [["日期", "星期", "時段", "組別", "班別", "人員"]].concat(slots.map(s => [s.date, dayName(s.date), s.hourText, s.groupName, s.shiftText, s.personName])); const blob = new Blob(["\ufeff" + rows.map(r => r.map(escapeCsv).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `當鋪週排班_${weekDates()[0]}_${weekDates()[5]}_${filterLabel()}.csv`; a.click(); URL.revokeObjectURL(url); }
function copyText(text, msg) { navigator.clipboard.writeText(text).then(() => setMessage(msg)); }
function visibleHours(weekStart) { return app.filterGroup === "ALL" ? ALL_HOURS : shiftForGroup(app.filterGroup, weekStart).hours; }
function buildDuplicateMap(dates) { const map = {}; dates.forEach(d => (app.data.schedules[d] || []).forEach(s => { const k = `${d}|${normalizeGroupId(s.groupId)}|${s.personId}`; map[k] = (map[k] || 0) + 1; })); return map; }
function getVisibleWeekSlots() { const dates = weekDates(); const visible = new Set(visibleHours(dates[0])); return dates.flatMap(d => (app.data.schedules[d] || []).filter(s => (app.filterGroup === "ALL" || normalizeGroupId(s.groupId) === app.filterGroup) && visible.has(s.hour))); }
function buildScheduleText(slots) { const dates = weekDates(); return [`當鋪週排班 ${dates[0]}～${dates[5]} ${filterLabel()}`].concat(slots.map(s => `${s.date} ${dayName(s.date)} ${s.hourText} ${s.groupName} ${s.shiftName || ""}：${s.personName}`)).join("\n"); }
function shiftForGroup(groupId, weekStart) { const order = rotatedOrderForWeek(weekStart); return SHIFTS[Math.max(0, order.indexOf(normalizeGroupId(groupId)))]; }
function rotatedOrderForWeek(weekStart) { const order = validRotationOrder(); const offset = weekRotationIndex(weekStart); return order.slice(offset).concat(order.slice(0, offset)); }
function weekRotationIndex(weekStart) { const base = parseDate(app.data.rotationBaseMonday || mondayText(todayText())); const target = mondayOf(parseDate(weekStart)); return mod(Math.floor(Math.round((target - base) / 86400000) / 7), 3); }
function validRotationOrder() { const raw = Array.isArray(app.data.rotationBaseOrder) ? app.data.rotationBaseOrder.map(normalizeGroupId) : []; const out = raw.filter((id, i) => GROUPS.some(g => g.id === id) && raw.indexOf(id) === i); GROUPS.forEach(g => { if (!out.includes(g.id)) out.push(g.id); }); return out.slice(0, 3); }
function rotationOrderText() { return validRotationOrder().map(id => groupById(id).name).join(" → "); }
function rotationSummary(weekStart) { return rotatedOrderForWeek(weekStart).map((id, i) => `${groupById(id).name}${SHIFTS[i].name}`).join("，"); }
function weekHasSchedules(dates, groups) { return dates.some(d => (app.data.schedules[d] || []).some(s => groups.includes(normalizeGroupId(s.groupId)))); }
function filterLabel() { return app.filterGroup === "ALL" ? "所有人" : groupById(app.filterGroup).name; }
function branchFromUrl() { return new URLSearchParams(location.search).get("branch") || "main"; }
function branchUrl(code) { const u = new URL(location.href); if (code === "main") u.searchParams.delete("branch"); else u.searchParams.set("branch", code); return u.toString(); }
function moveWeek(days) { const d = parseDate(currentDate()); d.setDate(d.getDate() + days); app.els.scheduleDate.value = formatDate(d); app.transition(State.ViewingSchedule); }
function weekDates() { return weekDatesFrom(mondayOf(parseDate(currentDate()))); }
function weekDatesFrom(monday) { const d0 = typeof monday === "string" ? parseDate(monday) : new Date(monday); return Array.from({ length: 6 }, (_, i) => { const d = new Date(d0); d.setDate(d0.getDate() + i); return formatDate(d); }); }
function currentDate() { return app.els.scheduleDate.value || todayText(); }
function mondayText(dateText) { return formatDate(mondayOf(parseDate(dateText))); }
function mondayOf(date) { const d = new Date(date); d.setHours(0,0,0,0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d; }
function parseDate(text) { const [y,m,d] = text.split("-").map(Number); return new Date(y, m - 1, d); }
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function todayText() { return formatDate(new Date()); }
function shortDate(text) { const [,m,d] = text.split("-"); return `${m}/${d}`; }
function dayName(text) { return `星期${"日一二三四五六"[parseDate(text).getDay()]}`; }
function addOneHour(text) { const [h,m] = text.split(":").map(Number); return `${String(h+1).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function normalizeGroupId(id) { return id === "C" ? "D" : id; }
function groupById(id) { return GROUPS.find(g => g.id === normalizeGroupId(id)) || GROUPS[0]; }
function mod(v,d) { return ((v % d) + d) % d; }
function shuffle(items) { const a = [...items]; for (let i=a.length-1;i>0;i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function cryptoId() { if (crypto.randomUUID) return crypto.randomUUID(); return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function setMessage(text, isError=false) { app.els.messageBox.textContent = text || ""; app.els.messageBox.style.color = isError ? "#d92d20" : "#172554"; }
function escapeHtml(v) { return String(v).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function escapeCsv(v) { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; }
