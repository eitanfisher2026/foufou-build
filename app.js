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
const GOOGLE_KEY   = 'AIzaSyCE598tSisniM66ApqRvOyOq4svTf6pLHc';
const PLACES_URL   = 'https://places.googleapis.com/v1/places:searchText';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OSM_TILES    = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const COLORS = ['#4a90d9','#e8a838','#d95555','#3bba7e','#d97eb5','#7c7ce0','#9b7ed9','#2eb8c9','#e08540','#b36dd9','#38b3a0','#c93d5a'];

const HE_WORDS = {
  'old city': 'העיר העתיקה',
  'old town': 'העיר העתיקה',
  'city center': 'מרכז העיר',
  'city centre': 'מרכז העיר',
  'downtown': 'מרכז העיר',
  'center': 'מרכז',
  'north': 'צפון',
  'south': 'דרום',
  'east': 'מזרח',
  'west': 'מערב',
  'northeast': 'צפון מזרח',
  'northwest': 'צפון מערב',
  'southeast': 'דרום מזרח',
  'southwest': 'דרום מערב',
  'port': 'נמל',
  'harbor': 'נמל',
  'harbour': 'נמל',
  'beach': 'חוף',
  'riverside': 'גדת הנהר',
  'waterfront': 'מול המים',
  'market': 'שוק',
  'park': 'פארק',
  'chinatown': "צ'יינה טאון",
  'uptown': 'אפטאון',
  'midtown': 'מידטאון',
};

function suggestHebrew(nameEn) {
  const lower = (nameEn || '').toLowerCase();
  for (const [key, val] of Object.entries(HE_WORDS)) {
    if (lower === key || lower.includes(key)) return val;
  }
  return '';
}

// Helpers
function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toId(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function roundCoord(v) { return Math.round(v * 10000) / 10000; }

// Returns true if str is written in Latin script (char codes <= 591, allowing accented chars)
// Blocks Greek (880+), Cyrillic (1024+), Hebrew (1424+), Arabic (1536+), CJK (19968+)
function isLatinScript(str) {
  if (!str) return false;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 591 && c !== 160) return false;
  }
  return true;
}

function processOverpassAreas(elements, cityLat, cityLng, maxRadius) {
  const seen = new Set();
  const raw = [];

  for (const el of elements) {
    const tags = el.tags || {};
    // Try name tags in order: English > international > Latin > other Latin-script languages > local
    const candidates = [
      tags['name:en'], tags['int_name'], tags['name:latin'],
      tags['name:fr'], tags['name:de'], tags['name:es'], tags['name']
    ];
    const nameEn = candidates.find(n => n && n.length >= 2 && isLatinScript(n)) || '';
    if (!nameEn) continue;

    const key = nameEn.toLowerCase();
    if (seen.has(key)) continue;

    let lat, lng, radius;
    if (el.type === 'node') {
      lat = el.lat; lng = el.lon;
      const rMap = { neighbourhood: 800, suburb: 1500, quarter: 700, borough: 2500, district: 2000, town: 1200 };
      radius = rMap[tags.place] || 1000;
    } else if (el.center) {
      lat = el.center.lat; lng = el.center.lon;
      if (el.bounds) {
        const latSpan = (el.bounds.maxlat - el.bounds.minlat) * 111320;
        const lngSpan = (el.bounds.maxlon - el.bounds.minlon) * 111320 * Math.cos(lat * Math.PI / 180);
        radius = Math.round(Math.max(latSpan, lngSpan) / 2);
      } else { radius = 1200; }
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
    const overlap = kept.some(k => distM(area.lat, area.lng, k.lat, k.lng) < Math.min(area.radius, k.radius) * 0.7);
    if (!overlap) kept.push(area);
    if (kept.length >= 12) break;
  }
  return kept;
}

function generateCompassAreas(cityLat, cityLng) {
  const R = 3000;
  const dLat = R / 111320;
  const dLng = R / (111320 * Math.cos(cityLat * Math.PI / 180));
  const make = (id, en, he, lat, lng) => ({
    id, labelEn: en, label: he, desc: '', descEn: '',
    lat: roundCoord(lat), lng: roundCoord(lng), radius: 2000, size: 'medium', safety: 'safe'
  });
  return [
    make('center',    'City Center', suggestHebrew('city center'), cityLat,        cityLng),
    make('north',     'North',       suggestHebrew('north'),       cityLat+dLat,   cityLng),
    make('south',     'South',       suggestHebrew('south'),       cityLat-dLat,   cityLng),
    make('east',      'East',        suggestHebrew('east'),        cityLat,        cityLng+dLng),
    make('west',      'West',        suggestHebrew('west'),        cityLat,        cityLng-dLng),
    make('northeast', 'North East',  suggestHebrew('northeast'),   cityLat+dLat,   cityLng+dLng),
    make('northwest', 'North West',  suggestHebrew('northwest'),   cityLat+dLat,   cityLng-dLng),
    make('southeast', 'South East',  suggestHebrew('southeast'),   cityLat-dLat,   cityLng+dLng),
  ];
}

// Toast
const Toast = ({ msg, type, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  const bg = { success: '#16a34a', error: '#dc2626', info: '#2563eb', warning: '#d97706' };
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: bg[type] || '#1e293b', color: 'white', padding: '10px 22px',
      borderRadius: 10, fontSize: 14, fontWeight: 'bold',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 9999, whiteSpace: 'nowrap'
    }}>{msg}</div>
  );
};

