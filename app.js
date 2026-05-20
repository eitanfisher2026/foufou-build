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
const VERSION      = '0.2.4';
const GOOGLE_KEY   = 'AIzaSyCE598tSisniM66ApqRvOyOq4svTf6pLHc';
const PLACES_URL   = 'https://places.googleapis.com/v1/places:searchText';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// CartoDB Positron -- free, no API key, no domain restriction
const MAP_TILES    = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const MAP_ATTR     = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';
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

// Toast
const Toast = ({ msg, type, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  const bg = { success:'#16a34a', error:'#dc2626', info:'#2563eb', warning:'#d97706' };
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
      background: bg[type]||'#1e293b', color:'white', padding:'10px 22px',
      borderRadius:10, fontSize:14, fontWeight:'bold',
      boxShadow:'0 4px 16px rgba(0,0,0,0.25)', zIndex:9999, whiteSpace:'nowrap'
    }}>{msg}</div>
  );
};

// ─── Leaflet Map ──────────────────────────────────────────────────────────────
// Key fixes:
//   1. Map initialised with explicit center+zoom so flyTo never crashes on uninitialised map.
//   2. cityLat/cityLng stored in refs so the init effect closure always has current values.
//   3. mapReady state ensures the redraw effect runs with fresh props, not stale closure.
//   4. flyTo wrapped in try-catch as a final safety net.
const AreaMap = ({ areas, selectedIdx, cityLat, cityLng, allCityRadius, onSelect }) => {
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

      // Fit bounds on first draw
      if (selectedIdx === null) {
        const circles = layersRef.current.filter(l => l instanceof L.Circle);
        try { map.fitBounds(L.featureGroup(circles).getBounds().pad(0.2)); } catch(e) {}
      }
    }

    // Fly to selected area (safe -- map always has center from init)
    if (selectedIdx !== null && areas && areas[selectedIdx]) {
      const a = areas[selectedIdx];
      try { map.flyTo([a.lat, a.lng], 14, { duration: 0.5 }); } catch(e) {}
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
  const txt = (label, key, dir) => (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>{label}</div>
      <textarea value={area[key]||''} onChange={e => onChange({...area,[key]:e.target.value})}
        rows={2} dir={dir||'ltr'}
        style={{ width:'100%', boxSizing:'border-box', padding:'6px 10px', border:'1px solid #e2e8f0',
          borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', resize:'vertical' }} />
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

      {inp('Name (English)', 'labelEn', 'e.g. Old Town')}
      {inp('Name (Hebrew)', 'label', '', 'rtl')}
      {txt('Description (English)', 'descEn')}
      {txt('Description (Hebrew)', 'desc', 'rtl')}

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

// ─── Shared review layout (used by AddCityFlow and CityEditor) ────────────────
const ReviewLayout = ({ title, areas, setAreas, selIdx, setSelIdx, cityLat, cityLng, allCityRadius,
  onBack, onSave, saving, extraButton }) => {

  const updateArea = (idx, updated) => setAreas(prev => prev.map((a,i) => i===idx ? updated : a));
  const deleteArea = (idx) => { setAreas(prev => prev.filter((_,i) => i!==idx)); setSelIdx(null); };
  const moveArea   = (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= areas.length) return;
    setAreas(prev => { const a=[...prev]; [a[idx],a[next]]=[a[next],a[idx]]; return a; });
    setSelIdx(next);
  };
  const addArea = () => {
    const a = { id:'area_'+Date.now(), labelEn:'New Area', label:'', descEn:'', desc:'',
      lat: roundCoord(cityLat), lng: roundCoord(cityLng), radius:1000, size:'medium', safety:'safe' };
    setAreas(prev => [...prev, a]);
    setSelIdx(areas.length);
  };

  // Full-screen layout using position:fixed -- guarantees Leaflet gets real pixel dimensions
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, display:'flex',
      flexDirection:'column', zIndex:100, background:'white' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 16px', borderBottom:'1px solid #e2e8f0', background:'white', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack}
            style={{ color:'#94a3b8', fontSize:13, background:'none', border:'none', cursor:'pointer' }}>
            Back
          </button>
          <span style={{ fontWeight:'bold', color:'#1e293b', fontSize:15 }}>{title}</span>
          <span style={{ color:'#94a3b8', fontSize:13 }}>-- {areas.length} areas</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {extraButton}
          <button onClick={addArea}
            style={{ padding:'6px 12px', fontSize:12, background:'#f1f5f9', border:'none',
              borderRadius:8, cursor:'pointer', fontWeight:600, color:'#475569' }}>+ Add Area</button>
          <button onClick={onSave} disabled={saving || !areas.length}
            style={{ padding:'6px 16px', fontSize:13, background:'#10b981', color:'white',
              border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold',
              opacity: (saving||!areas.length) ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save City'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Area list */}
        <div style={{ width:176, flexShrink:0, borderRight:'1px solid #e2e8f0',
          overflowY:'auto', background:'#f8fafc' }}>
          {areas.map((area, i) => (
            <div key={i} onClick={() => setSelIdx(i)}
              style={{ padding:'10px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer',
                background: selIdx===i ? 'white' : 'transparent',
                borderLeft: selIdx===i ? '4px solid #6366f1' : '4px solid transparent' }}>
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
          ))}
        </div>

        {/* Map -- takes remaining space, AreaMap fills it via height:100% */}
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
          <AreaMap areas={areas} selectedIdx={selIdx} cityLat={cityLat} cityLng={cityLng}
            allCityRadius={allCityRadius} onSelect={setSelIdx} />
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
    </div>
  );
};

// ─── Add City Flow ────────────────────────────────────────────────────────────
const AddCityFlow = ({ showToast, onDone }) => {
  const [step, setStep]           = useState('search');
  const [query, setQuery]         = useState('');
  const [searching, setSearching] = useState(false);
  const [foundCity, setFoundCity] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [areas, setAreas]         = useState([]);
  const [selIdx, setSelIdx]       = useState(null);
  const [cityIcon, setCityIcon]   = useState('');
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
        setFoundCity({ name:p.displayName?.text||query, address:p.formattedAddress||'',
          lat:p.location.latitude, lng:p.location.longitude, viewport:p.viewport });
      } else { showToast('City not found -- try a different spelling', 'error'); }
    } catch(e) { showToast('Search failed: '+e.message, 'error'); }
    setSearching(false);
  };

  const generateAreas = async () => {
    if (!foundCity) return;
    setGenerating(true);
    const { lat, lng, viewport } = foundCity;
    const s = viewport?.low?.latitude  ?? lat-0.18, w = viewport?.low?.longitude  ?? lng-0.18;
    const n = viewport?.high?.latitude ?? lat+0.18, e = viewport?.high?.longitude ?? lng+0.18;
    const maxR = Math.max(viewport ? distM(s,w,n,e)/2 : 20000, 12000);

    const q = '[out:json][timeout:30];\n(\n' +
      '  relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"]('+s+','+w+','+n+','+e+');\n' +
      '  node["place"~"^(neighbourhood|suburb|quarter|borough|district)$"]["name"]('+s+','+w+','+n+','+e+');\n' +
      '  way["place"~"^(neighbourhood|suburb|quarter|borough|district)$"]["name"]('+s+','+w+','+n+','+e+');\n' +
      ');\nout center tags bb;';

    try {
      const resp = await fetch(OVERPASS_URL, {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'data='+encodeURIComponent(q)
      });
      const data = await resp.json();
      let processed = processOverpassAreas(data.elements||[], lat, lng, maxR);
      if (processed.length < 4) {
        showToast('Limited OSM data -- using compass layout as base', 'warning');
        processed = generateCompassAreas(lat, lng);
      }
      const builtAreas = processed.map(buildArea);
      setAreas(builtAreas);
      setAllCityRadius(recalcRadius(lat, lng, builtAreas));
      setSelIdx(null);
      setStep('review');
    } catch(e) { showToast('Area generation failed: '+e.message, 'error'); }
    setGenerating(false);
  };

  const saveCity = async () => {
    if (!foundCity || !areas.length) return;
    setSaving(true);
    try {
      const cityId = toId(foundCity.name);
      await Promise.all([
        db.ref('cities/'+cityId+'/config').set({
          center:{ lat:roundCoord(foundCity.lat), lng:roundCoord(foundCity.lng) },
          allCityRadius, distanceMultiplier:1.05, dayStartHour:7, nightStartHour:18,
          areas, interestToGooglePlaces:{}, textSearchInterests:{graffiti:'street art'},
          interestTooltips:{}, systemRoutes:[]
        }),
        db.ref('settings/cityRegistry/'+cityId).set({
          id:cityId, name:foundCity.name, nameEn:foundCity.name,
          country:(foundCity.address.split(',').pop()||'').trim(),
          icon:cityIcon||'🏙️', active:false, order:99
        })
      ]);
      showToast(foundCity.name+' saved (inactive)', 'success');
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

            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>City icon (emoji)</div>
              <input value={cityIcon} onChange={e=>setCityIcon(e.target.value)} maxLength={4}
                placeholder="🏙️"
                style={{ width:60, padding:'6px', border:'1px solid #e2e8f0', borderRadius:8,
                  fontSize:20, textAlign:'center', fontFamily:'inherit' }} />
            </div>

            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={()=>setFoundCity(null)}
                style={{ flex:1, padding:'8px', border:'1px solid #e2e8f0', borderRadius:10,
                  fontSize:13, background:'white', cursor:'pointer', color:'#475569' }}>Try again</button>
              <button onClick={generateAreas} disabled={generating}
                style={{ flex:1, padding:'8px', background:'#10b981', color:'white', border:'none',
                  borderRadius:10, fontSize:13, fontWeight:'bold', cursor:'pointer',
                  opacity:generating?0.5:1 }}>
                {generating ? 'Generating...' : 'Correct -- Generate Areas'}
              </button>
            </div>
          </div>
        )}
        {generating && (
          <div style={{ textAlign:'center', padding:24, color:'#94a3b8', fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🗺️</div>
            Fetching areas from OpenStreetMap...
          </div>
        )}
      </div>
    </div>
  );

  if (step === 'review') return (
    <ReviewLayout
      title={(cityIcon||'🏙️') + ' ' + (foundCity?.name||'')}
      areas={areas} setAreas={a => { setAreas(a); setAllCityRadius(recalcRadius(foundCity.lat, foundCity.lng, a)); }}
      selIdx={selIdx} setSelIdx={setSelIdx}
      cityLat={foundCity?.lat} cityLng={foundCity?.lng}
      allCityRadius={allCityRadius}
      onBack={() => setStep('search')}
      onSave={saveCity} saving={saving}
    />
  );
  return null;
};

// ─── City Editor ──────────────────────────────────────────────────────────────
const CityEditor = ({ cityKey, regEntry, showToast, onDone }) => {
  const [areas, setAreas]       = useState([]);
  const [selIdx, setSelIdx]     = useState(null);
  const [config, setConfig]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    db.ref('cities/'+regEntry.id+'/config').once('value').then(snap => {
      const cfg = snap.val();
      if (cfg) {
        setConfig(cfg);
        const raw = cfg.areas
          ? (Array.isArray(cfg.areas) ? cfg.areas : Object.values(cfg.areas))
          : [];
        setAreas(raw.map(buildArea));
      }
    }).finally(() => setLoading(false));
  }, []);

  const allCityRadius = config?.allCityRadius || 15000;
  const cityLat = config?.center?.lat || regEntry.lat || 30;
  const cityLng = config?.center?.lng || regEntry.lng || 20;

  const saveCity = async () => {
    if (!areas.length) return;
    setSaving(true);
    try {
      const acr = Math.round(Math.max(...areas.map(a => distM(cityLat,cityLng,a.lat,a.lng)+a.radius)));
      await db.ref('cities/'+regEntry.id+'/config').update({ areas, allCityRadius: acr });
      showToast(regEntry.nameEn+' saved', 'success');
      onDone();
    } catch(e) { showToast('Save failed: '+e.message, 'error'); }
    setSaving(false);
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94a3b8' }}>
      Loading {regEntry.nameEn}...
    </div>
  );

  return (
    <ReviewLayout
      title={(regEntry.icon||'🏙️') + ' ' + regEntry.nameEn}
      areas={areas} setAreas={setAreas}
      selIdx={selIdx} setSelIdx={setSelIdx}
      cityLat={cityLat} cityLng={cityLng}
      allCityRadius={allCityRadius}
      onBack={onDone}
      onSave={saveCity} saving={saving}
    />
  );
};

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

  const sorted = Object.entries(cities).sort((a,b) => (a[1].order||0)-(b[1].order||0));

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
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:600, flexShrink:0,
                background: city.active ? '#dcfce7' : '#f1f5f9',
                color: city.active ? '#16a34a' : '#64748b' }}>
                {city.active ? 'Active' : 'Inactive'}
              </span>
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
  const [view, setView]               = useState('cities');
  const [editingCity, setEditingCity] = useState(null); // { key, entry }
  const [toast, setToast]             = useState(null);

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
      {(view === 'cities') && (
        <>
          <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'14px 24px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:22 }}>🏗️</span>
              <div>
                <div style={{ fontWeight:'bold', color:'#1e293b', fontSize:16, lineHeight:1.2 }}>FouFou Build</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>City management · v{VERSION}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:12, color:'#64748b' }}>{user.displayName||user.email}</div>
              <button onClick={signOut}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid #e2e8f0',
                  color:'#64748b', background:'white', cursor:'pointer' }}>Sign out</button>
            </div>
          </div>
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
