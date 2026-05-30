/**
 * My Tasks — script.js
 * 할 일 관리 앱의 모든 로직을 담당합니다.
 *
 * 주요 기능:
 *  - CRUD (추가/수정/삭제/완료 토글)
 *  - 카테고리 필터 + 정렬 (최신순·오래된순·카테고리순·수동 정렬)
 *  - 드래그 앤 드롭 (수동 정렬 모드)
 *  - 다크/라이트 모드
 *  - 실시간 검색 (디바운싱 적용)
 *  - JSON 내보내기 / 가져오기
 *  - 삭제 Undo (토스트 5초)
 *  - 중복 할 일 경고
 *  - 진행률 대시보드 (응원 메시지 + 오늘의 격언)
 *  - 접근성 (ARIA 레이블, 스크린 리더 알림)
 *  - 키보드 단축키 (Alt+N/1~4/D/E/I)
 */

// ════════════════════════════════════════════════
// 상수
// ════════════════════════════════════════════════

const STORAGE_KEY = 'my-tasks';
const FILTER_KEY  = 'my-tasks-filter';
const THEME_KEY   = 'my-tasks-theme';
const SORT_KEY    = 'my-tasks-sort';

/** 카테고리 메타데이터 */
const CATEGORIES = {
  work:     { label: '업무' },
  personal: { label: '개인' },
  study:    { label: '공부' },
};

/** 오늘의 격언 목록 — 날짜 기반으로 하루 한 개 표시 */
const QUOTES = [
  { text: '시작이 반이다.',                                       author: '한국 속담' },
  { text: '천 리 길도 한 걸음부터.',                             author: '노자' },
  { text: '오늘 할 수 있는 일을 내일로 미루지 마라.',            author: '벤저민 프랭클린' },
  { text: '작은 일에도 최선을 다하면 큰 일도 이룰 수 있다.',    author: '공자' },
  { text: '성공은 매일 반복되는 노력의 합이다.',                 author: '로버트 콜리어' },
  { text: '포기하지 않는 것이 성공의 비결이다.',                 author: '윈스턴 처칠' },
  { text: '지금 이 순간에 집중하라.',                            author: '붓다' },
  { text: '작은 진전도 진전이다.',                               author: '작자미상' },
  { text: '꿈을 향해 걷는 사람은 절대 지지 않는다.',            author: '작자미상' },
  { text: '노력은 배신하지 않는다.',                             author: '작자미상' },
  { text: '오늘의 나는 어제의 내가 만든 것이다.',                author: '작자미상' },
  { text: '완벽함보다 완료가 낫다.',                             author: '리드 호프먼' },
  { text: '행동이 두려움을 없앤다.',                             author: '작자미상' },
  { text: '집중이 곧 능력이다.',                                 author: '작자미상' },
];

// ════════════════════════════════════════════════
// DOM 참조
// ════════════════════════════════════════════════

const taskInput         = document.getElementById('taskInput');
const categorySelect    = document.getElementById('categorySelect');
const addBtn            = document.getElementById('addBtn');
const taskList          = document.getElementById('taskList');
const emptyMsg          = document.getElementById('emptyMsg');
const filterRow         = document.getElementById('filterRow');
const progressBar       = document.getElementById('progressBar');
const progressTrack     = document.getElementById('progressTrack');
const dashText          = document.getElementById('dashText');
const dashToday         = document.getElementById('dashToday');
const dashCats          = document.getElementById('dashCats');
const encourageMsg      = document.getElementById('encourageMsg');
const quoteBox          = document.getElementById('quoteBox');
const themeToggle       = document.getElementById('themeToggle');
const themeIcon         = document.querySelector('.theme-icon');
const searchInput       = document.getElementById('searchInput');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const remainingBadge    = document.getElementById('remainingBadge');
const sortSelect        = document.getElementById('sortSelect');
const exportBtn         = document.getElementById('exportBtn');
const importBtn         = document.getElementById('importBtn');
const importFile        = document.getElementById('importFile');
const toastEl           = document.getElementById('toast');
const srAnnounce        = document.getElementById('srAnnounce');

