// FouFou Build -- City management tool
// Copyright 2026 Eitan Fisher. All Rights Reserved.

const { useState, useEffect, useRef } = React;

// Firebase
firebase.initializeApp({
  apiKey: "AIzaSyCAH_2fk_plk6Dg5dlCCfaRWKL3Nmc6V6g",
  authDomain: "bangkok-explorer.firebaseapp.com",
  databaseURL: "https://bangkok-explorer-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bangkok-explorer",
  storageBucket: "bangkok-explorer.firebasestorage.app",
  messagingSenderId: "139083217994",
  appId: "1:139083217994:web:48fc6a45028c91d177bab3"
});
const db   = firebase.database();
const auth = firebase.auth();

// Constants
const VERSION = '0.2.31';

// AI provider configuration
const AI_PROVIDERS = {
  gemini:    { name: 'Google Gemini', defaultModel: 'gemini-1.5-flash',         keyHint: 'AIza...',    keyUrl: 'https://aistudio.google.com/apikey',                free: true  },
  openai:    { name: 'OpenAI / ChatGPT', defaultModel: 'gpt-4o-mini',           keyHint: 'sk-...',     keyUrl: 'https://platform.openai.com/api-keys',              free: false },
  anthropic: { name: 'Anthropic Claude', defaultModel: 'claude-3-5-haiku-20241022', keyHint: 'sk-ant-...', keyUrl: 'https://console.anthropic.com/settings/keys',  free: false },
};
const getProvider  = () => localStorage.getItem('foufou_ai_provider') || 'gemini';
const getApiKey    = (p) => localStorage.getItem('foufou_ai_key_' + (p||getProvider())) || '';
const getModel     = (p) => localStorage.getItem('foufou_ai_model_' + (p||getProvider())) || AI_PROVIDERS[p||getProvider()]?.defaultModel || '';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com';
const DEFAULT_PROMPT = `City: {cityName}

You are building a tourist travel app. For EVERY neighborhood below you MUST fill all 3 fields.

Return a JSON array — one object per neighborhood, same order as input:
[{"nameHe":"Hebrew name/transliteration","descEn":"6-8 word tourist vibe","desc":"EXACT Hebrew translation of descEn"},...]

Rules:
- nameHe: transliterate or translate the area name into Hebrew script (REQUIRED, never leave empty)
- descEn: 6-8 words max, vivid tourist perspective. Examples:
  "Historic temples, street food, canal views"
  "Upscale cafes, luxury boutiques, leafy streets"
  "Gritty markets, backpacker bars, urban buzz"
  "Lively nightlife, rooftop bars, modern vibe"
- desc: translate descEn to Hebrew word-for-word (REQUIRED, never leave empty)

Neighborhoods:
{neighborhoods}

Return ONLY the JSON array. No explanation, no markdown, just the array.`;
const getPrompt = () => localStorage.getItem('foufou_ai_prompt') || DEFAULT_PROMPT;

const AREAS_PROMPT = `You are a travel expert building a tourist app for {cityName}{country}.
{cityCenter}
List 8-10 well-known tourist neighborhoods spread across the ENTIRE city — not clustered near the center.

Return ONLY a JSON array (no markdown, no explanation):
[{
  "id": "snake_case_id",
  "labelEn": "English name tourists use",
  "label": "Hebrew transliteration (REQUIRED, never empty)",
  "lat": 50.0865,
  "lng": 14.4114,
  "radius": 650,
  "descEn": "6-8 word tourist vibe e.g. Gothic lanes, dark beer, medieval towers",
  "desc": "Hebrew translation of descEn (REQUIRED, never empty)",
  "safety": "safe"
}]

COORDINATE RULES (most important):
- lat/lng: the REAL GPS center of that specific neighborhood — NOT the city center
- Areas must be geographically spread: include neighborhoods north, south, east AND west of the city center
- Verify each coordinate is distinct and in the right part of the city

RADIUS RULES:
- Dense historic center: 400-600m
- Mixed tourist area: 600-900m
- Large modern district or waterfront: 900-1500m

OVERLAP RULE:
- If two area circles would significantly overlap (centers closer than their combined radius), merge them or increase radius instead of creating two separate overlapping areas

OTHER RULES:
- Focus on where tourists walk, eat, explore — not administrative regions
- label and desc are REQUIRED in Hebrew script, never leave empty
- safety: "safe", "caution", or "danger"`;
const GOOGLE_KEY   = 'AIzaSyCE598tSisniM66ApqRvOyOq4svTf6pLHc';
const PLACES_URL   = 'https://places.googleapis.com/v1/places:searchText';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
// MapTiler streets-v2 -- same key + URL as foufou-dev (domain eitanfisher2026.github.io is allowed)
const MAPTILER_KEY = 'Uvu44hp7joiCfp72GhTj';
const MAP_TILES    = 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=' + MAPTILER_KEY;
const MAP_ATTR     = '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const COLORS = ['#4a90d9','#e8a838','#d95555','#3bba7e','#d97eb5','#7c7ce0','#9b7ed9','#2eb8c9','#e08540','#b36dd9','#38b3a0','#c93d5a'];

const HE_WORDS = {
  'old city': 'העיר העתיקה', 'old town': 'העיר העתיקה',
  'city center': 'מרכז העיר', 'city centre': 'מרכז העיר', 'downtown': 'מרכז העיר', 'center': 'מרכז',
  'northeast': 'צפון מזרח', 'northwest': 'צפון מערב',
  'southeast': 'דרום מזרח', 'southwest': 'דרום מערב',
  'north': 'צפון', 'south': 'דרום', 'east': 'מזרח', 'west': 'מערב',
  'port': 'נמל', 'harbor': 'נמל', 'harbour': 'נמל',
  'beach': 'חוף', 'riverside': 'גדת הנהר', 'waterfront': 'מול המים',
  'market': 'שוק', 'park': 'פארק', 'chinatown': "צ'יינה טאון",
  'uptown': 'אפטאון', 'midtown': 'מידטאון',
};

// Sort by key length so "northeast" matches before "north"
function suggestHebrew(nameEn) {
  const lower   = (nameEn || '').toLowerCase();
  const noSpace = lower.replace(/\s+/g, '');
  const entries = Object.entries(HE_WORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, val] of entries) {
    const keyNoSpace = key.replace(/\s+/g, '');
    if (noSpace === keyNoSpace || lower === key) return val;
    if (noSpace.includes(keyNoSpace) || lower.includes(key)) return val;
  }
  return '';
}

function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function toId(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }
function roundCoord(v) { return Math.round(v*10000)/10000; }

function isLatinScript(str) {
  if (!str) return false;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 591 && c !== 160) return false;
  }
  return true;
}

// Try each Overpass endpoint in order; return parsed JSON or null
async function fetchOverpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(20000)
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.trimStart().startsWith('<')) continue; // XML error / HTML page
      return JSON.parse(text);
    } catch(e) { continue; }
  }
  return null;
}

function processOverpassAreas(elements, cityLat, cityLng, maxRadius) {
  const seen = new Set(), raw = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const candidates = [tags['name:en'], tags['int_name'], tags['name:latin'],
      tags['name:fr'], tags['name:de'], tags['name:es'], tags['name']];
    const nameEn = candidates.find(n => n && n.length >= 2 && isLatinScript(n)) || '';
    if (!nameEn) continue;
    const key = nameEn.toLowerCase();
    if (seen.has(key)) continue;
    let lat, lng, radius;
    if (el.type === 'node') {
      lat = el.lat; lng = el.lon;
      const rMap = { neighbourhood:800, suburb:1500, quarter:700, borough:2500, district:2000, town:1200 };
      radius = rMap[tags.place] || 1000;
    } else if (el.center) {
      lat = el.center.lat; lng = el.center.lon;
      radius = el.bounds
        ? Math.round(Math.max((el.bounds.maxlat-el.bounds.minlat)*111320,
            (el.bounds.maxlon-el.bounds.minlon)*111320*Math.cos(lat*Math.PI/180))/2)
        : 1200;
    } else continue;
    radius = Math.max(400, Math.min(radius, 6000));
    const dist = distM(cityLat, cityLng, lat, lng);
    if (dist > maxRadius * 1.15) continue;
    seen.add(key);
    raw.push({ nameEn, lat, lng, radius, dist });
  }
  raw.sort((a, b) => a.dist - b.dist);
  const kept = [];
  for (const area of raw) {
    if (!kept.some(k => distM(area.lat,area.lng,k.lat,k.lng) < Math.min(area.radius,k.radius)*0.7)) kept.push(area);
    if (kept.length >= 12) break;
  }
  return kept;
}

function generateCompassAreas(cityLat, cityLng) {
  const R = 3000, dLat = R/111320, dLng = R/(111320*Math.cos(cityLat*Math.PI/180));
  const make = (id, en, lat, lng) => ({
    id, labelEn: en, label: suggestHebrew(en), desc: '', descEn: '',
    lat: roundCoord(lat), lng: roundCoord(lng), radius: 2000, size: 'medium', safety: 'safe'
  });
  return [
    make('center',    'City Center', cityLat,      cityLng),
    make('north',     'North',       cityLat+dLat, cityLng),
    make('south',     'South',       cityLat-dLat, cityLng),
    make('east',      'East',        cityLat,      cityLng+dLng),
    make('west',      'West',        cityLat,      cityLng-dLng),
    make('northeast', 'North East',  cityLat+dLat, cityLng+dLng),
    make('northwest', 'North West',  cityLat+dLat, cityLng-dLng),
    make('southeast', 'South East',  cityLat-dLat, cityLng+dLng),
  ];
}

// Fetch a one-sentence tourist description from Wikipedia for an area name + city
async function fetchAreaDesc(areaName, cityName) {
  const titles = [areaName + ', ' + cityName, areaName];
  for (const t of titles) {
    try {
      const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t),
        { headers: { 'Api-User-Agent': 'FouFou-Build/1.0' } });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.extract && d.type !== 'disambiguation') {
        // Take first sentence only
        const first = d.extract.split(/(?<=[.!?])\s/)[0] || '';
        if (first.length > 10 && first.length < 200) return first;
      }
    } catch(e) { continue; }
  }
  return '';
}

// Fetch a Wikipedia DISTRICT/NEIGHBOURHOOD MAP image (not a photo) for the city
async function fetchWikiRefMap(cityName) {
  const pageTitles = [
    'Administrative divisions of ' + cityName,
    'Boroughs of ' + cityName,
    'Districts of ' + cityName,
    'Neighbourhoods of ' + cityName,
    'Neighborhoods of ' + cityName,
  ];
  for (const title of pageTitles) {
    try {
      // Get the list of images on the page
      const r = await fetch(
        'https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(title) +
        '&prop=images&imlimit=30&format=json&origin=*'
      );
      if (!r.ok) continue;
      const d = await r.json();
      const pages = Object.values(d?.query?.pages || {});
      if (!pages[0] || pages[0].missing !== undefined) continue;
      const images = pages[0]?.images || [];
      // Prefer images with "map", "district", "borough", "quarter" in filename
      const mapImg = images.find(img => {
        const n = img.title.toLowerCase();
        return /map|district|borough|quarter|neighbou|arrondissement|stadtbezirk|mcp/.test(n)
          && !/(locator|location|flag|coat|logo|icon|portal|commons|wiki)/.test(n)
          && /(\.svg|\.png|\.jpg)$/.test(n);
      });
      if (!mapImg) continue;
      // Resolve the actual image URL
      const r2 = await fetch(
        'https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(mapImg.title) +
        '&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*'
      );
      if (!r2.ok) continue;
      const d2 = await r2.json();
      const pg2 = Object.values(d2?.query?.pages || {})[0];
      const url = pg2?.imageinfo?.[0]?.thumburl || pg2?.imageinfo?.[0]?.url;
      if (url) return url;
    } catch(e) { continue; }
  }
  return '';
}

