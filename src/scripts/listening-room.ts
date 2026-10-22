import { embedURL, formatDuration, rankMedia, resolveScene, safeURL, scenes, type MediaItem, type Mode } from '../lib/media';

const catalog = JSON.parse(document.getElementById('media-data')!.textContent!) as { items: MediaItem[] };
const items = catalog.items;
const itemMap = new Map(items.map(item => [item.id, item]));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const dialog = $<HTMLDialogElement>('player-dialog');
const storageKey = 'joez-listening-room-v1';
interface ListeningState { queue: string[]; completed: string[]; positions: Record<string, number>; lastId?: string; }
let storageUnavailable = false;
function loadState(): ListeningState {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const validIds = (list: unknown) => Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === 'string' && itemMap.has(id)))] : [];
    const positions: Record<string, number> = {};
    if (raw.positions && typeof raw.positions === 'object') for (const [id, seconds] of Object.entries(raw.positions)) {
      if (itemMap.has(id) && typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) positions[id] = seconds;
    }
    return { queue: validIds(raw.queue), completed: validIds(raw.completed), positions, lastId: typeof raw.lastId === 'string' && itemMap.has(raw.lastId) ? raw.lastId : undefined };
  } catch { return { queue: [], completed: [], positions: {} }; }
}
let state = loadState();
let mode: Mode = 'auto';
let view = 'all';
let kind = 'all';
let query = '';
let topic = 'all';
let source = 'all';
let limit = 9;
let currentId: string | undefined;
let featuredId: string | undefined;
let activeScene = resolveScene(mode);
let audio: HTMLAudioElement | undefined;
let renderedItems: MediaItem[] = [];
let toastTimer: ReturnType<typeof setTimeout>;
let sleepInterval: ReturnType<typeof setInterval> | undefined;
let sleepDeadline = 0;
const cards = new Map([...document.querySelectorAll<HTMLElement>('.media-card')].map(card => [card.dataset.id!, card]));

function notify(message: string) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { if (!storageUnavailable) { notify('浏览器未允许本地存储，记录将在关闭页面后清除。'); storageUnavailable = true; } }
}
function dayKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function setPressed(selector: string, key: string, value: string) {
  document.querySelectorAll<HTMLElement>(selector).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[key] === value)));
}
function updateClock() {
  $('local-clock').textContent = '北京时间 ' + new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}
