const STORE_KEY = "pawnshop-scheduling-v2";
const OLD_STORE_KEY = "pawnshop-scheduling-v1";

const GROUPS = [
  { id: "A", name: "A組", start: "09:00", end: "13:00", hours: ["09:00", "10:00", "11:00", "12:00"] },
  { id: "B", name: "B組", start: "13:00", end: "17:00", hours: ["13:00", "14:00", "15:00", "16:00"] },
  { id: "D", name: "D組", start: "17:00", end: "21:00", hours: ["17:00", "18:00", "19:00", "20:00"] }
];

const DAYS = ["一", "二", "三", "四", "五", "六"];
const ALL_HOURS = GROUPS.flatMap(g => g.hours);

const State = Object.freeze({
  Idle: "Idle",
  ManagingPeople: "ManagingPeople",
  GeneratingSchedule: "GeneratingSchedule",
  ViewingSchedule: "ViewingSchedule",
  Error: "Error"
});

const app = {
  state: State.Idle,
  data: loadData(),
  filterGroup: "ALL",
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
    filterButtons: [...document.querySelectorAll(".filter-btn")]
  };

  app.els.scheduleDate.value = todayText();

  app.els.personForm.addEventListener("submit", onAddPerson);
  app.els.generateButton.addEventListener("click", onGenerateWeekSchedule);
  app.els.copyButton.addEventListener("click", onCopySchedule);
  app.els.exportButton.addEventListener("click", onExportCsv);
  app.els.clearScheduleButton.addEventListener("click", onClearWeekSchedule);
  app.els.prevWeekButton.addEventListener("click", () => moveWeek(-7));
  app.els.nextWeekButton.addEventListener("click", () => moveWeek(7));
  app.els.seedButton.addEventListener("click", onSeedPeople);
  app.els.clearPeopleButton.addEventListener("click", onClearPeople);
  app.els.scheduleDate.addEventListener("change", () => app.transition(State.ViewingSchedule));
  app.els.filterButtons.forEach(btn => btn.addEventListener("click", () => {
    app.filterGroup = btn.dataset.filter;
    app.transition(State.ViewingSchedule);
  }));

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
  if (!name) {
    app.transition(State.Error, "請輸入人員姓名。");
    return;
  }

  const exists = app.data.people.some(p => p.name === name && normalizeGroupId(p.groupId) === groupId && p.active);
  if (exists) {
    app.transition(State.Error, "同一組已有相同姓名的啟用人員。");
    return;
  }

  app.data.people.push({ id: cryptoId(), name, groupId, joinOrder: nextJoinOrder(), active: true });
  app.els.personName.value = "";
  saveData();
  setMessage("已新增人員。");
  app.transition(State.Idle);
}

function onGenerateWeekSchedule() {
  app.transition(State.GeneratingSchedule);
  try {
    weekDates().forEach(date => {
      app.data.schedules[date] = generateDaySchedule(date);
    });
    saveData();
    setMessage("已完成本週週一到週六排班。");
    app.transition(State.ViewingSchedule);
  } catch (err) {
    app.transition(State.Error, err.message);
  }
}

function generateDaySchedule(date) {
  const slots = [];
  for (const group of GROUPS) {
    const members = app.data.people
      .filter(p => normalizeGroupId(p.groupId) === group.id && p.active)
      .sort((a, b) => b.joinOrder - a.joinOrder);

    if (members.length === 0) throw new Error(`${group.name} 沒有啟用人員，無法排班。`);

    const used = new Set();
    group.hours.forEach((hour, index) => {
      const pool = members.length >= group.hours.length ? members.filter(p => !used.has(p.id)) : members.slice();
      const selected = weightedPick(pool.length ? pool : members);
      used.add(selected.id);
      slots.push({
        id: cryptoId(),
        date,
        hour,
        hourText: `${hour}～${addOneHour(hour)}`,
        groupId: group.id,
        groupName: group.name,
        personId: selected.id,
        personName: selected.name,
        order: index + 1
      });
    });
  }
  return slots;
}

