import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'src/data/media-catalog.json');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const asArray = data => Array.isArray(data) ? data : data.data ?? [];
const previous = existsSync(output) ? read(output) : { items: [] };
const existing = new Map(previous.items.map(item => [item.id, item]));
const cli = flags => asArray(JSON.parse(execFileSync('cubox-cli', ['card', 'list', ...flags, '--all'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })));
const cards = option('--cubox-file') ? asArray(read(option('--cubox-file'))) : cli(['--tag', '7504502111971837440,7504502115356643314']);
const interviews = option('--interviews-file') ? asArray(read(option('--interviews-file'))) : cli(['--keyword', '访谈']);
const enrichment = option('--enrichment-file') ? read(option('--enrichment-file')) : {};
const ticktick = option('--ticktick-file') ? asArray(read(option('--ticktick-file'))) : [];

function cleanURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    if (url.hostname.endsWith('bilibili.com')) return url.origin + url.pathname;
    if (url.hostname === 'b23.tv') return url.origin + url.pathname;
    if (url.hostname.endsWith('xiaoyuzhoufm.com')) return url.origin + url.pathname;
    if (['www.youtube.com', 'm.youtube.com', 'youtube.com'].includes(url.hostname)) {
      if (!url.searchParams.has('v')) return url.origin + url.pathname;
      return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
    }
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|spm|vd_source|share|s$|xsec)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return; }
}
function topicList(title, tags) {
  const text = `${title} ${tags.join(' ')}`;
  const topics = [];
  if (/\bAI\b|人工智能|模型|技术|机器人|GPT|Agent|Gemini|Anthropic|OpenAI|DeepMind|vLLM/i.test(text)) topics.push('科技');
  if (/产品|商业|支付|投资|基金|创业|需求调研|乔布斯|Stripe|Collison|Product|Meta|Muse|Snap|Discord|Google|Recruiter|职场|打工|牛马|Job-Search|company|fund/i.test(text)) topics.push('产品与商业');
  if (/写作|表达|提问|采访技能|Writing|Writer|Storytelling|Arndt|Picoult/i.test(text)) topics.push('写作与表达');
  if (/生活|旅行|徒步|地球|东亚|道教|社会|书籍|纪录片|哲学|道德|人文|故事/i.test(text)) topics.push('人文与远方');
  if (/成长|记忆|睡眠|健康|动力|认知|学习|初学者|手机瘾|逃避|恐惧|自我重建|burnout|loneliness|delusional|自信/i.test(text)) topics.push('自我与生活');
  return topics.length ? topics : ['灵感'];
}
function normalize(raw, source, url, custom = {}) {
  const old = existing.get(`${source === 'Cubox' ? 'cubox' : 'ticktick'}-${raw.id}`);
  const title = (custom.title || old?.title || raw.title).replace(/^Fw:\s*/i, '').replace(/\s*[-_｜|]\s*(哔哩哔哩_bilibili|YouTube|小宇宙 - 听播客，上小宇宙)\s*$/i, '').replace(/_哔哩哔哩_bilibili$/, '').trim();
  const tags = raw.tags || [];
  const kind = /xiaoyuzhoufm|podcast|dwarkesh|sourcery|lennys|substack/i.test(url) || tags.includes('播客') ? 'podcast' : 'video';
  const topics = topicList(`${title} ${raw.title} ${custom.description || ''}`, tags);
  const interview = !/采访技能|需求调研/.test(title) && /访谈|采访|对谈|对话|interview|Collison|Greene|Picoult|Weir|Ameisen|Florence|Graham|Woodward|Sellis|Sottiaux|Arndt|Tallinn|Huberman|Yousef/i.test(`${title} ${raw.title} ${custom.description || ''}`);
  const screenDependent = /Draw|real use cases|AI agent UX|Muse gets|Is Meta|Jev more than|压缩即智能|需求调研|采访技能/i.test(title);
  const listenOnly = !screenDependent && (kind === 'podcast' || interview || /动力|认知|记忆|自信|手机瘾/i.test(title));
  const scenes = [];
  if (listenOnly) scenes.push('chores');
  if (topics.some(t => ['人文与远方', '写作与表达', '自我与生活'].includes(t))) scenes.push('evening');
  if (topics.some(t => ['科技', '产品与商业', '写作与表达'].includes(t))) scenes.push('focus');
  scenes.push('weekend');
  let platform = new URL(url).hostname.replace(/^(www\.|m\.)/, '');
  if (/bilibili|b23.tv/.test(platform)) platform = '哔哩哔哩';
  if (/youtube|youtu.be/.test(platform)) platform = 'YouTube';
  if (/xiaoyuzhoufm/.test(platform)) platform = '小宇宙';
  const sourceURL = source === 'Cubox' ? `https://cubox.pro/web/card/${raw.id}` : `https://dida365.com/webapp/#p/${raw.projectId}/tasks/${raw.id}`;
  const audioUrl = cleanURL(custom.audioUrl || old?.audioUrl);
  const durationMinutes = custom.durationMinutes || old?.durationMinutes;
  return {
    id: `${source === 'Cubox' ? 'cubox' : 'ticktick'}-${raw.id}`, title,
    description: custom.description || old?.description || `围绕${topics.slice(0, 2).join('与')}展开的${interview ? '一场对话' : kind === 'podcast' ? '一期节目' : '一段视频'}，从收藏里重新遇见。`,
    url, kind, platform, topics, scenes, listenOnly, interview,
    savedAt: (raw.create_time || raw.createdTime || old?.savedAt || new Date().toISOString()).slice(0, 10),
    ...(audioUrl ? { audioUrl } : {}),
    ...(Number.isFinite(durationMinutes) && durationMinutes > 0 ? { durationMinutes: Math.round(durationMinutes) } : {}),
    sources: [{ name: source, url: sourceURL }],
  };
}