// Leaflet Map
const AreaMap = ({ areas, selectedIdx, cityLat, cityLng, onSelect }) => {
  const divRef    = useRef(null);
  const mapRef    = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    window.loadLeaflet().then(() => {
      if (mapRef.current || !divRef.current) return;
      const map = L.map(divRef.current, { zoomControl: true });
      L.tileLayer(OSM_TILES, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);
      mapRef.current = map;
      redraw(map, areas, selectedIdx);
    });
  }, []);

  useEffect(() => {
    if (mapRef.current) redraw(mapRef.current, areas, selectedIdx);
  }, [areas, selectedIdx]);

  function redraw(map, areas, selIdx) {
    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    layersRef.current = [];
    if (!areas || !areas.length) return;

    areas.forEach((area, i) => {
      const color = COLORS[i % COLORS.length];
      const selected = i === selIdx;
      const circle = L.circle([area.lat, area.lng], {
        radius: area.radius, color, fillColor: color,
        fillOpacity: selected ? 0.35 : 0.12,
        weight: selected ? 3 : 1.5
      }).addTo(map);
      circle.on('click', () => onSelect(i));

      const icon = L.divIcon({
        className: '',
        html: '<div style="font-size:11px;font-weight:bold;background:rgba(255,255,255,0.92);padding:2px 7px;border-radius:4px;border:2px solid ' + color + ';white-space:nowrap;color:' + color + ';box-shadow:0 1px 3px rgba(0,0,0,0.15)">' + (area.labelEn || '?') + '</div>',
        iconSize: [140, 22], iconAnchor: [70, 11]
      });
      const marker = L.marker([area.lat, area.lng], { icon, interactive: true }).addTo(map);
      marker.on('click', () => onSelect(i));
      layersRef.current.push(circle, marker);
    });

    const circles = layersRef.current.filter(l => l instanceof L.Circle);
    if (circles.length) {
      try { map.fitBounds(L.featureGroup(circles).getBounds().pad(0.15)); } catch(e) {}
    }
  }

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />;
};

// Area Editor Panel
const AreaEditor = ({ area, idx, total, onChange, onDelete, onMoveUp, onMoveDown }) => {
  if (!area) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm p-4 text-center">
      Click an area on the map or in the list to edit it
    </div>
  );

  const field = (label, key, placeholder, dir) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input value={area[key] || ''} onChange={e => onChange({ ...area, [key]: e.target.value })}
        placeholder={placeholder || ''} dir={dir || 'ltr'}
        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
      />
    </div>
  );

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Area {idx + 1} of {total}</span>
        <div className="flex gap-1">
          <button onClick={onMoveUp}   disabled={idx === 0}       className="px-2 py-1 text-xs rounded bg-slate-100 disabled:opacity-30 hover:bg-slate-200">up</button>
          <button onClick={onMoveDown} disabled={idx === total-1} className="px-2 py-1 text-xs rounded bg-slate-100 disabled:opacity-30 hover:bg-slate-200">dn</button>
          <button onClick={onDelete}   className="px-2 py-1 text-xs rounded bg-red-50 text-red-500 hover:bg-red-100">Delete</button>
        </div>
      </div>

      {field('Name (English)', 'labelEn', 'e.g. Old Town')}
      {field('Name (Hebrew)', 'label', '', 'rtl')}

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Description (English)</label>
        <textarea value={area.descEn || ''} onChange={e => onChange({ ...area, descEn: e.target.value })}
          placeholder="Landmarks, highlights, vibe..." rows={2}
          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Description (Hebrew)</label>
        <textarea value={area.desc || ''} onChange={e => onChange({ ...area, desc: e.target.value })}
          rows={2} dir="rtl"
          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Radius (m)</label>
          <input type="number" step="100" min="300" max="8000" value={area.radius || 1000}
            onChange={e => onChange({ ...area, radius: parseInt(e.target.value) || 1000 })}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Safety</label>
          <select value={area.safety || 'safe'} onChange={e => onChange({ ...area, safety: e.target.value })}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400">
            <option value="safe">Safe</option>
            <option value="caution">Caution</option>
            <option value="danger">Danger</option>
          </select>
        </div>
      </div>
      <div className="text-xs text-slate-400">Center: {area.lat}, {area.lng}</div>
    </div>
  );
};