function render() {
  activeScene = resolveScene(mode);
  updateClock();
  const scene = scenes[activeScene];
  const comma = scene.title.indexOf('，');
  $('room-title').replaceChildren(...[scene.title.slice(0, comma + 1), scene.title.slice(comma + 1)].map(text => {
    const line = document.createElement('span'); line.textContent = text; line.style.display = 'block'; return line;
  }));
  $('scene-description').textContent = scene.description;
  $('scene-label').textContent = `${mode === 'auto' ? '此刻推荐 · ' : '自由切换 · '}${scene.label}`;
  $('auto-hint').textContent = mode === 'auto' ? '周末 08–12 点打扫 · 19–06 点放松' : '已手动选择 · 点“跟随此刻”恢复自动推荐';
  $('recommendation-reason').textContent = scene.reason;
  setPressed('[data-mode]', 'mode', mode);
  setPressed('[data-view]', 'view', view);
  setPressed('[data-kind]', 'kind', kind);
  $('queue-count').textContent = String(state.queue.length);
  $('done-count').textContent = String(state.completed.length);

  const ranked = rankMedia(items, activeScene, state.completed, dayKey());
  const featured = ranked[0];
  featuredId = featured?.id;
  $<HTMLButtonElement>('start-recommendation').disabled = !featured;
  $<HTMLButtonElement>('feature-play').disabled = !featured;
  if (featured) {
    $('feature-title').textContent = featured.title;
    $('feature-description').textContent = featured.description;
    $('feature-topic').textContent = featured.topics.join(' / ');
    $('feature-kind').textContent = featured.platform + ' · ' + (featured.kind === 'podcast' ? '播客' : '视频');
    $('feature-duration').textContent = `${formatDuration(featured.durationMinutes)}${featured.audioUrl ? ' · 站内收听' : embedURL(featured.url) ? ' · 站内播放' : ' · 原站收看'}`;
    $<HTMLButtonElement>('feature-play').setAttribute('aria-label', `播放 ${featured.title}`);
  } else {
    $('feature-title').textContent = '这个场景的收藏，都看完了。';
    $('feature-description').textContent = '切换一个场景，或者到“已看完”重温一段。';
    $('feature-topic').textContent = 'A LITTLE TIME WELL SPENT';
    $('feature-kind').textContent = '暂时没有待播内容';
    $('feature-duration').textContent = '歇一会，也很好';
  }

  let ordered: MediaItem[];
  if (view === 'queue') ordered = state.queue.map(id => itemMap.get(id)!);
  else if (view === 'done') ordered = items.filter(item => state.completed.includes(item.id));
  else ordered = [...ranked, ...items.filter(item => state.completed.includes(item.id) && (activeScene !== 'chores' || item.listenOnly))];
  // The chores scene consistently keeps attention-free content, including in queue/history views.
  if (activeScene === 'chores') ordered = ordered.filter(item => item.listenOnly);
  const filtered = ordered.filter(item => {
    if (kind === 'podcast' && item.kind !== 'podcast') return false;
    if (kind === 'video' && item.kind !== 'video') return false;
    if (kind === 'interview' && !item.interview) return false;
    if (kind === 'listen' && !item.listenOnly) return false;
    if (topic !== 'all' && !item.topics.includes(topic)) return false;
    if (source !== 'all' && !item.sources.some(s => s.name === source)) return false;
    const text = [item.title, item.description, item.platform, ...item.topics, ...item.sources.map(s => s.name)].join(' ').toLocaleLowerCase();
    return !query || text.includes(query);
  });
  renderedItems = filtered;
  const visible = new Set(filtered.slice(0, limit).map(item => item.id));
  const grid = $('media-grid');
  cards.forEach((card, id) => {
    card.hidden = !visible.has(id);
    const item = itemMap.get(id)!;
    const queued = state.queue.includes(id), done = state.completed.includes(id);
    const queueButton = card.querySelector<HTMLButtonElement>('.queue-button')!;
    queueButton.textContent = queued ? '−' : '＋';
    queueButton.setAttribute('aria-pressed', String(queued));
    queueButton.setAttribute('aria-label', `${queued ? '移出待播' : '加入待播'}：${item.title}`);
    queueButton.title = queued ? '移出待播队列' : '加入待播队列';
    const doneButton = card.querySelector<HTMLButtonElement>('.done-button')!;
    doneButton.setAttribute('aria-pressed', String(done));
    doneButton.setAttribute('aria-label', `${done ? '恢复未看' : '标记看完'}：${item.title}`);
    doneButton.title = done ? '恢复未看状态' : '标记已看完';
    card.querySelector<HTMLElement>('.completed-stamp')!.hidden = !done;
  });
  // Move existing elements so keyboard labels and all source text stay server-rendered.
  filtered.forEach(item => grid.append(cards.get(item.id)!));
  $('result-count').textContent = `共 ${filtered.length} 条${view === 'queue' ? '待播' : view === 'done' ? '已看完的内容' : '收藏'}${filtered.length > limit ? ` · 已展示 ${limit} 条` : ''}`;
  $('list-order').textContent = view === 'queue' ? '按加入队列的先后排序' : view === 'done' ? '看过的，也值得重温' : '按当前场景推荐排序';
  $('load-more').hidden = filtered.length <= limit;
  const hasFilters = query !== '' || kind !== 'all' || topic !== 'all' || source !== 'all';
  $('reset-filters').hidden = !hasFilters;
  $('empty-state').hidden = filtered.length > 0;
  $('empty-title').textContent = view === 'queue' && !hasFilters ? '下一段，留在这里。' : view === 'done' && !hasFilters ? '慢慢来，从第一段开始。' : '没有找到这段内容。';
  $('empty-description').textContent = view === 'queue' && !hasFilters ? '点击收藏卡片上的“＋”，把想听的放进待播队列。' : view === 'done' && !hasFilters ? '听完后点击“✓”，这里就会留下你的足迹。' : '换个关键词或清除筛选；也可以切换收听场景。';
  updateResume();
  updatePlayerButtons();
}
function updateResume() {
  const last = state.lastId && itemMap.get(state.lastId);
  $('resume-banner').hidden = !last || state.completed.includes(last.id);
  if (!last) return;
  $('resume-title').textContent = last.title;
  const position = state.positions[last.id];
  $('resume-position').textContent = last.audioUrl && position > 0 ? `已听至 ${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, '0')} · 点击继续收听` : '上次打开的内容 · 视频播放进度由原平台管理';
}
function toggleQueue(id: string) {
  if (!itemMap.has(id)) return;
  const queued = state.queue.includes(id);
  state.queue = queued ? state.queue.filter(value => value !== id) : [...state.queue, id];
  persist(); render(); notify(queued ? '已移出待播队列' : '已加入待播队列');
}
function toggleDone(id: string) {
  if (!itemMap.has(id)) return;
  const done = state.completed.includes(id);
  state.completed = done ? state.completed.filter(value => value !== id) : [...state.completed, id];
  if (!done) {
    state.queue = state.queue.filter(value => value !== id);
    delete state.positions[id];
    if (state.lastId === id) state.lastId = undefined;
    if (id === currentId) { audio?.pause(); cancelSleep(); }
  }
  persist(); render(); notify(done ? '已恢复为未看' : '已看完，留点时间给下一段。');
}
function savePosition() {
  if (!audio || !currentId || state.completed.includes(currentId) || !Number.isFinite(audio.currentTime)) return;
  state.positions[currentId] = audio.currentTime;
  persist(); updateResume();
}
function cancelSleep() {
  if (sleepInterval) clearInterval(sleepInterval);
  sleepInterval = undefined;
  sleepDeadline = 0;
  $<HTMLSelectElement>('sleep-timer').value = '0';
  $('timer-status').textContent = '';
}
function stopMedia() {
  savePosition();
  audio?.pause();
  audio = undefined;
  $('player-media').replaceChildren();
  cancelSleep();
}
function updatePlayerButtons() {
  if (!currentId) return;
  $('player-queue').textContent = state.queue.includes(currentId) ? '移出待播' : '加入待播';
  $('player-done').textContent = state.completed.includes(currentId) ? '恢复未看 ↺' : '标记看完 ✓';
  $<HTMLButtonElement>('play-next').disabled = !nextItem();
}
function nextItem() {
  const eligible = (item: MediaItem) => item.id !== currentId && !state.completed.includes(item.id) && (activeScene !== 'chores' || item.listenOnly);
  return state.queue.map(id => itemMap.get(id)!).find(eligible) || renderedItems.find(eligible) || rankMedia(items, activeScene, state.completed, dayKey()).find(eligible);
}
function play(id?: string) {
  const item = id && itemMap.get(id);
  if (!item) return;
  stopMedia();
  currentId = item.id;
  state.lastId = item.id;
  persist();
  $('player-title').textContent = item.title;
  $('player-meta').textContent = `${item.platform} · ${item.kind === 'podcast' ? '播客' : item.interview ? '视频访谈' : '视频'} · ${formatDuration(item.durationMinutes)}`;
  $('player-description').textContent = item.description;
  $<HTMLAnchorElement>('open-original').href = safeURL(item.url) || '#';
  $('player-sources').replaceChildren(...item.sources.filter(s => safeURL(s.url)).map(source => {
    const link = document.createElement('a');
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `在 ${source.name} 中查看 ↗`; return link;
  }));
  const player = $('player-media');
  $('audio-settings').hidden = true;
  if (item.audioUrl && safeURL(item.audioUrl)) {
    const art = document.createElement('div'); art.className = 'audio-art'; art.textContent = '◖ 让耳朵，去散步。◗';
    const element = document.createElement('audio');
    audio = element;
    element.controls = true; element.preload = 'metadata'; element.src = item.audioUrl;
    element.setAttribute('aria-label', item.title);
    element.playbackRate = Number($<HTMLSelectElement>('playback-speed').value);
    const savedPosition = state.positions[item.id] || 0;
    element.addEventListener('loadedmetadata', () => { if (Number.isFinite(element.duration) && savedPosition < element.duration - 5) element.currentTime = savedPosition; });
    let lastSaved = 0;
    element.addEventListener('timeupdate', () => { if (Math.abs(element.currentTime - lastSaved) > 5) { lastSaved = element.currentTime; savePosition(); } });
    element.addEventListener('pause', savePosition);
    element.addEventListener('ended', () => { if (!state.completed.includes(item.id)) toggleDone(item.id); notify('这段听完了。点“下一段”，继续下一场对话。'); });
    element.addEventListener('error', () => { $('player-help').textContent = '音频暂时无法加载。可以点击“原站打开”到小宇宙收听。'; });
    player.append(art, element);
    $('audio-settings').hidden = false;
    $('player-help').textContent = '关闭播放器会暂停音频并保存位置；下次可接着听。';
    element.play().catch(() => { $('player-help').textContent = element.error ? '音频暂时无法加载，可以点击“原站打开”继续收听。' : '点击音频播放器的播放按钮开始收听。'; });
  } else {
    const url = embedURL(item.url);
    if (url) {
      const iframe = document.createElement('iframe');
      iframe.src = url; iframe.title = item.title; iframe.allow = 'fullscreen; picture-in-picture; encrypted-media'; iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      player.append(iframe);
      $('player-help').textContent = '点击画面中的播放按钮开始。若出现登录、地区或加载限制，点击“原站打开”。视频进度由原平台管理。';
    } else {
      const message = document.createElement('div'); message.className = 'audio-art'; message.textContent = '这段内容，在原站等你。'; player.append(message);
      $('player-help').textContent = '这个平台暂未提供可用的内嵌播放器。点击“原站打开”，即可前往节目页面。';
    }
  }
  updatePlayerButtons(); updateResume();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

document.querySelectorAll<HTMLElement>('[data-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.mode as Mode; limit = 9; render(); }));
document.querySelectorAll<HTMLElement>('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view!; limit = 9; render(); }));
document.querySelectorAll<HTMLElement>('[data-kind]').forEach(button => button.addEventListener('click', () => { kind = button.dataset.kind!; limit = 9; render(); }));
$('media-grid').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button?.dataset.id) return;
  if (button.dataset.action === 'play') play(button.dataset.id);
  if (button.dataset.action === 'queue') toggleQueue(button.dataset.id);
  if (button.dataset.action === 'done') toggleDone(button.dataset.id);
});
$<HTMLInputElement>('media-search').addEventListener('input', event => { query = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase(); limit = 9; render(); });
$<HTMLSelectElement>('topic-filter').addEventListener('change', event => { topic = (event.target as HTMLSelectElement).value; limit = 9; render(); });
$<HTMLSelectElement>('source-filter').addEventListener('change', event => { source = (event.target as HTMLSelectElement).value; limit = 9; render(); });
function reset() {
  query = ''; kind = 'all'; topic = 'all'; source = 'all'; view = 'all'; mode = 'auto'; limit = 9;
  $<HTMLInputElement>('media-search').value = '';
  $<HTMLSelectElement>('topic-filter').value = 'all';
  $<HTMLSelectElement>('source-filter').value = 'all';
  render();
}
$('reset-filters').addEventListener('click', reset);
$('empty-reset').addEventListener('click', reset);
$('load-more').addEventListener('click', () => { limit += 9; render(); });
$('start-recommendation').addEventListener('click', () => play(featuredId));
$('feature-play').addEventListener('click', () => play(featuredId));
$('resume-button').addEventListener('click', () => play(state.lastId));
$('close-player').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', stopMedia);
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
$('player-queue').addEventListener('click', () => currentId && toggleQueue(currentId));
$('player-done').addEventListener('click', () => currentId && toggleDone(currentId));
$('play-next').addEventListener('click', () => play(nextItem()?.id));
$<HTMLSelectElement>('playback-speed').addEventListener('change', event => { if (audio) audio.playbackRate = Number((event.target as HTMLSelectElement).value); });
$<HTMLSelectElement>('sleep-timer').addEventListener('change', event => {
  const minutes = Number((event.target as HTMLSelectElement).value);
  cancelSleep();
  if (!minutes || !audio) return;
  $<HTMLSelectElement>('sleep-timer').value = String(minutes);
  sleepDeadline = Date.now() + minutes * 60_000;
  const tick = () => {
    const seconds = Math.max(0, Math.ceil((sleepDeadline - Date.now()) / 1000));
    $('timer-status').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} 后暂停`;
    if (seconds === 0) { audio?.pause(); cancelSleep(); notify('到时间了，音频已暂停。晚安。'); }
  };
  tick(); sleepInterval = setInterval(tick, 1000);
});
document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (event.key === '/' && !dialog.open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) { event.preventDefault(); $('media-search').focus(); }
});
window.addEventListener('pagehide', savePosition);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePosition(); else { updateClock(); if (resolveScene(mode) !== activeScene) render(); } });
window.addEventListener('storage', event => { if (event.key === storageKey) { state = loadState(); render(); } });
setInterval(() => { updateClock(); if (resolveScene(mode) !== activeScene) render(); }, 60_000);
render();