const candidates = [];
for (const raw of new Map([...cards, ...interviews].map(card => [card.id, card])).values()) {
  const custom = enrichment[raw.id] || {};
  const url = cleanURL(custom.url || existing.get(`cubox-${raw.id}`)?.url || raw.url);
  // Only actual media and resolved newsletter episode pages belong in the room.
  if (!url || /Sina Visitor System|微博/.test(raw.title)) continue;
  const direct = /(?:bilibili\.com\/video|b23\.tv\/|youtube\.com\/watch|youtu\.be\/|xiaoyuzhoufm\.com\/episode)/.test(url);
  if (!direct && !custom.url) continue;
  candidates.push(normalize(raw, 'Cubox', url, custom));
}
for (const raw of ticktick) {
  const urls = (raw.content || '').match(/https:\/\/[^\s<>]+/g) || [];
  const custom = enrichment[raw.id] || {};
  const chosen = custom.url || urls.find(url => /xiaoyuzhoufm\.com\/episode|youtube\.com\/watch|youtu\.be\//.test(url));
  const url = cleanURL(chosen);
  if (url) candidates.push(normalize(raw, '滴答清单', url, custom));
}
if (!option('--ticktick-file')) candidates.push(...previous.items.filter(item => item.sources.some(s => s.name === '滴答清单')));
function canonical(url) {
  const u = new URL(url);
  if (u.hostname === 'youtu.be') return `youtube:${u.pathname.slice(1)}`;
  if (u.hostname.endsWith('youtube.com') && u.searchParams.get('v')) return `youtube:${u.searchParams.get('v')}`;
  return u.href.replace(/\/$/, '');
}
const unique = new Map();
for (const item of candidates) {
  const key = canonical(item.url);
  const prior = unique.get(key);
  if (prior) {
    prior.sources = [...new Map([...prior.sources, ...item.sources].map(source => [source.url, source])).values()];
    if (!prior.audioUrl && item.audioUrl) prior.audioUrl = item.audioUrl;
    if (!prior.durationMinutes && item.durationMinutes) prior.durationMinutes = item.durationMinutes;
  } else unique.set(key, item);
}
if (!unique.size) throw new Error('未读取到媒体，保留原有目录。请检查 Cubox 登录或导入文件。');
const items = [...unique.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
mkdirSync(resolve(root, 'src/data'), { recursive: true });
writeFileSync(output, JSON.stringify({ updatedAt: new Date().toISOString(), timezone: 'Asia/Shanghai', items }, null, 2) + '\n');
console.log(`已更新 ${items.length} 条媒体；${items.filter(i => i.audioUrl).length} 条可直接收听。`);