// Add City Flow
const AddCityFlow = ({ showToast, onDone }) => {
  const [step, setStep]         = useState('search');
  const [query, setQuery]       = useState('');
  const [searching, setSearching] = useState(false);
  const [foundCity, setFoundCity] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [areas, setAreas]       = useState([]);
  const [selIdx, setSelIdx]     = useState(null);
  const [cityIcon, setCityIcon] = useState('');
  const [saving, setSaving]     = useState(false);

  const searchCity = async () => {
    if (!query.trim()) return;
    setSearching(true); setFoundCity(null);
    try {
      const resp = await fetch(PLACES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.viewport' },
        body: JSON.stringify({ textQuery: query + ' city', languageCode: 'en', maxResultCount: 3 })
      });
      const data = await resp.json();
      const p = data.places?.[0];
      if (p?.location) {
        setFoundCity({ name: p.displayName?.text || query, address: p.formattedAddress || '',
          lat: p.location.latitude, lng: p.location.longitude, viewport: p.viewport });
      } else { showToast('City not found', 'error'); }
    } catch (e) { showToast('Search failed: ' + e.message, 'error'); }
    setSearching(false);
  };

  const generateAreas = async () => {
    if (!foundCity) return;
    setGenerating(true);
    const { lat, lng, viewport } = foundCity;
    const s = viewport?.low?.latitude  ?? lat - 0.18;
    const w = viewport?.low?.longitude ?? lng - 0.18;
    const n = viewport?.high?.latitude ?? lat + 0.18;
    const e = viewport?.high?.longitude ?? lng + 0.18;
    const maxRadius = Math.max(viewport ? distM(s, w, n, e) / 2 : 20000, 12000);

    const q = '[out:json][timeout:30];\n(\n' +
      '  relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"](' + s + ',' + w + ',' + n + ',' + e + ');\n' +
      '  node["place"~"^(neighbourhood|suburb|quarter|borough|district)$"]["name"](' + s + ',' + w + ',' + n + ',' + e + ');\n' +
      '  way["place"~"^(neighbourhood|suburb|quarter|borough|district)$"]["name"](' + s + ',' + w + ',' + n + ',' + e + ');\n' +
      ');\nout center tags bb;';

    try {
      const resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q)
      });
      const data = await resp.json();
      let processed = processOverpassAreas(data.elements || [], lat, lng, maxRadius);

      if (processed.length < 4) {
        showToast('Limited OSM data -- using compass areas as base', 'warning');
        processed = generateCompassAreas(lat, lng);
      }

      setAreas(processed.map((a, i) => ({
        id: toId(a.labelEn || ('area_' + i)),
        labelEn: a.labelEn || '',
        label: suggestHebrew(a.labelEn || ''),
        descEn: '', desc: '',
        lat: roundCoord(a.lat), lng: roundCoord(a.lng),
        radius: Math.round((a.radius || 1200) / 100) * 100,
        size: (a.radius || 1200) > 2500 ? 'large' : 'medium',
        safety: 'safe'
      })));
      setSelIdx(0);
      setStep('review');
    } catch (e) { showToast('Area generation failed: ' + e.message, 'error'); }
    setGenerating(false);
  };

  const updateArea = (idx, updated) => setAreas(prev => prev.map((a, i) => i === idx ? updated : a));
  const deleteArea = (idx) => { setAreas(prev => prev.filter((_, i) => i !== idx)); setSelIdx(null); };
  const moveArea   = (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= areas.length) return;
    setAreas(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
    setSelIdx(next);
  };

  const saveCity = async () => {
    if (!foundCity || !areas.length) return;
    setSaving(true);
    try {
      const cityId = toId(foundCity.name);
      const allCityRadius = Math.round(Math.max(...areas.map(a => distM(foundCity.lat, foundCity.lng, a.lat, a.lng) + a.radius)));
      await Promise.all([
        db.ref('cities/' + cityId + '/config').set({
          center: { lat: roundCoord(foundCity.lat), lng: roundCoord(foundCity.lng) },
          allCityRadius, distanceMultiplier: 1.05, dayStartHour: 7, nightStartHour: 18,
          areas, interestToGooglePlaces: {}, textSearchInterests: { graffiti: 'street art' },
          interestTooltips: {}, systemRoutes: []
        }),
        db.ref('settings/cityRegistry/' + cityId).set({
          id: cityId, name: foundCity.name, nameEn: foundCity.name,
          country: (foundCity.address.split(',').pop() || '').trim(),
          icon: cityIcon || '🏙️', active: false, order: 99
        })
      ]);
      showToast(foundCity.name + ' saved (inactive)', 'success');
      onDone();
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
    setSaving(false);
  };

  if (step === 'search') return (
    <div className="max-w-lg mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onDone} className="text-slate-400 hover:text-slate-600 text-sm">Back</button>
        <h2 className="text-lg font-bold text-slate-800">Add New City</h2>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-2">City name (English)</label>
          <div className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchCity()}
              placeholder="e.g. Barcelona, Tokyo, Amsterdam..."
              className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" autoFocus />
            <button onClick={searchCity} disabled={!query.trim() || searching}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
              {searching ? '...' : 'Search'}
            </button>
          </div>
        </div>

        {foundCity && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 space-y-3">
            <div>
              <div className="font-bold text-slate-800 text-base">{foundCity.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{foundCity.address}</div>
              <div className="text-xs text-slate-400 mt-0.5">{foundCity.lat.toFixed(4)}, {foundCity.lng.toFixed(4)}</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">City icon (emoji)</label>
              <input value={cityIcon} onChange={e => setCityIcon(e.target.value)} maxLength={4}
                placeholder="🏙️"
                className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-xl text-center" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setFoundCity(null)}
                className="flex-1 py-2 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
                Try again
              </button>
              <button onClick={generateAreas} disabled={generating}
                className="flex-1 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-50">
                {generating ? 'Generating...' : 'Correct -- Generate Areas'}
              </button>
            </div>
          </div>
        )}

        {generating && (
          <div className="text-center py-6 text-slate-400 text-sm">
            <div className="text-3xl mb-2">🗺️</div>
            Fetching areas from OpenStreetMap...
          </div>
        )}
      </div>
    </div>
  );

  if (step === 'review') return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('search')} className="text-slate-400 hover:text-slate-600 text-sm">Back</button>
          <span className="font-bold text-slate-800">{cityIcon || '🏙️'} {foundCity?.name}</span>
          <span className="text-slate-400 text-sm">-- {areas.length} areas</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => {
            const newArea = { id: 'area_' + Date.now(), labelEn: 'New Area', label: '', descEn: '', desc: '',
              lat: roundCoord(foundCity.lat), lng: roundCoord(foundCity.lng), radius: 1000, size: 'medium', safety: 'safe' };
            setAreas(prev => [...prev, newArea]);
            setSelIdx(areas.length);
          }} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-semibold">
            + Add Area
          </button>
          <button onClick={saveCity} disabled={saving || !areas.length}
            className="px-4 py-1.5 text-sm bg-emerald-500 text-white rounded-lg font-bold hover:bg-emerald-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save City'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-44 flex-shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50">
          {areas.map((area, i) => (
            <div key={i} onClick={() => setSelIdx(i)}
              className={'px-3 py-2.5 border-b border-slate-100 cursor-pointer hover:bg-white transition-colors' + (selIdx === i ? ' bg-white border-l-4 border-l-indigo-500' : '')}>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full flex-shrink-0 text-xs flex items-center justify-center font-bold text-white"
                  style={{ background: COLORS[i % COLORS.length], fontSize: '10px' }}>{i+1}</span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{area.labelEn || '(unnamed)'}</div>
                  {area.label && <div className="text-xs text-slate-400 truncate">{area.label}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 relative">
          <AreaMap areas={areas} selectedIdx={selIdx} cityLat={foundCity?.lat} cityLng={foundCity?.lng} onSelect={setSelIdx} />
        </div>

        <div className="w-72 flex-shrink-0 border-l border-slate-200 bg-white">
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
    </div>
  );

  return null;
};

// City List
const CityList = ({ onAddCity }) => {
  const [cities, setCities]   = useState({});
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    db.ref('settings/cityRegistry').once('value').then(snap => {
      const reg = snap.val() || {};
      setCities(reg);
      return Promise.all(Object.values(reg).map(c =>
        db.ref('cities/' + c.id + '/config/areas').once('value').then(s => ({ id: c.id, areas: s.val() }))
      ));
    }).then(results => {
      const counts = {};
      results.forEach(({ id, areas }) => {
        counts[id] = areas ? (Array.isArray(areas) ? areas.length : Object.keys(areas).length) : null;
      });
      setConfigs(counts);
    }).finally(() => setLoading(false));
  }, []);

  const sorted = Object.entries(cities).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-slate-700">Cities <span className="text-slate-400 font-normal">({sorted.length})</span></h2>
        <button onClick={onAddCity} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 shadow-sm">
          + New City
        </button>
      </div>
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading cities...</div>
      ) : (
        <div className="space-y-2">
          {sorted.map(([key, city]) => (
            <div key={key} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4 hover:border-slate-300 transition-colors">
              <span className="text-3xl flex-shrink-0">{city.icon?.startsWith?.('data:') ? '🏙️' : (city.icon || '🏙️')}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 text-sm">{city.nameEn}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {city.name} · {city.country}
                  {configs[city.id] != null
                    ? <span className="ml-2 text-slate-500">· {configs[city.id]} areas</span>
                    : <span className="ml-2 text-amber-500">· not seeded</span>}
                </div>
              </div>
              <span className={'text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ' + (city.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                {city.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main App
const FouFouBuild = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser]               = useState(null);
  const [userRole, setUserRole]       = useState(0);
  const [view, setView]               = useState('cities');
  const [toast, setToast]             = useState(null);

  const showToast = (msg, type) => setToast({ msg, type: type || 'info', key: Date.now() });

  useEffect(() => {
    auth.getRedirectResult().catch(() => {});
    return auth.onAuthStateChanged(async u => {
      setUser(u);
      if (u && !u.isAnonymous) {
        try { const s = await db.ref('users/' + u.uid + '/role').once('value'); setUserRole(s.val() || 0); }
        catch { setUserRole(0); }
      } else { setUserRole(0); }
      setAuthLoading(false);
    });
  }, []);

  const signIn  = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showToast(e.message, 'error'));
  const signOut = () => { auth.signOut(); setView('cities'); };

  if (authLoading) return (
    <div className="flex items-center justify-center h-screen flex-col gap-3 text-slate-500">
      <div className="text-5xl">🏗️</div>
      <div className="font-bold text-xl text-slate-700">FouFou Build</div>
      <div className="text-sm">Loading...</div>
    </div>
  );

  if (!user) return (
    <div className="flex items-center justify-center h-screen flex-col gap-6">
      <div className="text-6xl">🏗️</div>
      <div className="text-3xl font-bold text-slate-800">FouFou Build</div>
      <div className="text-slate-400 text-sm">City management · Admin only</div>
      <button onClick={signIn} className="mt-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg text-sm">
        Sign in with Google
      </button>
    </div>
  );

  if (userRole < 2) return (
    <div className="flex items-center justify-center h-screen flex-col gap-4">
      <div className="text-5xl">🔒</div>
      <div className="font-bold text-xl text-slate-700">Admin access required</div>
      <div className="text-sm text-slate-400">{user.email}</div>
      <button onClick={signOut} className="text-xs text-slate-400 underline hover:text-slate-600">Sign out</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {view === 'cities' && (
        <>
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏗️</span>
              <div>
                <div className="font-bold text-slate-800 text-lg leading-tight">FouFou Build</div>
                <div className="text-xs text-slate-400">City management</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 hidden sm:block">{user.displayName || user.email}</div>
              <button onClick={signOut} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">Sign out</button>
            </div>
          </div>
          <CityList onAddCity={() => setView('add-city')} />
        </>
      )}
      {view === 'add-city' && (
        <AddCityFlow showToast={showToast} onDone={() => setView('cities')} />
      )}
      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<FouFouBuild />);