// ════════════════════════════════════════════════
// 앱 상태
// ════════════════════════════════════════════════

/** 인메모리 캐시 — localStorage JSON.parse 반복 호출 방지 */
let taskCache = null;

/** 현재 검색어 (디바운싱 처리됨) */
let searchQuery = '';

/** 다음 render에서 진입 애니메이션을 적용할 task id 집합 */
const pendingEnterIds = new Set();

/** 드래그 중인 task id */
let dragSrcId = null;

/** 삭제 Undo 상태 — { tasks: Task[] } 스냅샷 저장 */
let undoState = null;

/** 토스트 자동 숨김 타이머 id */
let toastTimer = null;

// ════════════════════════════════════════════════
// 유틸리티
// ════════════════════════════════════════════════

/**
 * 함수 호출을 지연시키는 디바운서.
 * @param {Function} fn - 실행할 함수
 * @param {number}   ms - 지연 시간(ms)
 */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * ISO 날짜 문자열을 "N분 전" 형태로 변환합니다.
 * @param {string} isoString
 * @returns {string}
 */
function relativeTime(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

/**
 * ISO 날짜 문자열이 오늘인지 확인합니다.
 * @param {string} isoString
 * @returns {boolean}
 */
function isToday(isoString) {
  const d = new Date(isoString), n = new Date();
  return d.getFullYear() === n.getFullYear() &&
         d.getMonth()    === n.getMonth()    &&
         d.getDate()     === n.getDate();
}

/**
 * 완료율에 따른 응원 메시지를 반환합니다.
 * @param {number} pct   - 완료 퍼센트 (0~100)
 * @param {number} total - 전체 할 일 수
 * @returns {string}
 */
function getEncouragement(pct, total) {
  if (total === 0) return '할 일을 추가해서 오늘을 시작해보세요! ✏️';
  if (pct === 100) return '🎉 모든 할 일 완료! 오늘 하루도 훌륭했어요!';
  if (pct >= 80)   return '거의 다 왔어요! 마지막 스퍼트! 💪';
  if (pct >= 60)   return '절반 이상 완료! 훌륭한 페이스예요 👍';
  if (pct >= 40)   return '잘 하고 있어요! 계속 나아가세요 🚀';
  if (pct >= 20)   return '좋은 시작이에요! 할 수 있어요 ✨';
  return '오늘도 화이팅! 첫 완료를 목표로 해봐요 🌟';
}

/**
 * 날짜 기반 오늘의 격언을 반환합니다 (하루 단위 고정).
 * @returns {{ text: string, author: string }}
 */
function getDailyQuote() {
  const dayIdx = Math.floor(Date.now() / 86400000) % QUOTES.length;
  return QUOTES[dayIdx];
}

/**
 * 스크린 리더에 메시지를 알립니다 (시각적으로는 숨김).
 * @param {string} msg
 */
function announce(msg) {
  srAnnounce.textContent = '';
  // requestAnimationFrame으로 이전 내용 초기화 후 새 메시지 설정
  requestAnimationFrame(() => { srAnnounce.textContent = msg; });
}

// ════════════════════════════════════════════════
// localStorage 읽기/쓰기
// ════════════════════════════════════════════════

/**
 * 할 일 목록을 불러옵니다. 캐시가 있으면 캐시를 반환합니다.
 * 기존 데이터에 order 필드가 없으면 인덱스 기반으로 초기화합니다.
 * @returns {Task[]}
 */
function loadTasks() {
  if (taskCache !== null) return taskCache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    // order 필드 없는 구형 데이터 정규화
    taskCache = raw.map((t, i) => ({
      ...t,
      order: t.order !== undefined ? t.order : i * 10,
    }));
  } catch {
    taskCache = [];
  }
  return taskCache;
}

/**
 * 할 일 목록을 저장합니다. 캐시도 함께 업데이트합니다.
 * localStorage 용량 부족 시 에러 알림을 표시합니다.
 * @param {Task[]} tasks
 */
