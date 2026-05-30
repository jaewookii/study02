const STORAGE_KEY = 'my-tasks';
const FILTER_KEY  = 'my-tasks-filter';

const CATEGORIES = {
  work:     { label: '업무' },
  personal: { label: '개인' },
  study:    { label: '공부' },
};

const taskInput      = document.getElementById('taskInput');
const categorySelect = document.getElementById('categorySelect');
const addBtn         = document.getElementById('addBtn');
const taskList       = document.getElementById('taskList');
const emptyMsg       = document.getElementById('emptyMsg');
const filterRow      = document.getElementById('filterRow');

// ── 저장/불러오기 ──────────────────────────────────────────

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadFilter() {
  return localStorage.getItem(FILTER_KEY) || 'all';
}

function saveFilter(filter) {
  localStorage.setItem(FILTER_KEY, filter);
}

// ── 유틸 ───────────────────────────────────────────────────

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
  if (diff < 60)   return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// ── 렌더링 ─────────────────────────────────────────────────

function renderTasks() {
  const allTasks    = loadTasks();
  const activeFilter = loadFilter();

  const filtered = activeFilter === 'all'
    ? allTasks
    : allTasks.filter((t) => t.category === activeFilter);

  // 미완료 → 완료 순 정렬 (같은 그룹 내에서는 생성 시간 최신 순)
  const pending   = filtered.filter((t) => !t.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const completed = filtered.filter((t) =>  t.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  taskList.innerHTML = '';

  if (filtered.length === 0) {
    emptyMsg.classList.add('visible');
    return;
  }
  emptyMsg.classList.remove('visible');

  pending.forEach((task) => taskList.appendChild(buildItem(task)));

  if (completed.length > 0) {
    const divider = document.createElement('li');
    divider.className = 'completed-divider';
    divider.textContent = `완료 ${completed.length}개`;
    taskList.appendChild(divider);
    completed.forEach((task) => taskList.appendChild(buildItem(task)));
  }
}

function buildItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.completed ? ' completed' : '');
  li.dataset.id = task.id;
  li.dataset.category = task.category || 'work';

  // 체크박스
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.addEventListener('change', () => toggleTask(task.id));

  // 본문 묶음
  const body = document.createElement('div');
  body.className = 'task-body';

  const top = document.createElement('div');
  top.className = 'task-top';

  const span = document.createElement('span');
  span.className = 'task-text';
  span.textContent = task.text;

  const catInfo = CATEGORIES[task.category] || CATEGORIES.work;
  const tag = document.createElement('span');
  tag.className = `category-tag ${task.category || 'work'}`;
  tag.textContent = catInfo.label;

  top.append(span, tag);

  const timeLine = document.createElement('span');
  timeLine.className = 'task-time';
  timeLine.textContent = relativeTime(task.createdAt);

  body.append(top, timeLine);

  // 삭제 버튼
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = '삭제';
  deleteBtn.addEventListener('click', () => deleteTask(task.id));

  li.append(checkbox, body, deleteBtn);
  return li;
}

// ── 필터 버튼 ──────────────────────────────────────────────

function syncFilterButtons(activeFilter) {
  filterRow.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === activeFilter);
  });
}

filterRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  const filter = btn.dataset.filter;
  saveFilter(filter);
  syncFilterButtons(filter);
  renderTasks();
});

// ── CRUD ───────────────────────────────────────────────────

function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;

  const tasks = loadTasks();
  tasks.push(createTask(text, categorySelect.value));
  saveTasks(tasks);

  taskInput.value = '';
  taskInput.focus();
  renderTasks();
}

function toggleTask(id) {
  const tasks = loadTasks().map((t) =>
    t.id === id ? { ...t, completed: !t.completed } : t
  );
  saveTasks(tasks);
  renderTasks();
}

function deleteTask(id) {
  const tasks = loadTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
  renderTasks();
}

// ── 이벤트 ─────────────────────────────────────────────────

addBtn.addEventListener('click', addTask);

taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

// ── 초기화 ─────────────────────────────────────────────────

const initialFilter = loadFilter();
syncFilterButtons(initialFilter);
renderTasks();