function weightedPick(pool) {
  const newest = [...pool].sort((a, b) => b.joinOrder - a.joinOrder).slice(0, 3).map(p => p.id);
  const weightOf = person => {
    const rank = newest.indexOf(person.id);
    if (rank === 0) return 5;
    if (rank === 1) return 4;
    if (rank === 2) return 3;
    return 1;
  };
  const total = pool.reduce((sum, person) => sum + weightOf(person), 0);
  let roll = Math.random() * total;
  for (const person of pool) {
    roll -= weightOf(person);
    if (roll <= 0) return person;
  }
  return pool[pool.length - 1];
}

function onCopySchedule() {
  const slots = getWeekSlots();
  if (!slots.length) {
    setMessage("本週沒有排班可複製。", true);
    return;
  }
  navigator.clipboard.writeText(buildScheduleText(slots))
    .then(() => setMessage("已複製本週排班文字。"))
    .catch(() => setMessage("瀏覽器未允許複製，請手動選取表格內容。", true));
}

function onExportCsv() {
  const slots = getWeekSlots();
  if (!slots.length) {
    setMessage("本週沒有排班可下載。", true);
    return;
  }
  const rows = [["日期", "星期", "時段", "組別", "人員"]].concat(slots.map(s => [s.date, dayName(s.date), s.hourText, s.groupName, s.personName]));
  const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `當鋪週排班_${weekDates()[0]}_${weekDates()[5]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setMessage("已下載 CSV。");
}

function onClearWeekSchedule() {
  const dates = weekDates();
  const hasAny = dates.some(date => app.data.schedules[date]);
  if (!hasAny) {
    setMessage("本週沒有排班。", true);
    return;
  }
  dates.forEach(date => delete app.data.schedules[date]);
  saveData();
  setMessage("已清除本週排班。");
  app.transition(State.Idle);
}

function onSeedPeople() {
  app.transition(State.ManagingPeople);
  if (app.data.people.length > 0 && !confirm("會加入範例人員，不會清除原資料。是否繼續？")) {
    app.transition(State.Idle);
    return;
  }
  const names = {
    A: ["小明", "阿華", "小美", "大雄"],
    B: ["美玲", "雅婷", "家豪", "宗翰"],
    D: ["建宏", "佩君", "冠宇", "怡萱"]
  };
  Object.entries(names).forEach(([groupId, list]) => {
    list.forEach(name => app.data.people.push({ id: cryptoId(), name, groupId, joinOrder: nextJoinOrder(), active: true }));
  });
  saveData();
  setMessage("已建立範例人員。");
  app.transition(State.Idle);
}

function onClearPeople() {
  app.transition(State.ManagingPeople);
  if (!confirm("確定清除所有人員與所有排班資料？")) {
    app.transition(State.Idle);
    return;
  }
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
  if (!confirm(`確定刪除 ${person.name}？既有排班文字會保留。`)) return;
  app.data.people = app.data.people.filter(p => p.id !== id);
  saveData();
  setMessage("已刪除人員。");
  app.transition(State.Idle);
}

function moveWeek(days) {
  const date = parseDate(currentDate());
  date.setDate(date.getDate() + days);
  app.els.scheduleDate.value = formatDate(date);
  app.transition(State.ViewingSchedule);
}

function render() {
  app.els.stateLabel.textContent = app.state;
  renderFilterButtons();
  renderPeople();
  renderSchedule();
}

function renderFilterButtons() {
  app.els.filterButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.filter === app.filterGroup));
}

function renderPeople() {
  if (!app.data.people.length) {
    app.els.peopleList.innerHTML = `<div class="empty-box">尚未新增人員。</div>`;
    return;
  }
  const sorted = [...app.data.people].sort((a, b) => {
    const ga = normalizeGroupId(a.groupId);
    const gb = normalizeGroupId(b.groupId);
    if (ga !== gb) return ga.localeCompare(gb);
    return b.joinOrder - a.joinOrder;
  });
  app.els.peopleList.innerHTML = sorted.map(person => {
    const group = groupById(normalizeGroupId(person.groupId));
    return `
      <div class="person-row">
        <div>
          <div class="person-name">${escapeHtml(person.name)} ${person.active ? "" : "（停用）"}</div>
          <div class="person-meta">
            <span class="badge">${group.name}</span>
            <span>加入序：${person.joinOrder}</span>
            <span>${group.start}～${group.end}</span>
          </div>
        </div>
        <div class="row-actions">
          <button type="button" onclick="togglePerson('${person.id}')">${person.active ? "停用" : "啟用"}</button>
          <button type="button" class="danger-text" onclick="deletePerson('${person.id}')">刪除</button>
        </div>
      </div>`;
  }).join("");
}

function renderSchedule() {
  const dates = weekDates();
  app.els.weekLabel.textContent = `${dates[0].replaceAll("-", "/")} - ${dates[5].replaceAll("-", "/")}（週一至週六）`;
  const hasAny = dates.some(date => app.data.schedules[date] && app.data.schedules[date].length);
  if (!hasAny) {
    app.els.scheduleTable.innerHTML = `<div class="empty-box">本週尚未產生排班。</div>`;
    return;
  }

  const header = dates.map((date, index) => `<th><div class="day-head"><strong>${shortDate(date)}</strong><span>${DAYS[index]}</span></div></th>`).join("");
  const body = ALL_HOURS.map(hour => {
    const cells = dates.map(date => renderCell(date, hour)).join("");
    return `<tr><td>${hour}</td>${cells}</tr>`;
  }).join("");

  app.els.scheduleTable.innerHTML = `
    <table class="week-table">
      <thead><tr><th>成員 / 時段</th>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="schedule-note">目前查看：${filterLabel()}。只顯示站班每小時輪流排班。</div>`;
}

function renderCell(date, hour) {
  const slot = (app.data.schedules[date] || []).find(s => s.hour === hour);
  if (!slot) return `<td><span class="cell-empty">—</span></td>`;
  const groupId = normalizeGroupId(slot.groupId);
  if (app.filterGroup !== "ALL" && groupId !== app.filterGroup) return `<td><span class="cell-empty">—</span></td>`;
  return `<td><span class="cell-card group-${groupId}">${escapeHtml(slot.personName)}</span></td>`;
}

function getWeekSlots() {
  const dates = weekDates();
  return dates.flatMap(date => (app.data.schedules[date] || []).filter(slot => app.filterGroup === "ALL" || normalizeGroupId(slot.groupId) === app.filterGroup));
}

function buildScheduleText(slots) {
  const dates = weekDates();
  return [`當鋪週排班 ${dates[0]}～${dates[5]} ${filterLabel()}`]
    .concat(slots.map(s => `${s.date} ${dayName(s.date)} ${s.hourText} ${s.groupName}：${s.personName}`))
    .join("\n");
}

function filterLabel() {
  if (app.filterGroup === "ALL") return "所有人";
  return groupById(app.filterGroup).name;
}

function weekDates() {
  const monday = mondayOf(parseDate(currentDate()));
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDate(d);
  });
}

function currentDate() {
  return app.els.scheduleDate.value || todayText();
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function parseDate(text) {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayText() {
  return formatDate(new Date());
}

function shortDate(dateText) {
  const [, month, day] = dateText.split("-");
  return `${month}/${day}`;
}

function dayName(dateText) {
  const date = parseDate(dateText);
  const day = date.getDay();
  return `星期${"日一二三四五六"[day]}`;
}

function addOneHour(text) {
  const [h, m] = text.split(":").map(Number);
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nextJoinOrder() {
  return app.data.people.reduce((max, p) => Math.max(max, p.joinOrder || 0), 0) + 1;
}

function normalizeGroupId(id) {
  return id === "C" ? "D" : id;
}

function groupById(id) {
  return GROUPS.find(g => g.id === normalizeGroupId(id)) || GROUPS[0];
}

function setMessage(text, isError = false) {
  app.els.messageBox.textContent = text || "";
  app.els.messageBox.style.color = isError ? "#d92d20" : "#172554";
}

function saveData() {
  app.data.people.forEach(p => { p.groupId = normalizeGroupId(p.groupId); });
  localStorage.setItem(STORE_KEY, JSON.stringify(app.data));
}

function loadData() {
  const fallback = { people: [], schedules: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const people = Array.isArray(parsed.people) ? parsed.people.map(p => ({ ...p, groupId: normalizeGroupId(p.groupId) })) : [];
    const schedules = parsed.schedules && typeof parsed.schedules === "object" ? parsed.schedules : {};
    Object.values(schedules).forEach(slots => {
      if (Array.isArray(slots)) slots.forEach(slot => {
        slot.groupId = normalizeGroupId(slot.groupId);
        slot.groupName = groupById(slot.groupId).name;
      });
    });
    return { people, schedules };
  } catch {
    return fallback;
  }
}

function cryptoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