function saveTasks(tasks) {
  taskCache = tasks;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    // QuotaExceededError 등 저장 실패 처리
    showToast('저장 공간이 부족합니다. 일부 항목을 삭제해보세요.', 'error');
  }
}

function loadFilter() { return localStorage.getItem(FILTER_KEY) || 'all'; }
function saveFilter(f) { localStorage.setItem(FILTER_KEY, f); }

function loadTheme()  { return localStorage.getItem(THEME_KEY) || 'light'; }
function saveTheme(t) { localStorage.setItem(THEME_KEY, t); }

function loadSort()   { return localStorage.getItem(SORT_KEY) || 'newest'; }
function saveSort(s)  { localStorage.setItem(SORT_KEY, s); }

// ════════════════════════════════════════════════
// 테마 (다크/라이트)
// ════════════════════════════════════════════════

/**
 * 테마를 적용합니다.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  themeIcon.textContent = isDark ? '☀️' : '🌙';
  themeToggle.title = (isDark ? '라이트 모드' : '다크 모드') + ' (Alt+D)';
  themeToggle.setAttribute('aria-label', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
}

function toggleTheme() {
  const next = loadTheme() === 'dark' ? 'light' : 'dark';
  saveTheme(next);
  applyTheme(next);
}

// ════════════════════════════════════════════════
// 토스트 알림
// ════════════════════════════════════════════════

/**
 * 화면 하단에 토스트 알림을 표시합니다.
 * @param {string}   message  - 표시할 메시지
 * @param {'info'|'warning'|'error'|'success'} [type='info']
 * @param {Function} [undoFn] - 되돌리기 버튼 콜백 (있으면 버튼 표시)
 * @param {number}   [duration] - 자동 숨김 지연(ms), 기본 3000 / undo 있으면 5000
 */
function showToast(message, type = 'info', undoFn = null, duration) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = '';

  const text = document.createElement('span');
  text.textContent = message;
  toastEl.appendChild(text);

  if (undoFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo-btn';
    btn.textContent = '되돌리기';
    btn.addEventListener('click', () => {
      undoFn();
      hideToast();
    });
    toastEl.appendChild(btn);
  }

  toastEl.className = `toast visible ${type}`;

  const delay = duration ?? (undoFn ? 5000 : 3000);
  toastTimer = setTimeout(hideToast, delay);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('visible');
}

// ════════════════════════════════════════════════
// 정렬
// ════════════════════════════════════════════════

/**
 * 선택된 정렬 기준에 따라 할 일 배열을 정렬합니다.
 * 완료/미완료 분리는 renderTasks에서 처리하므로, 여기서는 전체 정렬만 담당합니다.
 * @param {Task[]} tasks
 * @returns {Task[]}
 */
function sortTasks(tasks) {
  const mode = loadSort();
  const copy = [...tasks];
  const CAT_ORDER = { work: 0, personal: 1, study: 2 };

  switch (mode) {
    case 'newest':
      return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'oldest':
      return copy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'category':
      return copy.sort((a, b) =>
        (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9) ||
        new Date(b.createdAt) - new Date(a.createdAt) // 같은 카테고리면 최신순
      );
    case 'manual':
      return copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    default:
      return copy;
  }
}

// ════════════════════════════════════════════════
// 대시보드 렌더링
// ════════════════════════════════════════════════

