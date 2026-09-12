import { geocode, fetchForecast, mapWeatherCode, summarizeDay, packingTips } from './weather.js';
import './style.css';

const app = document.getElementById('app');

// ---------------- state ----------------
const STORE_KEY = 'tabiyori.trip';
const state = {
  view: 'main',                 // 'main' | 'setup'
  trip: null,
  weather: {},                  // key `${loc}|${date}` -> {date, daily, hourly} | {error}
  loading: {},                  // key -> true
};

// ---------------- helpers ----------------
const keyOf = (day) => `${day.location}|${day.date}`;
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekdayJa = (iso) => `日月火水木金土`[new Date(`${iso}T00:00:00`).getDay()];
const shortDate = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}`; };
const money = (n) => Math.round(n);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadTrip() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } }
function saveTrip() { if (state.trip) localStorage.setItem(STORE_KEY, JSON.stringify(state.trip)); }

function defaultSample() {
  const base = new Date();
  base.setDate(base.getDate() + 1); // 明日開始
  const mk = (off) => { const d = new Date(base); d.setDate(d.getDate() + off); return fmtDate(d); };
  return {
    name: '京都 3泊4日',
    days: [
      { date: mk(0), location: '京都', activities: [
        { time: '11:00', title: '清水寺・二寧坂' }, { time: '14:00', title: '祇園さんぽ' }, { time: '18:30', title: '夕食（湯豆腐）' } ] },
      { date: mk(1), location: '京都', activities: [
        { time: '09:00', title: '嵐山（竹林・渡月橋）' }, { time: '13:00', title: '嵐山温泉' }, { time: '19:00', title: '夕食（夜景）' } ] },
      { date: mk(2), location: '京都', activities: [
        { time: '08:00', title: '伏見稲荷' }, { time: '11:30', title: '宇治・抹茶ランチ' }, { time: '14:00', title: '平等院' } ] },
      { date: mk(3), location: '京都', activities: [
        { time: '10:00', title: 'お土産めぐり' }, { time: '13:30', title: '新幹線で帰路' } ] },
    ],
  };
}

// ---------------- weather loading ----------------
async function ensureWeather() {
  const todo = [];
  for (const day of state.trip.days) {
    const k = keyOf(day);
    if (!state.weather[k]) todo.push({ day, k });
  }
  if (!todo.length) { render(); return; }
  todo.forEach(({ k }) => { state.loading[k] = true; });
  render();
  await Promise.all(todo.map(async ({ day, k }) => {
    try {
      const loc = await geocode(day.location);
      if (!loc) { state.weather[k] = { error: '場所が見つかりません' }; return; }
      const res = await fetchForecast(loc.lat, loc.lon, [day.date]);
      state.weather[k] = res[0];
    } catch (e) {
      state.weather[k] = { error: String(e) };
    } finally {
      state.loading[k] = false;
    }
  }));
  render();
}

// ---------------- render ----------------
function render() {
  if (state.view === 'setup') renderSetup();
  else renderMain();
}

function renderMain() {
  const trip = state.trip;
  const start = trip.days[0], end = trip.days[trip.days.length - 1];
  const v = verdict();
  const cards = trip.days.map((d, i) => dayCard(d, i)).join('');
  app.innerHTML = `
    <div class="header">
      <div class="brand">旅日和<span class="sub">TABIYORI</span></div>
      <button class="btn ghost small" data-action="edit">旅程を編集</button>
    </div>
    <header class="hero">
      <div class="eyebrow">旅行プラン × 天気</div>
      <h1>${esc(trip.name)}</h1>
      <div class="sub">${esc(shortDate(start.date))}(${weekdayJa(start.date)}) — ${esc(shortDate(end.date))}(${weekdayJa(end.date)})</div>
      <div class="verdict">
        <div class="dot">${v.emoji}</div>
        <p>${v.text}</p>
      </div>
    </header>
    <div class="tl">${cards}</div>
    <div class="hint">各日のカードをタップすると、その日のポイントが下から出てきます</div>
    <div class="toolbar">
      <button class="btn ghost" data-action="new-trip">＋ 新しい旅程を作る</button>
    </div>
  `;
}

function dayCard(day, i) {
  const k = keyOf(day);
  const wx = state.weather[k];
  const loading = state.loading[k];
  const agenda = day.activities.map((a) => a.title).join(' → ');
  const s = wx?.daily ? summarizeDay(wx) : null;
  const hasBadge = s?.rainy;

  let right;
  if (loading) {
    right = `<div class="loading"><span class="spinner"></span>取得中…</div>`;
  } else if (wx?.error) {
    right = `<div class="wx"><div class="icon">❓</div><div class="rain" style="color:var(--danger)">取得エラー</div></div>`;
  } else if (s) {
    right = `<div class="wx"><div class="icon">${s.emoji}</div>
      <div class="temp">${money(s.max)}°<small> / ${money(s.min)}°</small></div>
      <div class="rain">☔ ${s.precip}%</div></div>`;
  } else {
    right = `<div class="wx"><div class="icon">📅</div><div class="rain" style="color:var(--muted)">予報範囲外</div></div>`;
  }

  const badge = hasBadge ? `<span class="badge">雨注意</span>` : (s && s.label.includes('晴れ') ? `<span class="badge ok">晴れ</span>` : '');

  return `
    <article class="day ${hasBadge ? 'rain' : ''}">
      <div class="day-card" data-action="open-day" data-idx="${i}">
        <div class="head">
          <div class="daylabel">
            <div class="d1">${esc(day.label || `${i + 1}日目`)}${badge}</div>
            <div class="d2">${esc(shortDate(day.date))}(${weekdayJa(day.date)}) ・ ${esc(day.location)}</div>
          </div>
          ${right}
          <span class="chev">›</span>
        </div>
        <div class="agenda"><span class="mini">${esc(agenda)}</span><span class="count">${day.activities.length}予定</span></div>
      </div>
    </article>`;
}

// ---------------- verdict ----------------
function verdict() {
  const sums = state.trip.days.map((d) => summarizeDay(state.weather[keyOf(d)]));
  const has = sums.filter(Boolean);
  if (!has.length) return { emoji: '🌡️', text: '予報を取得中…' };
  const anyRain = sums.some((s) => s?.rainy);
  if (anyRain) return { emoji: '🌤️', text: '全体は<b>まずまずのお天気</b>。雨の日は屋外を午前中に寄せとこ。' };
  return { emoji: '☀️', text: '全体的に<b>まずまずの陽気</b>。屋外メインで組んでよさそう。' };
}

// ---------------- sheet ----------------
function openSheet(idx) {
  const day = state.trip.days[idx];
  const wx = state.weather[keyOf(day)];
  const s = wx?.daily ? summarizeDay(wx) : null;
  const tips = s ? packingTips(wx) : { tips: ['予報待ち'], note: '予報が取得できたら提案します。' };

  let hourly;
  if (wx?.hourly?.length) {
    hourly = `<div class="tl2">${wx.hourly.map((h) => {
      const mc = mapWeatherCode(h.weather_code);
      const rainy = mc.label.includes('雨') || mc.label.includes('雪') || h.precip >= 40;
      return `<div class="hr ${rainy ? 'rain' : ''}">
        <span class="temp">${money(h.temp)}°</span><span class="time">${h.hour}:00</span>
        <div class="txt"><span class="e">${mc.emoji}</span>${mc.label}${h.precip >= 30 ? ' ・降水' + h.precip + '%' : ''}</div>
      </div>`;
    }).join('')}</div>`;
  } else if (wx?.error) {
    hourly = `<div class="nofloat">天気を取得できませんでした（${esc(wx.error)}）</div>`;
  } else {
    hourly = `<div class="nofloat">この日は予報範囲外です。旅行の1週間前になると見られます。</div>`;
  }

  document.getElementById('sheetBody').innerHTML = `
    <div class="dayhead">
      <div class="ic">${s ? s.emoji : '📅'}</div>
      <div>
        <div class="t">${s ? money(s.max) + '°' : '—'}<small>${s ? ' / ' + money(s.min) + '°' : ''}</small></div>
        <div class="cond">${esc(shortDate(day.date))}(${weekdayJa(day.date)}) ・ ${s ? esc(s.label) : '予報なし'}</div>
      </div>
      <div class="cap"><div class="pl">${esc(day.location)}</div><div class="rain">${s ? '☔ ' + s.precip + '%' : ''}</div></div>
    </div>
    <div class="sect">
      <h4>この日の気持ちいい時間</h4>
      ${hourly}
    </div>
    <div class="sect">
      <div class="tip">
        <div class="i">🎒</div>
        <h3>この日のポイント</h3>
        <p>${esc(tips.note)}</p>
        ${tips.tips.map((t) => `<span class="tag ${t.cls || ''}">${esc(t.t)}</span>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('sheet').classList.add('show');
  document.getElementById('backdrop').classList.add('show');
}
function closeSheet() {
  document.getElementById('sheet').classList.remove('show');
  document.getElementById('backdrop').classList.remove('show');
}

// ---------------- setup ----------------
function renderSetup() {
  const trip = state.trip;
  app.innerHTML = `
    <div class="setup">
      <div class="header">
        <div class="brand">旅日和<span class="sub">TABIYORI</span></div>
        <button class="btn ghost small" data-action="back">← 戻る</button>
      </div>
      <header class="hero">
        <h1 style="font-size:26px">旅程を編集</h1>
        <div class="sub">行き先・日付・予定を入力。天気は Open-Meteo から自動で取得します。</div>
      </header>
      <div class="field"><label>旅行の名前</label><input class="input" id="trip-name" value="${esc(trip.name)}"></div>
      <div id="day-editor">${trip.days.map((d, i) => dayEditor(d, i)).join('')}</div>
      <button class="btn ghost" style="width:100%;margin-bottom:16px" data-action="add-day">＋ 日を追加</button>
      <div style="display:flex;gap:10px">
        <button class="btn primary" style="flex:1" data-action="save">保存して表示</button>
        <button class="btn ghost" data-action="sample">サンプルに戻す</button>
      </div>
    </div>`;
}

function dayEditor(day, i) {
  return `
    <div class="subcard" data-day="${i}">
      <div class="sc-t">${i + 1}日目 <span style="float:right;font-size:12px;font-weight:400;color:var(--muted)">${esc(day.location)}</span></div>
      <div class="day-row">
        <div class="field"><label>日付</label><input class="input" type="date" data-day="${i}" data-set="date" value="${day.date}"></div>
        <div class="field"><label>行き先</label><input class="input" data-day="${i}" data-set="location" value="${esc(day.location)}"></div>
      </div>
      <div class="act-list" data-day="${i}">
        ${(day.activities || []).map((a, ai) => `
          <div class="act-item">
            <input class="input time" type="time" data-day="${i}" data-act="${ai}" data-set="time" value="${a.time}">
            <input class="input title" data-day="${i}" data-act="${ai}" data-set="title" value="${esc(a.title)}">
          </div>`).join('')}
      </div>
      <button class="add-act" data-action="add-activity" data-day="${i}">＋ 予定を追加</button>
      ${i > 0 ? `<button class="btn ghost small" data-action="del-day" data-day="${i}" style="margin-left:8px">この日を削除</button>` : ''}
    </div>`;
}

function readSetup() {
  const name = document.getElementById('trip-name').value.trim() || '無題の旅';
  const days = [];
  document.querySelectorAll('.subcard').forEach((sc) => {
    const di = Number(sc.dataset.day);
    const date = sc.querySelector('[data-set="date"]').value;
    const location = sc.querySelector('[data-set="location"]').value.trim() || '京都';
    const acts = [];
    sc.querySelectorAll('.act-item').forEach((row) => {
      const t = row.querySelector('[data-set="time"]').value;
      const ti = row.querySelector('[data-set="title"]').value.trim();
      if (ti) acts.push({ time: t, title: ti });
    });
    days.push({ date, location, activities: acts, label: `${di + 1}日目` });
  });
  return { name, days: days.filter((d) => d.date) };
}

// ---------------- events ----------------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;
  const idx = el.dataset.idx !== undefined ? Number(el.dataset.idx) : undefined;
  const day = el.dataset.day !== undefined ? Number(el.dataset.day) : undefined;

  switch (act) {
    case 'edit': state.view = 'setup'; renderSetup(); break;
    case 'back': state.view = 'main'; render(); break;
    case 'new-trip': state.trip = defaultSample(); state.weather = {}; state.loading = {}; state.view = 'setup'; renderSetup(); break;
    case 'sample': state.trip = defaultSample(); state.weather = {}; state.loading = {}; state.view = 'main'; saveTrip(); ensureWeather(); break;
    case 'open-day': openSheet(idx); break;
    case 'close-sheet': closeSheet(); break;
    case 'save': {
      const t = readSetup();
      state.trip = t; state.weather = {}; state.loading = {};
      state.view = 'main'; saveTrip(); ensureWeather();
      break;
    }
    case 'add-day': {
      const d = state.trip.days[0] || { date: fmtDate(new Date()), location: '京都' };
      state.trip.days.push({ date: d.date, location: d.location, activities: [], label: `${state.trip.days.length + 1}日目` });
      renderSetup();
      break;
    }
    case 'del-day': {
      state.trip.days.splice(day, 1);
      state.trip.days.forEach((d, i) => { d.label = `${i + 1}日目`; });
      renderSetup();
      break;
    }
    case 'add-activity': {
      const sc = document.querySelector(`.subcard[data-day="${day}"]`);
      const list = sc.querySelector('.act-list');
      const row = document.createElement('div');
      row.className = 'act-item';
      row.innerHTML = `<input class="input time" type="time" data-day="${day}" data-set="time" value="12:00"><input class="input title" data-day="${day}" data-set="title" placeholder="予定の内容">`;
      list.appendChild(row);
      break;
    }
  }
});

// ---------------- init ----------------
function init() {
  state.trip = loadTrip() || defaultSample();
  state.view = 'main';
  ensureWeather();
}
init();
