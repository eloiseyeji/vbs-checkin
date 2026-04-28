'use client'
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { printAttendance } from "../lib/print";

const GROUPS = ["Sunshine Squad ☀️", "Star Seekers ⭐", "Wave Riders 🌊", "Rainbow Crew 🌈", "Thunder Bolts ⚡"];
const SYNC_INTERVAL = 12000;

const fmt = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const fmtDate = () => new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const statusColor = (s) => ({ "not-arrived": "#94a3b8", "checked-in": "#22c55e", "checked-out": "#f97316" }[s] || "#94a3b8");
const statusLabel = (s) => ({ "not-arrived": "Not Arrived", "checked-in": "Checked In", "checked-out": "Checked Out" }[s] || s);

const AVATAR_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#14b8a6"];
const avatarColor = (name) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const fromDB = (r) => ({
  id: r.id, name: r.name, group: r.group_name, guardian: r.guardian,
  phone: r.phone, notes: r.notes, status: r.status,
  checkInTime: r.check_in_time, checkOutTime: r.check_out_time,
  checkInBy: r.check_in_by, checkOutBy: r.check_out_by,
});

const toDB = (c) => ({
  id: c.id, name: c.name, group_name: c.group,
  guardian: c.guardian || "", phone: c.phone || "", notes: c.notes || "",
  status: c.status, check_in_time: c.checkInTime || null,
  check_out_time: c.checkOutTime || null, check_in_by: c.checkInBy || null, check_out_by: c.checkOutBy || null,
});

const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const paths = {
    check: "M20 6L9 17l-5-5",
    logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1",
    plus: "M12 4v16m8-8H4",
    search: "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
    refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
    x: "M18 6L6 18M6 6l12 12",
    printer: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
};