function renderDashboard() {
  const tasks   = loadTasks();
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = total - done;
  const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

  // 전체 진행률 텍스트 + 프로그레스 바
  dashText.textContent    = `${done}/${total} 완료 (${pct}%)`;
  progressBar.style.width = `${pct}%`;

  // ARIA 접근성 — 프로그레스바 현재값 업데이트
  progressTrack.setAttribute('aria-valuenow', pct);
  progressTrack.setAttribute('aria-label', `전체 진행률 ${pct}%`);

  // 남은 할 일 배지
  remainingBadge.textContent = `${pending}개 남음`;

  // 오늘 추가 개수
  const todayCount = tasks.filter(t => isToday(t.createdAt)).length;
  dashToday.textContent = `오늘 추가 ${todayCount}개`;

  // 완료 삭제 버튼 표시 여부
  clearCompletedBtn.style.display = done > 0 ? 'block' : 'none';

  // 응원 메시지
  encourageMsg.textContent = getEncouragement(pct, total);

  // 카테고리별 미니 진행률 바
  dashCats.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, { label }]) => {
    const catTasks = tasks.filter(t => t.category === key);
    const catTotal = catTasks.length;
    const catDone  = catTasks.filter(t => t.completed).length;
    const catPct   = catTotal === 0 ? 0 : Math.round((catDone / catTotal) * 100);

    const div = document.createElement('div');
    div.className = 'dash-cat';
    // innerHTML 사용이 안전한 이유: label은 상수, catDone/catTotal/catPct는 숫자
    div.innerHTML = `
      <div class="dash-cat-header">
        <span class="dash-cat-dot ${key}" aria-hidden="true"></span>
        <span class="dash-cat-label">${label}</span>
        <span class="dash-cat-count" aria-label="${label} ${catDone}/${catTotal}">${catDone}/${catTotal}</span>
      </div>
      <div class="progress-track small" role="progressbar"
           aria-valuenow="${catPct}" aria-valuemin="0" aria-valuemax="100"
           aria-label="${label} 진행률 ${catPct}%">
        <div class="progress-bar ${key}" style="width:${catPct}%"></div>
      </div>
    `;
    dashCats.appendChild(div);
  });

  // 오늘의 격언
  const quote = getDailyQuote();
  quoteBox.innerHTML = `
    <p class="quote-text">"${quote.text}"</p>
    <p class="quote-author">— ${quote.author}</p>
  `;
  quoteBox.classList.add('visible');
}

// ════════════════════════════════════════════════
// 할 일 목록 렌더링
// ════════════════════════════════════════════════

/**
 * 필터·검색·정렬 결과를 반영해 목록을 다시 그립니다.
 * DocumentFragment를 사용해 DOM 조작을 최소화합니다.
 */
function renderTasks() {
  const allTasks     = loadTasks();
  const activeFilter = loadFilter();
  const q            = searchQuery.trim().toLowerCase();
  const isManual     = loadSort() === 'manual';

  // 1) 카테고리 필터
  let filtered = activeFilter === 'all'
    ? allTasks
    : allTasks.filter(t => t.category === activeFilter);

  // 2) 검색 필터
  if (q) filtered = filtered.filter(t => t.text.toLowerCase().includes(q));

  // 3) 정렬
  const sorted    = sortTasks(filtered);
  const pending   = sorted.filter(t => !t.completed);
  const completed = sorted.filter(t =>  t.completed);

  // 4) 렌더링
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    emptyMsg.classList.add('visible');
    // 필터/검색으로 인한 빈 상태와 진짜 빈 상태 구분
    emptyMsg.innerHTML = (q || activeFilter !== 'all')
      ? '검색 결과가 없습니다. 🔍'
      : '할 일이 없습니다.<br>추가 버튼으로 시작해보세요! ✏️';
  } else {
    emptyMsg.classList.remove('visible');

    const frag = document.createDocumentFragment();

    // 미완료 항목
    pending.forEach(task => frag.appendChild(buildItem(task, isManual)));

    // 완료 항목 구분선
    if (completed.length > 0) {
      const divider = document.createElement('li');
      divider.className = 'completed-divider';
      divider.textContent = `완료 ${completed.length}개`;
      divider.setAttribute('aria-hidden', 'true');
      frag.appendChild(divider);
      completed.forEach(task => frag.appendChild(buildItem(task, isManual)));
    }

    taskList.appendChild(frag);
  }

  // 5) 진입 애니메이션 적용
  if (pendingEnterIds.size > 0) {
    pendingEnterIds.forEach(id => {
      const el = taskList.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.add('task-enter');
    });
    pendingEnterIds.clear();
  }
}

/**
 * 단일 할 일 항목 li 요소를 생성합니다.
 * @param {Task}    task     - 할 일 데이터
 * @param {boolean} isManual - 수동 정렬 모드 여부 (드래그 핸들 표시)
 * @returns {HTMLLIElement}
 */
