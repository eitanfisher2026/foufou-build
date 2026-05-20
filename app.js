// FouFou Build — City management tool
// Copyright © 2026 Eitan Fisher. All Rights Reserved.

const { useState, useEffect } = React;

// ── Firebase (same project as foufou-dev) ────────────────────────────────────
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

// ── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  const bg = { success: '#16a34a', error: '#dc2626', info: '#2563eb', warning: '#d97706' };
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: bg[type] || '#1e293b', color: 'white',
      padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 'bold',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 9999, whiteSpace: 'nowrap'
    }}>{msg}</div>
  );
};

// ── Main App ─────────────────────────────────────────────────────────────────
const FouFouBuild = () => {
  const [authLoading, setAuthLoading]   = useState(true);
  const [user, setUser]                 = useState(null);
  const [userRole, setUserRole]         = useState(0);
  const [cities, setCities]             = useState({});
  const [cityConfigs, setCityConfigs]   = useState({}); // cities/*/config area counts
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [toast, setToast]               = useState(null);

  const showToast = (msg, type = 'info') => setToast({ msg, type, key: Date.now() });

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    auth.getRedirectResult().catch(() => {});
    return auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u && !u.isAnonymous) {
        try {
          const snap = await db.ref(`users/${u.uid}/role`).once('value');
          setUserRole(snap.val() || 0);
        } catch { setUserRole(0); }
      } else {
        setUserRole(0);
      }
      setAuthLoading(false);
    });
  }, []);

  // ── Load city registry + area counts ───────────────────────────────────
  useEffect(() => {
    if (!user || userRole < 2) return;
    setCitiesLoading(true);
    db.ref('settings/cityRegistry').once('value')
      .then(snap => {
        const reg = snap.val() || {};
        setCities(reg);
        // Load area counts from each city's config
        const ids = Object.values(reg).map(c => c.id);
        return Promise.all(ids.map(id =>
          db.ref(`cities/${id}/config/areas`).once('value').then(s => ({ id, areas: s.val() }))
        ));
      })
      .then(results => {
        const counts = {};
        results.forEach(({ id, areas }) => {
          counts[id] = areas ? (Array.isArray(areas) ? areas.length : Object.keys(areas).length) : null;
        });
        setCityConfigs(counts);
      })
      .catch(() => showToast('Failed to load cities', 'error'))
      .finally(() => setCitiesLoading(false));
  }, [user, userRole]);

  const signIn = () =>
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(e => showToast(e.message, 'error'));

  const signOut = () => auth.signOut();

  // ── Loading ─────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div className="flex items-center justify-center h-screen flex-col gap-3 text-slate-500">
      <div className="text-5xl">🏗️</div>
      <div className="font-bold text-xl text-slate-700">FouFou Build</div>
      <div className="text-sm">Checking auth...</div>
    </div>
  );

  // ── Not signed in ────────────────────────────────────────────────────────
  if (!user) return (
    <div className="flex items-center justify-center h-screen flex-col gap-6">
      <div className="text-6xl">🏗️</div>
      <div className="text-3xl font-bold text-slate-800">FouFou Build</div>
      <div className="text-slate-400 text-sm">City management tool · Admin only</div>
      <button onClick={signIn}
        className="mt-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg text-sm">
        Sign in with Google
      </button>
    </div>
  );

  // ── Not admin ────────────────────────────────────────────────────────────
  if (userRole < 2) return (
    <div className="flex items-center justify-center h-screen flex-col gap-4 text-slate-500">
      <div className="text-5xl">🔒</div>
      <div className="font-bold text-xl text-slate-700">Admin access required</div>
      <div className="text-sm text-slate-400">{user.email}</div>
      <button onClick={signOut}
        className="text-xs text-slate-400 underline hover:text-slate-600">Sign out</button>
    </div>
  );

  // ── City list ────────────────────────────────────────────────────────────
  const sortedCities = Object.entries(cities)
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
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
          <button onClick={signOut}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-700">
            Cities <span className="text-slate-400 font-normal">({sortedCities.length})</span>
          </h2>
          <button
            onClick={() => showToast('City creator — coming soon', 'info')}
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 shadow-sm">
            + New City
          </button>
        </div>

        {citiesLoading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading cities...</div>
        ) : sortedCities.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No cities found. Run 🌱 Seed Firebase in foufou-dev first.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedCities.map(([key, city]) => {
              const areaCount = cityConfigs[city.id];
              const seeded = areaCount !== null && areaCount !== undefined;
              return (
                <div key={key}
                  className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4 hover:border-slate-300 transition-colors">
                  <span className="text-3xl flex-shrink-0">
                    {city.icon?.startsWith?.('data:') ? '🏙️' : (city.icon || '🏙️')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm">{city.nameEn}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {city.name} · {city.country}
                      {seeded
                        ? <span className="ml-2 text-slate-500">· {areaCount} areas</span>
                        : <span className="ml-2 text-amber-500">· not seeded</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                    city.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {city.active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => showToast('City editor — coming soon', 'info')}
                    className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold">
                    Edit →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<FouFouBuild />);