export default function VBSApp() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("dashboard");
  const [teacherName, setTeacherName] = useState("");
  const [teacherSet, setTeacherSet] = useState(false);
  const [filterGroup, setFilterGroup] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [printGroup, setPrintGroup] = useState("All");
  const [form, setForm] = useState({ name: "", group: GROUPS[0], guardian: "", phone: "", notes: "" });
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setSyncing(true);
    try {
      const { data, error } = await supabase.from("children").select("*").order("name");
      if (error) throw error;
      setChildren((data || []).map(fromDB));
      setLastSync(new Date());
    } catch (e) { console.error(e); }
    if (!quiet) setLoading(false); else setSyncing(false);
  }, []);

  useEffect(() => {
    loadData();
    const t = setInterval(() => loadData(true), SYNC_INTERVAL);
    return () => clearInterval(t);
  }, [loadData]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      let count = 0;
      for (const row of rows) {
        const name = row["Child's Full Name"] || row["Name"] || row["name"] || "";
        if (!name.trim()) continue;
        const newChild = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          name: name.trim(),
          group_name: row["Group"] || row["group"] || GROUPS[0],
          guardian: row["Guardian Name"] || row["Guardian"] || "",
          phone: String(row["Guardian Phone"] || row["Phone"] || ""),
          notes: row["Medical / Special Notes"] || row["Notes"] || "",
          status: "not-arrived",
          check_in_time: null, check_out_time: null,
          check_in_by: null, check_out_by: null,
        };
        await supabase.from("children").insert(newChild);
        count++;
      }
      await loadData(true);
      showToast("🎉 Imported " + count + " children!");
    } catch (err) {
      console.error(err);
      showToast("Import failed — check your file format", "error");
    }
    setImporting(false);
    e.target.value = "";
  };

  const checkIn = async (id) => {
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("children").update({
      status: "checked-in", check_in_time: now, check_in_by: teacherName, check_out_time: null, check_out_by: null
    }).eq("id", id);
    if (error) showToast("Error saving", "error");
    else { await loadData(true); showToast("✅ Checked in!"); }
    setSaving(false);
  };

  const checkOut = (id) => {
    const child = children.find(c => c.id === id);
    setConfirm({
      title: "Check out " + child.name + "?",
      sub: child.guardian ? "Guardian: " + child.guardian + "  ·  " + (child.phone || "no phone on file") : "No guardian info on file",
      action: async () => {
        setSaving(true);
        const now = new Date().toISOString();
        const { error } = await supabase.from("children").update({
          status: "checked-out", check_out_time: now, check_out_by: teacherName
        }).eq("id", id);
        if (error) showToast("Error saving", "error");
        else { await loadData(true); showToast("👋 Checked out safely!"); }
        setSaving(false);
        setConfirm(null);
      }
    });
  };

  const resetAll = () => {
    setConfirm({
      title: "Reset ALL attendance?",
      sub: "Clears all check-in/out times. Use this at the start of each new VBS day.",
      danger: true,
      action: async () => {
        setSaving(true);
        await supabase.from("children").update({
          status: "not-arrived", check_in_time: null, check_out_time: null, check_in_by: null, check_out_by: null
        }).neq("id", "");
        await loadData(true);
        showToast("🌅 All attendance reset for new day!");
        setSaving(false);
        setConfirm(null);
      }
    });
  };

  const resetChild = async (id) => {
    setSaving(true);
    await supabase.from("children").update({
      status: "not-arrived", check_in_time: null, check_out_time: null, check_in_by: null, check_out_by: null
    }).eq("id", id);
    await loadData(true);
    showToast("🔄 Attendance reset");
    setSaving(false);
  };

  const deleteChild = (id) => {
    const child = children.find(c => c.id === id);
    setConfirm({
      title: "Remove " + child.name + "?",
      sub: "This will permanently remove them from the roster.",
      danger: true,
      action: async () => {
        await supabase.from("children").delete().eq("id", id);
        await loadData(true);
        showToast("Removed from roster");
        setConfirm(null);
      }
    });
  };

  const submitForm = async () => {
    if (!form.name.trim()) return showToast("Name is required", "error");
    setSaving(true);
    if (editId) {
      await supabase.from("children").update(toDB({ ...children.find(c=>c.id===editId), ...form })).eq("id", editId);
      showToast("✏️ Updated!");
    } else {
      const newChild = { ...form, id: Date.now().toString(), status: "not-arrived", checkInTime: null, checkOutTime: null, checkInBy: null, checkOutBy: null };
      await supabase.from("children").insert(toDB(newChild));
      showToast("🎉 Added to roster!");
    }
    await loadData(true);
    setForm({ name: "", group: GROUPS[0], guardian: "", phone: "", notes: "" });
    setEditId(null);
    setView("roster");
    setSaving(false);
  };

  const openEdit = (child) => {
    setForm({ name: child.name, group: child.group, guardian: child.guardian, phone: child.phone, notes: child.notes });
    setEditId(child.id);
    setView("add");
  };

  const filtered = children.filter(c => {
    if (filterGroup !== "All" && c.group !== filterGroup) return false;
    if (filterStatus !== "All" && c.status !== filterStatus) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.guardian?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: children.length,
    in: children.filter(c => c.status === "checked-in").length,
    out: children.filter(c => c.status === "checked-out").length,
    notArrived: children.filter(c => c.status === "not-arrived").length,
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    input,select,textarea,button{font-family:'Nunito',sans-serif}
    input:focus,select:focus,textarea:focus{outline:none;border-color:#6366f1!important}
    button{cursor:pointer}
    @keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .card:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,0,0,.1)!important}
    .btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
    .nav-btn:hover{background:rgba(99,102,241,.08)!important;color:#6366f1!important}
    .row:hover{background:#fafafa!important}
    .upload-label:hover{filter:brightness(1.07)}
  `;

  if (!teacherSet) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#fef9c3 0%,#ddd6fe 100%)",padding:20,fontFamily:"'Nunito',sans-serif"}}>
      <style>{css}</style>
      <div style={{background:"#fff",borderRadius:28,padding:"52px 44px",boxShadow:"0 24px 64px rgba(0,0,0,.13)",width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:60,marginBottom:12}}>☀️</div>
        <h1 style={{fontFamily:"'Fredoka One',cursive",fontSize:38,color:"#1e293b",marginBottom:4}}>VBS Check-In</h1>
        <p style={{color:"#94a3b8",fontSize:14,marginBottom:36}}>Summer 2026 · Vacation Bible School</p>
        <p style={{textAlign:"left",fontWeight:800,color:"#374151",marginBottom:8,fontSize:13}}>WHO'S CHECKING IN TODAY?</p>
        <input
          style={{width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid #e2e8f0",fontSize:15,marginBottom:18,background:"#f8fafc",color:"#1e293b"}}
          placeholder="Your name (e.g. Ms. Yeji)"
          value={teacherName}
          onChange={e => setTeacherName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && teacherName.trim() && setTeacherSet(true)}
          autoFocus
        />
        <button className="btn"
          style={{width:"100%",background:teacherName.trim()?"linear-gradient(135deg,#6366f1,#8b5cf6)":"#e2e8f0",color:teacherName.trim()?"#fff":"#94a3b8",border:"none",borderRadius:14,padding:"15px",fontWeight:800,fontSize:15,transition:"all .2s"}}
          disabled={!teacherName.trim()} onClick={() => setTeacherSet(true)}>
          Enter App →
        </button>
        <p style={{fontSize:11,color:"#94a3b8",marginTop:20}}>⚡ All teachers share the same live roster — changes sync automatically</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Nunito',sans-serif",background:"#f0f9ff"}}>
      <style>{css}</style>
      <div style={{width:44,height:44,border:"4px solid #e2e8f0",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <p style={{color:"#64748b",marginTop:14,fontWeight:600}}>Loading roster…</p>
    </div>
  );

  return (
    <div style={{fontFamily:"'Nunito',sans-serif",minHeight:"100vh",background:"linear-gradient(150deg,#f0f9ff 0%,#fef9ee 100%)"}}>
      <style>{css}</style>

      <header style={{background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 20px rgba(99,102,241,.3)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:30}}>☀️</span>
          <div>
            <div style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:"#fff",lineHeight:1.1}}>VBS Check-In</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.65)"}}>Summer 2026</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {syncing && <span style={{width:8,height:8,borderRadius:"50%",background:"#fbbf24",animation:"pulse 1s infinite",display:"inline-block"}}/>}
          {lastSync && <span style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>Synced {fmt(lastSync.toISOString())}</span>}
          <button className="btn" onClick={() => loadData(true)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center"}}>
            <Icon name="refresh" size={15} color="#fff"/>
          </button>
          <div style={{background:"rgba(255,255,255,.2)",borderRadius:20,padding:"6px 14px",color:"#fff",fontSize:13,fontWeight:700}}>
            👋 {teacherName}
          </div>
        </div>
      </header>

      <nav style={{background:"#fff",borderBottom:"2px solid #f1f5f9",display:"flex",gap:4,padding:"8px 20px",flexWrap:"wrap"}}>
        {[["dashboard","☀️ Dashboard"],["roster","👥 Full Roster"],["print","🖨️ Print Sheet"],["add", editId ? "✏️ Edit Child" : "➕ Add Child"]].map(([v,label]) => (
          <button key={v} className="nav-btn"
            style={{background:view===v?"#eef2ff":"none",color:view===v?"#6366f1":"#64748b",border:"none",padding:"9px 18px",borderRadius:10,fontWeight:800,fontSize:13,transition:"all .15s"}}
            onClick={() => { setView(v); if(v!=="add"){setEditId(null);setForm({name:"",group:GROUPS[0],guardian:"",phone:"",notes:""});} }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={{padding:"28px 20px",maxWidth:1100,margin:"0 auto"}}>

        {view === "dashboard" && (
          <div style={{animation:"slideUp .3s ease"}}>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
              <button className="btn" onClick={resetAll}
                style={{background:"#fff",border:"2px solid #e2e8f0",borderRadius:12,padding:"10px 18px",fontWeight:800,fontSize:13,color:"#64748b",display:"flex",alignItems:"center",gap:7,transition:"all .15s"}}>
                🌅 Reset All for New Day
              </button>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:28}}>
              {[
                {label:"Total Enrolled",value:stats.total,color:"#6366f1",bg:"#eef2ff",emoji:"📋"},
                {label:"Checked In",value:stats.in,color:"#16a34a",bg:"#dcfce7",emoji:"✅"},
                {label:"Checked Out",value:stats.out,color:"#ea580c",bg:"#ffedd5",emoji:"👋"},
                {label:"Not Arrived",value:stats.notArrived,color:"#0284c7",bg:"#e0f2fe",emoji:"⏳"},
              ].map(s => (
                <div key={s.label} style={{background:s.bg,borderRadius:18,padding:"20px 16px",textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
                  <div style={{fontSize:28,marginBottom:4}}>{s.emoji}</div>
                  <div style={{fontFamily:"'Fredoka One',cursive",fontSize:38,color:s.color,lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:4,fontWeight:700}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{background:"#fff",borderRadius:20,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:"#1e293b",marginBottom:16}}>Quick Check-In / Out</h2>
              <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200,display:"flex",alignItems:"center",gap:8,background:"#f8fafc",borderRadius:12,padding:"10px 14px",border:"2px solid #e2e8f0"}}>
                  <Icon name="search" size={15} color="#94a3b8"/>
                  <input style={{flex:1,border:"none",background:"none",fontSize:14,color:"#334155"}} placeholder="Search child or guardian…" value={search} onChange={e=>setSearch(e.target.value)}/>
                  {search && <button style={{background:"none",border:"none",padding:2,display:"flex",alignItems:"center"}} onClick={()=>setSearch("")}><Icon name="x" size={13} color="#94a3b8"/></button>}
                </div>
                <select style={{padding:"10px 14px",borderRadius:12,border:"2px solid #e2e8f0",background:"#f8fafc",fontSize:13,fontWeight:700,color:"#475569"}} value={filterGroup} onChange={e=>setFilterGroup(e.target.value)}>
                  <option value="All">All Groups</option>
                  {GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                {filtered.map(child => (
                  <div key={child.id} className="card" style={{background:"#f8fafc",borderRadius:16,padding:16,border:"2px solid #e2e8f0",boxShadow:"0 2px 8px rgba(0,0,0,.04)",transition:"all .2s"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
                      <div style={{width:44,height:44,borderRadius:12,background:avatarColor(child.name),display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:16,flexShrink:0}}>
                        {child.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>{child.name}</div>
                        <div style={{fontSize:12,color:"#64748b",marginTop:1}}>{child.group}</div>
                        {child.notes && <div style={{fontSize:11,color:"#f97316",marginTop:3,fontWeight:700}}>⚠️ {child.notes}</div>}
                      </div>
                      <span style={{background:statusColor(child.status)+"22",color:statusColor(child.status),border:"1px solid "+statusColor(child.status)+"44",borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                        {statusLabel(child.status)}
                      </span>
                    </div>
                    {(child.checkInTime || child.checkOutTime) && (
                      <div style={{fontSize:11,color:"#64748b",background:"#fff",borderRadius:8,padding:"6px 10px",marginBottom:10,lineHeight:1.8}}>
                        {child.checkInTime && <div>✅ In: {fmt(child.checkInTime)} · {child.checkInBy}</div>}
                        {child.checkOutTime && <div>👋 Out: {fmt(child.checkOutTime)} · {child.checkOutBy}</div>}
                      </div>
                    )}
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {child.status === "not-arrived" && (
                        <button className="btn" style={{flex:1,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:6,justifyContent:"center",transition:"all .15s"}} onClick={()=>checkIn(child.id)}>
                          <Icon name="check" size={14} color="#fff"/> Check In
                        </button>
                      )}
                      {child.status === "checked-in" && (
                        <button className="btn" style={{flex:1,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:6,justifyContent:"center",transition:"all .15s"}} onClick={()=>checkOut(child.id)}>
                          <Icon name="logout" size={14} color="#fff"/> Check Out
                        </button>
                      )}
                      {child.status === "checked-out" && (
                        <button className="btn" style={{flex:1,background:"#f1f5f9",color:"#475569",border:"2px solid #e2e8f0",borderRadius:10,padding:"9px 14px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:6,justifyContent:"center",transition:"all .15s"}} onClick={()=>checkIn(child.id)}>
                          <Icon name="check" size={14} color="#475569"/> Re-Check In
                        </button>
                      )}
                      <button onClick={()=>resetChild(child.id)} title="Reset" style={{background:"#f1f5f9",border:"2px solid #e2e8f0",borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center",cursor:"pointer"}}>
                        <Icon name="refresh" size={14} color="#94a3b8"/>
                      </button>
                      <button onClick={()=>openEdit(child)} title="Edit" style={{background:"#f1f5f9",border:"2px solid #e2e8f0",borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center",cursor:"pointer"}}>
                        <Icon name="edit" size={14} color="#6366f1"/>
                      </button>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{gridColumn:"1/-1",textAlign:"center",padding:52,color:"#94a3b8",fontWeight:700}}>
                    <div style={{fontSize:40,marginBottom:8}}>🔍</div>
                    <p>{children.length === 0 ? "No children yet — add some from the roster tab!" : "No children match your search"}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === "roster" && (
          <div style={{animation:"slideUp .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:"#1e293b"}}>Full Roster ({children.length} children)</h2>
              <div style={{display:"flex",gap:8}}>
                <button className="btn" style={{background:"#f0fdf4",color:"#16a34a",border:"2px solid #bbf7d0",borderRadius:12,padding:"10px 16px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:7,transition:"all .15s"}} onClick={()=>setView("print")}>
                  <Icon name="printer" size={15} color="#16a34a"/> Print Sheet
                </button>
                <button className="btn" style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"10px 18px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:7,transition:"all .15s"}} onClick={()=>setView("add")}>
                  <Icon name="plus" size={15} color="#fff"/> Add Child
                </button>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200,display:"flex",alignItems:"center",gap:8,background:"#fff",borderRadius:12,padding:"10px 14px",border:"2px solid #e2e8f0"}}>
                <Icon name="search" size={15} color="#94a3b8"/>
                <input style={{flex:1,border:"none",background:"none",fontSize:14,color:"#334155"}} placeholder="Search roster…" value={search} onChange={e=>setSearch(e.target.value)}/>
                {search && <button style={{background:"none",border:"none",padding:2,display:"flex"}} onClick={()=>setSearch("")}><Icon name="x" size={13} color="#94a3b8"/></button>}
              </div>
              <select style={{padding:"10px 14px",borderRadius:12,border:"2px solid #e2e8f0",background:"#fff",fontSize:13,fontWeight:700,color:"#475569"}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="not-arrived">Not Arrived</option>
                <option value="checked-in">Checked In</option>
                <option value="checked-out">Checked Out</option>
              </select>
              <select style={{padding:"10px 14px",borderRadius:12,border:"2px solid #e2e8f0",background:"#fff",fontSize:13,fontWeight:700,color:"#475569"}} value={filterGroup} onChange={e=>setFilterGroup(e.target.value)}>
                <option value="All">All Groups</option>
                {GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
              <div style={{display:"flex",padding:"12px 20px",background:"#f8fafc",fontSize:11,fontWeight:900,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".06em",borderBottom:"2px solid #f1f5f9"}}>
                <span style={{flex:2}}>Name</span><span style={{flex:1.5}}>Group</span><span style={{flex:1.5}}>Guardian</span><span style={{flex:1}}>Status</span><span style={{flex:1.5}}>Times</span><span style={{flex:1,textAlign:"right"}}>Actions</span>
              </div>
              {filtered.map((child,i) => (
                <div key={child.id} className="row" style={{display:"flex",padding:"14px 20px",alignItems:"center",borderBottom:i<filtered.length-1?"1px solid #f1f5f9":"none",transition:"background .15s"}}>
                  <div style={{flex:2}}>
                    <div style={{fontWeight:800,color:"#1e293b",fontSize:14}}>{child.name}</div>
                    {child.notes && <div style={{fontSize:11,color:"#f97316",marginTop:2,fontWeight:700}}>⚠️ {child.notes}</div>}
                  </div>
                  <div style={{flex:1.5,color:"#475569",fontSize:13}}>{child.group}</div>
                  <div style={{flex:1.5}}>
                    <div style={{fontSize:13,color:"#334155",fontWeight:600}}>{child.guardian || "—"}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{child.phone || ""}</div>
                  </div>
                  <div style={{flex:1}}>
                    <span style={{background:statusColor(child.status)+"22",color:statusColor(child.status),border:"1px solid "+statusColor(child.status)+"44",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>
                      {statusLabel(child.status)}
                    </span>
                  </div>
                  <div style={{flex:1.5,fontSize:11,color:"#64748b",lineHeight:1.8}}>
                    {child.checkInTime ? <div>In {fmt(child.checkInTime)}</div> : null}
                    {child.checkOutTime ? <div>Out {fmt(child.checkOutTime)}</div> : null}
                    {!child.checkInTime && "—"}
                  </div>
                  <div style={{flex:1,display:"flex",gap:6,justifyContent:"flex-end"}}>
                    <button onClick={()=>openEdit(child)} title="Edit" style={{background:"#eef2ff",border:"none",borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center",cursor:"pointer"}}>
                      <Icon name="edit" size={14} color="#6366f1"/>
                    </button>
                    <button onClick={()=>deleteChild(child.id)} title="Remove" style={{background:"#fef2f2",border:"none",borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center",cursor:"pointer"}}>
                      <Icon name="trash" size={14} color="#ef4444"/>
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{textAlign:"center",padding:52,color:"#94a3b8",fontWeight:700}}>
                  <div style={{fontSize:36,marginBottom:8}}>📋</div>
                  <p>{children.length === 0 ? "No children yet — click Add Child to get started!" : "No children found"}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "print" && (
          <div style={{animation:"slideUp .3s ease",maxWidth:620}}>
            <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:"#1e293b",marginBottom:6}}>🖨️ Print Attendance Sheet</h2>
            <p style={{color:"#64748b",fontSize:14,marginBottom:24}}>Generate a printable sheet with today's check-in/out times, guardian info, and blank signature columns.</p>
            <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 2px 12px rgba(0,0,0,.06)",marginBottom:16}}>
              <div style={{marginBottom:20}}>
                <label style={{display:"block",fontWeight:800,fontSize:13,color:"#374151",marginBottom:8}}>WHICH GROUP TO PRINT?</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                  {["All", ...GROUPS].map(g => (
                    <button key={g} onClick={()=>setPrintGroup(g)}
                      style={{padding:"9px 16px",borderRadius:10,border:"2px solid "+(printGroup===g?"#6366f1":"#e2e8f0"),background:printGroup===g?"#eef2ff":"#f8fafc",color:printGroup===g?"#6366f1":"#475569",fontWeight:800,fontSize:13,transition:"all .15s",cursor:"pointer"}}>
                      {g === "All" ? "📋 All Groups" : g}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{background:"#f8fafc",borderRadius:14,padding:16,marginBottom:20,border:"2px dashed #e2e8f0"}}>
                <div style={{fontWeight:800,fontSize:13,color:"#374151",marginBottom:10}}>PREVIEW — {fmtDate()}</div>
                {(printGroup === "All" ? GROUPS : [printGroup]).map(g => {
                  const kids = children.filter(c => c.group === g);
                  if (kids.length === 0) return null;
                  return (
                    <div key={g} style={{marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#6366f1",marginBottom:4}}>{g} <span style={{color:"#94a3b8",fontWeight:600}}>({kids.length} children)</span></div>
                      {kids.map(k => (
                        <div key={k.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 8px",borderRadius:6,background:k.status==="checked-in"?"#dcfce7":k.status==="checked-out"?"#ffedd5":"#fff",marginBottom:2}}>
                          <span style={{fontWeight:600}}>{k.name}</span>
                          <span style={{color:statusColor(k.status),fontWeight:700,fontSize:11}}>{statusLabel(k.status)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <button className="btn"
                style={{width:"100%",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",borderRadius:14,padding:"15px",fontWeight:800,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .15s"}}
                onClick={() => printAttendance(children, printGroup)}>
                <Icon name="printer" size={18} color="#fff"/> Print / Save as PDF
              </button>
              <p style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:10}}>A print dialog will open. Choose "Save as PDF" to save a copy.</p>
            </div>
            <div style={{background:"#fffbeb",borderRadius:14,padding:16,border:"2px solid #fde68a"}}>
              <div style={{fontWeight:800,fontSize:13,color:"#92400e",marginBottom:6}}>💡 Tips for printing</div>
              <ul style={{fontSize:12,color:"#78350f",lineHeight:1.8,paddingLeft:18}}>
                <li>Print at end of day to capture all check-in/out times</li>
                <li>Use "Landscape" orientation for wider tables</li>
                <li>Highlighted rows in yellow = children with special notes</li>
              </ul>
            </div>
          </div>
        )}

        {view === "add" && (
          <div style={{animation:"slideUp .3s ease",maxWidth:520}}>
            <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:"#1e293b",marginBottom:24}}>{editId ? "✏️ Edit Child" : "➕ Add New Child"}</h2>

            {!editId && (
              <div style={{background:"#f0fdf4",borderRadius:16,padding:20,marginBottom:20,border:"2px dashed #86efac"}}>
                <div style={{fontWeight:800,fontSize:15,color:"#15803d",marginBottom:6}}>📊 Bulk Upload from Excel</div>
                <p style={{fontSize:12,color:"#166534",marginBottom:14,lineHeight:1.7}}>
                  Upload your Excel file with these columns:<br/>
                  <strong>Child's Full Name · Guardian Name · Guardian Phone · Group · Medical / Special Notes</strong>
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  id="excel-upload"
                  style={{display:"none"}}
                  onChange={handleExcelUpload}
                />
                <label htmlFor="excel-upload" className="upload-label" style={{display:"inline-flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",borderRadius:10,padding:"11px 22px",fontWeight:800,fontSize:14,cursor:"pointer",transition:"all .15s"}}>
                  {importing ? "⏳ Importing…" : "📂 Choose Excel File"}
                </label>
                {importing && <p style={{fontSize:12,color:"#16a34a",marginTop:10,fontWeight:600}}>Importing children, please wait…</p>}
              </div>
            )}

            <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#374151",marginBottom:16}}>Or add a single child manually:</div>
              {[
                {label:"Child's Full Name *",key:"name",placeholder:"First Last",type:"text"},
                {label:"Guardian Name",key:"guardian",placeholder:"Parent / caregiver name",type:"text"},
                {label:"Guardian Phone",key:"phone",placeholder:"404-555-0000",type:"tel"},
              ].map(f => (
                <div key={f.key} style={{marginBottom:18}}>
                  <label style={{display:"block",fontWeight:800,fontSize:13,color:"#374151",marginBottom:6}}>{f.label}</label>
                  <input style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",background:"#f8fafc"}}
                    type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}/>
                </div>
              ))}
              <div style={{marginBottom:18}}>
                <label style={{display:"block",fontWeight:800,fontSize:13,color:"#374151",marginBottom:6}}>Group</label>
                <select style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",background:"#f8fafc"}}
                  value={form.group} onChange={e=>setForm(p=>({...p,group:e.target.value}))}>
                  {GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div style={{marginBottom:24}}>
                <label style={{display:"block",fontWeight:800,fontSize:13,color:"#374151",marginBottom:6}}>Medical / Special Notes</label>
                <textarea style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",background:"#f8fafc",height:80,resize:"vertical"}}
                  placeholder="Allergies, medication, special needs…"
                  value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button className="btn" style={{flex:1,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,transition:"all .15s"}}
                  onClick={submitForm} disabled={saving}>
                  {saving ? "Saving…" : editId ? "Save Changes" : "Add to Roster"}
                </button>
                <button style={{background:"#f1f5f9",color:"#475569",border:"2px solid #e2e8f0",borderRadius:12,padding:"13px 20px",fontWeight:800,fontSize:14,cursor:"pointer"}}
                  onClick={()=>{setView("roster");setEditId(null);setForm({name:"",group:GROUPS[0],guardian:"",phone:"",notes:""});}}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#ef4444":"#22c55e",color:"#fff",fontWeight:800,fontSize:14,padding:"13px 28px",borderRadius:50,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:999,whiteSpace:"nowrap",animation:"slideUp .2s ease"}}>
          {toast.msg}
        </div>
      )}

      {confirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,animation:"fadeIn .2s ease"}} onClick={()=>setConfirm(null)}>
          <div style={{background:"#fff",borderRadius:24,padding:"40px 36px",maxWidth:400,width:"90%",textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,.2)",animation:"slideUp .2s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:44,marginBottom:12}}>{confirm.danger ? "🗑️" : "👋"}</div>
            <h3 style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:"#1e293b",marginBottom:8}}>{confirm.title}</h3>
            <p style={{color:"#64748b",fontSize:14,marginBottom:28,lineHeight:1.6}}>{confirm.sub}</p>
            <div style={{display:"flex",gap:10}}>
              <button className="btn" style={{flex:1,background:confirm.danger?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,transition:"all .15s"}} onClick={confirm.action}>
                Confirm
              </button>
              <button style={{flex:1,background:"#f1f5f9",color:"#475569",border:"2px solid #e2e8f0",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,cursor:"pointer"}} onClick={()=>setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}