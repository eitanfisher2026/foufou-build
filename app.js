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
const VERSION = '0.2.73';

// AI provider configuration
const AI_PROVIDERS = {
  gemini:    { name: 'Google Gemini', defaultModel: 'gemini-2.5-flash',         keyHint: 'AIza...',    keyUrl: 'https://aistudio.google.com/apikey',                free: true  },
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

// ─── Tips generation prompt ───────────────────────────────────────────────────
const DEFAULT_TIPS_PROMPT = `City: {cityName}

You are a seasoned traveler writing practical insider tips for a tourist app.
Study the Bangkok example below — match its tone, detail level, and topic range exactly.

Return a JSON array of 15-20 tips:
[{"tipEn": "English tip text", "tip": "Hebrew translation of tipEn"}, ...]

Return ONLY the JSON array. No markdown, no explanation.

--- EXAMPLE (Bangkok) ---
- Bangkok is a relatively safe city, even for women — safe to walk around in all areas, day and night. In dense tourist areas there may be pickpockets, as in any city, but this is not a representative phenomenon.
- In Bangkok everything mixes and everything is together: temples next to massage parlors, food stalls next to fancy restaurants, new next to old. That's the beauty of the city.
- With all the seeming chaos, the city is very clean. It is customary to give waste to the food stalls in the city.
- The city accepts and does not push — pleasant to walk around and calm. The people are kind and polite.
- The city is different in the morning and in the evening; the same street looks different during the day and at night.
- It is interesting to visit the morning markets, but you must go to the evening and night markets.
- Driving is on the left. There is no right of way for pedestrians — blend in gently but assertively. Pay attention to scooters, they do not respect traffic laws.
- Car traffic is very dense and slow, including taxis. Travel by subway and light rail — comfortable, cheap, air-conditioned and modern.
- It is possible and acceptable to use scooters as taxis. The slow traffic makes it less scary than it sounds; tourists and locals use the service a lot — cheap and efficient. (They don't always have a helmet for the passenger.)
- Riding a tuk tuk is a nice one-time tourist experience, but it costs more than any alternative, is not air-conditioned, and does not avoid traffic jams like a scooter.
- Highly recommended: install Grab or Bolt and order a taxi or scooter — prices are uniform and fair.
- A very unique way to get around is to cruise the inner canals on a public boat (not a tourist cruise). Worth a try.
- There are no bicycle paths — do not cycle on the roads. You can ride in the parks.
- There are no running tracks in the city; it is common to run in the big parks in the late afternoon.
- Getting around with a stroller can be complicated due to the quality of the sidewalks.
- The quantity, quality and diversity of Bangkok's shopping malls are among the most beautiful in the world — an experience in itself. Arrive with free space in your luggage.
- It is acceptable to make orders with delivery, even for small things.
- Avoid March–April (very hot and humid) and July–August (very rainy).
--- END EXAMPLE ---

Now generate tips for: {cityName}`;
const getTipsPrompt = () => localStorage.getItem('foufou_tips_prompt') || DEFAULT_TIPS_PROMPT;

// ─── Favorites generation prompt ──────────────────────────────────────────────
const DEFAULT_FAVORITES_PROMPT = `City: {cityName}
Interest: {interestName}

You are curating places for a tourist discovery app that values quality over quantity.
The app mixes iconic spots with hidden gems — advice from a knowledgeable friend, not a Wikipedia list.

Bangkok examples for this interest (quality bar):
{bangkokExamples}

Generate {count} {interestName} spots in {cityName}.

Quality rules:
- ~30% iconic: places that genuinely deserve their fame even if well-known
- ~70% hidden gems: a knowledgeable local would recommend these to a friend — not the first Google result
- No obvious tourist traps or generic landmarks
- Only real, verifiable places with accurate GPS coordinates
- Only include places that are currently open and operational — exclude any place known to be closed or permanently shut
- nameEn: official English name of the place (English only, no transliteration)
- descEn: 6-10 words capturing the vibe, like a personal recommendation from someone who's been there

Return ONLY a JSON array, no markdown:
[{"nameEn":"English name","descEn":"6-10 word vibe","lat":0.0000,"lng":0.0000}]`;
const getFavoritesPrompt = () => localStorage.getItem('foufou_favorites_prompt') || DEFAULT_FAVORITES_PROMPT;

// ─── Area generation prompts ──────────────────────────────────────────────────
// AUTO: AI decides count and naming style based on city knowledge
const AREAS_PROMPT = `You are a travel expert building a tourist app for {cityName}{country}.
{cityCenter}
Use your knowledge of {cityName} to generate the RIGHT tourist neighborhoods.

NAMING — use names tourists actually use, not administrative codes:
- Bangkok → Sukhumvit, Silom, Chatuchak, Rattanakosin, Thonglor...
- Paris → Montmartre, Le Marais, Saint-Germain, Bastille... (NOT "18th arrondissement")
- Rome → Trastevere, Testaccio, Prati, Campo de' Fiori...
- Cardinal names (City Center, North, South, East, West) are acceptable when:
  tourist-specific names are not commonly used, or when grouping several
  small nearby sub-areas into one larger zone

COUNT — let the city decide:
- Small/focused city: 6-8 areas
- Standard tourist city: 9-12 areas
- Dense city with many distinct zones (Paris, Istanbul, Bangkok): 12-16 areas

RADIUS — size each circle so it covers its full tourist zone with NO gaps to neighbours.
Think: "how far from the center can a tourist walk and still feel they are in this area?"
- Tiny compact district (Jewish Quarter, Medina, Josefov): 400-550m
- Standard walkable neighborhood: 600-900m
- Large spread area (Sukhumvit strip, Hyde Park, Beyoglu): 900-1500m
- COVERAGE RULE: if two neighbouring area centers are D meters apart, each radius should be
  ≈ D×0.55 so the circles overlap slightly — overlap is acceptable, gaps are not.
Real examples to calibrate:
  Prague Old Town → 500m · Vinohrady → 800m · Holešovice → 900m
  Tokyo Shinjuku → 900m · Shibuya → 800m · Asakusa → 700m
  Paris Marais → 700m · Montmartre → 800m · Saint-Germain → 750m
  Bangkok Silom → 900m · Sukhumvit → 1200m · Rattanakosin → 700m

Return ONLY a JSON array, no markdown:
[{"id":"snake_case","labelEn":"Tourist name","label":"Hebrew (REQUIRED)","lat":0.0,"lng":0.0,"radius":700,"descEn":"6-8 word vibe","desc":"Hebrew translation (REQUIRED)","safety":"safe"}]

OTHER RULES:
- lat/lng: real GPS center of THAT neighborhood, 4 decimal places
- Spread across the full city — north, south, east, west, not only the center
- label and desc: Hebrew script, REQUIRED, never empty
- safety: "safe", "caution", "danger", or "local"
  · safe   = popular tourist area, plenty to see and do
  · local  = residential or in-between area, low tourist interest but fills coverage gap
  · caution = exercise normal urban caution
  · danger = avoid at night or entirely
- COVERAGE: ensure NO significant blank spots inside the city footprint, especially near the center.
  If a zone between tourist areas has no specific tourist draw, add it with safety "local" and
  an honest description (e.g. "Quiet residential streets, few tourist attractions")
  so the app has content everywhere inside the boundary.`;

// COMPACT: 6-8 broad zones — good for smaller or grid-layout cities
const AREAS_PROMPT_COMPACT = `You are a travel expert building a tourist app for {cityName}{country}.
{cityCenter}
Generate 6-8 BROAD tourist zones — merge nearby attractions into fewer, larger areas.
Use the names tourists actually use for each zone.
Radius: 900-2000m (large zones covering substantial territory). Circles should overlap slightly — gaps are worse than overlap.

Return ONLY a JSON array:
[{"id":"snake_case","labelEn":"Tourist name","label":"Hebrew (REQUIRED)","lat":0.0,"lng":0.0,"radius":1200,"descEn":"6-8 word vibe","desc":"Hebrew translation (REQUIRED)","safety":"safe"}]

RULES: lat/lng real GPS center, spread across city, no overlap, label and desc Hebrew REQUIRED.
safety: "safe" (tourist area), "local" (residential filler, low tourist interest), "caution", or "danger".
COVERAGE: no blank spots inside the city boundary — use "local" areas to fill gaps near the center.`;

// DETAILED: 12-18 specific areas — good for dense historic cities (Paris, Istanbul, Bangkok)
const AREAS_PROMPT_DETAILED = `You are a travel expert building a tourist app for {cityName}{country}.
{cityCenter}
Generate 12-18 SPECIFIC tourist neighborhoods — split areas that have distinct characters.
Use the names tourists actually use, including sub-neighborhoods.
Radius: 400-800m (walkable, neighborhood scale). Circles should overlap slightly — gaps are worse than overlap.

Return ONLY a JSON array:
[{"id":"snake_case","labelEn":"Tourist name","label":"Hebrew (REQUIRED)","lat":0.0,"lng":0.0,"radius":500,"descEn":"6-8 word vibe","desc":"Hebrew translation (REQUIRED)","safety":"safe"}]

RULES: lat/lng real GPS center, spread across city, no overlap, label and desc Hebrew REQUIRED.
safety: "safe" (tourist area), "local" (residential filler, low tourist interest), "caution", or "danger".
COVERAGE: no blank spots inside the city boundary — use "local" areas to fill gaps near the center.`;

const getAreasPrompt = () => localStorage.getItem('foufou_areas_prompt') || AREAS_PROMPT;
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
// Returns 3-5 emoji options for the city, best one first
async function generateCityIconOptions(cityName) {
  if (!getApiKey()) return [];
  const result = await callAI(
    'Suggest 4-5 emoji icons for the city "' + cityName + '" as a tourist destination.\n' +
    'Think: iconic landmarks, famous food, architecture, culture — specific to THIS city.\n' +
    'Put the single most iconic/recognisable symbol FIRST.\n\n' +
    'Examples:\n' +
    'Paris     → ["🗼","🥐","🎭","🏰","🍷"]   (Eiffel Tower first)\n' +
    'Tokyo     → ["⛩️","🗾","🌸","🍜","🎎"]   (shrine gate first)\n' +
    'New York  → ["🗽","🌆","🍕","🎸","🚕"]   (Statue of Liberty first)\n' +
    'Amsterdam → ["🚲","🌷","🏠","⚓","🧀"]   (bicycle first)\n' +
    'Prague    → ["🍺","🎻","🌉","🏰","🎭"]   (beer first, then others)\n' +
    'Sydney    → ["🌉","🏄","🦘","☀️","🐨"]   (bridge/opera first)\n\n' +
    'Return ONLY a JSON array of 4-5 emoji strings, nothing else.',
    2048
  );
  if (!result || result.error) return [];
  try {
    const stripped = result.replace(/```[a-z]*/g,'').replace(/```/g,'').trim();
    let arr = null;
    try { arr = JSON.parse(stripped); } catch(e) {}
    if (!Array.isArray(arr)) {
      const m = result.match(/\[[\s\S]*?\]/);
      if (m) try { arr = JSON.parse(m[0]); } catch(e) {}
    }
    if (!Array.isArray(arr)) return [];
    // Extract first emoji character from each element
    return arr.slice(0, 5).map(e => {
      const chars = Array.from(String(e).trim());
      return chars.find(c => c.codePointAt(0) > 0xFF) || '';
    }).filter(Boolean);
  } catch(e) { return []; }
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
      if (!r.ok) { return { error: 'Gemini model "' + model + '" not found on your account.\nTry: gemini-2.5-flash  or  gemini-2.0-flash' }; }
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
  const result = await callAI(prompt, 16000);
  if (result && result.error) return result;
  try {
    const stripped = (result||'').replace(/```[a-z]*/g,'').replace(/```/g,'').trim();
    let arr = null;
    try { arr = JSON.parse(stripped); } catch(e) {}
    if (!Array.isArray(arr)) {
      const m = (result||'').match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (m) try { arr = JSON.parse(m[0]); } catch(e) {}
    }
    return Array.isArray(arr) ? arr : { error: 'AI returned unexpected format. Try again.\nRaw: ' + (result||'').slice(0,200) };
  } catch(e) { return { error: 'Could not parse AI response. Try adjusting the prompt.' }; }
}

// Generate city areas using AI — returns area array or { error }
async function generateAreasWithAI(cityName, country, cityLat, cityLng, customPrompt) {
  const centerLine = (cityLat && cityLng)
    ? 'The city center is at approximately ' + cityLat.toFixed(4) + ', ' + cityLng.toFixed(4) + '. Use this as a reference — area coordinates must be in the correct direction from this point.\n'
    : '';
  const template = customPrompt || getAreasPrompt();
  const prompt = template
    .replace('{cityName}', cityName)
    .replace('{country}', country ? ' (' + country + ')' : '')
    .replace('{cityCenter}', centerLine);
  const result = await callAI(prompt, 32768);
  if (!result || result.error) return result || { error: 'No response from AI' };
  try {
    // Robust extraction — handles thinking models that add text around JSON.
    // Use [\s*{...}\s*] regex to specifically find an array-of-objects block.
    const stripped = result.replace(/```[a-z]*/g, '').replace(/```/g, '').trim();
    let arr = null;
    try { arr = JSON.parse(stripped); } catch(e) {}
    if (!Array.isArray(arr)) {
      const m = result.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (m) try { arr = JSON.parse(m[0]); } catch(e) {}
    }
    if (!Array.isArray(arr)) return { error: 'AI returned unexpected format — raw: ' + result.slice(0, 200) };
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
    return adjustRadiiForOverlap(areas);
  } catch(e) { return { error: 'Could not parse AI areas. Try again.' }; }
}

async function getCityNameHebrew(cityName) {
  const key = getApiKey();
  if (!key) return '';
  const result = await callAI('Translate/transliterate the city name "' + cityName + '" to Hebrew. Return only the Hebrew text, nothing else.', 2048);
  return (result && !result.error) ? result : '';
}

// Expand radii to ensure coverage — gaps are worse than overlap for a tourist app.
// Each radius is set to AT LEAST 58% of the distance to its nearest neighbour,
// so adjacent circles always overlap slightly and leave no uncovered zone.
// The AI's own radius is kept if it's already larger.
// Hard cap: 2000m (avoid absurdly large isolated circles).
function adjustRadiiForOverlap(areas) {
  return areas.map((a, i) => {
    const minDist = areas.reduce((min, b, j) => {
      if (i === j) return min;
      return Math.min(min, distM(a.lat, a.lng, b.lat, b.lng));
    }, Infinity);
    if (minDist === Infinity) return a;
    const floor = Math.round(minDist * 0.58 / 50) * 50;
    const r = Math.min(2000, Math.max(floor, a.radius));
    return { ...a, radius: r };
  });
}

// Returns compass direction of area relative to city center
function getGeographicDirection(lat, lng, cityLat, cityLng) {
  if (!cityLat || !cityLng) return '';
  if (distM(lat, lng, cityLat, cityLng) < 600) return 'Center';
  const angle = Math.atan2(lng - cityLng, lat - cityLat) * 180 / Math.PI;
  const dirs = ['North','Northeast','East','Southeast','South','Southwest','West','Northwest'];
  return dirs[Math.round(((angle % 360) + 360) % 360 / 45) % 8];
}

// Prompt shown to user when they expand it
function buildSuggestNamePrompt(area, cityName, direction) {
  return `City: ${cityName}
Area: "${area.labelEn}" — located ${direction} of the city center (GPS: ${area.lat}, ${area.lng})

Suggest 3 name options for this tourist area:
1. Tourist name: the name tourists and travel guides use (memorable, evocative)
2. Geographic name: based on its compass position — ${direction} of city center
3. Official name: the administrative district or official neighborhood name

IMPORTANT:
- Do NOT include the city name — just the neighborhood/district name
- Multi-word names are fine when clearer: "Historic Center", "Old Town & Jewish Quarter"
- Use & to combine two naturally-grouped zones: "Museum Quarter & City Park", "Arts District & Waterfront"
- Prioritize what a tourist would immediately recognize or search for

Recommend the single best option for a tourist app.
For each option also provide nameHe: the Hebrew translation/transliteration.

Return ONLY a JSON array (no explanation):
[{"type":"tourist","name":"...","nameHe":"...","recommended":true},{"type":"geographic","name":"...","nameHe":"...","recommended":false},{"type":"official","name":"...","nameHe":"...","recommended":false}]`;
}

async function suggestAreaNames(area, cityName, direction, onPrompt) {
  const prompt = buildSuggestNamePrompt(area, cityName, direction);
  if (onPrompt) onPrompt(prompt);
  const result = await callAI(prompt, 2048);
  if (!result || result.error) return result || { error: 'No response' };
  try {
    const stripped = result.replace(/```[a-z]*/g,'').replace(/```/g,'').trim();
    let arr = null;
    try { const p = JSON.parse(stripped); arr = Array.isArray(p) ? p : null; } catch(e) {}
    if (!arr) {
      const m = result.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (m) try { arr = JSON.parse(m[0]); } catch(e) {}
    }
    // Fallback: extract individual objects and build array
    if (!arr) {
      const objs = [];
      const re = /\{[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*\}/g;
      let hit;
      while ((hit = re.exec(result)) !== null) {
        try { objs.push(JSON.parse(hit[0])); } catch(e) {}
      }
      if (objs.length) arr = objs;
    }
    return Array.isArray(arr) && arr.length ? arr : { error: 'Could not parse name suggestions. Raw: ' + result.slice(0, 300) };
  } catch(e) { return { error: 'Parse error: ' + e.message }; }
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

// Toast -- errors and warnings stay open until manually closed; success/info auto-dismiss
const Toast = ({ msg, type, onDone }) => {
  const stayOpen = type === 'error' || type === 'warning';
  useEffect(() => {
    if (stayOpen) return;
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

  // ResizeObserver: whenever the map container changes size (e.g. City panel opens/closes),
  // tell Leaflet to recalculate tile layout so tiles fill the container again
  useEffect(() => {
    if (!mapReady || !divRef.current) return;
    const obs = new ResizeObserver(() => {
      try { mapRef.current?.invalidateSize({ animate: false, pan: false }); } catch(e) {}
    });
    obs.observe(divRef.current);
    return () => obs.disconnect();
  }, [mapReady]);

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
  }, [mapReady, areas, selectedIdx, allCityRadius]);

  return <div ref={divRef} style={{ width:'100%', height:'100%' }} />;
};

// ─── Area Editor Panel ────────────────────────────────────────────────────────
const AreaEditor = ({ area, idx, total, onChange, onDelete, onMoveUp, onMoveDown, onAIFill, cityLat, cityLng, onSuggestName }) => {
  const [filling, setFilling] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [nameSuggestions, setNameSuggestions] = React.useState(null);
  const [lastPromptText, setLastPromptText] = React.useState('');
  const [showNamePrompt, setShowNamePrompt] = React.useState(false);
  const [showDescPrompt, setShowDescPrompt] = React.useState(false);
  const direction = (area && cityLat && cityLng) ? getGeographicDirection(area.lat, area.lng, cityLat, cityLng) : '';
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

      {/* Name EN + direction badge */}
      <div style={{ marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:600, color:'#64748b' }}>Name (English)</span>
          {direction && (
            <span style={{ fontSize:10, fontWeight:700, color:'#7c3aed', background:'#ede9fe',
              padding:'1px 6px', borderRadius:10, letterSpacing:0.2 }}>{direction}</span>
          )}
        </div>
        <input value={area.labelEn||''} onChange={e => onChange({...area, labelEn:e.target.value})}
          placeholder="e.g. Old Town, Chinatown, Riverside"
          style={{ width:'100%', boxSizing:'border-box', padding:'6px 10px', border:'1px solid #e2e8f0',
            borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }} />
      </div>
      {inp('Name (Hebrew)', 'label', 'שם האזור בעברית', 'rtl')}

      {/* Unified AI Panel */}
      {(onSuggestName || onAIFill) && (
        <div style={{ marginBottom:12, border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>

          {/* --- Suggest Name row --- */}
          {onSuggestName && (<>
            <div style={{ display:'flex', alignItems:'center', padding:'7px 10px',
              background: showNamePrompt ? '#faf5ff' : '#fafafa',
              borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ flex:1, fontSize:12, fontWeight:600, color:'#7c3aed' }}>📝 Suggest Name</span>
              <span style={{ fontSize:10, color:'#94a3b8', marginRight:6 }}>
                {AI_PROVIDERS[getProvider()]?.name || getProvider()}
              </span>
              <button onClick={() => setShowNamePrompt(v => !v)}
                style={{ fontSize:10, color:'#9ca3af', background:'none', border:'none', cursor:'pointer', marginRight:6 }}>
                {showNamePrompt ? 'hide ▴' : 'prompt ▾'}
              </button>
              <button disabled={suggesting} onClick={async () => {
                  setSuggesting(true); setNameSuggestions(null);
                  const res = await onSuggestName(area, direction, (p) => setLastPromptText(p));
                  setSuggesting(false);
                  setNameSuggestions(res || { error: 'No response' });
                }}
                style={{ padding:'3px 10px', fontSize:11, borderRadius:6, background:'#7c3aed',
                  color:'white', border:'none', cursor:'pointer', fontWeight:700, opacity: suggesting ? 0.6 : 1 }}>
                {suggesting ? '⏳' : '▶ Run'}
              </button>
            </div>
            {showNamePrompt && lastPromptText && (
              <pre style={{ margin:0, padding:'8px 10px', fontSize:9, color:'#6b7280',
                background:'#faf5ff', borderBottom:'1px solid #ede9fe',
                whiteSpace:'pre-wrap', fontFamily:'monospace', lineHeight:1.4, overflowX:'auto' }}>
                {lastPromptText}
              </pre>
            )}
            {nameSuggestions && !nameSuggestions.error && (
              <div style={{ padding:'8px 10px', background:'#f5f3ff', borderBottom:'1px solid #ede9fe' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {nameSuggestions.map((s, i) => (
                    <button key={i}
                      onClick={() => { onChange({...area, labelEn:s.name, label:s.nameHe||area.label}); setNameSuggestions(null); }}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 9px',
                        background: s.recommended ? '#7c3aed' : 'white',
                        color: s.recommended ? 'white' : '#374151',
                        border: '1px solid ' + (s.recommended ? '#7c3aed' : '#d1d5db'),
                        borderRadius:6, cursor:'pointer', fontSize:12, textAlign:'left',
                        fontWeight: s.recommended ? 700 : 400 }}>
                      <span style={{ flex:1 }}>{s.name}</span>
                      {s.nameHe && <span style={{ fontSize:11, opacity:0.8 }} dir="rtl">{s.nameHe}</span>}
                      <span style={{ fontSize:9, opacity:0.5 }}>{s.type}</span>
                      {s.recommended && <span style={{ fontSize:10 }}>★</span>}
                    </button>
                  ))}
                </div>
                <button onClick={() => setNameSuggestions(null)}
                  style={{ marginTop:4, fontSize:10, color:'#9ca3af', background:'none', border:'none', cursor:'pointer' }}>
                  dismiss
                </button>
              </div>
            )}
            {nameSuggestions?.error && (
              <div style={{ padding:'6px 10px', color:'#dc2626', fontSize:11, background:'#fef2f2',
                borderBottom:'1px solid #fecaca', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>{nameSuggestions.error}</span>
                <button onClick={() => setNameSuggestions(null)}
                  style={{ fontSize:10, color:'#dc2626', background:'none', border:'none', cursor:'pointer' }}>✕</button>
              </div>
            )}
          </>)}

          {/* --- Fill Description row --- */}
          {onAIFill && (<>
            <div style={{ display:'flex', alignItems:'center', padding:'7px 10px',
              background: showDescPrompt ? '#fffbeb' : '#fafafa' }}>
              <span style={{ flex:1, fontSize:12, fontWeight:600, color:'#d97706' }}>✍️ Fill Description</span>
              <span style={{ fontSize:10, color:'#94a3b8', marginRight:6 }}>
                {AI_PROVIDERS[getProvider()]?.name || getProvider()}
              </span>
              <button onClick={() => setShowDescPrompt(v => !v)}
                style={{ fontSize:10, color:'#9ca3af', background:'none', border:'none', cursor:'pointer', marginRight:6 }}>
                {showDescPrompt ? 'hide ▴' : 'prompt ▾'}
              </button>
              <button disabled={filling} onClick={async () => { setFilling(true); await onAIFill(area); setFilling(false); }}
                style={{ padding:'3px 10px', fontSize:11, borderRadius:6, background:'#d97706',
                  color:'white', border:'none', cursor:'pointer', fontWeight:700, opacity: filling ? 0.6 : 1 }}>
                {filling ? '⏳' : '▶ Run'}
              </button>
            </div>
            {showDescPrompt && (
              <pre style={{ margin:0, padding:'8px 10px', fontSize:9, color:'#6b7280',
                background:'#fffbeb', whiteSpace:'pre-wrap', fontFamily:'monospace', lineHeight:1.4, overflowX:'auto' }}>
                {getPrompt().replace('{cityName}','…').replace('{neighborhoods}', area.labelEn||'…')}
              </pre>
            )}
          </>)}

        </div>
      )}

      <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>Descriptions</div>
      {txt('English', 'descEn', 'ltr', 'e.g. Historic temples, street food, night markets')}
      {txt('Hebrew', 'desc', 'rtl', 'תאר בקצרה: אתרים, אווירה, מה לראות')}

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
            <option value="local">Local (residential filler)</option>
            <option value="caution">Caution</option>
            <option value="danger">Danger</option>
          </select>
        </div>
      </div>
      <div style={{ fontSize:11, color:'#cbd5e1' }}>
        {direction && <span style={{ color:'#c4b5fd', marginRight:5 }}>{direction}</span>}
        {area.lat}, {area.lng}
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
  // UI state
  const [showCfg, setShowCfg]     = useState(false);
  const [isDirty, setIsDirty]     = useState(false);
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
  const fillSingleArea = async (area) => {
    if (!getApiKey()) { setShowKeyPanel(true); return; }
    const results = await generateWithAI([area], cfgNameEn || title);
    if (results?.error) { if (showToast) showToast('AI: ' + results.error, 'error'); return; }
    if (Array.isArray(results) && results[0]) {
      updateArea(selIdx, { ...area,
        label: results[0].nameHe || area.label,
        descEn: results[0].descEn || area.descEn,
        desc:   results[0].desc   || area.desc,
      });
    }
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
            <button onClick={() => { onSave({ cityLat, cityLng, allCityRadius, cfgIcon, cfgNameEn, cfgNameHe, dayStartHour, nightStartHour, distMultiplier }); setIsDirty(false); }}
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
                <input type="number" step="500" min="1000" value={allCityRadius||''}
                  onChange={e => { const v=Math.max(1000, parseInt(e.target.value)||allCityRadius); setAllCityRadius(v); setIsDirty(true); notify({radius:v}); }}
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
                  <div style={{ fontSize:12, fontWeight:600,
                    color: area.safety==='local' ? '#94a3b8' : '#1e293b',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {area.labelEn || '(unnamed)'}
                    {area.safety==='local' && <span style={{ fontSize:9, color:'#cbd5e1', marginLeft:4 }}>local</span>}
                  </div>
                  {area.label && (
                    <div style={{ fontSize:11, color:'#cbd5e1',
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
            onAIFill={onAIFill ? fillSingleArea : null}
            cityLat={cityLat} cityLng={cityLng}
            onSuggestName={async (area, direction, onPrompt) => {
              if (!getApiKey()) { setShowKeyPanel(true); return { error: 'No API key set. Click 🔑 to add one.' }; }
              return await suggestAreaNames(area, cfgNameEn || title, direction, onPrompt);
            }}
          />
        </div>
      </div>
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
  const [cityIcon, setCityIcon]       = useState('');
  const [iconOptions, setIconOptions] = useState([]);
  const [iconSuggesting, setIconSuggesting] = useState(false);
  const [foundCityHe, setFoundCityHe] = useState('');
  const [saving, setSaving]       = useState(false);
  const [allCityRadius, setAllCityRadius] = useState(15000);
  // AI settings for area generation (local copies, saved to localStorage on Generate)
  const [areaProvider, setAreaProvider]   = useState(getProvider());
  const [areaKey,      setAreaKey]        = useState(() => getApiKey(getProvider()));
  const [areaModel,    setAreaModel]      = useState(() => getModel(getProvider()));
  const [areaPrompt,   setAreaPrompt]     = useState(() => localStorage.getItem('foufou_areas_prompt') || AREAS_PROMPT);
  const [promptPreset, setPromptPreset]   = useState('auto');
  const [showPromptEd, setShowPromptEd]  = useState(false);

  const switchAreaProvider = (p) => {
    setAreaProvider(p);
    setAreaKey(getApiKey(p));
    setAreaModel(getModel(p));
  };
  const applyPreset = (key) => {
    const map = { auto: AREAS_PROMPT, compact: AREAS_PROMPT_COMPACT, detailed: AREAS_PROMPT_DETAILED };
    setAreaPrompt(map[key] || AREAS_PROMPT);
    setPromptPreset(key);
  };

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
        setCityIcon(''); setIconOptions([]);
        if (areaKey.trim()) {
          localStorage.setItem('foufou_ai_provider', areaProvider);
          localStorage.setItem('foufou_ai_key_' + areaProvider, areaKey.trim());
          localStorage.setItem('foufou_ai_model_' + areaProvider, areaModel.trim());
        }
        if (getApiKey()) {
          setIconSuggesting(true);
          generateCityIconOptions(cityName)
            .then(opts => { if (opts.length) { setIconOptions(opts); setCityIcon(opts[0]); } })
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
    // Save AI settings to localStorage before running
    localStorage.setItem('foufou_ai_provider', areaProvider);
    localStorage.setItem('foufou_ai_key_' + areaProvider, areaKey.trim());
    localStorage.setItem('foufou_ai_model_' + areaProvider, areaModel.trim());
    localStorage.setItem('foufou_areas_prompt', areaPrompt);

    if (getApiKey()) {
      setGenStep('ai');
      const aiResult = await generateAreasWithAI(foundCity.name, country, lat, lng, areaPrompt);
      if (Array.isArray(aiResult) && aiResult.length >= 3) {
        builtAreas = aiResult;
      } else if (aiResult?.error) {
        showToast('AI error: ' + aiResult.error + '\nFalling back to OpenStreetMap data.', 'error');
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
      } catch(e) {
        showToast('Area generation failed: ' + e.message, 'error');
        setGenStep('');
        return;
      }
    }

    // Step 3: translate city name to Hebrew
    setGenStep('wrap');
    const he = await getCityNameHebrew(foundCity.name).catch(() => '');
    setFoundCityHe(he || '');
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
                {iconSuggesting && <span style={{ fontSize:10, color:'#d97706', fontWeight:600 }}>🤖 generating options...</span>}
              </div>
              {/* AI option buttons */}
              {iconOptions.length > 0 && (
                <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
                  {iconOptions.map((emoji, i) => (
                    <button key={i} onClick={() => setCityIcon(emoji)}
                      style={{ fontSize:26, width:46, height:46, borderRadius:10, cursor:'pointer',
                        border:'2px solid ' + (cityIcon===emoji ? '#6366f1' : '#e2e8f0'),
                        background: cityIcon===emoji ? '#eff6ff' : 'white',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        position:'relative', flexShrink:0 }}>
                      {emoji}
                      {i===0 && <span style={{ position:'absolute', top:-5, right:-5, fontSize:8,
                        background:'#6366f1', color:'white', borderRadius:99, padding:'1px 4px',
                        fontWeight:700, lineHeight:1.4 }}>★</span>}
                    </button>
                  ))}
                  <span style={{ fontSize:10, color:'#94a3b8' }}>★ = AI favourite</span>
                </div>
              )}
              {/* Custom emoji input */}
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ fontSize:30, width:42, height:42, flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  border:'2px solid ' + (iconSuggesting?'#fcd34d':'#6366f1'),
                  borderRadius:8, background: iconSuggesting?'#fefce8':'#eff6ff' }}>
                  {iconSuggesting ? '⏳' : (cityIcon || '🏙️')}
                </div>
                <input value={cityIcon} onChange={e=>setCityIcon(e.target.value)} maxLength={4}
                  placeholder="or type any emoji"
                  style={{ flex:1, padding:'7px 10px', border:'1px solid #e2e8f0',
                    borderRadius:8, fontSize:15, fontFamily:'inherit', outline:'none' }} />
              </div>
            </div>

            {/* ── AI settings: provider, key, style preset, prompt ── */}
            <div style={{ marginTop:14, padding:'12px', background:'#fefce8', borderRadius:8, border:'1px solid #fde68a' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#92400e', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>AI for area generation</div>

              {/* Provider tabs */}
              <div style={{ display:'flex', gap:5, marginBottom:8 }}>
                {Object.entries(AI_PROVIDERS).map(([id, p]) => (
                  <button key={id} onClick={() => switchAreaProvider(id)}
                    style={{ padding:'3px 10px', fontSize:11, fontWeight:600, borderRadius:16, cursor:'pointer',
                      border:'1px solid ' + (areaProvider===id ? '#d97706' : '#e2e8f0'),
                      background: areaProvider===id ? '#fef3c7' : 'white',
                      color: areaProvider===id ? '#92400e' : '#64748b' }}>
                    {p.name.split(' ')[0]} {areaKey&&areaProvider===id ? '✓' : ''}
                  </button>
                ))}
              </div>

              {/* Key + model */}
              <div style={{ display:'flex', gap:6, marginBottom:8, alignItems:'center' }}>
                <input value={areaKey} onChange={e=>setAreaKey(e.target.value)} type="password"
                  placeholder={AI_PROVIDERS[areaProvider].keyHint}
                  style={{ flex:2, padding:'5px 8px', border:'1px solid #fcd34d', borderRadius:6, fontSize:11, fontFamily:'monospace', outline:'none' }} />
                <input value={areaModel} onChange={e=>setAreaModel(e.target.value)}
                  placeholder="model"
                  style={{ flex:1, minWidth:0, padding:'5px 8px', border:'1px solid #fcd34d', borderRadius:6, fontSize:11, fontFamily:'monospace', outline:'none' }} />
                <a href={AI_PROVIDERS[areaProvider].keyUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize:10, color:'#92400e', whiteSpace:'nowrap' }}>Get key ↗</a>
              </div>

              {/* Style presets */}
              <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:11, color:'#92400e', fontWeight:600 }}>Style:</span>
                {[
                  { key:'auto',     label:'Auto (recommended)' },
                  { key:'compact',  label:'Compact 6-8' },
                  { key:'detailed', label:'Detailed 12-18' },
                ].map(({key, label}) => (
                  <button key={key} onClick={() => applyPreset(key)}
                    style={{ padding:'3px 10px', fontSize:11, borderRadius:16, cursor:'pointer', fontWeight:600,
                      border:'1px solid ' + (promptPreset===key ? '#d97706' : '#e2e8f0'),
                      background: promptPreset===key ? '#fef3c7' : 'white',
                      color: promptPreset===key ? '#92400e' : '#64748b' }}>
                    {label}
                  </button>
                ))}
                <button onClick={() => setShowPromptEd(v => !v)}
                  style={{ padding:'3px 10px', fontSize:11, borderRadius:16, cursor:'pointer',
                    border:'1px solid #e2e8f0', background:'white', color:'#475569', marginLeft:4 }}>
                  {showPromptEd ? '▲ prompt' : '▼ prompt'}
                </button>
              </div>

              {showPromptEd && (
                <textarea value={areaPrompt}
                  onChange={e => { setAreaPrompt(e.target.value); setPromptPreset('custom'); }}
                  rows={9} spellCheck={false}
                  style={{ width:'100%', boxSizing:'border-box', marginTop:8, padding:'6px 8px',
                    border:'1px solid #fcd34d', borderRadius:6, fontSize:10,
                    fontFamily:'monospace', outline:'none', resize:'vertical', lineHeight:1.45 }} />
              )}
            </div>

            <div style={{ display:'flex', gap:8, marginTop:12 }}>
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
      areas={areas} setAreas={a => {
        if (typeof a === 'function') {
          setAreas(prev => { const next = a(prev); setAllCityRadius(recalcRadius(foundCity.lat, foundCity.lng, next)); return next; });
        } else {
          setAreas(a); setAllCityRadius(recalcRadius(foundCity.lat, foundCity.lng, a));
        }
      }}
      selIdx={selIdx} setSelIdx={setSelIdx}
      cityLat={foundCity?.lat} cityLng={foundCity?.lng}
      allCityRadius={allCityRadius}
      initMeta={{ icon: cityIcon||'🏙️', nameEn: foundCity?.name||'', nameHe: foundCityHe, dayStartHour:7, nightStartHour:18, distanceMultiplier:1.05 }}
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
        }),
        db.ref('settings/cityRegistry/'+cityKey).update({
          icon: meta?.cfgIcon || regEntry.icon,
          name: meta?.cfgNameHe || regEntry.name,
          nameEn: meta?.cfgNameEn || regEntry.nameEn,
        })
      ]);
      showToast(regEntry.nameEn+' saved ✓', 'success');
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

// ─── Favorites Generator ──────────────────────────────────────────────────────
const assignArea = (lat, lng, areas) => {
  if (!areas || !areas.length) return { areaId: '', areaName: '' };
  let best = areas[0], bestDist = distM(lat, lng, areas[0].lat, areas[0].lng);
  for (const a of areas.slice(1)) {
    const d = distM(lat, lng, a.lat, a.lng);
    if (d < bestDist) { bestDist = d; best = a; }
  }
  return { areaId: best.id, areaName: best.labelEn || best.id };
};

const FavoritesGenerator = ({ showToast, onBack, user }) => {
  const [cities, setCities]               = useState({});
  const [loadingCities, setLoadingCities] = useState(true);
  const [selectedKey, setSelectedKey]     = useState('');
  const [interests, setInterests]         = useState([]);
  const [loadingInterests, setLoadingInterests] = useState(true);
  const [selInterests, setSelInterests]   = useState({});
  const [countPer, setCountPer]           = useState(8);
  const [cityAreas, setCityAreas]         = useState([]);
  const [existingPlaces, setExistingPlaces] = useState([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [generating, setGenerating]       = useState(false);
  const [genProgress, setGenProgress]     = useState('');
  const [genError, setGenError]           = useState('');
  const [draftPlaces, setDraftPlaces]     = useState(null);
  const [saving, setSaving]               = useState(false);
  const [editingIdx, setEditingIdx]       = useState(null);
  const [showKeyPanel, setShowKeyPanel]   = useState(false);
  const [favPrompt, setFavPrompt]         = useState(getFavoritesPrompt);
  const [favProvider, setFavProvider]     = useState(getProvider);
  const [favKey,      setFavKey]          = useState(() => getApiKey(getProvider()));
  const [favModel,    setFavModel]        = useState(() => getModel(getProvider()));
  const bkkCacheRef = useRef(null);

  const switchProvider = (p) => { setFavProvider(p); setFavKey(getApiKey(p)); setFavModel(getModel(p)); };

  useEffect(() => {
    db.ref('settings/cityRegistry').once('value').then(snap => {
      setCities(snap.val() || {}); setLoadingCities(false);
    });
    Promise.all([
      db.ref('customInterests').once('value'),
      db.ref('settings/interestGroups').once('value'),
    ]).then(([intSnap, grpSnap]) => {
      const raw = intSnap.val() || {};
      const groups = grpSnap.val() || {};
      const groupOrder = {};
      Object.keys(groups).forEach((gId, idx) => {
        groupOrder[gId] = groups[gId]?.order ?? idx;
      });
      const list = Object.values(raw)
        .filter(i => i.locked === true && i.labelEn)
        .sort((a, b) => {
          const ga = groupOrder[a.group || ''] ?? 99;
          const gb = groupOrder[b.group || ''] ?? 99;
          if (ga !== gb) return ga - gb;
          return (a.labelEn || '').localeCompare(b.labelEn || '');
        });
      setInterests(list);
      const sel = {}; list.forEach(i => { sel[i.id] = true; });
      setSelInterests(sel);
      setLoadingInterests(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedKey) { setCityAreas([]); setExistingPlaces([]); return; }
    const city = cities[selectedKey];
    if (!city) return;
    db.ref('cities/' + city.id + '/config/areas').once('value').then(snap => {
      const val = snap.val();
      if (!val) { setCityAreas([]); return; }
      const arr = Array.isArray(val) ? val : Object.values(val);
      setCityAreas(arr.filter(a => a && a.lat && a.lng));
    });
    db.ref('cities/' + city.id + '/locations').once('value').then(snap => {
      const val = snap.val() || {};
      setExistingPlaces(Object.values(val).filter(p => p.status !== 'blacklist'));
    });
  }, [selectedKey, cities]);

  const getBangkokExamples = async (interestId) => {
    if (!bkkCacheRef.current) {
      const snap = await db.ref('cities/bangkok/locations').once('value');
      bkkCacheRef.current = snap.val() || {};
    }
    const matches = Object.values(bkkCacheRef.current).filter(loc => {
      const arr = Array.isArray(loc.interests) ? loc.interests : Object.values(loc.interests || {});
      return arr.includes(interestId) && loc.nameEn && loc.status !== 'blacklist';
    });
    return matches.sort(() => Math.random() - 0.5).slice(0, 3)
      .map(loc => `- ${loc.nameEn}${loc.description ? ': ' + String(loc.description).slice(0, 80) : ''}`)
      .join('\n') || '(no Bangkok examples for this interest)';
  };

  const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isDupe = (place, existing) => {
    const nn = normName(place.nameEn);
    return existing.some(e =>
      normName(e.nameEn) === nn || normName(e.name) === nn ||
      (e.lat && e.lng && distM(place.lat, place.lng, e.lat, e.lng) < 150)
    );
  };

  const generate = async () => {
    const city = cities[selectedKey];
    if (!city) return;
    const toRun = interests.filter(i => selInterests[i.id]);
    if (!toRun.length) { showToast('Select at least one interest', 'error'); return; }
    localStorage.setItem('foufou_ai_provider', favProvider);
    localStorage.setItem('foufou_ai_key_' + favProvider, favKey.trim());
    localStorage.setItem('foufou_ai_model_' + favProvider, favModel.trim());
    setGenerating(true); setGenError(''); setDraftPlaces([]); setEditingIdx(null);
    setFilteredCount(0);
    const all = []; let filtered = 0;
    const iconText = (i) => i.icon && !i.icon.startsWith('data:') && !i.icon.startsWith('http') ? i.icon + ' ' : '';
    for (let i = 0; i < toRun.length; i++) {
      const interest = toRun[i];
      const label = `${iconText(interest)}${interest.labelEn} (${i + 1}/${toRun.length})`;

      // Step 1: AI generation
      setGenProgress(`Generating ${label}`);
      const examples = await getBangkokExamples(interest.id);
      const prompt = favPrompt
        .replace(/\{cityName\}/g, city.nameEn || city.name)
        .replace(/\{interestName\}/g, interest.labelEn)
        .replace(/\{count\}/g, String(countPer))
        .replace(/\{bangkokExamples\}/g, examples);
      const result = await callAI(prompt, 8192);
      if (result && result.error) { setGenError(`Error on "${interest.labelEn}": ${result.error}`); break; }
      let arr = null;
      try {
        const s = (result||'').replace(/```[a-z]*/g,'').replace(/```/g,'').trim();
        try { arr = JSON.parse(s); } catch(e) {}
        if (!Array.isArray(arr)) { const m = (result||'').match(/\[\s*\{[\s\S]*?\}\s*\]/); if (m) try { arr = JSON.parse(m[0]); } catch(e) {} }
      } catch(e) {}
      if (!Array.isArray(arr)) continue;

      // Step 2: dedup filter
      const candidates = arr.filter(p => p.nameEn && p.lat && p.lng).filter(p => {
        if (isDupe(p, existingPlaces) || isDupe(p, all)) { filtered++; return false; }
        return true;
      });

      // Step 3: area assignment
      for (const p of candidates) {
        const { areaId, areaName } = assignArea(p.lat, p.lng, cityAreas);
        all.push({ ...p, _iid: interest.id, _iname: interest.labelEn, _iicon: interest.icon || '📍', _areaId: areaId, _areaName: areaName });
      }
      setDraftPlaces([...all]);
      setFilteredCount(filtered);
    }
    setGenerating(false); setGenProgress('');
    if (all.length) {
      const parts = [`Generated ${all.length} places`];
      if (filtered) parts.push(`${filtered} duplicates filtered`);
      showToast(parts.join(' · '), 'success');
    }
  };

  const saveToFirebase = async () => {
    const city = cities[selectedKey];
    if (!city || !draftPlaces || !draftPlaces.length) return;
    setSaving(true);
    const toSave = draftPlaces.filter(p => !isDupe(p, existingPlaces));
    const skipped = draftPlaces.length - toSave.length;
    await Promise.all(toSave.map(p =>
      db.ref('cities/' + city.id + '/locations').push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        nameEn: p.nameEn || '', name: p.nameEn || '',
        description: p.descEn || '',
        lat: p.lat, lng: p.lng,
        area: p._areaId || '', areas: p._areaId ? [p._areaId] : [],
        interests: [p._iid], status: 'active',
        addedBy: 'ai-gen', locked: true, aiGenerated: true,
      })
    ));
    setSaving(false);
    const msg = skipped > 0
      ? `Saved ${toSave.length} places (${skipped} skipped as duplicates)`
      : `Saved ${toSave.length} places to ${city.nameEn || city.name}`;
    showToast(msg, 'success');
    setDraftPlaces(null);
  };

  const updateDraft = (i, f, v) => setDraftPlaces(prev => prev.map((p, idx) => idx===i ? {...p,[f]:v} : p));
  const deleteDraft = (i) => {
    setDraftPlaces(prev => prev.filter((_,idx) => idx!==i));
    if (editingIdx===i) setEditingIdx(null); else if (editingIdx>i) setEditingIdx(editingIdx-1);
  };

  const sortedCities = Object.entries(cities).sort((a,b) => (a[1].nameEn||'').localeCompare(b[1].nameEn||''));
  const selectedCity = selectedKey ? cities[selectedKey] : null;
  const selCount = Object.values(selInterests).filter(Boolean).length;
  const interestsInDraft = interests.filter(i => draftPlaces && draftPlaces.some(p => p._iid === i.id));

  const existingCountByInterest = React.useMemo(() => {
    const counts = {};
    existingPlaces.forEach(p => {
      const arr = Array.isArray(p.interests) ? p.interests : Object.values(p.interests || {});
      arr.forEach(iid => { counts[iid] = (counts[iid] || 0) + 1; });
    });
    return counts;
  }, [existingPlaces]);

  const [sortFewest, setSortFewest] = useState(false);
  const sortedInterests = sortFewest
    ? [...interests].sort((a, b) => (existingCountByInterest[a.id] || 0) - (existingCountByInterest[b.id] || 0))
    : interests;

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'14px 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} style={{ fontSize:13, color:'#6366f1', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>← Dashboard</button>
          <div style={{ width:1, height:20, background:'#e2e8f0' }} />
          <span style={{ fontSize:22 }}>⭐</span>
          <div>
            <div style={{ fontWeight:'bold', color:'#1e293b', fontSize:16, lineHeight:1.2 }}>Favorites Generator</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>v{VERSION}</div>
          </div>
        </div>
        <button onClick={() => setShowKeyPanel(v => !v)}
          style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:'1px solid #e2e8f0',
            background: favKey ? '#f0fdf4' : '#fef3c7', cursor:'pointer', color: favKey ? '#16a34a' : '#d97706' }}>
          {favKey ? '🔑 AI ✓' : '🔑 AI Key'}
        </button>
      </div>

      {/* AI panel */}
      {showKeyPanel && (
        <div style={{ background:'#fefce8', borderBottom:'1px solid #fde68a', padding:'12px 24px' }}>
          <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', gap:6 }}>
              {Object.entries(AI_PROVIDERS).map(([id, p]) => (
                <button key={id} onClick={() => switchProvider(id)}
                  style={{ padding:'4px 14px', fontSize:12, fontWeight:600, borderRadius:20,
                    border:'1px solid '+(favProvider===id?'#d97706':'#e2e8f0'),
                    background: favProvider===id?'#fef3c7':'white',
                    color: favProvider===id?'#92400e':'#64748b', cursor:'pointer' }}>
                  {p.name} {getApiKey(id)?'✓':''} {p.free?'(free)':''}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#92400e', minWidth:30 }}>Key</span>
              <input value={favKey} onChange={e => setFavKey(e.target.value)} type="password"
                placeholder={AI_PROVIDERS[favProvider].keyHint}
                style={{ flex:2, minWidth:200, padding:'6px 10px', border:'1px solid #fcd34d', borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', background:'white' }} />
              <span style={{ fontSize:12, fontWeight:700, color:'#92400e' }}>Model</span>
              <input value={favModel} onChange={e => setFavModel(e.target.value)}
                style={{ flex:1, minWidth:140, padding:'6px 10px', border:'1px solid #fcd34d', borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', background:'white' }} />
              <a href={AI_PROVIDERS[favProvider].keyUrl} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#92400e' }}>Get key ↗</a>
            </div>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#92400e', minWidth:50, paddingTop:4 }}>Prompt</span>
              <textarea value={favPrompt} onChange={e => setFavPrompt(e.target.value)} rows={14} spellCheck={false}
                style={{ flex:1, padding:'8px 10px', border:'1px solid #fcd34d', borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', resize:'vertical', lineHeight:1.5 }} />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setFavPrompt(DEFAULT_FAVORITES_PROMPT)}
                style={{ padding:'6px 14px', fontSize:12, background:'white', border:'1px solid #fcd34d', borderRadius:8, cursor:'pointer', color:'#92400e' }}>Reset prompt</button>
              <button onClick={() => setShowKeyPanel(false)}
                style={{ padding:'6px 14px', fontSize:12, background:'white', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b' }}>Cancel</button>
              <button onClick={() => {
                localStorage.setItem('foufou_ai_provider', favProvider);
                localStorage.setItem('foufou_ai_key_' + favProvider, favKey.trim());
                localStorage.setItem('foufou_ai_model_' + favProvider, favModel.trim());
                localStorage.setItem('foufou_favorites_prompt', favPrompt);
                setShowKeyPanel(false);
                showToast('AI settings saved (' + AI_PROVIDERS[favProvider].name + ')', 'success');
              }} style={{ padding:'6px 14px', fontSize:12, background:'#d97706', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth:920, margin:'0 auto', padding:'32px 24px' }}>
        {/* City picker */}
        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:13, fontWeight:700, color:'#334155', display:'block', marginBottom:8 }}>Select a city</label>
          {loadingCities ? <div style={{ color:'#94a3b8', fontSize:13 }}>Loading...</div> : (
            <select value={selectedKey} onChange={e => { setSelectedKey(e.target.value); setDraftPlaces(null); setEditingIdx(null); }}
              style={{ padding:'10px 14px', border:'2px solid #f59e0b', borderRadius:10, fontSize:14, color:'#1e293b', background:'white', cursor:'pointer', outline:'none', minWidth:240 }}>
              <option value="">— pick a city —</option>
              {sortedCities.map(([key, city]) => <option key={key} value={key}>{city.nameEn || city.name}</option>)}
            </select>
          )}
        </div>

        {selectedCity && draftPlaces === null && (
          <>
            {/* Interest picker */}
            <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20, marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#1e293b' }}>Select interests</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, color:'#64748b' }}>Places per interest:</span>
                  <input type="number" min={3} max={20} value={countPer}
                    onChange={e => setCountPer(Math.max(3, Math.min(20, +e.target.value)))}
                    style={{ width:50, padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, textAlign:'center', outline:'none' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                <button onClick={() => { const s={}; interests.forEach(i=>{s[i.id]=true;}); setSelInterests(s); }}
                  style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', color:'#64748b' }}>All</button>
                <button onClick={() => setSelInterests({})}
                  style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', color:'#64748b' }}>None</button>
                {existingPlaces.length > 0 && (
                  <button onClick={() => setSortFewest(v => !v)}
                    style={{ fontSize:11, padding:'3px 10px', borderRadius:6, cursor:'pointer',
                      border:'1px solid '+(sortFewest?'#f59e0b':'#e2e8f0'),
                      background: sortFewest?'#fef3c7':'white',
                      color: sortFewest?'#92400e':'#64748b' }}>
                    {sortFewest ? '↑ Fewest first' : 'Sort by fewest'}
                  </button>
                )}
              </div>
              {loadingInterests ? <div style={{ color:'#94a3b8', fontSize:13 }}>Loading interests...</div> : (
                <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                  {sortedInterests.map(interest => {
                    const on = !!selInterests[interest.id];
                    const cnt = existingCountByInterest[interest.id] || 0;
                    const cntColor = cnt === 0 ? '#ef4444' : cnt < 5 ? '#f59e0b' : '#94a3b8';
                    return (
                      <button key={interest.id}
                        onClick={() => setSelInterests(prev => ({ ...prev, [interest.id]: !prev[interest.id] }))}
                        style={{ padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                          border:'1px solid '+(on?'#f59e0b':'#e2e8f0'),
                          background: on?'#fef3c7':'white', color: on?'#92400e':'#94a3b8',
                          display:'flex', alignItems:'center', gap:4 }}>
                        {interest.icon?.startsWith('data:') || interest.icon?.startsWith('http')
                          ? <img src={interest.icon} alt="" style={{ height:'1em', width:'1em', verticalAlign:'middle', objectFit:'contain' }} />
                          : (interest.icon || '📍')}{' '}{interest.labelEn}
                        {existingPlaces.length > 0 && (
                          <span style={{ fontSize:10, fontWeight:700, color: on ? cntColor : cntColor, marginLeft:2 }}>
                            ({cnt})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button onClick={generate} disabled={generating || !selCount}
                style={{ padding:'10px 28px', background: (!selCount||generating)?'#fcd34d':'#f59e0b',
                  color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:'bold',
                  cursor: (!selCount||generating)?'default':'pointer' }}>
                {generating ? `⏳ ${genProgress}` : `✨ Generate — ${selCount} interests × ${countPer} places`}
              </button>
            </div>
          </>
        )}

        {/* Progress indicator while generating with no results yet */}
        {generating && draftPlaces !== null && draftPlaces.length === 0 && (
          <div style={{ color:'#f59e0b', fontSize:14, fontWeight:600, padding:'24px 0' }}>⏳ {genProgress}</div>
        )}

        {genError && (
          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10, padding:'12px 16px', margin:'16px 0', fontSize:13, color:'#dc2626' }}>
            {genError}
          </div>
        )}

        {/* Review */}
        {draftPlaces !== null && draftPlaces.length > 0 && (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
              <button onClick={saveToFirebase} disabled={saving || generating}
                style={{ padding:'10px 24px', background: (saving||generating)?'#86efac':'#10b981',
                  color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:'bold',
                  cursor:(saving||generating)?'default':'pointer' }}>
                {saving ? 'Saving...' : `💾 Save ${draftPlaces.length} places`}
              </button>
              {generating && <span style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>⏳ Still generating: {genProgress}</span>}
              {!generating && <>
                <button onClick={() => { setDraftPlaces(null); setEditingIdx(null); }}
                  style={{ padding:'10px 16px', background:'white', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:10, fontSize:13, cursor:'pointer' }}>Discard</button>
                <span style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>● {draftPlaces.length} places — not saved yet</span>
                {filteredCount > 0 && (
                  <span style={{ fontSize:12, color:'#94a3b8' }}>{filteredCount} duplicates filtered out</span>
                )}
              </>}
            </div>

            {interestsInDraft.map(interest => (
              <div key={interest.id} style={{ marginBottom:28 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#92400e', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                  {interest.icon?.startsWith('data:') || interest.icon?.startsWith('http')
                    ? <img src={interest.icon} alt="" style={{ height:'1em', width:'1em', verticalAlign:'middle', objectFit:'contain' }} />
                    : (interest.icon || '')} {interest.labelEn}
                  <span style={{ fontSize:11, color:'#94a3b8', fontWeight:400 }}>
                    ({draftPlaces.filter(p => p._iid===interest.id).length} places)
                  </span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {draftPlaces.map((place, idx) => {
                    if (place._iid !== interest.id) return null;
                    const isEditing = editingIdx === idx;
                    return (
                      <div key={idx} style={{ background:'white', borderRadius:12, border:'1px solid #fde68a', padding:'12px 16px' }}>
                        {isEditing ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:'#92400e', marginBottom:3 }}>Name (English)</div>
                              <input value={place.nameEn||''} onChange={e => updateDraft(idx,'nameEn',e.target.value)}
                                style={{ width:'100%', padding:'6px 8px', border:'1px solid #fde68a', borderRadius:6, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:'#92400e', marginBottom:3 }}>Description</div>
                              <input value={place.descEn||''} onChange={e => updateDraft(idx,'descEn',e.target.value)}
                                style={{ width:'100%', padding:'6px 8px', border:'1px solid #fde68a', borderRadius:6, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <a href={`https://www.google.com/maps/search/${encodeURIComponent(place.nameEn)}/@${place.lat},${place.lng},17z`}
                                target="_blank" rel="noreferrer"
                                style={{ fontSize:11, color:'#2563eb' }}>📍 Open in Google Maps</a>
                              <span style={{ fontSize:11, color:'#94a3b8' }}>→ <b>{place._areaName || 'no area'}</b></span>
                              <div style={{ flex:1 }} />
                              <button onClick={() => setEditingIdx(null)}
                                style={{ padding:'4px 12px', fontSize:12, background:'#f59e0b', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600 }}>Done</button>
                              <button onClick={() => deleteDraft(idx)}
                                style={{ padding:'4px 12px', fontSize:12, background:'white', color:'#ef4444', border:'1px solid #fca5a5', borderRadius:6, cursor:'pointer' }}>Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:600, color:'#1e293b' }}>{place.nameEn}</div>
                              <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{place.descEn}</div>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                                <span style={{ fontSize:11, color:'#94a3b8' }}>📍 {place._areaName || 'no area'}</span>
                                <a href={`https://www.google.com/maps/search/${encodeURIComponent(place.nameEn)}/@${place.lat},${place.lng},17z`}
                                  target="_blank" rel="noreferrer"
                                  style={{ fontSize:11, color:'#2563eb', textDecoration:'none' }}>View on Google Maps ↗</a>
                              </div>
                            </div>
                            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                              <button onClick={() => setEditingIdx(idx)}
                                style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #fde68a', background:'#fefce8', color:'#92400e', cursor:'pointer' }}>Edit</button>
                              <button onClick={() => deleteDraft(idx)}
                                style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #fca5a5', background:'white', color:'#ef4444', cursor:'pointer' }}>✕</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Tips Generator ───────────────────────────────────────────────────────────
const TipsGenerator = ({ showToast, onBack }) => {
  const [cities, setCities]             = useState({});
  const [loadingCities, setLoadingCities] = useState(true);
  const [selectedKey, setSelectedKey]   = useState('');
  const [savedTips, setSavedTips]       = useState(null);   // what's in Firebase
  const [draftTips, setDraftTips]       = useState(null);   // unsaved working copy
  const [loadingTips, setLoadingTips]   = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [editingIdx, setEditingIdx]     = useState(null);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [tipsPrompt, setTipsPrompt]     = useState(getTipsPrompt);
  const [tipProvider, setTipProvider]   = useState(getProvider);
  const [tipKey,      setTipKey]        = useState(() => getApiKey(getProvider()));
  const [tipModel,    setTipModel]      = useState(() => getModel(getProvider()));

  const switchProvider = (p) => { setTipProvider(p); setTipKey(getApiKey(p)); setTipModel(getModel(p)); };

  useEffect(() => {
    db.ref('settings/cityRegistry').once('value').then(snap => {
      setCities(snap.val() || {});
      setLoadingCities(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedKey) { setSavedTips(null); setDraftTips(null); setEditingIdx(null); return; }
    const city = cities[selectedKey];
    if (!city) return;
    setLoadingTips(true);
    setDraftTips(null); setEditingIdx(null);
    db.ref('helpContent/hint_city_' + city.id).once('value').then(snap => {
      const val = snap.val();
      if (val && val.en) {
        const enLines = val.en.split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean);
        const heLines = (val.he || '').split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean);
        setSavedTips(enLines.map((tipEn, i) => ({ tipEn, tip: heLines[i] || '' })));
      } else {
        setSavedTips([]);
      }
    }).finally(() => setLoadingTips(false));
  }, [selectedKey, cities]);

  const saveAiSettings = () => {
    localStorage.setItem('foufou_ai_provider', tipProvider);
    localStorage.setItem('foufou_ai_key_' + tipProvider, tipKey.trim());
    localStorage.setItem('foufou_ai_model_' + tipProvider, tipModel.trim());
    localStorage.setItem('foufou_tips_prompt', tipsPrompt);
    setShowKeyPanel(false);
    showToast('AI settings saved (' + AI_PROVIDERS[tipProvider].name + ')', 'success');
  };

  const generate = async () => {
    const city = cities[selectedKey];
    if (!city) return;
    setError(''); setEditingIdx(null);
    localStorage.setItem('foufou_ai_provider', tipProvider);
    localStorage.setItem('foufou_ai_key_' + tipProvider, tipKey.trim());
    localStorage.setItem('foufou_ai_model_' + tipProvider, tipModel.trim());
    setGenerating(true);
    const prompt = tipsPrompt.replace(/\{cityName\}/g, city.nameEn || city.name);
    const result = await callAI(prompt, 8192);
    setGenerating(false);
    if (result && result.error) { setError(result.error); return; }
    let arr = null;
    try {
      const stripped = (result || '').replace(/```[a-z]*/g, '').replace(/```/g, '').trim();
      try { arr = JSON.parse(stripped); } catch(e) {}
      if (!Array.isArray(arr)) {
        const m = (result || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (m) try { arr = JSON.parse(m[0]); } catch(e) {}
      }
    } catch(e) {}
    if (!Array.isArray(arr) || !arr.length) {
      setError('AI returned unexpected format. Try again.\nRaw: ' + (result || '').slice(0, 300));
      return;
    }
    setDraftTips(arr);
  };

  const saveToFirebase = async () => {
    const city = cities[selectedKey];
    if (!city || !draftTips) return;
    setSaving(true);
    const enBlob = draftTips.map(t => '- ' + t.tipEn).join('\n');
    const heBlob = draftTips.map(t => '- ' + t.tip).join('\n');
    await db.ref('helpContent/hint_city_' + city.id).set({ en: enBlob, he: heBlob });
    setSavedTips(draftTips);
    setDraftTips(null);
    setEditingIdx(null);
    setSaving(false);
    showToast('Saved ' + draftTips.length + ' tips for ' + (city.nameEn || city.name), 'success');
  };

  const updateDraftTip = (i, field, val) => {
    setDraftTips(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  };

  const deleteDraftTip = (i) => {
    setDraftTips(prev => prev.filter((_, idx) => idx !== i));
    if (editingIdx === i) setEditingIdx(null);
    else if (editingIdx > i) setEditingIdx(editingIdx - 1);
  };

  const sorted = Object.entries(cities).sort((a, b) => (a[1].nameEn || '').localeCompare(b[1].nameEn || ''));
  const selectedCity = selectedKey ? cities[selectedKey] : null;
  const displayTips = draftTips !== null ? draftTips : savedTips;
  const isDraft = draftTips !== null;

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'14px 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack}
            style={{ fontSize:13, color:'#6366f1', background:'none', border:'none',
              cursor:'pointer', fontWeight:600 }}>← Dashboard</button>
          <div style={{ width:1, height:20, background:'#e2e8f0' }} />
          <span style={{ fontSize:22 }}>💡</span>
          <div>
            <div style={{ fontWeight:'bold', color:'#1e293b', fontSize:16, lineHeight:1.2 }}>Tips Generator</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>v{VERSION}</div>
          </div>
        </div>
        <button onClick={() => setShowKeyPanel(v => !v)}
          style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:'1px solid #e2e8f0',
            background: tipKey ? '#f0fdf4' : '#fef3c7', cursor:'pointer',
            color: tipKey ? '#16a34a' : '#d97706' }}>
          {tipKey ? '🔑 AI ✓' : '🔑 AI Key'}
        </button>
      </div>

      {/* AI settings panel */}
      {showKeyPanel && (
        <div style={{ background:'#fefce8', borderBottom:'1px solid #fde68a', padding:'12px 24px' }}>
          <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', gap:6 }}>
              {Object.entries(AI_PROVIDERS).map(([id, p]) => (
                <button key={id} onClick={() => switchProvider(id)}
                  style={{ padding:'4px 14px', fontSize:12, fontWeight:600, borderRadius:20,
                    border:'1px solid ' + (tipProvider===id ? '#d97706' : '#e2e8f0'),
                    background: tipProvider===id ? '#fef3c7' : 'white',
                    color: tipProvider===id ? '#92400e' : '#64748b', cursor:'pointer' }}>
                  {p.name} {getApiKey(id) ? '✓' : ''} {p.free ? '(free)':''}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#92400e', minWidth:30 }}>Key</span>
              <input value={tipKey} onChange={e => setTipKey(e.target.value)} type="password"
                placeholder={AI_PROVIDERS[tipProvider].keyHint}
                style={{ flex:2, minWidth:200, padding:'6px 10px', border:'1px solid #fcd34d',
                  borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', background:'white' }} />
              <span style={{ fontSize:12, fontWeight:700, color:'#92400e' }}>Model</span>
              <input value={tipModel} onChange={e => setTipModel(e.target.value)}
                style={{ flex:1, minWidth:140, padding:'6px 10px', border:'1px solid #fcd34d',
                  borderRadius:8, fontSize:12, fontFamily:'monospace', outline:'none', background:'white' }} />
              <a href={AI_PROVIDERS[tipProvider].keyUrl} target="_blank" rel="noreferrer"
                style={{ fontSize:11, color:'#92400e', whiteSpace:'nowrap' }}>Get key ↗</a>
            </div>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#92400e', minWidth:50, paddingTop:4 }}>Prompt</span>
              <textarea value={tipsPrompt} onChange={e => setTipsPrompt(e.target.value)}
                rows={14} spellCheck={false}
                style={{ flex:1, padding:'8px 10px', border:'1px solid #fcd34d', borderRadius:8,
                  fontSize:12, fontFamily:'monospace', outline:'none', resize:'vertical', lineHeight:1.5 }} />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setTipsPrompt(DEFAULT_TIPS_PROMPT)}
                style={{ padding:'6px 14px', fontSize:12, background:'white', border:'1px solid #fcd34d',
                  borderRadius:8, cursor:'pointer', color:'#92400e' }}>Reset prompt</button>
              <button onClick={() => setShowKeyPanel(false)}
                style={{ padding:'6px 14px', fontSize:12, background:'white', border:'1px solid #e2e8f0',
                  borderRadius:8, cursor:'pointer', color:'#64748b' }}>Cancel</button>
              <button onClick={saveAiSettings}
                style={{ padding:'6px 14px', fontSize:12, background:'#d97706', color:'white',
                  border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth:760, margin:'0 auto', padding:'32px 24px' }}>

        {/* City picker */}
        <div style={{ marginBottom:28 }}>
          <label style={{ fontSize:13, fontWeight:700, color:'#334155', display:'block', marginBottom:8 }}>
            Select a city
          </label>
          {loadingCities ? (
            <div style={{ color:'#94a3b8', fontSize:13 }}>Loading cities...</div>
          ) : (
            <select value={selectedKey} onChange={e => setSelectedKey(e.target.value)}
              style={{ padding:'10px 14px', border:'2px solid #6366f1', borderRadius:10, fontSize:14,
                color:'#1e293b', background:'white', cursor:'pointer', outline:'none', minWidth:240 }}>
              <option value="">— pick a city —</option>
              {sorted.map(([key, city]) => (
                <option key={key} value={key}>{city.nameEn || city.name}</option>
              ))}
            </select>
          )}
        </div>

        {selectedCity && (
          <>
            {/* Action bar */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
              <button onClick={generate} disabled={generating}
                style={{ padding:'10px 24px', background: generating ? '#a5b4fc' : '#6366f1',
                  color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:'bold',
                  cursor: generating ? 'default' : 'pointer' }}>
                {generating ? '⏳ Generating...' : (savedTips && savedTips.length ? '🔄 Regenerate' : '✨ Generate tips')}
              </button>

              {isDraft && (
                <>
                  <button onClick={saveToFirebase} disabled={saving}
                    style={{ padding:'10px 24px', background: saving ? '#86efac' : '#10b981',
                      color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:'bold',
                      cursor: saving ? 'default' : 'pointer' }}>
                    {saving ? 'Saving...' : '💾 Save to Firebase'}
                  </button>
                  <button onClick={() => { setDraftTips(null); setEditingIdx(null); }}
                    style={{ padding:'10px 16px', background:'white', color:'#64748b',
                      border:'1px solid #e2e8f0', borderRadius:10, fontSize:13, cursor:'pointer' }}>
                    Discard
                  </button>
                  <span style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>
                    ● {draftTips.length} tips — not saved yet
                  </span>
                </>
              )}
              {!isDraft && savedTips && savedTips.length > 0 && (
                <span style={{ fontSize:13, color:'#64748b' }}>{savedTips.length} tips saved ✓</span>
              )}
            </div>

            {error && (
              <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10,
                padding:'12px 16px', marginBottom:20, fontSize:13, color:'#dc2626', whiteSpace:'pre-wrap' }}>
                {error}
              </div>
            )}

            {loadingTips ? (
              <div style={{ color:'#94a3b8', fontSize:13 }}>Loading tips...</div>
            ) : displayTips && displayTips.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {displayTips.map((tip, i) => (
                  <div key={i} style={{ background:'white', borderRadius:12,
                    border:'1px solid ' + (isDraft ? '#c7d2fe' : '#e2e8f0'), padding:'14px 18px' }}>
                    {editingIdx === i && isDraft ? (
                      /* Edit mode */
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#6366f1', marginBottom:2 }}>
                          #{i+1} — English
                        </div>
                        <textarea value={tip.tipEn}
                          onChange={e => updateDraftTip(i, 'tipEn', e.target.value)}
                          rows={3} spellCheck={false}
                          style={{ width:'100%', padding:'8px 10px', border:'1px solid #c7d2fe',
                            borderRadius:8, fontSize:13, lineHeight:1.6, resize:'vertical',
                            outline:'none', boxSizing:'border-box' }} />
                        <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:2 }}>
                          Hebrew
                        </div>
                        <textarea value={tip.tip}
                          onChange={e => updateDraftTip(i, 'tip', e.target.value)}
                          rows={3} spellCheck={false} dir="rtl"
                          style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0',
                            borderRadius:8, fontSize:13, lineHeight:1.6, resize:'vertical',
                            outline:'none', boxSizing:'border-box' }} />
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={() => setEditingIdx(null)}
                            style={{ padding:'5px 14px', fontSize:12, background:'#6366f1', color:'white',
                              border:'none', borderRadius:8, cursor:'pointer', fontWeight:600 }}>Done</button>
                          <button onClick={() => deleteDraftTip(i)}
                            style={{ padding:'5px 14px', fontSize:12, background:'white', color:'#ef4444',
                              border:'1px solid #fca5a5', borderRadius:8, cursor:'pointer' }}>Delete tip</button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'#6366f1', minWidth:22, paddingTop:3 }}>
                          {i+1}
                        </span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, color:'#1e293b', lineHeight:1.6, marginBottom:4 }}>
                            {tip.tipEn}
                          </div>
                          <div style={{ fontSize:12, color:'#94a3b8', direction:'rtl', textAlign:'right', lineHeight:1.6 }}>
                            {tip.tip}
                          </div>
                        </div>
                        {isDraft && (
                          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                            <button onClick={() => setEditingIdx(i)}
                              style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #c7d2fe',
                                background:'#eef2ff', color:'#6366f1', cursor:'pointer' }}>Edit</button>
                            <button onClick={() => deleteDraftTip(i)}
                              style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #fca5a5',
                                background:'white', color:'#ef4444', cursor:'pointer' }}>✕</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : displayTips !== null && !loadingTips ? (
              <div style={{ textAlign:'center', padding:'48px 0', color:'#94a3b8', fontSize:14 }}>
                No tips yet — click Generate to create them with AI
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id:'cities',    icon:'🏙️', title:'City Builder',        color:'#10b981', ready:true,
    desc:'Create and edit cities — define areas, boundaries, names and characteristics.' },
  { id:'favorites', icon:'⭐', title:'Favorites Generator',  color:'#f59e0b', ready:true,
    desc:'AI agent adds 5 curated places per area per interest using Google Places.' },
  { id:'tips',      icon:'💡', title:'Tips Generator',       color:'#6366f1', ready:true,
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

      {view === 'favorites' && (
        <FavoritesGenerator showToast={showToast} onBack={() => setView('dashboard')} user={user} />
      )}

      {view === 'tips' && (
        <TipsGenerator showToast={showToast} onBack={() => setView('dashboard')} />
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
