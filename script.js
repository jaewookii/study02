const STORAGE_KEY = 'my-tasks';
const FILTER_KEY  = 'my-tasks-filter';
const THEME_KEY   = 'my-tasks-theme';

const CATEGORIES = {
  work:     { label: '업무' },
  personal: { label: '개인' },
  study:    { label: '공부' },
};

// ── DOM refs ──────────────────────────────────────────────────
const taskInput         = document.getElementById('taskInput');
const categorySelect    = document.getElementById('categorySelect');
const addBtn            = document.getElementById('addBtn');
const taskList          = document.getElementById('taskList');
const emptyMsg          = document.getElementById('emptyMsg');
const filterRow         = document.getElementById('filterRow');
const progressBar       = document.getElementById('progressBar');
const dashText          = document.getElementById('dashText');
const dashToday         = document.getElementById('dashToday');
const dashCats          = document.getElementById('dashCats');
const themeToggle       = document.getElementById('themeToggle');
const themeIcon         = document.querySelector('.theme-icon');
const searchInput       = document.getElementById('searchInput');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const remainingBadge    = document.getElementById('remainingBadge');

const pendingEnterIds = new Set();
let searchQuery = '';

// ── Storage ───────────────────────────────────────────────────

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadFilter() { return localStorage.getItem(FILTER_KEY) || 'all'; }
function saveFilter(f) { localStorage.setItem(FILTER_KEY, f); }

function loadTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
function saveTheme(t) { localStorage.setItem(THEME_KEY, t); }

// ── Theme ─────────────────────────────────────────────────────

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  themeIcon.textContent = isDark ? '☀️' : '🌙';
  themeToggle.title = (isDark ? '라이트 모드' : '다크 모드') + ' (Alt+D)';
}

function toggleTheme() {
  const next = loadTheme() === 'dark' ? 'light' : 'dark';
  saveTheme(next);
  applyTheme(next);
}

// ── Utils ─────────────────────────────────────────────────────

function createTask(text, category) {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    completed: false,
    category,
    createdAt: new Date().toISOString(),
  };
}

function relativeTime(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function isToday(isoString) {
  const d = new Date(isoString), n = new Date();
  return d.getFullYear() === n.getFullYear() &&
         d.getMonth()    === n.getMonth()    &&
         d.getDate()     === n.getDate();
}

// ── Dashboard ─────────────────────────────────────────────────

function renderDashboard() {
  const tasks   = loadTasks();
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = total - done;
  const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

  dashText.textContent    = `${done}/${total} 완료 (${pct}%)`;
  progressBar.style.width = `${pct}%`;
  remainingBadge.textContent = `${pending}개 남음`;

  const todayCount = tasks.filter(t => isToday(t.createdAt)).length;
  dashToday.textContent = `오늘 추가 ${todayCount}개`;

  clearCompletedBtn.style.display = done > 0 ? 'block' : 'none';

  dashCats.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, { label }]) => {
    const catTasks = tasks.filter(t => t.category === key);
    const catTotal = catTasks.length;
    const catDone  = catTasks.filter(t => t.completed).length;
    const catPct   = catTotal === 0 ? 0 : Math.round((catDone / catTotal) * 100);

    const div = document.createElement('div');
    div.className = 'dash-cat';
    div.innerHTML = `
      <div class="dash-cat-header">
        <span class="dash-cat-dot ${key}"></span>
        <span class="dash-cat-label">${label}</span>
        <span class="dash-cat-count">${catDone}/${catTotal}</span>
      </div>
      <div class="progress-track small">
        <div class="progress-bar ${key}" style="width:${catPct}%"></div>
      </div>
    `;
    dashCats.appendChild(div);
  });
}

// ── Task List ─────────────────────────────────────────────────

function renderTasks() {
  const allTasks     = loadTasks();
  const activeFilter = loadFilter();
  const q            = searchQuery.trim().toLowerCase();

  let filtered = activeFilter === 'all'
    ? allTasks
    : allTasks.filter(t => t.category === activeFilter);

  if (q) filtered = filtered.filter(t => t.text.toLowerCase().includes(q));

  const byDate    = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const pending   = filtered.filter(t => !t.completed).sort(byDate);
  const completed = filtered.filter(t =>  t.completed).sort(byDate);

  taskList.innerHTML = '';

  if (filtered.length === 0) {
    emptyMsg.classList.add('visible');
    // Differentiate "empty because of filter/search" vs "truly empty"
    emptyMsg.innerHTML = (q || activeFilter !== 'all')
      ? '검색 결과가 없습니다.'
      : '할 일이 없습니다.<br>새 할 일을 추가해보세요!';
  } else {
    emptyMsg.classList.remove('visible');
    pending.forEach(task => taskList.appendChild(buildItem(task)));

    if (completed.length > 0) {
      const divider = document.createElement('li');
      divider.className = 'completed-divider';
      divider.textContent = `완료 ${completed.length}개`;
      taskList.appendChild(divider);
      completed.forEach(task => taskList.appendChild(buildItem(task)));
    }
  }

  if (pendingEnterIds.size > 0) {
    pendingEnterIds.forEach(id => {
      const el = taskList.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.add('task-enter');
    });
    pendingEnterIds.clear();
  }
}

function buildItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.completed ? ' completed' : '');
  li.dataset.id = task.id;
  li.dataset.category = task.category || 'work';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.addEventListener('change', () => toggleTask(task.id));

  const body = document.createElement('div');
  body.className = 'task-body';

  const top = document.createElement('div');
  top.className = 'task-top';

  const span = document.createElement('span');
  span.className = 'task-text';
  span.textContent = task.text;
  span.title = '더블클릭하여 수정';
  span.addEventListener('dblclick', () => enterEditMode(task.id, li));

  const catInfo = CATEGORIES[task.category] || CATEGORIES.work;
  const tag = document.createElement('span');
  tag.className = `category-tag ${task.category || 'work'}`;
  tag.textContent = catInfo.label;

  top.append(span, tag);

  const timeLine = document.createElement('span');
  timeLine.className = 'task-time';
  timeLine.textContent = relativeTime(task.createdAt);

  body.append(top, timeLine);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = '삭제';
  deleteBtn.addEventListener('click', () => deleteTask(task.id));

  li.append(checkbox, body, deleteBtn);
  return li;
}

// ── Inline Edit ───────────────────────────────────────────────

function enterEditMode(id, li) {
  if (li.classList.contains('editing')) return;
  const task = loadTasks().find(t => t.id === id);
  if (!task) return;

  li.classList.add('editing');
  const body = li.querySelector('.task-body');
  body.innerHTML = '';

  const editRow = document.createElement('div');
  editRow.className = 'edit-row';

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'edit-input';
  editInput.value = task.text;
  editInput.maxLength = 200;

  const editSelect = document.createElement('select');
  editSelect.className = 'edit-category-select';
  Object.entries(CATEGORIES).forEach(([key, { label }]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    if (key === task.category) opt.selected = true;
    editSelect.appendChild(opt);
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-save-btn';
  saveBtn.textContent = '✓';
  saveBtn.title = '저장 (Enter)';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = '✕';
  cancelBtn.title = '취소 (ESC)';

  editRow.append(editInput, editSelect, saveBtn, cancelBtn);
  body.appendChild(editRow);
  editInput.focus();
  editInput.select();

  function save() {
    const newText = editInput.value.trim();
    if (!newText) { editInput.focus(); return; }
    updateTask(id, newText, editSelect.value);
  }

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', render);
  editInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  save();
    if (e.key === 'Escape') render();
  });
}

function updateTask(id, newText, newCategory) {
  const tasks = loadTasks().map(t =>
    t.id === id ? { ...t, text: newText, category: newCategory } : t
  );
  saveTasks(tasks);
  render();
}

// ── Clear Completed ───────────────────────────────────────────

function clearCompleted() {
  const tasks = loadTasks();
  const count = tasks.filter(t => t.completed).length;
  if (count === 0) return;
  if (!confirm(`완료된 항목 ${count}개를 모두 삭제할까요?`)) return;
  saveTasks(tasks.filter(t => !t.completed));
  render();
}

// ── Filter ────────────────────────────────────────────────────

function syncFilterButtons(activeFilter) {
  filterRow.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === activeFilter);
  });
}

function setFilter(filter) {
  saveFilter(filter);
  syncFilterButtons(filter);
  renderTasks();
}

filterRow.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  setFilter(btn.dataset.filter);
});

// ── CRUD with animation ───────────────────────────────────────

function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;

  const task  = createTask(text, categorySelect.value);
  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);

  pendingEnterIds.add(task.id);
  taskInput.value = '';
  taskInput.focus();
  render();
}

function toggleTask(id) {
  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (li) {
    li.style.transition    = 'opacity 0.25s ease, transform 0.25s ease';
    li.style.opacity       = '0';
    li.style.transform     = 'translateY(6px)';
    li.style.pointerEvents = 'none';
    const cb = li.querySelector('.task-checkbox');
    if (cb) cb.disabled = true;
  }
  pendingEnterIds.add(id);
  setTimeout(() => {
    const tasks = loadTasks().map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    saveTasks(tasks);
    render();
  }, 260);
}

function deleteTask(id) {
  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (li) {
    li.style.transition    = 'opacity 0.22s ease, transform 0.22s ease';
    li.style.opacity       = '0';
    li.style.transform     = 'translateX(16px)';
    li.style.pointerEvents = 'none';
  }
  setTimeout(() => {
    saveTasks(loadTasks().filter(t => t.id !== id));
    render();
  }, 240);
}

// ── Render ────────────────────────────────────────────────────

function render() {
  renderTasks();
  renderDashboard();
}

// ── Events ────────────────────────────────────────────────────

addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

themeToggle.addEventListener('click', toggleTheme);
clearCompletedBtn.addEventListener('click', clearCompleted);

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value;
  renderTasks();
});

// 키보드 단축키
document.addEventListener('keydown', e => {
  if (!e.altKey) return;

  // 편집 중인 input에서는 단축키 무시
  const active = document.activeElement;
  if (active && (active.classList.contains('edit-input') ||
                 active.classList.contains('edit-category-select'))) return;

  switch (e.key) {
    case 'n': case 'N':
      e.preventDefault();
      taskInput.focus();
      taskInput.select();
      break;
    case '1':
      e.preventDefault();
      setFilter('all');
      break;
    case '2':
      e.preventDefault();
      setFilter('work');
      break;
    case '3':
      e.preventDefault();
      setFilter('personal');
      break;
    case '4':
      e.preventDefault();
      setFilter('study');
      break;
    case 'd': case 'D':
      e.preventDefault();
      toggleTheme();
      break;
  }
});

// ── Init ──────────────────────────────────────────────────────

applyTheme(loadTheme());
syncFilterButtons(loadFilter());
render();
