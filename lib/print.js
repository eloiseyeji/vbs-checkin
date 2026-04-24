export const fmt = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const printAttendance = (children, groupFilter) => {
  const today = new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const list = groupFilter === "All" ? children : children.filter(c => c.group === groupFilter);
  const byGroup = {};
  list.forEach(c => { if (!byGroup[c.group]) byGroup[c.group] = []; byGroup[c.group].push(c); });

  const rows = (kids) => kids.map((k, i) => {
    const inTime = k.checkInTime ? fmt(k.checkInTime) : '<span class="blank-box"></span>';
    const outTime = k.checkOutTime ? fmt(k.checkOutTime) : '<span class="blank-box"></span>';
    return '<tr class="' + (k.notes ? 'has-note' : '') + '"><td style="text-align:center;color:#94a3b8">' + (i+1) + '</td><td><strong>' + k.name + '</strong></td><td>' + (k.guardian || '—') + '</td><td>' + (k.phone || '—') + '</td><td style="color:#c2410c;font-size:11px">' + (k.notes ? '⚠️ ' + k.notes : '') + '</td><td style="text-align:center">' + inTime + '</td><td style="text-align:center">' + outTime + '</td><td></td></tr>';
  }).join("");

  const groupHTML = Object.entries(byGroup).map(([group, kids]) =>
    '<div class="group-block"><div class="group-title">' + group + '</div><table><thead><tr><th style="width:30px">#</th><th>Child Name</th><th>Guardian</th><th>Phone</th><th>Notes</th><th style="width:80px">Check-In</th><th style="width:80px">Check-Out</th><th style="width:70px">Initials</th></tr></thead><tbody>' + rows(kids) + '</tbody></table></div>'
  ).join("");

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>VBS Attendance</title><style>@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap");*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Nunito",sans-serif;font-size:12px;color:#1e293b;padding:24px 32px}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6366f1;padding-bottom:12px;margin-bottom:20px}.header-left h1{font-size:24px;font-weight:900;color:#6366f1}.header-right{text-align:right;font-size:12px;color:#475569}.stats-row{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;flex:1;text-align:center}.stat .num{font-size:22px;font-weight:900;color:#6366f1}.stat .lbl{font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;margin-top:2px}.group-block{margin-bottom:24px;break-inside:avoid}.group-title{background:#6366f1;color:white;font-weight:800;font-size:13px;padding:7px 14px;border-radius:8px 8px 0 0}table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-top:none}th{background:#f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;padding:7px 10px;text-align:left;border-bottom:1px solid #e2e8f0}td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tr:last-child td{border-bottom:none}tr.has-note{background:#fffbeb}.blank-box{display:inline-block;width:48px;height:16px;border:1px solid #cbd5e1;border-radius:3px}.footer{margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}.sig-line{display:inline-block;width:160px;border-bottom:1px solid #cbd5e1;margin-left:8px}</style></head><body><div class="header"><div class="header-left"><h1>☀️ VBS Check-In · Attendance Sheet</h1><p>Vacation Bible School 2026</p></div><div class="header-right"><strong>' + today + '</strong>Group: ' + (groupFilter === "All" ? "All Groups" : groupFilter) + '</div></div><div class="stats-row"><div class="stat"><div class="num">' + list.length + '</div><div class="lbl">Total</div></div><div class="stat"><div class="num" style="color:#16a34a">' + list.filter(c=>c.status==="checked-in").length + '</div><div class="lbl">Checked In</div></div><div class="stat"><div class="num" style="color:#ea580c">' + list.filter(c=>c.status==="checked-out").length + '</div><div class="lbl">Checked Out</div></div><div class="stat"><div class="num" style="color:#0284c7">' + list.filter(c=>c.status==="not-arrived").length + '</div><div class="lbl">Not Arrived</div></div></div>' + groupHTML + '<div class="footer"><div>Teacher on duty:<span class="sig-line"></span></div><div>Signature:<span class="sig-line"></span></div><div>Printed: ' + new Date().toLocaleString() + '</div></div></body></html>';

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
};