function buildItem(task, isManual) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.completed ? ' completed' : '');
  li.dataset.id       = task.id;
  li.dataset.category = task.category || 'work';
  li.setAttribute('role', 'listitem');
  li.setAttribute('aria-label',
    `${task.completed ? '완료됨' : '미완료'}: ${task.text}, ` +
    `${CATEGORIES[task.category]?.label ?? ''}`
  );

  // ── 드래그 핸들 (수동 정렬 모드) ──────────────
  if (isManual) {
    li.dataset.sortable = 'true';
    li.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = '드래그하여 순서 변경';
    li.appendChild(handle);

    li.addEventListener('dragstart', e => {
      dragSrcId = task.id;
      e.dataTransfer.effectAllowed = 'move';
      // 다음 프레임에 클래스 추가해야 ghost 이미지에 영향 없음
      requestAnimationFrame(() => li.classList.add('dragging'));
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      taskList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    li.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrcId !== task.id) li.classList.add('drag-over');
    });

    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));

    li.addEventListener('drop', e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === task.id) return;

      // DOM 상의 현재 순서로 id 목록 추출
      const allEls = [...taskList.querySelectorAll('.task-item[data-id]')];
      const ids    = allEls.map(el => el.dataset.id);

      const srcIdx = ids.indexOf(dragSrcId);
      const tgtIdx = ids.indexOf(task.id);
      if (srcIdx === -1 || tgtIdx === -1) return;

      // 소스를 빼서 대상 위치에 삽입
      ids.splice(srcIdx, 1);
      ids.splice(tgtIdx, 0, dragSrcId);

      // order 값 재할당 (0, 10, 20, ...) — 사이 삽입 여유 확보
      const tasks = loadTasks();
      ids.forEach((id, idx) => {
        const t = tasks.find(t => t.id === id);
        if (t) t.order = idx * 10;
      });

      saveTasks(tasks);
      renderTasks(); // 목록만 다시 그리면 됨
    });
  }

  // ── 체크박스 ──────────────────────────────────
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `"${task.text}" 완료 토글`);
  checkbox.addEventListener('change', () => toggleTask(task.id));

  // ── 본문 ──────────────────────────────────────
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
  tag.setAttribute('aria-label', `카테고리: ${catInfo.label}`);

  top.append(span, tag);

  const timeLine = document.createElement('span');
  timeLine.className = 'task-time';
  timeLine.textContent = relativeTime(task.createdAt);
  timeLine.setAttribute('aria-label', `${relativeTime(task.createdAt)} 추가됨`);

  body.append(top, timeLine);

  // ── 삭제 버튼 ─────────────────────────────────
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.setAttribute('aria-label', `"${task.text}" 삭제`);
  deleteBtn.addEventListener('click', () => deleteTask(task.id));

  li.append(checkbox, body, deleteBtn);
  return li;
}

// ════════════════════════════════════════════════
// 인라인 편집
// ════════════════════════════════════════════════

/**
 * 할 일 항목을 편집 모드로 전환합니다.
 * @param {string}          id - 편집할 task id
 * @param {HTMLLIElement}   li - 해당 li 요소
 */
