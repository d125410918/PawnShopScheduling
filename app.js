const STORE_KEY = "pawnshop-scheduling-v1";

const GROUPS = [
  { id: "A", name: "A組", start: "09:00", end: "13:00", hours: ["09:00", "10:00", "11:00", "12:00"] },
  { id: "B", name: "B組", start: "13:00", end: "17:00", hours: ["13:00", "14:00", "15:00", "16:00"] },
  { id: "C", name: "C組", start: "17:00", end: "21:00", hours: ["17:00", "18:00", "19:00", "20:00"] }
];

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
    generateButton: document.getElementById("generateButton"),
    copyButton: document.getElementById("copyButton"),
    exportButton: document.getElementById("exportButton"),
    clearScheduleButton: document.getElementById("clearScheduleButton"),
    seedButton: document.getElementById("seedButton"),
    clearPeopleButton: document.getElementById("clearPeopleButton"),
    messageBox: document.getElementById("messageBox"),
    scheduleTable: document.getElementById("scheduleTable")
  };

  app.els.scheduleDate.value = todayText();

  app.els.personForm.addEventListener("submit", onAddPerson);
  app.els.generateButton.addEventListener("click", onGenerateSchedule);
  app.els.copyButton.addEventListener("click", onCopySchedule);
  app.els.exportButton.addEventListener("click", onExportCsv);
  app.els.clearScheduleButton.addEventListener("click", onClearSchedule);
  app.els.seedButton.addEventListener("click", onSeedPeople);
  app.els.clearPeopleButton.addEventListener("click", onClearPeople);
  app.els.scheduleDate.addEventListener("change", () => app.transition(State.ViewingSchedule));

  app.transition(State.Idle);
}

function enterState(state, payload) {
  if (state === State.Error) {
    setMessage(payload || "發生錯誤。", true);
  }
  if (state === State.GeneratingSchedule) {
    app.els.generateButton.disabled = true;
  }
}

function exitState(state) {
  if (state === State.GeneratingSchedule) {
    app.els.generateButton.disabled = false;
  }
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

  const exists = app.data.people.some(p => p.name === name && p.groupId === groupId && p.active);
  if (exists) {
    app.transition(State.Error, "同一組已有相同姓名的啟用人員。");
    return;
  }

  app.data.people.push({
    id: cryptoId(),
    name,
    groupId,
    joinOrder: nextJoinOrder(),
    active: true
  });

  app.els.personName.value = "";
  saveData();
  setMessage("已新增人員。");
  app.transition(State.Idle);
}

function onGenerateSchedule() {
  app.transition(State.GeneratingSchedule);
  const date = currentDate();

  try {
    const slots = [];
    for (const group of GROUPS) {
      const members = app.data.people
        .filter(p => p.groupId === group.id && p.active)
        .sort((a, b) => b.joinOrder - a.joinOrder);

      if (members.length === 0) {
        throw new Error(`${group.name} 沒有啟用人員，無法排班。`);
      }

      const used = new Set();
      group.hours.forEach((hour, index) => {
        const pool = members.length >= group.hours.length
          ? members.filter(p => !used.has(p.id))
          : members.slice();
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

    app.data.schedules[date] = slots;
    saveData();
    setMessage("已完成當日排班。");
    app.transition(State.ViewingSchedule);
  } catch (err) {
    app.transition(State.Error, err.message);
  }
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
  const slots = getCurrentSlots();
  if (!slots.length) {
    setMessage("目前日期沒有排班可複製。", true);
    return;
  }
  const text = buildScheduleText(slots);
  navigator.clipboard.writeText(text)
    .then(() => setMessage("已複製排班文字。"))
    .catch(() => setMessage("瀏覽器未允許複製，請手動選取表格內容。", true));
}

function onExportCsv() {
  const slots = getCurrentSlots();
  if (!slots.length) {
    setMessage("目前日期沒有排班可下載。", true);
    return;
  }
  const rows = [["日期", "時段", "組別", "人員"]].concat(slots.map(s => [s.date, s.hourText, s.groupName, s.personName]));
  const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `當鋪排班表_${currentDate()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setMessage("已下載 CSV。")
}

function onClearSchedule() {
  const date = currentDate();
  if (!app.data.schedules[date]) {
    setMessage("目前日期沒有排班。", true);
    return;
  }
  delete app.data.schedules[date];
  saveData();
  setMessage("已清除當日排班。");
  app.transition(State.Idle);
}

function onSeedPeople() {
  app.transition(State.ManagingPeople);
  if (app.data.people.length > 0 && !confirm("會加入範例人員，不會清除原資料。是否繼續？")) {
    app.transition(State.Idle);
    return;
  }
  const names = {
    A: ["阿仁", "小林", "志明", "阿凱"],
    B: ["美玲", "雅婷", "家豪", "宗翰"],
    C: ["建宏", "佩君", "冠宇", "怡萱"]
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

function render() {
  app.els.stateLabel.textContent = app.state;
  renderPeople();
  renderSchedule();
}

function renderPeople() {
  if (!app.data.people.length) {
    app.els.peopleList.innerHTML = `<div class="empty-box">尚未新增人員。</div>`;
    return;
  }

  const sorted = [...app.data.people].sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    return b.joinOrder - a.joinOrder;
  });

  app.els.peopleList.innerHTML = sorted.map(person => {
    const group = GROUPS.find(g => g.id === person.groupId);
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
  const slots = getCurrentSlots();
  if (!slots.length) {
    app.els.scheduleTable.innerHTML = `<div class="empty-box">目前日期尚未產生排班。</div>`;
    return;
  }

  app.els.scheduleTable.innerHTML = `
    <table>
      <thead>
        <tr><th>日期</th><th>時段</th><th>組別</th><th>排班人員</th></tr>
      </thead>
      <tbody>
        ${slots.map(slot => `
          <tr>
            <td>${slot.date}</td>
            <td>${slot.hourText}</td>
            <td class="group-cell">${slot.groupName}</td>
            <td>${escapeHtml(slot.personName)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function getCurrentSlots() {
  return app.data.schedules[currentDate()] || [];
}

function buildScheduleText(slots) {
  return [`當鋪排班表 ${currentDate()}`]
    .concat(slots.map(s => `${s.hourText} ${s.groupName}：${s.personName}`))
    .join("\n");
}

function currentDate() {
  return app.els.scheduleDate.value || todayText();
}

function todayText() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addOneHour(text) {
  const [h, m] = text.split(":").map(Number);
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nextJoinOrder() {
  return app.data.people.reduce((max, p) => Math.max(max, p.joinOrder || 0), 0) + 1;
}

function setMessage(text, isError = false) {
  app.els.messageBox.textContent = text || "";
  app.els.messageBox.style.color = isError ? "#9d2f2f" : "#5e3c20";
}

function saveData() {
  localStorage.setItem(STORE_KEY, JSON.stringify(app.data));
}

function loadData() {
  const fallback = { people: [], schedules: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      people: Array.isArray(parsed.people) ? parsed.people : [],
      schedules: parsed.schedules && typeof parsed.schedules === "object" ? parsed.schedules : {}
    };
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