// Ask AI for the single best emoji icon for a city (its famous symbol)
async function generateCityIcon(cityName) {
  if (!getApiKey()) return '';
  const result = await callAI(
    'Return a single emoji that best represents the city "' + cityName + '" as a tourist destination — use its most iconic landmark or cultural symbol.\n' +
    'Examples: Paris→🗼  New York→🗽  Prague→🏰  Tokyo→⛩️  Cairo→🔺  Rome→🏛️  Sydney→🌉  Amsterdam→🚲  London→🎡  Barcelona→🏟️  Venice→🚢  Istanbul→🕌\n' +
    'Return ONLY the single emoji, nothing else.',
    10
  );
  if (!result || result.error) return '';
  const m = (result.trim()).match(/\p{Extended_Pictographic}/u);
  return m ? m[0] : '';
}

// Compass positions (fractional x,y in the SVG canvas) for the schema renderer
const SCHEMA_POS = {
  center:[0.50,0.50], c:[0.50,0.50],
  n:[0.50,0.14], north:[0.50,0.14],
  s:[0.50,0.86], south:[0.50,0.86],
  e:[0.83,0.50], east:[0.83,0.50],
  w:[0.17,0.50], west:[0.17,0.50],
  ne:[0.78,0.18], nw:[0.22,0.18],
  se:[0.78,0.82], sw:[0.22,0.82],
};
const SCHEMA_COLORS = ['#e8734a','#5b9dc9','#7db87a','#c97ab8','#c9a85b','#7a8ec9','#c97a7a','#7ac9b0','#a07ac9','#b8c97a'];