function enterEditMode(id, li) {
  if (li.classList.contains('editing')) return;
  const task = loadTasks().find(t => t.id === id);
  if (!task) return;

  li.classList.add('editing');
  const body = li.querySelector('.task-body');
  body.innerHTML = '';

  const editRow = document.createElement('div');
  editRow.className = 'edit-row';
  editRow.setAttribute('role', 'group');
  editRow.setAttribute('aria-label', '할 일 편집');

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'edit-input';
  editInput.value = task.text;
  editInput.maxLength = 200;
  editInput.setAttribute('aria-label', '할 일 내용 수정');

  const editSelect = document.createElement('select');
  editSelect.className = 'edit-category-select';
  editSelect.setAttribute('aria-label', '카테고리 변경');
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
  saveBtn.setAttribute('aria-label', '수정 저장');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = '✕';
  cancelBtn.title = '취소 (ESC)';
  cancelBtn.setAttribute('aria-label', '수정 취소');

  editRow.append(editInput, editSelect, saveBtn, cancelBtn);
  body.appendChild(editRow);
  editInput.focus();
  editInput.select();

  function save() {
    const newText = editInput.value.trim();
    if (!newText) {
      editInput.focus();
      showToast('내용을 입력해주세요.', 'warning');
      return;
    }
    // 자기 자신 제외 중복 검사
    if (isDuplicate(newText, id)) {
      showToast('이미 같은 내용의 할 일이 있습니다.', 'warning');
      editInput.select();
      return;
    }
    updateTask(id, newText, editSelect.value);
  }

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', render);
  editInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  save();
    if (e.key === 'Escape') render();
  });
}

/**
 * 할 일 내용 및 카테고리를 저장합니다.
 * @param {string} id          - task id
 * @param {string} newText     - 새 텍스트
 * @param {string} newCategory - 새 카테고리 키
 */
function updateTask(id, newText, newCategory) {
  const tasks = loadTasks().map(t =>
    t.id === id ? { ...t, text: newText, category: newCategory } : t
  );
  saveTasks(tasks);
  announce(`할 일 수정됨: ${newText}`);
  render();
}

// ════════════════════════════════════════════════
// 중복 검사
// ════════════════════════════════════════════════

/**
 * 동일한 텍스트의 할 일이 이미 존재하는지 검사합니다 (대소문자 무시).
 * @param {string} text      - 검사할 텍스트
 * @param {string} [excludeId] - 편집 시 자기 자신 제외
 * @returns {boolean}
 */
function isDuplicate(text, excludeId = null) {
  const normalized = text.trim().toLowerCase();
  return loadTasks().some(t =>
    t.text.toLowerCase() === normalized && t.id !== excludeId
  );
}

// ════════════════════════════════════════════════
// 완료 항목 일괄 삭제
// ════════════════════════════════════════════════

function clearCompleted() {
  const tasks    = loadTasks();
  const toDelete = tasks.filter(t => t.completed);
  if (toDelete.length === 0) return;

  if (!confirm(`완료된 항목 ${toDelete.length}개를 모두 삭제할까요?`)) return;

  // Undo를 위해 전체 스냅샷 저장
  undoState = { tasks: [...tasks] };
  saveTasks(tasks.filter(t => !t.completed));
  render();
  announce(`완료된 항목 ${toDelete.length}개 삭제됨`);
  showToast(`완료된 항목 ${toDelete.length}개 삭제됨`, 'info', undoDelete);
}

// ════════════════════════════════════════════════
// CRUD — 추가 / 토글 / 삭제 (Undo 포함)
// ════════════════════════════════════════════════

/**
 * 새 할 일을 추가합니다.
 * - 중복 텍스트 경고
 * - 추가 후 입력창 초기화 및 포커스 유지
 */
function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;

  // 중복 검사
  if (isDuplicate(text)) {
    showToast('이미 같은 내용의 할 일이 있습니다.', 'warning');
    taskInput.select();
    return;
  }

  const task  = createTask(text, categorySelect.value);
  const tasks = loadTasks();
  // order: 기존 최대값 + 10 (수동 정렬 시 새 항목을 맨 뒤에 배치)
  task.order  = tasks.length > 0 ? Math.max(...tasks.map(t => t.order ?? 0)) + 10 : 0;
  tasks.push(task);
  saveTasks(tasks);

  pendingEnterIds.add(task.id);
  taskInput.value = '';
  taskInput.focus();
  announce(`할 일 추가됨: ${task.text}`);
  render();
}

/**
 * 새 task 객체를 생성합니다.
 * @param {string} text     - 할 일 내용
 * @param {string} category - 카테고리 키
 * @returns {Task}
 */
function createTask(text, category) {
  return {
    id:        crypto.randomUUID(),
    text:      text.trim(),
    completed: false,
    category,
    createdAt: new Date().toISOString(),
    order:     Date.now(), // 임시값; addTask에서 덮어씀
  };
}

