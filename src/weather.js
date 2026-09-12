// weather.js — Open-Meteo 連携（キー不要・無料）
// 1) 場所名 → 緯度経度
// 2) 日別＋時間別の予報取得
// 3) WMO 天気コード → アイコン・日本語ラベル変換

// ---- WMO weather code -> {emoji, label} ----
export function mapWeatherCode(code) {
  const map = {
    0:  { emoji: '☀️', label: '快晴' },
    1:  { emoji: '🌤️', label: 'ほぼ晴れ' },
    2:  { emoji: '⛅', label: '晴れ時々曇り' },
    3:  { emoji: '☁️', label: '曇り' },
    45: { emoji: '🌫️', label: '霧' },
    48: { emoji: '🌫️', label: '霧（着霜）' },
    51: { emoji: '🌦️', label: '霧雨' },
    53: { emoji: '🌦️', label: '霧雨' },
    55: { emoji: '🌦️', label: '霧雨' },
    56: { emoji: '🌧️', label: '凍結霧雨' },
    57: { emoji: '🌧️', label: '凍結霧雨' },
    61: { emoji: '🌧️', label: '雨' },
    63: { emoji: '🌧️', label: '雨' },
    65: { emoji: '🌧️', label: '強い雨' },
    66: { emoji: '🌧️', label: '凍結雨' },
    67: { emoji: '🌧️', label: '凍結雨' },
    71: { emoji: '🌨️', label: '雪' },
    73: { emoji: '🌨️', label: '雪' },
    75: { emoji: '🌨️', label: '強い雪' },
    77: { emoji: '❄️', label: '雪粒' },
    80: { emoji: '🌦️', label: 'にわか雨' },
    81: { emoji: '🌦️', label: 'にわか雨' },
    82: { emoji: '🌧️', label: '激しいにわか雨' },
    85: { emoji: '🌨️', label: 'にわか雪' },
    86: { emoji: '🌨️', label: 'にわか雪' },
    95: { emoji: '⛈️', label: '雷雨' },
    96: { emoji: '⛈️', label: '雷雨＋ひょう' },
    99: { emoji: '⛈️', label: '雷雨＋ひょう' },
  };
  return map[code] || { emoji: '🌡️', label: '不明' };
}
const isRainy = (code) => mapWeatherCode(code).label.includes('雨') || mapWeatherCode(code).label.includes('雪');
const isStorm = (code) => code >= 95;

// ---- Geocoding：場所名 -> 緯度経度 ----
// Open-Meteo の geocoding は都市名の完全一致が必要（「京都」は NG /「京都市」は OK）。
// ・まず入力名で試し、ヒットしなければ「◯◯市」に付け替えて再試行する。
export async function geocode(name) {
  const candidates = [name.trim(), `${name.trim()}市`];
  for (const c of candidates) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=1&language=ja&format=json`;
    const r = await fetch(url);
    if (!r.ok) continue;
    const j = await r.json();
    if (j.results && j.results.length) {
      const g = j.results[0];
      return { name: g.name, country: g.country || '', lat: g.latitude, lon: g.longitude };
    }
  }
  return null;
}

// ---- Forecast：日別＋時間別 ----
// dates: ['YYYY-MM-DD', ...] のうち予報が欲しい日。
// 戻り値: [{ date, daily:{...}|null, hourly:[...] }]
export async function fetchForecast(lat, lon, dates) {
  const forecastDays = 16; // Open-Meteo 無料枠（最大16日）
  const needs = dates.filter((d, i) => dates.indexOf(d) === i); // 重複除去
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
    + `&hourly=weather_code,temperature_2m,precipitation_probability`
    + `&timezone=auto&forecast_days=${forecastDays}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Forecast 失敗 (${r.status})`);
  const j = await r.json();
  if (j.error) throw new Error(j.reason);

  const daily = {};
  j.daily.time.forEach((d, i) => {
    daily[d] = {
      weather_code: j.daily.weather_code[i],
      temp_max: j.daily.temperature_2m_max[i],
      temp_min: j.daily.temperature_2m_min[i],
      precip_prob: j.daily.precipitation_probability_max?.[i] ?? 0,
    };
  });

  const hourly = {};
  j.hourly.time.forEach((t, i) => {
    const d = t.slice(0, 10);
    const h = t.slice(11, 13);
    if (!hourly[d]) hourly[d] = [];
    hourly[d].push({
      hour: h,
      weather_code: j.hourly.weather_code[i],
      temp: j.hourly.temperature_2m[i],
      precip: j.hourly.precipitation_probability?.[i] ?? 0,
    });
  });

  // 主要時間帯だけ抜粋（モバイルで見せる用）
  const want = ['06', '09', '12', '15', '18', '21'];
  return needs.map((date) => ({
    date,
    daily: daily[date] || null,
    hourly: (hourly[date] || []).filter((h) => want.includes(h.hour)),
  }));
}

// ---- 1日の概要（サマリー用） ----
export function summarizeDay(wx) {
  const d = wx?.daily;
  if (!d) return null;
  const { emoji, label } = mapWeatherCode(d.weather_code);
  const anyRain = isRainy(d.weather_code) || isStorm(d.weather_code) || d.precip_prob >= 40;
  return {
    emoji, label,
    max: d.temp_max, min: d.temp_min, precip: d.precip_prob,
    rainy: anyRain,
  };
}

// ---- 「今日のポイント」の持ち物提案 ----
export function packingTips(wx) {
  const d = wx?.daily;
  const tips = [];
  let note = '';
  if (!d) return { tips: ['予報待ち'], note: '予報が取得できたら提案します。' };

  const max = d.temp_max, min = d.temp_min, p = d.precip_prob;
  const rainyHr = (wx.hourly || []).some((h) => h.precip >= 40 && isRainy(h.weather_code));

  if (p >= 50 || rainyHr) {
    tips.push({ t: '折りたたみ傘', cls: 'blue' });
    if (p >= 70) tips.push({ t: '防水シューズ', cls: 'blue' });
    note = '雨の可能性が高い。屋外は午前中に寄せて、降りどころは屋内で。';
  } else if (max >= 25) {
    note = '日差しが強い。朝イチ行動とこまめな水分補給が◎。';
  } else if (min <= 8) {
    note = 'ぐっと冷える。厚手の上着があると安心。';
  } else if (min <= 12) {
    note = '朝晩ひんやり。薄手の上着を1枚。';
  } else {
    note = '過ごしやすい陽気。屋外メインで組んでよさそう。';
  }

  if (max >= 25) { tips.push({ t: '帽子', cls: 'ok' }); tips.push({ t: '日焼け止め', cls: 'ok' }); }
  if (min <= 8) tips.push({ t: '厚手のコート', cls: 'warm' });
  else if (min <= 12) tips.push({ t: '薄手の上着', cls: 'warm' });
  if (!tips.length) tips.push({ t: '歩きやすい靴' });

  return { tips, note };
}
