"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Line, LineChart,
} from "recharts";

interface Row { building: string; roomType: string; gender: string; bedSpaces: number; }
interface Snapshot { timestamp: string; rows: Row[]; }
interface HousingData { snapshots: Snapshot[]; lastUpdated: string | null; }
interface GroupedRow {
  key: string; building: string; roomType: string;
  totalBeds: number; byGender: Record<string, number>;
  change: number | null;
}

const GC: Record<string, string> = {
  Female: "#e06080", Male: "#5090e0", "Gender Inclusive": "#a080e0", "Non-Binary": "#d0a050", total: "#999",
};

// Fix #5: enforce gender display order
const GENDER_ORDER = ["Female", "Male", "Gender Inclusive", "Non-Binary"];
function sortGenders(genders: string[]): string[] {
  return genders.sort((a, b) => {
    const ai = GENDER_ORDER.indexOf(a);
    const bi = GENDER_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Fix #1: proportional color — takes current and initial for the *filtered* view
const bedColor = (current: number, initial: number) => {
  if (current === 0) return "#e05050";
  if (initial <= 0) return "#60b060";
  const pct = current / initial;
  if (pct > 0.75) return "#40c070";
  if (pct > 0.5) return "#60b060";
  if (pct > 0.25) return "#b0a040";
  if (pct > 0.1) return "#d08040";
  return "#e05050";
};

const changeColor = (n: number | null) => {
  if (n === null) return "#444";
  if (n === 0) return "#555";
  if (n < 0) return "#e06060";
  return "#50b050";
};

// Fix #6: date format M/D H:MM instead of day-of-week
const fmt = (ts: string) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* ── Pill ── */

function Pill({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} className={`pill ${active ? "on" : ""}`} style={active && color ? {
      background: `${color}20`, borderColor: color, color: color,
    } : undefined}>{label}</button>
  );
}

/* ── Trend Modal ── */

function TrendModal({ snapshots, rowKey, onClose }: { snapshots: Snapshot[]; rowKey: string; onClose: () => void }) {
  const [gf, setGf] = useState("All");
  const { building, roomType } = JSON.parse(rowKey);

  const genders = useMemo(() => {
    const set = new Set<string>();
    for (const sn of snapshots) for (const r of sn.rows)
      if (r.building === building && r.roomType === roomType) set.add(r.gender);
    return sortGenders([...set]);
  }, [snapshots, building, roomType]);

  const chartData = useMemo(() => {
    return snapshots.map((sn) => {
      const rel = sn.rows.filter((r) => r.building === building && r.roomType === roomType);
      const pt: Record<string, any> = { timestamp: sn.timestamp, total: 0 };
      for (const r of rel) {
        if (gf === "All" || r.gender === gf) { pt.total += r.bedSpaces; pt[r.gender] = (pt[r.gender] || 0) + r.bedSpaces; }
      }
      return pt;
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [snapshots, building, roomType, gf]);

  const st = chartData[0]?.total || 0;
  const en = chartData[chartData.length - 1]?.total || 0;
  const pct = st > 0 ? Math.round(((st - en) / st) * 100) : 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <div>
            <h2>{building}</h2>
            <p>{roomType}</p>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>

        <div className="stat-row">
          {[
            { n: String(st), l: "start", c: "#bbb" },
            { n: String(en), l: "current", c: bedColor(en, st) },
            { n: `${pct}%`, l: "filled", c: pct > 80 ? "#e05050" : pct > 50 ? "#d08040" : "#60b060" },
          ].map((s, i) => (
            <div key={i} className="stat">
              <div className="stat-n" style={{ color: s.c }}>{s.n}</div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {chartData.length <= 1 && (
          <p className="notice">Upload multiple snapshots over time to see the trend chart.</p>
        )}

        <div className="pill-row" style={{ marginBottom: 14 }}>
          <Pill label="All" active={gf === "All"} onClick={() => setGf("All")} />
          {genders.map((g) => <Pill key={g} label={g} active={gf === g} onClick={() => setGf(g)} color={gf === g ? GC[g] : undefined} />)}
        </div>

        <div style={{ width: "100%", height: 250 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
              <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fontSize: 11, fill: "#444" }} axisLine={{ stroke: "#252525" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "#444" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #333", background: "#1a1a1a", color: "#ccc" }} labelStyle={{ color: "#555" }} labelFormatter={fmt} />
              {gf === "All"
                ? genders.map((g) => <Line key={g} type="monotone" dataKey={g} stroke={GC[g] || "#888"} strokeWidth={1.5} dot={false} name={g} />)
                : <Line type="monotone" dataKey="total" stroke={GC[gf] || "#999"} strokeWidth={2} dot={false} name={gf} />}
              <Legend wrapperStyle={{ fontSize: 12, color: "#666" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ── Admin Upload Modal ── */

function AdminModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleUpload = async () => {
    if (!password || !file) return;
    setStatus("uploading");
    setMessage("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "x-admin-password": password }, body: fd });
      const data = await res.json();
      if (!res.ok) { setStatus("error"); setMessage(data.error || "Failed."); return; }
      setStatus("success");
      setMessage(`${data.rowsImported} rows imported.`);
      setTimeout(() => { onSuccess(); onClose(); }, 1000);
    } catch (err: any) { setStatus("error"); setMessage(err.message); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h2>Upload CSV</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <label className="label">Password</label>
        <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" />
        <label className="label" style={{ marginTop: 12 }}>File</label>
        <button className="file-pick" onClick={() => document.getElementById("admin-file")?.click()}>
          {file ? file.name : "Choose .csv file…"}
        </button>
        <input id="admin-file" type="file" accept=".csv,.tsv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
        {message && <p className={status === "error" ? "err" : "ok"}>{message}</p>}
        <div className="btn-pair">
          <button className="btn sec" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={!password || !file || status === "uploading"} onClick={handleUpload}>
            {status === "uploading" ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function Home() {
  const [data, setData] = useState<HousingData>({ snapshots: [], lastUpdated: null });
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState("All");
  const [building, setBuilding] = useState("All");
  const [roomType, setRoomType] = useState("All");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sortF, setSortF] = useState<"building" | "roomType" | "bedSpaces" | "change">("bedSpaces");
  const [sortD, setSortD] = useState<"asc" | "desc">("desc");
  const [admin, setAdmin] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/data"); setData(await r.json()); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const latest = useMemo(() => data.snapshots.length ? data.snapshots[data.snapshots.length - 1].rows : [], [data]);
  const prev = useMemo(() => data.snapshots.length > 1 ? data.snapshots[data.snapshots.length - 2].rows : null, [data]);

  // Fix #1: compute initial totals respecting current gender filter
  const initialTotals = useMemo(() => {
    if (data.snapshots.length === 0) return {} as Record<string, number>;
    const first = data.snapshots[0].rows;
    const totals: Record<string, number> = {};
    for (const r of first) {
      // Apply the same gender filter as the main table
      if (gender !== "All" && r.gender !== gender) continue;
      const k = JSON.stringify({ building: r.building, roomType: r.roomType });
      totals[k] = (totals[k] || 0) + r.bedSpaces;
    }
    return totals;
  }, [data, gender]);

  // Fix #5: sorted genders
  const genders = useMemo(() => ["All", ...sortGenders([...new Set(latest.map((r) => r.gender))])], [latest]);
  const buildings = useMemo(() => ["All", ...new Set(latest.map((r) => r.building))], [latest]);
  const roomTypes = useMemo(() => ["All", ...new Set(latest.map((r) => r.roomType))], [latest]);

  // Fix #7: compute previous snapshot totals for change column
  const prevTotals = useMemo(() => {
    if (!prev) return null;
    let f = prev;
    if (gender !== "All") f = f.filter((r) => r.gender === gender);
    if (building !== "All") f = f.filter((r) => r.building === building);
    if (roomType !== "All") f = f.filter((r) => r.roomType === roomType);
    if (q) { const lq = q.toLowerCase(); f = f.filter((r) => r.building.toLowerCase().includes(lq) || r.roomType.toLowerCase().includes(lq)); }
    const g: Record<string, number> = {};
    for (const r of f) {
      const k = JSON.stringify({ building: r.building, roomType: r.roomType });
      g[k] = (g[k] || 0) + r.bedSpaces;
    }
    return g;
  }, [prev, gender, building, roomType, q]);

  const table = useMemo(() => {
    let f = latest;
    if (gender !== "All") f = f.filter((r) => r.gender === gender);
    if (building !== "All") f = f.filter((r) => r.building === building);
    if (roomType !== "All") f = f.filter((r) => r.roomType === roomType);
    if (q) { const lq = q.toLowerCase(); f = f.filter((r) => r.building.toLowerCase().includes(lq) || r.roomType.toLowerCase().includes(lq)); }
    const g: Record<string, GroupedRow> = {};
    for (const r of f) {
      const k = JSON.stringify({ building: r.building, roomType: r.roomType });
      if (!g[k]) g[k] = { key: k, building: r.building, roomType: r.roomType, totalBeds: 0, byGender: {}, change: null };
      g[k].totalBeds += r.bedSpaces;
      g[k].byGender[r.gender] = (g[k].byGender[r.gender] || 0) + r.bedSpaces;
    }
    // Compute change from previous snapshot
    for (const row of Object.values(g)) {
      if (prevTotals && row.key in prevTotals) {
        row.change = row.totalBeds - prevTotals[row.key];
      }
    }
    const arr = Object.values(g);
    arr.sort((a, b) => {
      if (sortF === "bedSpaces") return sortD === "asc" ? a.totalBeds - b.totalBeds : b.totalBeds - a.totalBeds;
      if (sortF === "change") {
        const ac = a.change ?? 0;
        const bc = b.change ?? 0;
        return sortD === "asc" ? ac - bc : bc - ac;
      }
      const x = sortF === "building" ? a.building : a.roomType;
      const y = sortF === "building" ? b.building : b.roomType;
      return sortD === "asc" ? x.localeCompare(y) : y.localeCompare(x);
    });
    return arr;
  }, [latest, gender, building, roomType, q, sortF, sortD, prevTotals]);

  const doSort = (f: "building" | "roomType" | "bedSpaces" | "change") => {
    if (sortF === f) setSortD((d) => d === "asc" ? "desc" : "asc");
    else { setSortF(f); setSortD(f === "bedSpaces" || f === "change" ? "desc" : "asc"); }
  };
  const si = (f: string) => sortF === f ? (sortD === "asc" ? " ↑" : " ↓") : "";
  const totalBeds = table.reduce((a, r) => a + r.totalBeds, 0);

  if (loading) return <div className="center muted" style={{ padding: 80 }}>Loading…</div>;

  return (
    <div className="page">
      {/* Header */}
      <header className="header">
        <div className="header-glow" />
        <div className="header-inner">
          <div>
            <h1>UCLA RSU Availability</h1>
            <p className="sub">Room Sign Up · March 2–6, 2026</p>
          </div>
          <div className="header-actions">
            <button className="btn sec sm" onClick={() => setAdmin(true)}>Upload CSV</button>
            <a href="https://ucla.app.box.com/s/0lsmybss0m99921jly29lqvgshyr74sb" target="_blank" rel="noopener noreferrer" className="link">Source ↗</a>
          </div>
        </div>
      </header>

      <main className="main">
        {!latest.length ? (
          <div className="empty-state">
            <h2>No data yet</h2>
            <p>Download the CSV from the{" "}
              <a href="https://ucla.app.box.com/s/0lsmybss0m99921jly29lqvgshyr74sb" target="_blank" rel="noopener noreferrer">UCLA Housing spreadsheet</a>
              , then upload it here. Upload new snapshots hourly during RSU to track fill rates.
            </p>
            <button className="btn pri" style={{ marginTop: 16 }} onClick={() => setAdmin(true)}>Upload first snapshot</button>
          </div>
        ) : (
          <>
            {/* Meta bar */}
            <div className="meta-bar">
              <span><strong>{totalBeds.toLocaleString()}</strong> beds</span>
              <span className="dot">·</span>
              <span>{new Set(table.map((r) => r.building)).size} buildings</span>
              <span className="dot">·</span>
              <span>{data.snapshots.length} snapshot{data.snapshots.length !== 1 ? "s" : ""}</span>
              {data.lastUpdated && <>
                <span className="dot">·</span>
                <span style={{ color: "#444" }}>Updated {new Date(data.lastUpdated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </>}
            </div>

            {/* Filters */}
            <div className="filters">
              <input type="text" className="search" placeholder="Search buildings or room types…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="fg">
                <span className="fl">Gender</span>
                <div className="pill-row">
                  {(genders as string[]).map((o) => (
                    <Pill key={o} label={o} active={gender === o} onClick={() => setGender(o)}
                      color={gender === o && o !== "All" ? GC[o] : undefined} />
                  ))}
                </div>
              </div>
              <div className="fg">
                <span className="fl">Building</span>
                <div className="pill-row pill-wrap-desktop pill-scroll-mobile">
                  {(buildings as string[]).map((o) => (
                    <Pill key={o} label={o} active={building === o} onClick={() => setBuilding(o)} />
                  ))}
                </div>
              </div>
              <div className="fg">
                <span className="fl">Room type</span>
                <div className="pill-row pill-scroll-mobile">
                  {(roomTypes as string[]).map((o) => (
                    <Pill key={o} label={o} active={roomType === o} onClick={() => setRoomType(o)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="tbl-wrap">
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      {([["building","Building","left"],["roomType","Room type","left"],["bedSpaces","Beds","right"],["change","Change","right"]] as const).map(([k,l,a]) => (
                        <th key={k} className={`sortable ${sortF === k ? "active" : ""} ${a === "right" ? "r" : ""}`} onClick={() => doSort(k as any)}>
                          {l}{si(k)}
                        </th>
                      ))}
                      <th className="r">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.length === 0
                      ? <tr><td colSpan={5} className="empty-cell">No results.</td></tr>
                      : table.map((row, i) => (
                        <tr key={row.key} className="drow fade-row" onClick={() => setSelected(row.key)}
                          style={{ animationDelay: `${Math.min(i * 15, 300)}ms` }}>
                          <td className="bold">{row.building}</td>
                          <td className="muted">{row.roomType}</td>
                          <td className="r mono" style={{ fontWeight: 600, color: bedColor(row.totalBeds, initialTotals[row.key] ?? row.totalBeds) }}>{row.totalBeds}</td>
                          <td className="r mono" style={{ color: changeColor(row.change), fontSize: 12 }}>
                            {row.change === null ? "—" : row.change === 0 ? "0" : (row.change > 0 ? "+" : "") + row.change}
                          </td>
                          <td className="r">
                            <span className="breakdown">
                              {Object.entries(row.byGender)
                                .sort(([a], [b]) => {
                                  const ai = GENDER_ORDER.indexOf(a);
                                  const bi = GENDER_ORDER.indexOf(b);
                                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                                })
                                .map(([g, c]) => (
                                  <span key={g} className="gtag" title={g} style={{ color: GC[g] || "#555" }}>{g.charAt(0)}:{c}</span>
                                ))}
                            </span>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              <div className="tbl-foot">
                <span>{table.length} rows</span>
                <span>Click a row for trend</span>
              </div>
            </div>
          </>
        )}
      </main>

      {selected && <TrendModal snapshots={data.snapshots} rowKey={selected} onClose={() => setSelected(null)} />}
      {admin && <AdminModal onClose={() => setAdmin(false)} onSuccess={load} />}
    </div>
  );
}