/**
 * 완료 상태를 토글합니다.
 * 현재 위치에서 페이드아웃 후 새 위치에 페이드인합니다.
 * @param {string} id - task id
 */
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
    const tasks = loadTasks();
    const task  = tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveTasks(tasks);
    announce(`"${task.text}" ${task.completed ? '완료' : '미완료로 변경'}`);
    render();
  }, 260);
}

/**
 * 할 일을 삭제합니다. 5초간 Undo 가능합니다.
 * @param {string} id - task id
 */
function deleteTask(id) {
  const tasks   = loadTasks();
  const deleted = tasks.find(t => t.id === id);
  if (!deleted) return;

  // 전체 스냅샷 저장 (Undo용)
  undoState = { tasks: [...tasks] };

  // 삭제 애니메이션
  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (li) {
    li.style.transition    = 'opacity 0.22s ease, transform 0.22s ease';
    li.style.opacity       = '0';
    li.style.transform     = 'translateX(16px)';
    li.style.pointerEvents = 'none';
  }

  setTimeout(() => {
    saveTasks(tasks.filter(t => t.id !== id));
    render();

    const preview = deleted.text.length > 22
      ? deleted.text.slice(0, 22) + '…'
      : deleted.text;
    announce(`"${deleted.text}" 삭제됨`);
    showToast(`"${preview}" 삭제됨`, 'info', undoDelete);
  }, 240);
}

/**
 * 마지막 삭제 작업을 되돌립니다 (Undo).
 */
function undoDelete() {
  if (!undoState) return;
  saveTasks(undoState.tasks);
  // 복구된 항목에 진입 애니메이션 적용
  undoState.tasks.forEach(t => {
    if (!loadTasks().find(existing => existing.id === t.id)) {
      pendingEnterIds.add(t.id);
    }
  });
  undoState = null;
  render();
  showToast('되돌렸습니다.', 'success', null, 2000);
}

// ════════════════════════════════════════════════
// 내보내기 / 가져오기
// ════════════════════════════════════════════════

/**
 * 현재 할 일 목록을 JSON 파일로 내보냅니다.
 */