// Render the neighborhood schema JSON to a data: SVG URL
function renderNeighborhoodSchemaSvg(schema, cityName) {
  const W = 500, H = 330;
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,32);
  const blobs = schema.map((area, i) => {
    const key = (area.pos||'center').toLowerCase().replace(/\s|-/g,'');
    const [fx, fy] = SCHEMA_POS[key] || [0.5, 0.5];
    const isCenter = key === 'center' || key === 'c';
    return { cx: fx*W, cy: fy*H, rx: isCenter?84:66, ry: isCenter?48:37,
      c: area.color || SCHEMA_COLORS[i % SCHEMA_COLORS.length],
      name: esc(area.name||''), desc: esc(area.desc||''), isCenter };
  });
  const center = blobs.find(b => b.isCenter);
  const lines = center ? blobs.filter(b => !b.isCenter).map(b =>
    `<line x1="${center.cx|0}" y1="${center.cy|0}" x2="${b.cx|0}" y2="${b.cy|0}" stroke="#cbbfaf" stroke-width="1.5" stroke-dasharray="6,4" stroke-linecap="round"/>`
  ).join('') : '';
  const shapes = blobs.map(b =>
    `<ellipse cx="${b.cx|0}" cy="${b.cy|0}" rx="${b.rx}" ry="${b.ry}" fill="${b.c}" fill-opacity="0.28" stroke="${b.c}" stroke-width="2" stroke-opacity="0.65"/>` +
    `<text x="${b.cx|0}" y="${(b.cy-5)|0}" text-anchor="middle" font-size="${b.isCenter?13.5:11.5}" font-family="'Helvetica Neue',Arial,sans-serif" fill="${b.c}" font-weight="800">${b.name}</text>` +
    (b.desc ? `<text x="${b.cx|0}" y="${(b.cy+11)|0}" text-anchor="middle" font-size="8.5" font-family="Arial,sans-serif" fill="#5f5a52">${b.desc}</text>` : '')
  ).join('');
  const title = cityName
    ? `<text x="${W/2}" y="16" text-anchor="middle" font-size="11" font-family="'Helvetica Neue',Arial,sans-serif" fill="#8a7a6a" font-weight="700" letter-spacing="2">${esc(cityName.toUpperCase())} NEIGHBORHOODS</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="bg2" cx="50%" cy="55%" r="70%"><stop offset="0%" stop-color="#fdf8ef"/><stop offset="100%" stop-color="#ede5d6"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#bg2)" rx="10"/>${title}${lines}${shapes}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Ask the AI for a tourist neighborhood schema (spatial positions + descriptions)
async function generateNeighborhoodSchema(cityName) {
  if (!getApiKey()) return null;
  const result = await callAI(
    'City: ' + cityName + '\n\nCreate a tourist neighborhood reference schema.\n' +
    'List 6-9 main tourist areas with compass position and short description.\n\n' +
    'Return ONLY a JSON array:\n' +
    '[{"name":"Old Town","pos":"center","color":"#e8734a","desc":"Historic core, top sights"},\n' +
    ' {"name":"Letná","pos":"n","color":"#5b9dc9","desc":"Parks, hipster cafes"},\n' +
    ' {"name":"Vinohrady","pos":"se","color":"#7db87a","desc":"Upscale, art nouveau"},\n' +
    ' ...]\n\n' +
    'pos MUST be one of: center, n, s, e, w, ne, nw, se, sw\n' +
    'color: visually distinct, warm/cool palette\n' +
    'desc: max 4 words, tourist-focused\n' +
    'Focus ONLY on areas tourists visit — NOT all administrative districts.',
    700
  );
  if (!result || result.error) return null;
  try {
    const clean = result.replace(/^```[a-z]*\n?/,'').replace(/\n?```$/,'').trim();
    const arr = JSON.parse(clean);
    return Array.isArray(arr) && arr.length >= 3 ? arr : null;
  } catch(e) { return null; }
}

// Generate a data-URL SVG minimap showing area positions relative to each other
function makeAreaOverviewSvgUrl(areas) {
  if (!areas || areas.length < 2) return '';
  const W = 420, H = 280;
  const lats = areas.map(a => a.lat), lngs = areas.map(a => a.lng);
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const spanLat = (Math.max(...lats) - Math.min(...lats)) || 0.08;
  const spanLng = (Math.max(...lngs) - Math.min(...lngs)) || 0.08;
  const scale = Math.min((W * 0.80) / spanLng, (H * 0.80) / spanLat);
  const toX = lng => W/2 + (lng - cLng) * scale;
  const toY = lat => H/2 - (lat - cLat) * scale;
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,24);
  const elems = areas.map((a, i) => {
    const x = toX(a.lng).toFixed(1), y = toY(a.lat).toFixed(1);
    const r = Math.min(40, Math.max(9, a.radius / 111320 * scale)).toFixed(1);
    const c = COLORS[i % COLORS.length];
    const ty = (parseFloat(y) + parseFloat(r) + 10).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="2"/>` +
           `<text x="${x}" y="${ty}" text-anchor="middle" font-size="9" font-family="system-ui,sans-serif" fill="${c}" font-weight="700">${esc(a.labelEn)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#eef2f7" rx="6"/>${elems.join('')}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Unified AI call — returns text string or { error: '...' }
async function callAI(prompt, maxTokens) {
  const provider = getProvider();
  const key = getApiKey(provider);
  const model = getModel(provider);
  if (!key) return { error: 'No API key set for ' + AI_PROVIDERS[provider].name + '. Click 🔑 to add one.' };

  try {
    let r, body;

    if (provider === 'gemini') {
      // Try v1 then v1beta
      const urls = [
        GEMINI_BASE + '/v1/models/' + model + ':generateContent?key=' + key,
        GEMINI_BASE + '/v1beta/models/' + model + ':generateContent?key=' + key,
      ];
      for (const url of urls) {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens || 2048 } })
        });
        if (r.ok) break;
        const e = await r.json().catch(() => ({}));
        if (r.status !== 404) return { error: 'Gemini ' + r.status + ': ' + (e?.error?.message || 'Unknown error') };
      }
      if (!r.ok) { return { error: 'Gemini model "' + model + '" not available on your account.\nOpen 🔑, try one of: gemini-1.5-pro, gemini-1.0-pro, gemini-pro' }; }
      const d = await r.json();
      return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    }

    if (provider === 'openai') {
      r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens || 2048, temperature: 0.7,
          messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); return { error: 'OpenAI ' + r.status + ': ' + (e?.error?.message || 'Check your API key') }; }
      const d = await r.json();
      return (d.choices?.[0]?.message?.content || '').trim();
    }

    if (provider === 'anthropic') {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: maxTokens || 2048,
          messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); return { error: 'Anthropic ' + r.status + ': ' + (e?.error?.message || 'Check your API key and credits') }; }
      const d = await r.json();
      return (d.content?.[0]?.text || '').trim();
    }

    return { error: 'Unknown provider: ' + provider };
  } catch(e) { return { error: 'Network error: ' + e.message }; }
}

async function generateWithAI(areas, cityName) {
  const key = getApiKey();
  if (!key) return { error: 'No API key. Click 🔑 to add one.' };
  const list = areas.map((a, i) => i + ': ' + (a.labelEn || '')).join('\n');
  const prompt = getPrompt().replace('{cityName}', cityName).replace('{neighborhoods}', list);
  const result = await callAI(prompt, 2048);
  if (result && result.error) return result;
  try {
    const clean = (result||'').replace(/^```[a-z]*\n?/,'').replace(/\n?```$/,'').trim();
    const arr = JSON.parse(clean);
    return Array.isArray(arr) ? arr : { error: 'AI returned unexpected format. Try again.' };
  } catch(e) { return { error: 'Could not parse AI response. Try adjusting the prompt.' }; }
}

// Generate city areas using AI — returns area array or { error }
async function generateAreasWithAI(cityName, country, cityLat, cityLng) {
  const centerLine = (cityLat && cityLng)
    ? 'The city center is at approximately ' + cityLat.toFixed(4) + ', ' + cityLng.toFixed(4) + '. Use this as a reference — area coordinates must be in the correct direction from this point.\n'
    : '';
  const prompt = AREAS_PROMPT
    .replace('{cityName}', cityName)
    .replace('{country}', country ? ' (' + country + ')' : '')
    .replace('{cityCenter}', centerLine);
  const result = await callAI(prompt, 3000);
  if (!result || result.error) return result || { error: 'No response from AI' };
  try {
    const clean = result.replace(/^```[a-z]*\n?/,'').replace(/\n?```$/,'').trim();
    const arr = JSON.parse(clean);
    if (!Array.isArray(arr)) return { error: 'AI returned unexpected format' };
    const areas = arr
      .map((a, i) => ({
        id: toId(a.id || a.labelEn || 'area_' + i),
        labelEn: a.labelEn || '',
        label: a.label || suggestHebrew(a.labelEn || ''),
        lat: roundCoord(parseFloat(a.lat) || 0),
        lng: roundCoord(parseFloat(a.lng) || 0),
        radius: Math.max(300, Math.min(5000, parseInt(a.radius) || 800)),
        descEn: a.descEn || '',
        desc: a.desc || '',
        size: (parseInt(a.radius) || 800) > 2000 ? 'large' : 'medium',
        safety: a.safety || 'safe'
      }))
      .filter(a => a.lat !== 0 && a.lng !== 0);
    if (areas.length < 3) return { error: 'AI returned too few areas (' + areas.length + ')' };
    return areas;
  } catch(e) { return { error: 'Could not parse AI areas. Try again.' }; }
}

async function getCityNameHebrew(cityName) {
  const key = getApiKey();
  if (!key) return '';
  const result = await callAI('Translate/transliterate the city name "' + cityName + '" to Hebrew. Return only the Hebrew text, nothing else.', 20);
  return (result && !result.error) ? result : '';
}

function buildArea(a, i) {
  const name = a.nameEn || a.labelEn || '';
  return {
    id: toId(name || ('area_'+i)),
    labelEn: name,
    label: a.label || suggestHebrew(name),
    descEn: a.descEn || '', desc: a.desc || '',
    lat: roundCoord(a.lat), lng: roundCoord(a.lng),
    radius: Math.round((a.radius||1200)/100)*100,
    size: (a.radius||1200) > 2500 ? 'large' : 'medium',
    safety: a.safety || 'safe'
  };
}

// Toast -- errors stay open until manually closed; others auto-dismiss after 3.5s
const Toast = ({ msg, type, onDone }) => {
  const isError = type === 'error';
  useEffect(() => {
    if (isError) return; // no auto-dismiss for errors
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, []);
  const bg = { success:'#16a34a', error:'#dc2626', info:'#2563eb', warning:'#d97706' };
  const copy = () => navigator.clipboard?.writeText(msg).catch(() => {});
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
      background: bg[type]||'#1e293b', color:'white', padding:'10px 16px',
      borderRadius:10, fontSize:13, fontWeight:'bold',
      boxShadow:'0 4px 20px rgba(0,0,0,0.35)', zIndex:9999,
      display:'flex', alignItems:'center', gap:10, maxWidth:'80vw'
    }}>
      <span style={{ flex:1, wordBreak:'break-word', whiteSpace:'pre-wrap' }}>{msg}</span>
      <button onClick={copy} title="Copy"
        style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6,
          color:'white', cursor:'pointer', padding:'3px 7px', fontSize:13, flexShrink:0 }}>
        ⧉
      </button>
      <button onClick={onDone} title="Close"
        style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6,
          color:'white', cursor:'pointer', padding:'3px 8px', fontSize:14, fontWeight:'bold', flexShrink:0 }}>
        ✕
      </button>
    </div>
  );
};

// ─── Leaflet Map ──────────────────────────────────────────────────────────────
// Key fixes:
//   1. Map initialised with explicit center+zoom so flyTo never crashes on uninitialised map.
//   2. cityLat/cityLng stored in refs so the init effect closure always has current values.
//   3. mapReady state ensures the redraw effect runs with fresh props, not stale closure.
//   4. flyTo wrapped in try-catch as a final safety net.
const AreaMap = ({ areas, selectedIdx, cityLat, cityLng, allCityRadius, onSelect, onMove }) => {
  const divRef      = useRef(null);
  const mapRef      = useRef(null);
  const layersRef   = useRef([]);
  const cityLatRef  = useRef(cityLat);
  const cityLngRef  = useRef(cityLng);
  const [mapReady, setMapReady] = useState(false);

  // Keep lat/lng refs current
  useEffect(() => { cityLatRef.current = cityLat; cityLngRef.current = cityLng; }, [cityLat, cityLng]);

  // Init map once with an explicit center so flyTo is always safe
  useEffect(() => {
    window.loadLeaflet().then(() => {
      if (mapRef.current || !divRef.current) return;
      const lat = cityLatRef.current || 30, lng = cityLngRef.current || 20;
      const map = L.map(divRef.current, { center: [lat, lng], zoom: 12, zoomControl: true });
      L.tileLayer(MAP_TILES, { attribution: MAP_ATTR, maxZoom: 19, subdomains: 'abcd' }).addTo(map);
      mapRef.current = map;
      setTimeout(() => { map.invalidateSize(); setMapReady(true); }, 150);
    });
  }, []);

  // Redraw on ready / areas / selection change
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    layersRef.current = [];

    // City boundary
    if (cityLat && cityLng && allCityRadius) {
      layersRef.current.push(
        L.circle([cityLat, cityLng], {
          radius: allCityRadius, color:'#94a3b8', fillColor:'#94a3b8',
          fillOpacity:0.04, weight:2, dashArray:'10,7', interactive:false
        }).addTo(map)
      );
    }

    // Areas
    if (areas && areas.length) {
      areas.forEach((area, i) => {
        const color = COLORS[i % COLORS.length], sel = i === selectedIdx;
        const circle = L.circle([area.lat, area.lng], {
          radius: area.radius, color, fillColor: color,
          fillOpacity: sel ? 0.35 : 0.12, weight: sel ? 3 : 1.5
        }).addTo(map);
        circle.on('click', () => onSelect(i));

        const lbl = L.divIcon({
          className: '',
          html: '<div style="font-size:11px;font-weight:bold;background:rgba(255,255,255,0.92);padding:2px 7px;border-radius:4px;border:2px solid '+color+';white-space:nowrap;color:'+color+';box-shadow:0 1px 3px rgba(0,0,0,.15)">'+(area.labelEn||'?')+'</div>',
          iconSize:[140,22], iconAnchor:[70,11]
        });
        const mk = L.marker([area.lat, area.lng], { icon: lbl, interactive: true }).addTo(map);
        mk.on('click', () => onSelect(i));
        layersRef.current.push(circle, mk);
      });

      // Fit to show all areas whenever nothing is selected
      if (selectedIdx === null) {
        const circles = layersRef.current.filter(l => l instanceof L.Circle);
        try { map.fitBounds(L.featureGroup(circles).getBounds().pad(0.2)); } catch(e) {}
      }
    }

    // Fly to selected area
    if (selectedIdx !== null && areas && areas[selectedIdx]) {
      const a = areas[selectedIdx];
      try { map.flyTo([a.lat, a.lng], 14, { duration: 0.5 }); } catch(e) {}

      // Draggable move handle — lets user reposition the area on the map
      if (onMove) {
        const moveIcon = L.divIcon({
          className: '',
          html: '<div style="width:26px;height:26px;background:white;border:3px solid #6366f1;border-radius:50%;cursor:move;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(99,102,241,0.45)">✛</div>',
          iconSize: [26,26], iconAnchor: [13,13]
        });
        const mover = L.marker([a.lat, a.lng], { icon: moveIcon, draggable: true, zIndexOffset: 2000 }).addTo(map);
        mover.on('dragend', e => {
          const ll = e.target.getLatLng();
          onMove(selectedIdx, roundCoord(ll.lat), roundCoord(ll.lng));
        });
        layersRef.current.push(mover);
      }
    }
  }, [mapReady, areas, selectedIdx]);

  return <div ref={divRef} style={{ width:'100%', height:'100%' }} />;
};

// ─── Area Editor Panel ────────────────────────────────────────────────────────
const AreaEditor = ({ area, idx, total, onChange, onDelete, onMoveUp, onMoveDown }) => {
  if (!area) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100%', color:'#94a3b8', fontSize:13, padding:16, textAlign:'center' }}>
      Click an area on the map or in the list to edit it
    </div>
  );

  const inp = (label, key, ph, dir) => (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>{label}</div>
      <input value={area[key]||''} onChange={e => onChange({...area,[key]:e.target.value})}
        placeholder={ph||''} dir={dir||'ltr'}
        style={{ width:'100%', boxSizing:'border-box', padding:'6px 10px', border:'1px solid #e2e8f0',
          borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }} />
    </div>
  );
  const txt = (label, key, dir, ph) => (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>{label}</div>
      <input value={area[key]||''} onChange={e => onChange({...area,[key]:e.target.value})}
        placeholder={ph||''} dir={dir||'ltr'}
        style={{ width:'100%', boxSizing:'border-box', padding:'6px 10px', border:'1px solid #e2e8f0',
          borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }} />
    </div>
  );

  return (
    <div style={{ padding:16, overflowY:'auto', height:'100%', boxSizing:'border-box' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>
          Area {idx+1} / {total}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={onMoveUp} disabled={idx===0}
            style={{ padding:'3px 8px', fontSize:11, borderRadius:6, border:'1px solid #e2e8f0',
              background:'#f8fafc', cursor:'pointer', opacity: idx===0?0.3:1 }}>up</button>
          <button onClick={onMoveDown} disabled={idx===total-1}
            style={{ padding:'3px 8px', fontSize:11, borderRadius:6, border:'1px solid #e2e8f0',
              background:'#f8fafc', cursor:'pointer', opacity: idx===total-1?0.3:1 }}>dn</button>
          <button onClick={onDelete}
            style={{ padding:'3px 8px', fontSize:11, borderRadius:6, border:'1px solid #fecaca',
              background:'#fef2f2', color:'#ef4444', cursor:'pointer' }}>Delete</button>
        </div>
      </div>

      {inp('Name (English)', 'labelEn', 'e.g. Old Town, Chinatown, Riverside')}
      {inp('Name (Hebrew)', 'label', 'שם האזור בעברית', 'rtl')}
      {txt('Description (English)', 'descEn', 'ltr', 'e.g. Historic temples, street food, night markets')}
      {txt('Description (Hebrew)', 'desc', 'rtl', 'תאר בקצרה: אתרים, אווירה, מה לראות')}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>Radius (m)</div>
          <input type="number" step="100" min="300" max="8000" value={area.radius||1000}
            onChange={e => onChange({...area, radius: parseInt(e.target.value)||1000})}
            style={{ width:'100%', boxSizing:'border-box', padding:'6px 10px', border:'1px solid #e2e8f0',
              borderRadius:8, fontSize:13, outline:'none' }} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>Safety</div>
          <select value={area.safety||'safe'} onChange={e => onChange({...area, safety:e.target.value})}
            style={{ width:'100%', boxSizing:'border-box', padding:'6px 10px', border:'1px solid #e2e8f0',
              borderRadius:8, fontSize:13, outline:'none', background:'white' }}>
            <option value="safe">Safe</option>
            <option value="caution">Caution</option>
            <option value="danger">Danger</option>
          </select>
        </div>
      </div>
      <div style={{ fontSize:11, color:'#cbd5e1' }}>Center: {area.lat}, {area.lng}</div>
    </div>
  );
};

// ─── Draggable reference-map dialog ──────────────────────────────────────────
const RefMapDialog = ({ src, onClose }) => {
  const [pos,  setPos]  = useState({ x: 80, y: 80 });
  const [zoom, setZoom] = useState(1);
  const onMouseDown = (e) => {
    e.preventDefault();
    const ox = e.clientX - pos.x, oy = e.clientY - pos.y;
    const move = ev => setPos({ x: ev.clientX - ox, y: ev.clientY - oy });
    const up   = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const btnS = { padding:'2px 10px', fontSize:15, border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', background:'white', lineHeight:1.4 };
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9500 }} onMouseDown={e => e.target===e.currentTarget && onClose()}>
      <div style={{ position:'absolute', top:pos.y, left:pos.x, background:'white', borderRadius:12,
        boxShadow:'0 12px 48px rgba(0,0,0,0.32)', border:'1px solid #e2e8f0', overflow:'hidden', minWidth:340 }}>
        {/* Drag handle / toolbar */}
        <div onMouseDown={onMouseDown} style={{ padding:'8px 12px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0',
          cursor:'grab', userSelect:'none', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, color:'#475569', fontWeight:600 }}>Reference Map — drag to move</span>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            <button style={btnS} onClick={() => setZoom(z => Math.max(0.25, +(z-0.25).toFixed(2)))}>−</button>
            <span style={{ fontSize:11, color:'#94a3b8', minWidth:36, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
            <button style={btnS} onClick={() => setZoom(z => Math.min(5, +(z+0.25).toFixed(2)))}>+</button>
            <button style={{...btnS, borderColor:'#fecaca', background:'#fef2f2', color:'#ef4444', fontWeight:'bold'}} onClick={onClose}>✕</button>
          </div>
        </div>
        {/* Image */}
        <div style={{ overflow:'auto', maxHeight:'82vh', maxWidth:'90vw', padding:10 }}>
          <img src={src} alt="Reference" draggable={false}
            style={{ display:'block', width: (680*zoom) + 'px', maxWidth:'none', borderRadius:8 }} />
        </div>
      </div>
    </div>
  );
};

// ─── Shared review layout (used by AddCityFlow and CityEditor) ────────────────
const ReviewLayout = ({ title, areas, setAreas, selIdx, setSelIdx,
  cityLat: initLat, cityLng: initLng, allCityRadius: initRadius,
  initMeta, onBack, onSave, saving, extraButton, onCityConfigChange, onAIFill, showToast }) => {

  // Geo config
  const [cityLat, setCityLat]           = useState(initLat || 30);
  const [cityLng, setCityLng]           = useState(initLng || 20);
  const [allCityRadius, setAllCityRadius] = useState(initRadius || 15000);
  // City metadata
  const [cfgIcon,        setCfgIcon]        = useState(initMeta?.icon || '🏙️');
  const [cfgNameEn,      setCfgNameEn]      = useState(initMeta?.nameEn || '');
  const [cfgNameHe,      setCfgNameHe]      = useState(initMeta?.nameHe || '');
  const [dayStartHour,   setDayStartHour]   = useState(initMeta?.dayStartHour ?? 7);
  const [nightStartHour, setNightStartHour] = useState(initMeta?.nightStartHour ?? 18);
  const [distMultiplier, setDistMultiplier] = useState(initMeta?.distanceMultiplier ?? 1.05);
  const [refMapUrl,      setRefMapUrl]      = useState(initMeta?.referenceMapUrl || '');
  const [schemaUrl,      setSchemaUrl]      = useState(initMeta?.schemaUrl || '');
  const [genSchema,      setGenSchema]      = useState(false);
  // UI state
  const [showCfg, setShowCfg]     = useState(false);
  const [isDirty, setIsDirty]     = useState(false);
  const [dialogSrc, setDialogSrc] = useState(null);
  const [aiFilling, setAiFilling]             = useState(false);
  const [mergeMode, setMergeMode]             = useState(false);
  const [mergeFirst, setMergeFirst]           = useState(null); // idx of first area to merge
  const [showKeyPanel, setShowKeyPanel]       = useState(false);
  const [providerDraft, setProviderDraft]     = useState(getProvider());
  const [keyDraftLocal, setKeyDraftLocal]     = useState(() => getApiKey(getProvider()));
  const [modelDraftLocal, setModelDraftLocal] = useState(() => getModel(getProvider()));
  const [promptDraftLocal, setPromptDraftLocal] = useState(getPrompt());

  const switchProviderDraft = (p) => {
    setProviderDraft(p);
    setKeyDraftLocal(getApiKey(p));
    setModelDraftLocal(getModel(p));
  };

  const notify = (overrides) => {
    if (onCityConfigChange) onCityConfigChange({
      lat: cityLat, lng: cityLng, radius: allCityRadius,
      icon: cfgIcon, nameEn: cfgNameEn, nameHe: cfgNameHe,
      dayStartHour, nightStartHour, distanceMultiplier: distMultiplier,
      refMapUrl,
      ...overrides
    });
  };
  const setAndNotify = (setter, key, val) => { setter(val); notify({ [key]: val }); };

  const autoRadius = () => {
    if (!areas.length) return;
    const r = Math.round(Math.max(...areas.map(a => distM(cityLat, cityLng, a.lat, a.lng) + a.radius)));
    setAllCityRadius(r); notify({ radius: r });
    setIsDirty(true);
  };

  const doGenerateSchema = async () => {
    if (!getApiKey()) { setShowKeyPanel(true); return; }
    setGenSchema(true);
    const schema = await generateNeighborhoodSchema(cfgNameEn || title).catch(() => null);
    if (schema) setSchemaUrl(renderNeighborhoodSchemaSvg(schema, cfgNameEn || title));
    else if (showToast) showToast('Could not generate schema — check AI key', 'warning');
    setGenSchema(false);
  };

  const handleBack = () => {
    if (isDirty && !window.confirm('You have unsaved changes.\nLeave without saving?')) return;
    onBack();
  };

  const markDirty = (fn) => (...args) => { fn(...args); setIsDirty(true); };

  const updateArea = (idx, updated) => { setAreas(prev => prev.map((a,i) => i===idx ? updated : a)); setIsDirty(true); };
  const deleteArea = (idx) => { setAreas(prev => prev.filter((_,i) => i!==idx)); setSelIdx(null); setIsDirty(true); };

  const mergeAreas = (i1, i2) => {
    const a = areas[i1], b = areas[i2];
    const merged = {
      id: toId(a.labelEn + '_' + b.labelEn),
      labelEn: a.labelEn + ' / ' + b.labelEn,
      label: (a.label || '') + ' / ' + (b.label || ''),
      lat: roundCoord((a.lat + b.lat) / 2),
      lng: roundCoord((a.lng + b.lng) / 2),
      radius: Math.round(Math.max(a.radius, b.radius) * 1.2 / 100) * 100,
      descEn: a.descEn || b.descEn,
      desc: a.desc || b.desc,
      size: 'large', safety: a.safety === 'danger' || b.safety === 'danger' ? 'danger' : a.safety === 'caution' || b.safety === 'caution' ? 'caution' : 'safe'
    };
    setAreas(prev => prev.filter((_,i) => i !== i1 && i !== i2).concat([merged]));
    setSelIdx(null); setMergeMode(false); setMergeFirst(null); setIsDirty(true);
  };

  const handleAreaClick = (i) => {
    if (!mergeMode) { setSelIdx(i); return; }
    if (mergeFirst === null) { setMergeFirst(i); return; }
    if (mergeFirst === i) { setMergeFirst(null); return; }
    mergeAreas(mergeFirst, i);
  };
  const moveArea   = (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= areas.length) return;
    setAreas(prev => { const a=[...prev]; [a[idx],a[next]]=[a[next],a[idx]]; return a; });
    setSelIdx(next); setIsDirty(true);
  };
  const moveAreaOnMap = (idx, lat, lng) => {
    setAreas(prev => prev.map((a,i) => i===idx ? {...a, lat, lng} : a));
    setIsDirty(true);
  };

  const addArea = () => {
    const a = { id:'area_'+Date.now(), labelEn:'New Area', label:'', descEn:'', desc:'',
      lat: roundCoord(cityLat), lng: roundCoord(cityLng), radius:1000, size:'medium', safety:'safe' };
    setAreas(prev => [...prev, a]);
    setSelIdx(areas.length); setIsDirty(true);
  };

  // Full-screen layout using position:fixed -- guarantees Leaflet gets real pixel dimensions
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, display:'flex',
      flexDirection:'column', zIndex:100, background:'white' }}>

      {/* Header */}
      <div style={{ borderBottom:'1px solid #e2e8f0', background:'white', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={handleBack}
              style={{ color:'#94a3b8', fontSize:13, background:'none', border:'none', cursor:'pointer' }}>
              Back{isDirty ? ' *' : ''}
            </button>
            <span style={{ fontWeight:'bold', color:'#1e293b', fontSize:15, display:'flex', alignItems:'center', gap:6 }}>
              <span title="Click to change icon" style={{ position:'relative', display:'inline-flex' }}>
                <input value={cfgIcon} onChange={e => { setCfgIcon(e.target.value); setIsDirty(true); notify({icon:e.target.value}); }}
                  maxLength={4} title="Click to change city icon"
                  style={{ width:36, height:32, fontSize:22, border:'1px solid #e2e8f0', borderRadius:6,
                    textAlign:'center', fontFamily:'inherit', background:'#f8fafc',
                    cursor:'text', padding:0, outline:'none' }}
                  onFocus={e => { e.target.style.borderColor='#6366f1'; e.target.style.background='#eff6ff'; }}
                  onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; }} />
              </span>
              {cfgNameEn || title}
            </span>
            {cfgNameHe && <span style={{ color:'#64748b', fontSize:14 }} dir="rtl">{cfgNameHe}</span>}
            <span style={{ color:'#94a3b8', fontSize:13 }}>-- {areas.length} areas</span>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {extraButton}
            <button onClick={() => { setSelIdx(null); }}
              style={{ padding:'6px 10px', fontSize:12, border:'1px solid #e2e8f0',
                borderRadius:8, cursor:'pointer', color:'#475569', background:'#f8fafc' }}>
              Show All
            </button>
            <button onClick={() => setShowKeyPanel(v => !v)}
              title="Anthropic API key"
              style={{ padding:'6px 10px', fontSize:12, border:'1px solid #e2e8f0',
                borderRadius:8, cursor:'pointer', fontWeight:600,
                background: getApiKey() ? '#f0fdf4' : '#fef3c7',
                color: getApiKey() ? '#16a34a' : '#d97706' }}>
              {getApiKey() ? '🔑 ✓' : '🔑 Key'}
            </button>
            {onAIFill && (
              <button onClick={async () => {
                  if (!getApiKey()) { setShowKeyPanel(true); return; }
                  setAiFilling(true);
                  const result = await onAIFill(areas, setAreas);
                  if (result && result.error) {
                    if (showToast) showToast('AI error: ' + result.error, 'error');
                    else alert(result.error);
                  }
                  setIsDirty(true); setAiFilling(false);
                }}
                disabled={aiFilling}
                style={{ padding:'6px 10px', fontSize:12, border:'1px solid #e2e8f0',
                  borderRadius:8, cursor:'pointer', fontWeight:600,
                  background:'#fef3c7', color:'#d97706', opacity: aiFilling ? 0.6 : 1 }}>
                {aiFilling ? '⏳...' : '🤖 AI Fill'}
              </button>
            )}
            <button onClick={() => setShowCfg(v => !v)}
              style={{ padding:'6px 10px', fontSize:12, border:'1px solid #e2e8f0',
                borderRadius:8, cursor:'pointer', fontWeight:600,
                background: showCfg ? '#eff6ff' : '#f8fafc', color: showCfg ? '#2563eb' : '#475569' }}>
              ⚙️ City
            </button>
            <button onClick={addArea}
              style={{ padding:'6px 10px', fontSize:12, background:'#f1f5f9', border:'none',
                borderRadius:8, cursor:'pointer', fontWeight:600, color:'#475569' }}>+ Area</button>
            <button onClick={() => { setMergeMode(v => !v); setMergeFirst(null); setSelIdx(null); }}
              style={{ padding:'6px 10px', fontSize:12, border:'1px solid #e2e8f0',
                borderRadius:8, cursor:'pointer', fontWeight:600,
                background: mergeMode ? '#fef3c7' : '#f8fafc',
                color: mergeMode ? '#d97706' : '#475569' }}>
              {mergeMode ? (mergeFirst !== null ? '⬡ click 2nd area' : '⬡ click 1st area') : '⬡ Merge'}
            </button>
            <button onClick={() => { onSave({ cityLat, cityLng, allCityRadius, cfgIcon, cfgNameEn, cfgNameHe, dayStartHour, nightStartHour, distMultiplier, refMapUrl }); setIsDirty(false); }}
              disabled={saving || !areas.length}
              style={{ padding:'6px 14px', fontSize:13, background:'#10b981', color:'white',
                border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold',
                opacity: (saving||!areas.length) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : 'Save City'}
            </button>
          </div>
        </div>

        {/* AI settings panel */}
        {showKeyPanel && (
          <div style={{ padding:'12px 16px', background:'#fefce8', borderTop:'1px solid #fde68a' }}>
            {/* Provider tabs */}
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {Object.entries(AI_PROVIDERS).map(([id, p]) => (
                <button key={id} onClick={() => switchProviderDraft(id)}
                  style={{ padding:'4px 12px', fontSize:12, fontWeight:600, borderRadius:20,
                    border: '1px solid ' + (providerDraft===id ? '#d97706' : '#e2e8f0'),
                    background: providerDraft===id ? '#fef3c7' : 'white',
                    color: providerDraft===id ? '#92400e' : '#64748b', cursor:'pointer' }}>
                  {p.name} {getApiKey(id) ? '✓' : ''} {p.free ? '(free)' : ''}
                </button>
              ))}
            </div>
            {/* Key + model row */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#92400e', minWidth:34 }}>Key</span>
              <input value={keyDraftLocal} onChange={e => setKeyDraftLocal(e.target.value)} type="password"
                placeholder={AI_PROVIDERS[providerDraft].keyHint}
                style={{ flex:2, minWidth:180, padding:'5px 10px', border:'1px solid #fcd34d',
                  borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none' }} />
              <span style={{ fontSize:12, fontWeight:600, color:'#92400e' }}>Model</span>
              <input value={modelDraftLocal} onChange={e => setModelDraftLocal(e.target.value)}
                style={{ flex:1, minWidth:120, padding:'5px 10px', border:'1px solid #fcd34d',
                  borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none' }} />
              <a href={AI_PROVIDERS[providerDraft].keyUrl} target="_blank" rel="noreferrer"
                style={{ fontSize:11, color:'#92400e', whiteSpace:'nowrap' }}>Get key ↗</a>
            </div>
            {/* Prompt */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#92400e', minWidth:46, paddingTop:4 }}>Prompt</span>
              <textarea value={promptDraftLocal} onChange={e => setPromptDraftLocal(e.target.value)}
                rows={7} spellCheck={false}
                style={{ flex:1, padding:'6px 10px', border:'1px solid #fcd34d', borderRadius:8,
                  fontSize:11, fontFamily:'monospace', outline:'none', resize:'vertical', lineHeight:1.5 }} />
            </div>
            {/* Buttons */}
            <div style={{ display:'flex', gap:8, marginTop:8, justifyContent:'flex-end' }}>
              <button onClick={() => setPromptDraftLocal(DEFAULT_PROMPT)}
                style={{ padding:'5px 12px', fontSize:11, background:'white', border:'1px solid #fcd34d',
                  borderRadius:8, cursor:'pointer', color:'#92400e' }}>Reset prompt</button>
              <button onClick={() => setShowKeyPanel(false)}
                style={{ padding:'5px 12px', fontSize:11, background:'white', border:'1px solid #e2e8f0',
                  borderRadius:8, cursor:'pointer', color:'#64748b' }}>Cancel</button>
              <button onClick={() => {
                  localStorage.setItem('foufou_ai_provider', providerDraft);
                  localStorage.setItem('foufou_ai_key_' + providerDraft, keyDraftLocal.trim());
                  localStorage.setItem('foufou_ai_model_' + providerDraft, modelDraftLocal.trim());
                  localStorage.setItem('foufou_ai_prompt', promptDraftLocal);
                  setShowKeyPanel(false);
                  if (showToast) showToast('AI settings saved (' + AI_PROVIDERS[providerDraft].name + ')', 'success');
                }}
                style={{ padding:'5px 14px', background:'#d97706', color:'white', border:'none',
                  borderRadius:8, fontSize:12, fontWeight:'bold', cursor:'pointer' }}>Save</button>
            </div>
          </div>
        )}

        {/* City config panel -- all city-level fields */}
        {showCfg && (
          <div style={{ padding:'12px 16px', background:'#eff6ff', borderTop:'1px solid #dbeafe' }}>
            {/* Row 1: Identity */}
            <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', textTransform:'uppercase', letterSpacing:1, minWidth:72 }}>Identity</span>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Icon</span>
                <input value={cfgIcon} onChange={e => { setCfgIcon(e.target.value); setIsDirty(true); notify({icon:e.target.value}); }}
                  maxLength={4} style={{ width:44, padding:'3px', border:'1px solid #93c5fd', borderRadius:6, fontSize:22, textAlign:'center', outline:'none' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Name EN</span>
                <input value={cfgNameEn} onChange={e => { setCfgNameEn(e.target.value); setIsDirty(true); notify({nameEn:e.target.value}); }}
                  style={{ width:110, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Name HE</span>
                <input value={cfgNameHe} onChange={e => { setCfgNameHe(e.target.value); setIsDirty(true); notify({nameHe:e.target.value}); }}
                  dir="rtl" style={{ width:110, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
            </div>
            {/* Row 2: Geography */}
            <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', textTransform:'uppercase', letterSpacing:1, minWidth:72 }}>Geography</span>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Center Lat</span>
                <input type="number" step="0.0001" value={cityLat||''}
                  onChange={e => { const v=parseFloat(e.target.value)||cityLat; setCityLat(v); setIsDirty(true); notify({lat:v}); }}
                  style={{ width:90, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Lng</span>
                <input type="number" step="0.0001" value={cityLng||''}
                  onChange={e => { const v=parseFloat(e.target.value)||cityLng; setCityLng(v); setIsDirty(true); notify({lng:v}); }}
                  style={{ width:90, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Boundary (m)</span>
                <input type="number" step="500" value={allCityRadius||''}
                  onChange={e => { const v=parseInt(e.target.value)||allCityRadius; setAllCityRadius(v); setIsDirty(true); notify({radius:v}); }}
                  style={{ width:80, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
                <button onClick={autoRadius}
                  style={{ padding:'4px 9px', fontSize:11, background:'#2563eb', color:'white',
                    border:'none', borderRadius:6, cursor:'pointer', fontWeight:600 }}>Auto</button>
              </div>
            </div>
            {/* Row 3: Behaviour */}
            <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', textTransform:'uppercase', letterSpacing:1, minWidth:72 }}>Behaviour</span>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Day starts (h)</span>
                <input type="number" min={0} max={12} value={dayStartHour}
                  onChange={e => { const v=parseInt(e.target.value)??7; setDayStartHour(v); setIsDirty(true); notify({dayStartHour:v}); }}
                  style={{ width:52, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Night starts (h)</span>
                <input type="number" min={12} max={24} value={nightStartHour}
                  onChange={e => { const v=parseInt(e.target.value)??18; setNightStartHour(v); setIsDirty(true); notify({nightStartHour:v}); }}
                  style={{ width:52, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#475569' }}>Distance multiplier</span>
                <input type="number" min={1} max={2} step={0.05} value={distMultiplier}
                  onChange={e => { const v=parseFloat(e.target.value)||1.05; setDistMultiplier(v); setIsDirty(true); notify({distanceMultiplier:v}); }}
                  style={{ width:60, padding:'4px 8px', border:'1px solid #93c5fd', borderRadius:6, fontSize:12, outline:'none' }} />
              </div>
            </div>
            {/* Row 4: Reference schema */}
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', textTransform:'uppercase', letterSpacing:1, minWidth:72 }}>Reference</span>
                <span style={{ fontSize:11, color:'#64748b' }}>AI neighborhood schema — use this to validate &amp; adjust generated areas</span>
                <button onClick={doGenerateSchema} disabled={genSchema}
                  style={{ padding:'3px 10px', fontSize:11, background: genSchema?'#f1f5f9':'#eff6ff',
                    border:'1px solid #93c5fd', borderRadius:6, cursor:'pointer', color:'#2563eb',
                    fontWeight:600, opacity: genSchema?0.6:1 }}>
                  {genSchema ? '⏳ Generating...' : schemaUrl ? '↻ Regenerate' : '🗺️ Generate Schema'}
                </button>
              </div>
              {schemaUrl ? (
                <img src={schemaUrl} alt="Neighborhood schema" title="Click to enlarge"
                  onClick={() => setDialogSrc(schemaUrl)}
                  style={{ maxWidth:'100%', maxHeight:200, borderRadius:8, border:'1px solid #dbeafe',
                    display:'block', cursor:'zoom-in', marginBottom:8 }} />
              ) : (
                <div style={{ fontSize:11, color:'#94a3b8', padding:'8px 0', marginBottom:8 }}>
                  Click "Generate Schema" to create an AI reference map of the real tourist neighborhoods.
                </div>
              )}
              {/* Optional external URL */}
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>External URL (optional):</span>
                <input value={refMapUrl}
                  onChange={e => { setRefMapUrl(e.target.value); setIsDirty(true); notify({ refMapUrl: e.target.value }); }}
                  placeholder="Paste any district/neighborhood map URL"
                  style={{ flex:1, minWidth:140, padding:'3px 7px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:11, outline:'none', fontFamily:'inherit' }} />
                {refMapUrl && (
                  <a href={refMapUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize:11, color:'#2563eb', textDecoration:'none' }}>Open ↗</a>
                )}
              </div>
              {refMapUrl && (
                <img src={refMapUrl} alt="External reference" title="Click to enlarge"
                  onClick={() => setDialogSrc(refMapUrl)}
                  style={{ maxWidth:'100%', maxHeight:140, borderRadius:8, border:'1px solid #e2e8f0',
                    display:'block', cursor:'zoom-in', marginTop:6 }}
                  onError={e => { e.target.style.display='none'; }} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Area list */}
        <div style={{ width:176, flexShrink:0, borderRight:'1px solid #e2e8f0',
          overflowY:'auto', background:'#f8fafc' }}>
          {areas.map((area, i) => {
            const isMerge1 = mergeMode && mergeFirst === i;
            const isSelected = !mergeMode && selIdx === i;
            return (
            <div key={i} onClick={() => handleAreaClick(i)}
              style={{ padding:'10px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer',
                background: isMerge1 ? '#fef3c7' : isSelected ? 'white' : 'transparent',
                borderLeft: isMerge1 ? '4px solid #d97706' : isSelected ? '4px solid #6366f1' : '4px solid transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:20, height:20, borderRadius:'50%', background:COLORS[i%COLORS.length],
                  color:'white', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:'bold', flexShrink:0 }}>{i+1}</span>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#1e293b',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {area.labelEn || '(unnamed)'}
                  </div>
                  {area.label && (
                    <div style={{ fontSize:11, color:'#94a3b8',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {area.label}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Map -- takes remaining space, AreaMap fills it via height:100% */}
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
          <AreaMap areas={areas} selectedIdx={selIdx} cityLat={cityLat} cityLng={cityLng}
            allCityRadius={allCityRadius} onSelect={handleAreaClick} onMove={moveAreaOnMap} />
        </div>

        {/* Editor */}
        <div style={{ width:288, flexShrink:0, borderLeft:'1px solid #e2e8f0',
          background:'white', overflow:'hidden' }}>
          <AreaEditor
            area={selIdx !== null ? areas[selIdx] : null}
            idx={selIdx} total={areas.length}
            onChange={updated => updateArea(selIdx, updated)}
            onDelete={() => deleteArea(selIdx)}
            onMoveUp={() => moveArea(selIdx, -1)}
            onMoveDown={() => moveArea(selIdx, 1)}
          />
        </div>
      </div>
      {dialogSrc && <RefMapDialog src={dialogSrc} onClose={() => setDialogSrc(null)} />}
    </div>
  );
};

// ─── Add City Flow ────────────────────────────────────────────────────────────
const AddCityFlow = ({ showToast, onDone }) => {
  const [step, setStep]           = useState('search');
  const [query, setQuery]         = useState('');
  const [searching, setSearching] = useState(false);
  const [foundCity, setFoundCity] = useState(null);
  const [genStep, setGenStep] = useState(''); // '', 'ai', 'osm', 'wrap'
  const [areas, setAreas]         = useState([]);
  const [selIdx, setSelIdx]       = useState(null);
  const [cityIcon, setCityIcon]   = useState('');
  const [iconSuggesting, setIconSuggesting] = useState(false);
  const [foundCityHe, setFoundCityHe] = useState('');
  const [refMapUrl, setRefMapUrl] = useState('');
  const [schemaUrl, setSchemaUrl] = useState('');
  const [saving, setSaving]       = useState(false);
  const [allCityRadius, setAllCityRadius] = useState(15000);

  const recalcRadius = (lat, lng, areaList) => {
    if (!areaList.length) return 15000;
    return Math.round(Math.max(...areaList.map(a => distM(lat,lng,a.lat,a.lng)+a.radius)));
  };

  const searchCity = async () => {
    if (!query.trim()) return;
    setSearching(true); setFoundCity(null);
    try {
      const resp = await fetch(PLACES_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-Goog-Api-Key':GOOGLE_KEY,
          'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.location,places.viewport,places.types' },
        body: JSON.stringify({ textQuery:query, languageCode:'en', maxResultCount:5 })
      });
      const data = await resp.json();
      const cityTypes = ['locality','administrative_area_level_1','administrative_area_level_2'];
      const p = data.places?.find(pl => pl.types?.some(t => cityTypes.includes(t))) || data.places?.[0];
      if (p?.location) {
        const cityName = p.displayName?.text || query;
        setFoundCity({ name:cityName, address:p.formattedAddress||'',
          lat:p.location.latitude, lng:p.location.longitude, viewport:p.viewport });
        setCityIcon('');
        if (getApiKey()) {
          setIconSuggesting(true);
          generateCityIcon(cityName)
            .then(icon => { if (icon) setCityIcon(icon); })
            .finally(() => setIconSuggesting(false));
        }
      } else { showToast('City not found -- try a different spelling', 'error'); }
    } catch(e) { showToast('Search failed: '+e.message, 'error'); }
    setSearching(false);
  };

  const generateAreas = async () => {
    if (!foundCity) return;
    const { lat, lng, viewport } = foundCity;
    const country = (foundCity.address || '').split(',').pop()?.trim() || '';
    let builtAreas = null;

    // Step 1: try AI (gives accurate tourist areas with names + descriptions in one call)
    if (getApiKey()) {
      setGenStep('ai');
      const aiResult = await generateAreasWithAI(foundCity.name, country, lat, lng);
      if (Array.isArray(aiResult) && aiResult.length >= 3) {
        builtAreas = aiResult;
      } else if (aiResult?.error) {
        showToast('AI areas: ' + aiResult.error + ' — trying OpenStreetMap fallback', 'warning');
      }
    }

    // Step 2: fallback to Overpass (OSM) if AI unavailable or failed
    if (!builtAreas) {
      setGenStep('osm');
      const s = viewport?.low?.latitude  ?? lat-0.18, w = viewport?.low?.longitude  ?? lng-0.18;
      const n = viewport?.high?.latitude ?? lat+0.18, e = viewport?.high?.longitude ?? lng+0.18;
      const maxR = Math.max(viewport ? distM(s,w,n,e)/2 : 20000, 12000);
      const q = '[out:json][timeout:30];\n(\n' +
        '  relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"]('+s+','+w+','+n+','+e+');\n' +
        '  node["place"~"^(neighbourhood|suburb|quarter|borough|district)$"]["name"]('+s+','+w+','+n+','+e+');\n' +
        ');\nout center tags bb;';
      try {
        const data = await fetchOverpass(q);
        let processed = data ? processOverpassAreas(data.elements||[], lat, lng, maxR) : [];
        if (processed.length < 4) {
          showToast('Limited map data — using compass layout', 'warning');
          processed = generateCompassAreas(lat, lng);
        }
        builtAreas = processed.map(buildArea);
        if (getApiKey()) {
          generateWithAI(builtAreas, foundCity.name).then(results => {
            if (results && !results.error) {
              setAreas(prev => prev.map((a, i) => results[i]
                ? { ...a, label: results[i].nameHe||a.label, descEn: results[i].descEn||a.descEn, desc: results[i].desc||a.desc }
                : a));
            }
          });
        }
      } catch(e) {
        showToast('Area generation failed: ' + e.message, 'error');
        setGenStep('');
        return;
      }
    }

    // Step 3: translate + generate neighborhood reference schema
    setGenStep('wrap');
    const [he, schema] = await Promise.all([
      getCityNameHebrew(foundCity.name).catch(() => ''),
      generateNeighborhoodSchema(foundCity.name).catch(() => null),
    ]);

    setFoundCityHe(he || '');
    setSchemaUrl(schema ? renderNeighborhoodSchemaSvg(schema, foundCity.name) : '');
    setAreas(builtAreas);
    setAllCityRadius(recalcRadius(lat, lng, builtAreas));
    setSelIdx(null);
    setStep('review');
    setGenStep('');
  };

  const saveCity = async (meta) => {
    if (!foundCity || !areas.length) return;
    setSaving(true);
    try {
      const cityId = toId(meta?.cfgNameEn || foundCity.name);
      const icon = meta?.cfgIcon || cityIcon || '🏙️';
      await Promise.all([
        db.ref('cities/'+cityId+'/config').set({
          center:{ lat:roundCoord(meta?.lat || foundCity.lat), lng:roundCoord(meta?.lng || foundCity.lng) },
          allCityRadius: meta?.radius || allCityRadius,
          distanceMultiplier: meta?.distMultiplier || 1.05,
          dayStartHour: meta?.dayStartHour ?? 7,
          nightStartHour: meta?.nightStartHour ?? 18,
          areas, interestToGooglePlaces:{}, textSearchInterests:{graffiti:'street art'},
          interestTooltips:{}, systemRoutes:[]
        }),
        db.ref('settings/cityRegistry/'+cityId).set({
          id:cityId,
          name: meta?.cfgNameHe || foundCity.name,
          nameEn: meta?.cfgNameEn || foundCity.name,
          country:(foundCity.address.split(',').pop()||'').trim(),
          icon, active:false, order:99
        })
      ]);
      showToast((meta?.cfgNameEn || foundCity.name)+' saved (inactive)', 'success');
      onDone();
    } catch(e) { showToast('Save failed: '+e.message, 'error'); }
    setSaving(false);
  };

  if (step === 'search') return (
    <div style={{ maxWidth:520, margin:'0 auto', padding:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={onDone}
          style={{ color:'#94a3b8', fontSize:13, background:'none', border:'none', cursor:'pointer' }}>Back</button>
        <h2 style={{ margin:0, fontSize:18, fontWeight:'bold', color:'#1e293b' }}>Add New City</h2>
      </div>
      <div style={{ background:'white', borderRadius:12, border:'1px solid #e2e8f0', padding:20 }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#475569', marginBottom:8 }}>City name (English)</div>
          <div style={{ display:'flex', gap:8 }}>
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchCity()}
              placeholder="e.g. Barcelona, Tokyo, Amsterdam..."
              style={{ flex:1, padding:'10px 14px', border:'2px solid #e2e8f0', borderRadius:10,
                fontSize:13, outline:'none', fontFamily:'inherit' }} autoFocus />
            <button onClick={searchCity} disabled={!query.trim()||searching}
              style={{ padding:'10px 20px', background:'#4f46e5', color:'white', border:'none',
                borderRadius:10, fontSize:13, fontWeight:'bold', cursor:'pointer',
                opacity:(!query.trim()||searching)?0.5:1 }}>
              {searching ? '...' : 'Search'}
            </button>
          </div>
        </div>

        {foundCity && (
          <div style={{ background:'#f0fdf4', border:'2px solid #86efac', borderRadius:10, padding:16 }}>
            <div style={{ fontWeight:'bold', fontSize:15, color:'#1e293b' }}>{foundCity.name}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{foundCity.address}</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{foundCity.lat.toFixed(4)}, {foundCity.lng.toFixed(4)}</div>

            <div style={{ marginTop:14, padding:'12px', background:'white', borderRadius:8, border:'1px solid #d1fae5' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5, display:'flex', alignItems:'center', gap:8 }}>
                City Icon
                {iconSuggesting && <span style={{ fontSize:10, color:'#d97706', fontWeight:600 }}>🤖 AI suggesting...</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:40, width:56, height:56, display:'flex', alignItems:'center', justifyContent:'center',
                  border:'2px solid ' + (iconSuggesting ? '#fcd34d' : '#6366f1'),
                  borderRadius:12, background: iconSuggesting ? '#fefce8' : '#eff6ff', flexShrink:0 }}>
                  {iconSuggesting ? '⏳' : (cityIcon || '🏙️')}
                </div>
                <div style={{ flex:1 }}>
                  <input value={cityIcon} onChange={e=>setCityIcon(e.target.value)} maxLength={4}
                    placeholder={iconSuggesting ? 'AI is choosing...' : 'type any emoji to override'}
                    style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', border:'1px solid #e2e8f0',
                      borderRadius:8, fontSize:16, fontFamily:'inherit', outline:'none' }} />
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:4 }}>
                    AI picks the city symbol automatically — type to override
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={()=>setFoundCity(null)}
                style={{ flex:1, padding:'8px', border:'1px solid #e2e8f0', borderRadius:10,
                  fontSize:13, background:'white', cursor:'pointer', color:'#475569' }}>Try again</button>
              <button onClick={generateAreas} disabled={!!genStep}
                style={{ flex:1, padding:'8px', background:'#10b981', color:'white', border:'none',
                  borderRadius:10, fontSize:13, fontWeight:'bold', cursor:'pointer',
                  opacity:genStep?0.5:1 }}>
                {genStep === 'ai'  ? '⏳ Asking AI for areas...' :
                 genStep === 'osm' ? '⏳ Fetching map data...' :
                 genStep === 'wrap' ? '⏳ Finishing up...' :
                 'Generate Areas'}
              </button>
            </div>
          </div>
        )}
        {genStep && (
          <div style={{ textAlign:'center', padding:24, color:'#64748b', fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>
              {genStep === 'ai' ? '🤖' : genStep === 'osm' ? '🗺️' : '✨'}
            </div>
            <div style={{ marginBottom:8 }}>
              {genStep === 'ai'  ? 'Asking AI for tourist neighborhoods...' :
               genStep === 'osm' ? 'Fetching map data from OpenStreetMap...' :
               'Translating names and fetching reference map...'}
            </div>
            <div style={{ display:'flex', justifyContent:'center', gap:6 }}>
              {['ai','osm','wrap'].map(s => (
                <div key={s} style={{ width:8, height:8, borderRadius:'50%',
                  background: s === genStep ? '#10b981' : '#e2e8f0',
                  transition:'background 0.3s' }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (step === 'review') return (
    <ReviewLayout
      title={foundCity?.name || ''}
      areas={areas} setAreas={a => { setAreas(a); setAllCityRadius(recalcRadius(foundCity.lat, foundCity.lng, a)); }}
      selIdx={selIdx} setSelIdx={setSelIdx}
      cityLat={foundCity?.lat} cityLng={foundCity?.lng}
      allCityRadius={allCityRadius}
      initMeta={{ icon: cityIcon||'🏙️', nameEn: foundCity?.name||'', nameHe: foundCityHe, dayStartHour:7, nightStartHour:18, distanceMultiplier:1.05, referenceMapUrl: refMapUrl, schemaUrl }}
      onAIFill={async (currentAreas, setAreas) => {
        const results = await generateWithAI(currentAreas, foundCity?.name||'');
        if (results?.error) return results;
        if (Array.isArray(results)) { setAreas(prev => prev.map((a,i) => results[i] ? {...a, label:results[i].nameHe||a.label, descEn:results[i].descEn||a.descEn, desc:results[i].desc||a.desc} : a)); return null; }
        return { error: 'No results returned' };
      }}
      showToast={showToast}
      onBack={() => setStep('search')}
      onSave={saveCity} saving={saving}
    />
  );
  return null;
};

// ─── City Editor ──────────────────────────────────────────────────────────────
const CityEditor = ({ cityKey, regEntry, showToast, onDone }) => {
  const [areas, setAreas]         = useState([]);
  const [selIdx, setSelIdx]       = useState(null);
  const [config, setConfig]       = useState(null);
  const [cityConfig, setCityConfig] = useState(null); // center + radius overrides from config panel
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    db.ref('cities/'+regEntry.id+'/config').once('value').then(snap => {
      const cfg = snap.val();
      if (cfg) {
        setConfig(cfg);
        setCityConfig({ lat: cfg.center?.lat, lng: cfg.center?.lng, radius: cfg.allCityRadius });
        const raw = cfg.areas
          ? (Array.isArray(cfg.areas) ? cfg.areas : Object.values(cfg.areas))
          : [];
        setAreas(raw.map(buildArea));
      }
    }).finally(() => setLoading(false));
  }, []);

  const cityLat = config?.center?.lat || 30;
  const cityLng = config?.center?.lng || 20;
  const allCityRadius = config?.allCityRadius || 15000;

  const saveCity = async (meta) => {
    if (!areas.length) return;
    setSaving(true);
    try {
      await Promise.all([
        db.ref('cities/'+regEntry.id+'/config').update({
          areas,
          allCityRadius: meta?.radius || allCityRadius,
          center: { lat: roundCoord(meta?.lat || cityLat), lng: roundCoord(meta?.lng || cityLng) },
          distanceMultiplier: meta?.distMultiplier || config?.distanceMultiplier || 1.05,
          dayStartHour: meta?.dayStartHour ?? config?.dayStartHour ?? 7,
          nightStartHour: meta?.nightStartHour ?? config?.nightStartHour ?? 18,
          referenceMapUrl: meta?.refMapUrl ?? config?.referenceMapUrl ?? '',
        }),
        db.ref('settings/cityRegistry/'+cityKey).update({
          icon: meta?.cfgIcon || regEntry.icon,
          name: meta?.cfgNameHe || regEntry.name,
          nameEn: meta?.cfgNameEn || regEntry.nameEn,
        })
      ]);
      showToast(regEntry.nameEn+' saved', 'success');
      onDone();
    } catch(e) { showToast('Save failed: '+e.message, 'error'); }
    setSaving(false);
  };

  const deleteCity = async () => {
    if (!window.confirm('Delete ' + regEntry.nameEn + '?\n\nThis removes the city config and registry entry. Custom places and reviews are kept.')) return;
    try {
      await Promise.all([
        db.ref('cities/'+regEntry.id+'/config').remove(),
        db.ref('settings/cityRegistry/'+cityKey).remove()
      ]);
      showToast(regEntry.nameEn+' deleted', 'info');
      onDone();
    } catch(e) { showToast('Delete failed: '+e.message, 'error'); }
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94a3b8' }}>
      Loading {regEntry.nameEn}...
    </div>
  );

  const deleteBtn = (
    <button onClick={deleteCity}
      style={{ padding:'6px 12px', fontSize:12, background:'#fef2f2', border:'1px solid #fecaca',
        borderRadius:8, cursor:'pointer', fontWeight:600, color:'#ef4444' }}>
      🗑️ Delete
    </button>
  );

  return (
    <ReviewLayout
      title={regEntry.nameEn}
      areas={areas} setAreas={setAreas}
      selIdx={selIdx} setSelIdx={setSelIdx}
      cityLat={cityLat} cityLng={cityLng}
      allCityRadius={allCityRadius}
      initMeta={{
        icon: regEntry.icon || '🏙️',
        nameEn: regEntry.nameEn || '',
        nameHe: regEntry.name || '',
        dayStartHour: config?.dayStartHour ?? 7,
        nightStartHour: config?.nightStartHour ?? 18,
        distanceMultiplier: config?.distanceMultiplier ?? 1.05,
        referenceMapUrl: config?.referenceMapUrl || '',
      }}
      onBack={onDone}
      onSave={saveCity} saving={saving}
      extraButton={deleteBtn}
      onAIFill={async (currentAreas, setAreasFn) => {
        const results = await generateWithAI(currentAreas, regEntry.nameEn);
        if (results?.error) return results;
        if (Array.isArray(results)) { setAreasFn(prev => prev.map((a,i) => results[i] ? {...a, label:results[i].nameHe||a.label, descEn:results[i].descEn||a.descEn, desc:results[i].desc||a.desc} : a)); return null; }
        return { error: 'No results returned' };
      }}
      showToast={showToast}
    />
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id:'cities',    icon:'🏙️', title:'City Builder',        color:'#10b981', ready:true,
    desc:'Create and edit cities — define areas, boundaries, names and characteristics.' },
  { id:'favorites', icon:'⭐', title:'Favorites Generator',  color:'#f59e0b', ready:false,
    desc:'AI agent adds 5 curated places per area per interest using Google Places.' },
  { id:'tips',      icon:'💡', title:'Tips Generator',       color:'#6366f1', ready:false,
    desc:'Generate practical tourist tips for each city, like the Bangkok tips in FouFou.' },
  { id:'trails',    icon:'🗺️', title:'Trail Generator',      color:'#ec4899', ready:false,
    desc:'Generate 2 recommended saved trails per area per city.' },
];

const Dashboard = ({ onNavigate, user, onSignOut }) => (
  <div style={{ minHeight:'100vh', background:'#f8fafc' }}>
    <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'14px 32px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:24 }}>🏗️</span>
        <div>
          <div style={{ fontWeight:'bold', color:'#1e293b', fontSize:18, lineHeight:1.2 }}>FouFou Build</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>City content management · v{VERSION}</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:12, color:'#64748b' }}>{user?.displayName||user?.email}</div>
        <button onClick={onSignOut} style={{ fontSize:12, padding:'6px 12px', borderRadius:8,
          border:'1px solid #e2e8f0', color:'#64748b', background:'white', cursor:'pointer' }}>Sign out</button>
      </div>
    </div>
    <div style={{ maxWidth:760, margin:'0 auto', padding:'40px 24px' }}>
      <h2 style={{ fontSize:20, fontWeight:'bold', color:'#1e293b', marginBottom:6 }}>What would you like to do?</h2>
      <p style={{ fontSize:13, color:'#64748b', marginBottom:32 }}>All tasks use your configured AI — set it up via the 🔑 button inside any section.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {SECTIONS.map(s => (
          <div key={s.id}
            onClick={() => s.ready && onNavigate(s.id)}
            style={{ background:'white', borderRadius:16, padding:28,
              border:'2px solid ' + (s.ready ? s.color : '#e2e8f0'),
              cursor: s.ready ? 'pointer' : 'default',
              opacity: s.ready ? 1 : 0.65, transition:'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { if (s.ready) { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'; }}}
            onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
            <div style={{ fontSize:36, marginBottom:12 }}>{s.icon}</div>
            <div style={{ fontSize:16, fontWeight:'bold', color:'#1e293b', marginBottom:8 }}>{s.title}</div>
            <div style={{ fontSize:13, color:'#64748b', lineHeight:1.6 }}>{s.desc}</div>
            {s.ready
              ? <div style={{ marginTop:16, fontSize:13, fontWeight:700, color:s.color }}>Open →</div>
              : <div style={{ marginTop:16, fontSize:11, color:'#94a3b8', fontStyle:'italic' }}>Coming soon</div>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── City List ────────────────────────────────────────────────────────────────
const CityList = ({ onAddCity, onEditCity }) => {
  const [cities, setCities]   = useState({});
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    db.ref('settings/cityRegistry').once('value').then(snap => {
      const reg = snap.val() || {};
      setCities(reg);
      return Promise.all(Object.values(reg).map(c =>
        db.ref('cities/'+c.id+'/config/areas').once('value').then(s => ({ id:c.id, areas:s.val() }))
      ));
    }).then(results => {
      const counts = {};
      results.forEach(({ id, areas }) => {
        counts[id] = areas ? (Array.isArray(areas) ? areas.length : Object.keys(areas).length) : null;
      });
      setConfigs(counts);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const toggleActive = (e, key, city) => {
    e.stopPropagation();
    const next = !city.active;
    setCities(prev => ({ ...prev, [key]: { ...prev[key], active: next } }));
    db.ref('settings/cityRegistry/' + key + '/active').set(next).catch(() => reload());
  };

  const sorted = Object.entries(cities).sort((a,b) => (a[1].nameEn||'').localeCompare(b[1].nameEn||''));

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 style={{ margin:0, fontSize:15, fontWeight:'bold', color:'#334155' }}>
          Cities <span style={{ color:'#94a3b8', fontWeight:'normal' }}>({sorted.length})</span>
        </h2>
        <button onClick={onAddCity}
          style={{ padding:'8px 16px', background:'#10b981', color:'white', border:'none',
            borderRadius:8, fontSize:13, fontWeight:'bold', cursor:'pointer' }}>+ New City</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:13 }}>Loading cities...</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {sorted.map(([key, city]) => (
            <div key={key} onClick={() => onEditCity(key, city)}
              style={{ background:'white', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px',
                display:'flex', alignItems:'center', gap:16, cursor:'pointer',
                transition:'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor='#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor='#e2e8f0'}>
              <span style={{ fontSize:28, flexShrink:0 }}>{city.icon?.startsWith?.('data:') ? '🏙️' : (city.icon||'🏙️')}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:'bold', color:'#1e293b' }}>{city.nameEn}</div>
                <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>
                  {city.name} · {city.country}
                  {configs[city.id] != null
                    ? <span style={{ marginLeft:8, color:'#64748b' }}>· {configs[city.id]} areas</span>
                    : <span style={{ marginLeft:8, color:'#f59e0b' }}>· not seeded</span>}
                </div>
              </div>
              <button onClick={e => toggleActive(e, key, city)}
                title="Click to toggle active / inactive"
                style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600, flexShrink:0,
                  border:'none', cursor:'pointer',
                  background: city.active ? '#dcfce7' : '#f1f5f9',
                  color: city.active ? '#16a34a' : '#64748b' }}>
                {city.active ? 'Active' : 'Inactive'}
              </button>
              <span style={{ fontSize:12, color:'#6366f1', fontWeight:600, flexShrink:0 }}>Edit →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const FouFouBuild = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser]               = useState(null);
  const [userRole, setUserRole]       = useState(0);
  const [view, setView]               = useState('dashboard');
  const [editingCity, setEditingCity] = useState(null);
  const [toast, setToast]             = useState(null);
  const [showKeyInput, setShowKeyInput]       = useState(false);
  const [headerProvider, setHeaderProvider]   = useState(getProvider());
  const [keyDraft, setKeyDraft]               = useState(() => getApiKey(getProvider()));
  const [modelDraft, setModelDraft]           = useState(() => getModel(getProvider()));
  const [promptDraft, setPromptDraft]         = useState(getPrompt());
  const switchHeaderProvider = (p) => { setHeaderProvider(p); setKeyDraft(getApiKey(p)); setModelDraft(getModel(p)); };
  const saveAiSettings = () => {
    localStorage.setItem('foufou_ai_provider', headerProvider);
    localStorage.setItem('foufou_ai_key_' + headerProvider, keyDraft.trim());
    localStorage.setItem('foufou_ai_model_' + headerProvider, modelDraft.trim());
    localStorage.setItem('foufou_ai_prompt', promptDraft);
    setShowKeyInput(false);
    showToast('AI settings saved (' + AI_PROVIDERS[headerProvider].name + ')', 'success');
  };

  const showToast = (msg, type) => setToast({ msg, type:type||'info', key:Date.now() });

  useEffect(() => {
    auth.getRedirectResult().catch(() => {});
    return auth.onAuthStateChanged(async u => {
      setUser(u);
      if (u && !u.isAnonymous) {
        try { const s = await db.ref('users/'+u.uid+'/role').once('value'); setUserRole(s.val()||0); }
        catch { setUserRole(0); }
      } else { setUserRole(0); }
      setAuthLoading(false);
    });
  }, []);

  const signIn  = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showToast(e.message,'error'));
  const signOut = () => { auth.signOut(); setView('cities'); };

  if (authLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh',
      flexDirection:'column', gap:12, color:'#64748b' }}>
      <div style={{ fontSize:48 }}>🏗️</div>
      <div style={{ fontWeight:'bold', fontSize:20, color:'#1e293b' }}>FouFou Build</div>
      <div style={{ fontSize:13 }}>Loading...</div>
    </div>
  );

  if (!user) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh',
      flexDirection:'column', gap:20 }}>
      <div style={{ fontSize:56 }}>🏗️</div>
      <div style={{ fontSize:28, fontWeight:'bold', color:'#1e293b' }}>FouFou Build</div>
      <div style={{ fontSize:13, color:'#94a3b8' }}>City management · Admin only</div>
      <button onClick={signIn}
        style={{ marginTop:8, padding:'12px 32px', background:'#2563eb', color:'white', border:'none',
          borderRadius:12, fontSize:14, fontWeight:'bold', cursor:'pointer' }}>
        Sign in with Google
      </button>
    </div>
  );

  if (userRole < 2) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh',
      flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:48 }}>🔒</div>
      <div style={{ fontSize:20, fontWeight:'bold', color:'#1e293b' }}>Admin access required</div>
      <div style={{ fontSize:13, color:'#94a3b8' }}>{user.email}</div>
      <button onClick={signOut} style={{ fontSize:12, color:'#94a3b8', textDecoration:'underline',
        background:'none', border:'none', cursor:'pointer' }}>Sign out</button>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc' }}>
      {view === 'dashboard' && (
        <Dashboard user={user} onSignOut={signOut} onNavigate={id => setView(id)} />
      )}
      {(view === 'cities') && (
        <>
          <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'14px 24px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button onClick={() => setView('dashboard')}
                style={{ fontSize:13, color:'#6366f1', background:'none', border:'none',
                  cursor:'pointer', fontWeight:600 }}>← Dashboard</button>
              <div style={{ width:1, height:20, background:'#e2e8f0' }} />
              <span style={{ fontSize:22 }}>🏙️</span>
              <div>
                <div style={{ fontWeight:'bold', color:'#1e293b', fontSize:16, lineHeight:1.2 }}>City Builder</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>v{VERSION}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:12, color:'#64748b' }}>{user.displayName||user.email}</div>
              <button onClick={() => setShowKeyInput(v => !v)} title="Anthropic API key for AI descriptions"
                style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:'1px solid #e2e8f0',
                  background: getApiKey() ? '#f0fdf4' : '#fef3c7', cursor:'pointer',
                  color: getApiKey() ? '#16a34a' : '#d97706' }}>
                {getApiKey() ? '🔑 AI ✓' : '🔑 AI Key'}
              </button>
              <button onClick={signOut}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid #e2e8f0',
                  color:'#64748b', background:'white', cursor:'pointer' }}>Sign out</button>
            </div>
          </div>
          {/* AI settings panel */}
          {showKeyInput && (
            <div style={{ background:'#fefce8', borderBottom:'1px solid #fde68a', padding:'12px 24px' }}>
              <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:10 }}>
                {/* Provider tabs */}
                <div style={{ display:'flex', gap:6 }}>
                  {Object.entries(AI_PROVIDERS).map(([id, p]) => (
                    <button key={id} onClick={() => switchHeaderProvider(id)}
                      style={{ padding:'4px 14px', fontSize:12, fontWeight:600, borderRadius:20,
                        border:'1px solid ' + (headerProvider===id ? '#d97706' : '#e2e8f0'),
                        background: headerProvider===id ? '#fef3c7' : 'white',
                        color: headerProvider===id ? '#92400e' : '#64748b', cursor:'pointer' }}>
                      {p.name} {getApiKey(id) ? '✓' : ''} {p.free ? '(free)':''}
                    </button>
                  ))}
                </div>
                {/* Key + model */}
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#92400e', minWidth:30 }}>Key</span>
                  <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} type="password"
                    placeholder={AI_PROVIDERS[headerProvider].keyHint}
                    style={{ flex:2, minWidth:200, padding:'6px 10px', border:'1px solid #fcd34d',
                      borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', background:'white' }} />
                  <span style={{ fontSize:12, fontWeight:700, color:'#92400e' }}>Model</span>
                  <input value={modelDraft} onChange={e => setModelDraft(e.target.value)}
                    style={{ flex:1, minWidth:140, padding:'6px 10px', border:'1px solid #fcd34d',
                      borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', background:'white' }} />
                  <a href={AI_PROVIDERS[headerProvider].keyUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize:11, color:'#92400e', whiteSpace:'nowrap' }}>Get key ↗</a>
                </div>
                {/* Prompt */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#92400e', minWidth:50, paddingTop:4 }}>Prompt</span>
                  <textarea value={promptDraft} onChange={e => setPromptDraft(e.target.value)}
                    rows={9} spellCheck={false}
                    style={{ flex:1, padding:'8px 10px', border:'1px solid #fcd34d', borderRadius:8,
                      fontSize:12, fontFamily:'monospace', outline:'none', resize:'vertical', lineHeight:1.5 }} />
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={() => setPromptDraft(DEFAULT_PROMPT)}
                    style={{ padding:'6px 14px', fontSize:12, background:'white', border:'1px solid #fcd34d',
                      borderRadius:8, cursor:'pointer', color:'#92400e' }}>Reset prompt</button>
                  <button onClick={() => setShowKeyInput(false)}
                    style={{ padding:'6px 14px', fontSize:12, background:'white', border:'1px solid #e2e8f0',
                      borderRadius:8, cursor:'pointer', color:'#64748b' }}>Cancel</button>
                  <button onClick={saveAiSettings}
                    style={{ padding:'6px 14px', fontSize:12, background:'#d97706', color:'white',
                      border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>Save</button>
                </div>
              </div>
            </div>
          )}
          <CityList
            onAddCity={() => setView('add-city')}
            onEditCity={(key, entry) => { setEditingCity({ key, entry }); setView('edit-city'); }}
          />
        </>
      )}

      {view === 'add-city' && (
        <AddCityFlow showToast={showToast} onDone={() => setView('cities')} />
      )}

      {view === 'edit-city' && editingCity && (
        <CityEditor
          cityKey={editingCity.key}
          regEntry={editingCity.entry}
          showToast={showToast}
          onDone={() => { setEditingCity(null); setView('cities'); }}
        />
      )}

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<FouFouBuild />);