function exportTasks() {
  const tasks = loadTasks();
  if (tasks.length === 0) {
    showToast('내보낼 할 일이 없습니다.', 'warning');
    return;
  }

  const payload = {
    version:    1,
    exportedAt: new Date().toISOString(),
    tasks,
  };

  try {
    const blob     = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const anchor   = document.createElement('a');
    const filename = `my-tasks-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.href     = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    announce(`${tasks.length}개 항목 내보내기 완료`);
    showToast(`${tasks.length}개 항목을 내보냈습니다.`, 'success');
  } catch (e) {
    showToast('내보내기에 실패했습니다.', 'error');
  }
}

/**
 * JSON 파일에서 할 일 목록을 가져옵니다.
 * 가져오기 전 현재 데이터가 있으면 교체 여부를 확인합니다.
 * @param {File} file - 선택된 JSON 파일
 */
function importTasks(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const raw   = JSON.parse(e.target.result);
      // { version, tasks } 형식과 순수 배열 형식 모두 지원
      const items = Array.isArray(raw) ? raw : (raw.tasks ?? []);

      if (!Array.isArray(items)) throw new Error('배열 형식이 아닙니다.');

      // 필수 필드가 있는 항목만 필터링
      const valid = items.filter(t =>
        t && typeof t.id === 'string' &&
        typeof t.text === 'string' && t.text.trim() &&
        typeof t.createdAt === 'string'
      );

      if (valid.length === 0) {
        showToast('유효한 할 일 데이터가 없습니다.', 'warning');
        return;
      }

      const current = loadTasks();
      const msg = current.length > 0
        ? `현재 ${current.length}개의 데이터가 ${valid.length}개로 교체됩니다. 계속할까요?`
        : `${valid.length}개의 항목을 가져올까요?`;

      if (!confirm(msg)) return;

      // 정규화: 누락 필드 기본값 보정
      const normalized = valid.map((t, i) => ({
        id:        t.id,
        text:      t.text.trim(),
        completed: Boolean(t.completed),
        category:  CATEGORIES[t.category] ? t.category : 'work',
        createdAt: t.createdAt,
        order:     t.order !== undefined ? t.order : i * 10,
      }));

      // 가져오기 전 Undo 상태 저장 (현재 데이터)
      undoState = { tasks: [...current] };

      saveTasks(normalized);
      taskCache = null; // 캐시 무효화
      render();
      announce(`${normalized.length}개 항목 가져오기 완료`);
      showToast(`${normalized.length}개 항목을 가져왔습니다.`, 'success', undoDelete);
    } catch (err) {
      showToast('올바른 JSON 형식이 아닙니다.', 'error');
    }
  };

  reader.onerror = () => showToast('파일을 읽을 수 없습니다.', 'error');
  reader.readAsText(file);

  // 같은 파일을 다시 가져올 수 있도록 value 초기화
  importFile.value = '';
}

// ════════════════════════════════════════════════
// 필터
// ════════════════════════════════════════════════

/**
 * 필터 버튼의 active 클래스와 aria-pressed 속성을 동기화합니다.
 * @param {string} activeFilter - 현재 활성 필터 키
 */
function syncFilterButtons(activeFilter) {
  filterRow.querySelectorAll('.filter-btn').forEach(btn => {
    const isActive = btn.dataset.filter === activeFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

/**
 * 카테고리 필터를 변경하고 목록을 갱신합니다.
 * @param {string} filter - 필터 키 ('all'|'work'|'personal'|'study')
 */
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

// ════════════════════════════════════════════════
// 통합 렌더
// ════════════════════════════════════════════════

function render() {
  renderTasks();
  renderDashboard();
}

// ════════════════════════════════════════════════
// 이벤트 바인딩
// ════════════════════════════════════════════════

// 할 일 추가
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

// 테마
themeToggle.addEventListener('click', toggleTheme);

// 완료 삭제
clearCompletedBtn.addEventListener('click', clearCompleted);

// 검색 — 200ms 디바운스로 과도한 렌더 방지
const debouncedSearch = debounce(q => {
  searchQuery = q;
  renderTasks();
}, 200);

searchInput.addEventListener('input', e => debouncedSearch(e.target.value));

// 정렬 선택
sortSelect.addEventListener('change', e => {
  saveSort(e.target.value);
  renderTasks(); // 정렬만 바뀌므로 대시보드는 갱신 불필요
});

// 내보내기
exportBtn.addEventListener('click', exportTasks);

// 가져오기: 버튼 → 숨겨진 file input 클릭
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', e => importTasks(e.target.files[0]));

// ── 키보드 단축키 ──────────────────────────────
document.addEventListener('keydown', e => {
  if (!e.altKey) return;

  // 인라인 편집 중에는 단축키 무시
  const active = document.activeElement;
  if (active &&
      (active.classList.contains('edit-input') ||
       active.classList.contains('edit-category-select'))) return;

  switch (e.key) {
    case 'n': case 'N':
      e.preventDefault();
      taskInput.focus();
      taskInput.select();
      break;
    case '1':
      e.preventDefault(); setFilter('all');      break;
    case '2':
      e.preventDefault(); setFilter('work');     break;
    case '3':
      e.preventDefault(); setFilter('personal'); break;
    case '4':
      e.preventDefault(); setFilter('study');    break;
    case 'd': case 'D':
      e.preventDefault(); toggleTheme();         break;
    case 'e': case 'E':
      e.preventDefault(); exportTasks();         break;
    case 'i': case 'I':
      e.preventDefault(); importFile.click();    break;
  }
});

// ════════════════════════════════════════════════
// 초기화
// ════════════════════════════════════════════════

// 저장된 테마 적용
applyTheme(loadTheme());

// 저장된 필터 복원
const savedFilter = loadFilter();
syncFilterButtons(savedFilter);

// 저장된 정렬 복원
sortSelect.value = loadSort();

// 초기 렌더
render();
