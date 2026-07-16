(function(){
"use strict";

/* ======================================================================
   DATA LAYER
====================================================================== */
const DB_KEY = "bridgetrack_db_v2";

function defaultDB(){
  return {
    vehicles: [], transactions: [], receipts: [], bridges: [], citations: [],
    employees: [], searchLog: [], activity: [],
    counters: { vehicle:0, bridge:0, receiptDay:{}, citationDay:{} },
    settings: { defaultEmployee: "" }
  };
}
let DB = loadDB();
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return seedDB(defaultDB());
    return Object.assign(defaultDB(), JSON.parse(raw));
  }catch(e){ console.error("DB load failed, reseeding.", e); return seedDB(defaultDB()); }
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); setStorageOk(true); }
  catch(e){ setStorageOk(false); }
  refreshChrome();
}
function seedDB(db){
  db.employees = ["J. Alvarez","M. Chen","R. Patel"];
  db.settings.defaultEmployee = "J. Alvarez";
  db.counters.bridge = 2;
  db.bridges = [
    { id:"BR-001", name:"Harborview Crossing", location:"Eastport District", type:"Suspension", lanes:6, speedLimit:45, status:"Open", notes:"Main commuter route." },
    { id:"BR-002", name:"Copperline Span", location:"North Ridge", type:"Cantilever", lanes:4, speedLimit:40, status:"Open", notes:"" }
  ];
  db.counters.vehicle = 2;
  db.vehicles = [
    { id:"VEH-000001", plate:"7BXK219", state:"CA", make:"Toyota", model:"Camry", year:"2021", color:"Silver", owner:"A. Whitfield", registration:"Valid", insurance:"Valid", notes:"" },
    { id:"VEH-000002", plate:"KTL-4482", state:"NV", make:"Ford", model:"F-150", year:"2019", color:"Black", owner:"D. Marsh", registration:"Valid", insurance:"Expired", notes:"Flagged for insurance renewal." }
  ];
  db.activity = [{ id:uid(), type:"info", title:"System initialized", time:Date.now() }];
  return db;
}

/* ======================================================================
   ID GENERATORS / HELPERS
====================================================================== */
function pad(n,len){ return String(n).padStart(len,"0"); }
function todayStr(){ const d=new Date(); return `${d.getFullYear()}${pad(d.getMonth()+1,2)}${pad(d.getDate(),2)}`; }
function yy_mm_dd(){ const d=new Date(); return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth()+1,2)}${pad(d.getDate(),2)}`; }
function nextVehicleId(){ DB.counters.vehicle++; return "VEH-"+pad(DB.counters.vehicle,6); }
function nextBridgeId(){ DB.counters.bridge++; return "BR-"+pad(DB.counters.bridge,3); }
function nextReceiptId(){ const k=todayStr(); DB.counters.receiptDay[k]=(DB.counters.receiptDay[k]||0)+1; return `RCP-${k}-${pad(DB.counters.receiptDay[k],6)}`; }
function nextCitationId(){ const k=yy_mm_dd(); DB.counters.citationDay[k]=(DB.counters.citationDay[k]||0)+1; return `CIT-${k}-${pad(DB.counters.citationDay[k],3)}`; }
function nextTxnId(){ let id; do{ id="TXN-"+Math.floor(10000000+Math.random()*89999999); }while(DB.transactions.some(t=>t.id===id)); return id; }
function uid(){ return Math.random().toString(36).slice(2,9); }
function fmtMoney(n){ return "RP " + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function nowDate(){ return new Date().toISOString().slice(0,10); }
function nowTime(){ return new Date().toTimeString().slice(0,5); }
function findVehicleByPlate(plate){ if(!plate) return null; const p=plate.trim().toUpperCase(); return DB.vehicles.find(v=>v.plate.toUpperCase()===p)||null; }
function badgeStatus(status){
  const s=(status||"").toLowerCase(); let cls="badge-gray";
  if(["paid","valid","open","active","resolved","completed"].includes(s)) cls="badge-success";
  else if(["pending","construction","duplicate"].includes(s)) cls="badge-navy";
  else if(["unpaid","expired","closed","overdue","issued","disputed"].includes(s)) cls="badge-danger";
  return `<span class="badge ${cls}">${esc(status||"—")}</span>`;
}
function logActivity(type, title){
  DB.activity.unshift({ id:uid(), type, title, time:Date.now() });
  DB.activity = DB.activity.slice(0,60);
}

/* ======================================================================
   NOTIFICATIONS (enterprise toasts)
====================================================================== */
function notify(title, sub, type){
  type = type || "info";
  const stack = document.getElementById("notifyStack");
  const el = document.createElement("div");
  el.className = "notify" + (type!=="info" ? " "+type : "");
  const icMap = { info:"i", success:"&check;", warn:"!", danger:"&times;" };
  el.innerHTML = `<div class="notify-ic">${icMap[type]||"i"}</div><div class="notify-body"><div class="notify-title">${esc(title)}</div>${sub?`<div class="notify-sub">${esc(sub)}</div>`:""}</div>`;
  stack.appendChild(el);
  setTimeout(()=>{ el.classList.add("leaving"); setTimeout(()=>el.remove(), 220); }, 3200);
}

let confirmCallback = null;
function askConfirm(title, msg, onOk, okLabel){
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMsg").textContent = msg;
  document.getElementById("confirmOk").textContent = okLabel || "Confirm";
  confirmCallback = onOk;
  document.getElementById("confirmBackdrop").classList.remove("hidden");
}

function openModal(title, bodyHtml, actionsHtml){
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<h3>${esc(title)}</h3>${bodyHtml}<div class="modal-actions">${actionsHtml}</div>`;
  document.getElementById("modalBackdrop").classList.remove("hidden");
  root.querySelectorAll("select").forEach(s=> s.classList.add("filled"));
  const firstInput = root.querySelector("input,select,textarea");
  if(firstInput) setTimeout(()=>firstInput.focus(), 50);
}
function closeModal(){ document.getElementById("modalBackdrop").classList.add("hidden"); }
function closeDetail(){ document.getElementById("detailBackdrop").classList.add("hidden"); document.getElementById("detailPanel").innerHTML=""; }

/* ======================================================================
   NAVIGATION / CHROME
====================================================================== */
const VIEW_TITLES = { dashboard:["Overview","Dashboard"], lookup:["Records","Plate Lookup"], vehicles:["Records","Vehicles"],
  transactions:["Records","Toll Transactions"], receipts:["Records","Receipts"], bridges:["Infrastructure","Bridges"],
  citations:["Enforcement","Citations"], reports:["Insights","Reports"], settings:["System","Settings"] };

function gotoView(view){
  if(view==="more"){ document.getElementById("moreSheet").classList.remove("hidden"); document.getElementById("scrim").classList.add("show"); return; }
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  const el = document.getElementById("view-"+view);
  if(!el) return;
  el.classList.add("active");
  const [crumb, title] = VIEW_TITLES[view] || [view,view];
  document.getElementById("breadcrumb").textContent = crumb + " / " + title;
  document.getElementById("pageTitle").textContent = title;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  document.querySelectorAll(".bn-item").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  closeMobileSidebar();
  document.getElementById("moreSheet").classList.add("hidden");
  renderPageActions(view);
  renderView(view);
  window.scrollTo(0,0);
}
function renderPageActions(view){
  const map = {
    vehicles: `<button class="btn btn-primary" onclick="App.openVehicleModal(null)">+ New Vehicle</button>`,
    transactions: `<button class="btn btn-primary" onclick="App.openTxnModal(null)">+ New Transaction</button>`,
    citations: `<button class="btn btn-primary" onclick="App.openCitationModal(null)">+ Issue Citation</button>`,
    bridges: ``,
    reports: ``
  };
  document.getElementById("pageActions").innerHTML = map[view] || "";
}
function renderView(view){
  if(view==="dashboard") renderDashboard();
  else if(view==="lookup") renderLookup();
  else if(view==="vehicles") renderVehiclesTable();
  else if(view==="transactions") renderTxnTable();
  else if(view==="receipts") renderReceiptTable();
  else if(view==="bridges") renderBridges();
  else if(view==="citations") renderCitationTable();
  else if(view==="reports") renderReports();
  else if(view==="settings") renderSettings();
}

function openMobileSidebar(){ document.getElementById("shell").classList.add("sidebar-open"); document.getElementById("scrim").classList.add("show"); }
function closeMobileSidebar(){ document.getElementById("shell").classList.remove("sidebar-open"); if(document.getElementById("moreSheet").classList.contains("hidden")) document.getElementById("scrim").classList.remove("show"); }
function toggleSidebar(){
  const shell = document.getElementById("shell");
  if(window.innerWidth <= 1100){ shell.classList.toggle("sidebar-open"); document.getElementById("scrim").classList.toggle("show"); }
  else{ shell.classList.toggle("sidebar-collapsed"); }
}
function toggleActivity(){ document.getElementById("shell").classList.toggle("activity-hidden"); }

/* ======================================================================
   STATUS BAR / CLOCK / STORAGE METER
====================================================================== */
let storageOk = true;
function setStorageOk(v){ storageOk = v; }
function tickClock(){
  const d = new Date();
  document.getElementById("statusDate").textContent = d.toLocaleDateString(undefined,{weekday:"short", year:"numeric", month:"short", day:"numeric"});
  document.getElementById("statusTime").textContent = d.toLocaleTimeString();
}
function refreshChrome(){
  const totalRecords = DB.vehicles.length + DB.transactions.length + DB.receipts.length + DB.bridges.length + DB.citations.length;
  document.getElementById("statusRecords").textContent = totalRecords.toLocaleString() + " Records";
  document.getElementById("statusStorage").textContent = "Local Storage: " + (storageOk ? "OK" : "ERROR");
  document.querySelector(".status-dot.online").style.background = storageOk ? "var(--success)" : "var(--danger)";
  document.getElementById("navReceiptQueue").textContent = DB.receipts.length;
  const openCites = DB.citations.filter(c=>c.status==="Issued"||c.status==="Disputed").length;
  document.getElementById("navOpenCitations").textContent = openCites;
  document.getElementById("navOpenCitations").classList.toggle("hidden", openCites===0);

  // storage meter (rough estimate against a 5MB soft budget)
  let bytes = 0; try{ bytes = new Blob([localStorage.getItem(DB_KEY)||""]).size; }catch(e){}
  const pct = Math.min(100, Math.round((bytes / (5*1024*1024)) * 100));
  document.getElementById("storageFill").style.width = Math.max(pct,2) + "%";
  document.getElementById("storagePct").textContent = pct + "%";

  const emp = DB.settings.defaultEmployee;
  document.getElementById("cmdUserName").textContent = emp || "Select Employee";
  document.getElementById("cmdUserAvatar").textContent = emp ? emp.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "—";

  renderActivityFeed();
}
function renderActivityFeed(){
  const el = document.getElementById("activityList");
  if(!DB.activity.length){ el.innerHTML = `<div class="empty-note">No activity yet.</div>`; return; }
  el.innerHTML = DB.activity.slice(0,40).map(a=>`
    <div class="activity-item">
      <span class="activity-dot ${a.type}"></span>
      <div class="activity-body">
        <span class="activity-title">${esc(a.title)}</span>
        <span class="activity-time">${new Date(a.time).toLocaleTimeString()}</span>
      </div>
    </div>`).join("");
}

/* ======================================================================
   DASHBOARD
====================================================================== */
function renderDashboard(){
  const today = nowDate();
  const todaysTxns = DB.transactions.filter(t=>t.date===today);
  const totalRevenue = DB.receipts.reduce((s,r)=>s+Number(r.amount||0),0);
  const outstanding = DB.transactions.filter(t=>t.status==="Unpaid").reduce((s,t)=>s+Number(t.amount),0);
  const activeBridges = DB.bridges.filter(b=>b.status==="Open").length;
  const openCites = DB.citations.filter(c=>c.status==="Issued"||c.status==="Disputed").length;

  const cards = [
    ["Total Toll Transactions", DB.transactions.length, ""],
    ["Revenue (RP)", fmtMoney(totalRevenue), "accent-success"],
    ["Outstanding Balances", fmtMoney(outstanding), "accent-warn"],
    ["Vehicles Registered", DB.vehicles.length, ""],
    ["Active Bridges", activeBridges + " / " + DB.bridges.length, ""],
    ["Open Citations", openCites, openCites?"accent-danger":""],
    ["Today's Activity", todaysTxns.length + " transactions", ""],
    ["Receipt Queue", DB.receipts.length, ""]
  ];
  document.getElementById("dashCards").innerHTML = cards.map((c,i)=>`
    <div class="stat-card" style="animation-delay:${i*35}ms"><div class="stat-label">${c[0]}</div><div class="stat-value ${c[2]}">${c[1]}</div></div>
  `).join("");

  renderMiniList("recentTxns", [...DB.transactions].reverse().slice(0,6), t=>({id:t.id, sub:`${t.plate} · ${t.bridge}`, right:fmtMoney(t.amount)}));
  renderMiniList("recentReceipts", [...DB.receipts].reverse().slice(0,6), r=>({id:r.id, sub:`${r.plate} · ${r.employee}`, right:fmtMoney(r.amount)}));
  renderMiniList("recentCitations", [...DB.citations].reverse().slice(0,6), c=>({id:c.id, sub:`${c.plate} · ${c.reason}`, right:fmtMoney(c.fine)}));
  renderMiniList("recentSearches", [...DB.searchLog].reverse().slice(0,6), s=>({id:s.query, sub:`${s.type} · ${new Date(s.ts).toLocaleString()}`, right:""}));
}
function renderMiniList(elId, items, mapFn){
  const el = document.getElementById(elId);
  if(!items.length){ el.innerHTML = `<div class="empty-note">No records yet.</div>`; return; }
  el.innerHTML = items.map(it=>{ const m=mapFn(it); return `<div class="mini-row"><div class="m-left"><span class="m-id">${esc(m.id)}</span><span class="m-sub">${esc(m.sub)}</span></div><div class="m-right">${esc(m.right)}</div></div>`; }).join("");
}

/* ======================================================================
   PLATE LOOKUP
====================================================================== */
function renderLookup(){ document.getElementById("lookupResults").innerHTML=""; document.getElementById("lookupDetail").innerHTML=""; }
function doLookup(){
  const type = document.getElementById("lookupType").value;
  const val = document.getElementById("lookupInput").value.trim();
  if(!val){ notify("Search value required","Enter a plate, partial plate, or vehicle ID.","warn"); return; }
  DB.searchLog.push({ type, query:val, ts:Date.now() }); saveDB();

  let results = [];
  if(type==="plate"){ const v=findVehicleByPlate(val); results = v?[v]:[]; }
  else if(type==="partial"){ results = DB.vehicles.filter(v=>v.plate.toUpperCase().includes(val.toUpperCase())); }
  else if(type==="vehicleId"){ results = DB.vehicles.filter(v=>v.id.toUpperCase().includes(val.toUpperCase())); }

  const box = document.getElementById("lookupResults");
  document.getElementById("lookupDetail").innerHTML = "";
  if(!results.length){ box.innerHTML = `<div class="panel"><div class="empty-note">No vehicles matched "${esc(val)}".</div></div>`; return; }
  if(results.length===1){ box.innerHTML=""; showVehicleDetail(results[0].id); return; }
  box.innerHTML = `<div class="dt-wrap"><div class="dt-toolbar"><strong style="font-size:13px;">${results.length} Results</strong></div>
    <div class="dt-scroll"><table class="dt-table"><thead><tr><th><div class="dt-th-inner">Vehicle ID</div></th><th><div class="dt-th-inner">Plate</div></th><th><div class="dt-th-inner">State</div></th><th><div class="dt-th-inner">Make/Model</div></th><th><div class="dt-th-inner">Owner</div></th><th></th></tr></thead>
    <tbody>${results.map(v=>`<tr onclick="App.showVehicleDetail('${v.id}')">
      <td class="mono">${esc(v.id)}</td><td class="mono">${esc(v.plate)}</td><td>${esc(v.state)}</td>
      <td>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.owner)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();App.showVehicleDetail('${v.id}')">View</button></td>
    </tr>`).join("")}</tbody></table></div></div>`;
}
function showVehicleDetail(id){
  const v = DB.vehicles.find(x=>x.id===id);
  if(!v) return;
  document.getElementById("lookupResults").innerHTML="";
  const crossings = DB.transactions.filter(t=>t.plate.toUpperCase()===v.plate.toUpperCase()).reverse();
  const cites = DB.citations.filter(c=>c.plate.toUpperCase()===v.plate.toUpperCase()).reverse();
  const balance = crossings.filter(t=>t.status==="Unpaid").reduce((s,t)=>s+Number(t.amount),0);

  document.getElementById("lookupDetail").innerHTML = `
  <div class="panel">
    <div class="panel-head"><h3>${esc(v.plate)} &middot; ${esc(v.id)}</h3></div>
    <div class="detail-grid">
      <div class="detail-kv"><label>State</label><div>${esc(v.state)}</div></div>
      <div class="detail-kv"><label>Make / Model / Year</label><div>${esc(v.make)} ${esc(v.model)} · ${esc(v.year)}</div></div>
      <div class="detail-kv"><label>Color</label><div>${esc(v.color)}</div></div>
      <div class="detail-kv"><label>Owner (RP)</label><div>${esc(v.owner)||"—"}</div></div>
      <div class="detail-kv"><label>Registration</label><div>${badgeStatus(v.registration)}</div></div>
      <div class="detail-kv"><label>Insurance</label><div>${badgeStatus(v.insurance)}</div></div>
      <div class="detail-kv"><label>Outstanding Balance</label><div>${fmtMoney(balance)}</div></div>
      <div class="detail-kv"><label>Notes</label><div>${esc(v.notes)||"—"}</div></div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" onclick="App.openTxnModal(null,'${esc(v.plate)}')">New Transaction</button>
      <button class="btn btn-secondary btn-sm" onclick="App.openCitationModal(null,'${esc(v.plate)}')">Issue Citation</button>
      <button class="btn btn-secondary btn-sm" onclick="App.printVehicleSummary('${v.id}')">Print Summary</button>
      <button class="btn btn-secondary btn-sm" onclick="App.openVehicleModal('${v.id}')">Edit Vehicle</button>
      <button class="btn btn-danger btn-sm" onclick="App.deleteVehicle('${v.id}')">Delete Vehicle</button>
    </div>
  </div>
  <div class="dash-grid">
    <div class="panel"><div class="panel-head"><h3>Previous Toll Crossings</h3></div>
      ${crossings.length? `<div class="dt-scroll"><table class="dt-table"><thead><tr><th><div class="dt-th-inner">Date</div></th><th><div class="dt-th-inner">Bridge</div></th><th><div class="dt-th-inner">Amount</div></th><th><div class="dt-th-inner">Status</div></th></tr></thead><tbody>
      ${crossings.map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.bridge)}</td><td class="mono">${fmtMoney(t.amount)}</td><td>${badgeStatus(t.status)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty-note">No crossings on record.</div>`}
    </div>
    <div class="panel"><div class="panel-head"><h3>Citation History</h3></div>
      ${cites.length? `<div class="dt-scroll"><table class="dt-table"><thead><tr><th><div class="dt-th-inner">Date</div></th><th><div class="dt-th-inner">Reason</div></th><th><div class="dt-th-inner">Fine</div></th><th><div class="dt-th-inner">Status</div></th></tr></thead><tbody>
      ${cites.map(c=>`<tr><td>${esc(c.date)}</td><td>${esc(c.reason)}</td><td class="mono">${fmtMoney(c.fine)}</td><td>${badgeStatus(c.status)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty-note">No citations on record.</div>`}
    </div>
  </div>`;
}

/* ======================================================================
   GENERIC DATA TABLE ENGINE
   Supports: sort, per-column filter, resize, bulk select, export CSV,
   pagination, row highlight, double-click -> detail panel.
====================================================================== */
const tableState = {}; // keyed by tableId -> { sortKey, sortDir, page, filters, selected:Set, pageSize, colWidths }
function getTableState(id, cols){
  if(!tableState[id]) tableState[id] = { sortKey:null, sortDir:"asc", page:1, filters:{}, selected:new Set(), pageSize:8, colWidths:{} };
  return tableState[id];
}

function renderDataTable(opts){
  // opts: { id, title, columns:[{key,label,width,sortable,filterable,type:'text'|'select',options,render(row)}], data:[], rowActions(row)->html, onOpen(row), newLabel, onNew, exportName }
  const st = getTableState(opts.id);
  const container = document.getElementById(opts.mount);
  let rows = [...opts.data];

  // filters
  Object.entries(st.filters).forEach(([key,val])=>{
    if(!val) return;
    rows = rows.filter(r=>{
      const col = opts.columns.find(c=>c.key===key);
      const v = col.getVal ? col.getVal(r) : r[key];
      return String(v==null?"":v).toLowerCase().includes(String(val).toLowerCase());
    });
  });
  // global per-table search
  if(st.search){
    const q = st.search.toLowerCase();
    rows = rows.filter(r => opts.columns.some(c=>{
      const v = c.getVal ? c.getVal(r) : r[c.key];
      return String(v==null?"":v).toLowerCase().includes(q);
    }));
  }
  // sort
  if(st.sortKey){
    const col = opts.columns.find(c=>c.key===st.sortKey);
    rows.sort((a,b)=>{
      let va = col.getVal ? col.getVal(a) : a[st.sortKey];
      let vb = col.getVal ? col.getVal(b) : b[st.sortKey];
      if(col.type==="number"){ va=Number(va)||0; vb=Number(vb)||0; }
      else { va=String(va==null?"":va).toLowerCase(); vb=String(vb==null?"":vb).toLowerCase(); }
      if(va<vb) return st.sortDir==="asc"?-1:1;
      if(va>vb) return st.sortDir==="asc"?1:-1;
      return 0;
    });
  } else if(opts.defaultReverse){ rows.reverse(); }

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/st.pageSize));
  if(st.page>pages) st.page=pages;
  const pageRows = rows.slice((st.page-1)*st.pageSize, (st.page-1)*st.pageSize + st.pageSize);

  const filterRow = opts.columns.some(c=>c.filterable) ? `<tr class="dt-filter-row"><th></th>${opts.columns.map(c=>{
    if(!c.filterable) return `<th></th>`;
    if(c.type==="select"){
      return `<th><select data-filter-key="${c.key}" data-table="${opts.id}"><option value="">All</option>${(c.options||[]).map(o=>`<option ${st.filters[c.key]===o?"selected":""}>${esc(o)}</option>`).join("")}</select></th>`;
    }
    return `<th><input type="text" data-filter-key="${c.key}" data-table="${opts.id}" placeholder="Filter&hellip;" value="${esc(st.filters[c.key]||"")}"></th>`;
  }).join("")}<th></th></tr>` : "";

  const headCells = opts.columns.map(c=>{
    const sorted = st.sortKey===c.key;
    const w = st.colWidths[c.key] || c.width || 140;
    return `<th style="width:${w}px" data-col="${c.key}">
      <div class="dt-th-inner ${sorted?"sorted":""} ${sorted&&st.sortDir==="desc"?"desc":""}" data-sort-key="${c.sortable===false?"":c.key}" data-table="${opts.id}">
        <span>${esc(c.label)}</span>${c.sortable===false?"":`<span class="dt-sort-ic">&#9650;</span>`}
      </div>
      <div class="dt-resize-handle" data-resize-key="${c.key}" data-table="${opts.id}"></div>
    </th>`;
  }).join("");

  const bodyRows = pageRows.length ? pageRows.map((r,i)=>{
    const id = r.id;
    const sel = st.selected.has(id);
    return `<tr class="${sel?"selected":""}" style="animation-delay:${i*22}ms" data-row-id="${esc(id)}" data-table="${opts.id}">
      <td style="width:38px"><input type="checkbox" class="dt-checkbox" data-select-row="${esc(id)}" data-table="${opts.id}" ${sel?"checked":""} onclick="event.stopPropagation()"></td>
      ${opts.columns.map(c=>`<td style="width:${st.colWidths[c.key]||c.width||140}px">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}
      <td class="dt-actions-cell" onclick="event.stopPropagation()">${opts.rowActions ? opts.rowActions(r) : ""}</td>
    </tr>`;
  }).join("") : `<tr class="empty-table-row"><td colspan="${opts.columns.length+2}">No records found.</td></tr>`;

  const selCount = st.selected.size;

  container.innerHTML = `
  <div class="dt-wrap">
    <div class="dt-toolbar">
      <input type="text" placeholder="Search ${esc(opts.title.toLowerCase())}&hellip;" value="${esc(st.search||"")}" data-table-search="${opts.id}">
      <button class="btn btn-secondary btn-sm" data-table-export="${opts.id}">Export CSV</button>
      ${opts.onNew?`<button class="btn btn-primary btn-sm" data-table-new="${opts.id}">${esc(opts.newLabel||"+ New")}</button>`:""}
    </div>
    ${selCount ? `<div class="dt-bulkbar"><span>${selCount} selected</span>
      <button class="btn btn-secondary btn-sm" data-bulk-export="${opts.id}">Export Selected</button>
      <button class="btn btn-danger btn-sm" data-bulk-delete="${opts.id}">Delete Selected</button>
      <button class="btn btn-ghost btn-sm" data-bulk-clear="${opts.id}">Clear</button>
    </div>` : ""}
    <div class="dt-scroll">
      <table class="dt-table">
        <thead>
          <tr><th style="width:38px"><input type="checkbox" class="dt-checkbox" data-select-all="${opts.id}" ${pageRows.length && pageRows.every(r=>st.selected.has(r.id))?"checked":""}></th>${headCells}<th style="width:110px">Actions</th></tr>
          ${filterRow}
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="dt-footer">
      <span class="dt-count">${total} record${total===1?"":"s"} &middot; Page ${st.page} of ${pages}</span>
      <div class="pagination">
        <button class="pg-btn" data-page="${st.page-1}" data-table="${opts.id}" ${st.page<=1?"disabled":""}>&lsaquo;</button>
        ${Array.from({length:pages}).slice(0,7).map((_,i)=>`<button class="pg-btn ${i+1===st.page?"active":""}" data-page="${i+1}" data-table="${opts.id}">${i+1}</button>`).join("")}
        <button class="pg-btn" data-page="${st.page+1}" data-table="${opts.id}" ${st.page>=pages?"disabled":""}>&rsaquo;</button>
      </div>
    </div>
  </div>`;

  wireDataTable(opts, rows);
}

function wireDataTable(opts, allFilteredRows){
  const id = opts.id;
  const root = document.getElementById(opts.mount);

  root.querySelectorAll(`[data-table-search="${id}"]`).forEach(inp=>{
    inp.addEventListener("input", ()=>{ getTableState(id).search = inp.value; getTableState(id).page=1; renderDataTable(opts); });
  });
  root.querySelectorAll(`[data-filter-key][data-table="${id}"]`).forEach(inp=>{
    const evt = inp.tagName==="SELECT" ? "change" : "input";
    inp.addEventListener(evt, ()=>{ getTableState(id).filters[inp.dataset.filterKey]=inp.value; getTableState(id).page=1; renderDataTable(opts); });
  });
  root.querySelectorAll(`.dt-th-inner[data-table="${id}"]`).forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.sortKey; if(!key) return;
      const st = getTableState(id);
      if(st.sortKey===key) st.sortDir = st.sortDir==="asc"?"desc":"asc";
      else { st.sortKey=key; st.sortDir="asc"; }
      renderDataTable(opts);
    });
  });
  root.querySelectorAll(`[data-page][data-table="${id}"]`).forEach(btn=>{
    btn.addEventListener("click", ()=>{ getTableState(id).page = parseInt(btn.dataset.page,10); renderDataTable(opts); });
  });
  root.querySelectorAll(`[data-select-row][data-table="${id}"]`).forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const st = getTableState(id); const rid = cb.dataset.selectRow;
      if(cb.checked) st.selected.add(rid); else st.selected.delete(rid);
      renderDataTable(opts);
    });
  });
  const selAll = root.querySelector(`[data-select-all="${id}"]`);
  if(selAll) selAll.addEventListener("change", ()=>{
    const st = getTableState(id);
    const pageIds = root.querySelectorAll(`[data-select-row][data-table="${id}"]`);
    if(selAll.checked) pageIds.forEach(cb=>st.selected.add(cb.dataset.selectRow));
    else pageIds.forEach(cb=>st.selected.delete(cb.dataset.selectRow));
    renderDataTable(opts);
  });
  const exportBtn = root.querySelector(`[data-table-export="${id}"]`);
  if(exportBtn) exportBtn.addEventListener("click", ()=> exportRowsCSV(opts, allFilteredRows));
  const bulkExport = root.querySelector(`[data-bulk-export="${id}"]`);
  if(bulkExport) bulkExport.addEventListener("click", ()=>{
    const st = getTableState(id);
    exportRowsCSV(opts, opts.data.filter(r=>st.selected.has(r.id)));
  });
  const bulkDelete = root.querySelector(`[data-bulk-delete="${id}"]`);
  if(bulkDelete) bulkDelete.addEventListener("click", ()=>{
    const st = getTableState(id);
    askConfirm("Delete Selected Records?", `This will permanently remove ${st.selected.size} record(s).`, ()=>{
      opts.onBulkDelete([...st.selected]);
      st.selected.clear();
    }, "Delete");
  });
  const bulkClear = root.querySelector(`[data-bulk-clear="${id}"]`);
  if(bulkClear) bulkClear.addEventListener("click", ()=>{ getTableState(id).selected.clear(); renderDataTable(opts); });
  const newBtn = root.querySelector(`[data-table-new="${id}"]`);
  if(newBtn) newBtn.addEventListener("click", opts.onNew);

  // row double-click -> detail panel
  root.querySelectorAll(`tr[data-row-id][data-table="${id}"]`).forEach(tr=>{
    tr.addEventListener("dblclick", ()=>{ if(opts.onOpen) opts.onOpen(tr.dataset.rowId); });
  });

  // column resize
  root.querySelectorAll(`[data-resize-key][data-table="${id}"]`).forEach(handle=>{
    handle.addEventListener("mousedown", (e)=>{
      e.preventDefault();
      const key = handle.dataset.resizeKey;
      const th = handle.closest("th");
      const startX = e.clientX; const startW = th.offsetWidth;
      function onMove(ev){
        const w = Math.max(70, startW + (ev.clientX-startX));
        getTableState(id).colWidths[key] = w;
        th.style.width = w+"px";
      }
      function onUp(){ document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); renderDataTable(opts); }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}
function exportRowsCSV(opts, rows){
  const headers = opts.columns.map(c=>c.label);
  const lines = [headers.join(",")];
  rows.forEach(r=>{
    const vals = opts.columns.map(c=>{
      let v = c.getVal ? c.getVal(r) : r[c.key];
      v = String(v==null?"":v).replace(/"/g,'""');
      return `"${v}"`;
    });
    lines.push(vals.join(","));
  });
  const blob = new Blob([lines.join("\n")], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download = (opts.exportName||opts.id)+"-export.csv"; a.click();
  URL.revokeObjectURL(url);
  notify("Export complete", rows.length+" record(s) exported to CSV.", "success");
  logActivity("success", "Exported "+rows.length+" "+opts.title.toLowerCase()+" record(s)"); saveDB();
}

/* ======================================================================
   VEHICLES TABLE + DETAIL PANEL
====================================================================== */
function renderVehiclesTable(){
  renderDataTable({
    id:"vehicles", mount:"tbl-vehicles", title:"Vehicles", data:DB.vehicles, defaultReverse:true, newLabel:"+ New Vehicle",
    onNew:()=>openVehicleModal(null), exportName:"vehicles",
    columns:[
      {key:"id", label:"Vehicle ID", width:120, render:r=>`<span class="mono">${esc(r.id)}</span>`},
      {key:"plate", label:"Plate", width:110, filterable:true, render:r=>`<span class="mono">${esc(r.plate)}</span>`},
      {key:"state", label:"State", width:70, filterable:true},
      {key:"make", label:"Make", width:100, filterable:true},
      {key:"model", label:"Model", width:110},
      {key:"year", label:"Year", width:70, type:"number"},
      {key:"owner", label:"Owner", width:140, filterable:true},
      {key:"registration", label:"Registration", width:110, filterable:true, type:"select", options:["Valid","Expired","Pending"], render:r=>badgeStatus(r.registration)}
    ],
    rowActions:(v)=>`
      <button class="icon-action" title="View" onclick="App.gotoLookupVehicle('${v.id}')">&#128065;</button>
      <button class="icon-action" title="Edit" onclick="App.openVehicleModal('${v.id}')">&#9998;</button>
      <button class="icon-action" title="Delete" onclick="App.deleteVehicle('${v.id}')">&#128465;</button>`,
    onOpen:(id)=>openVehicleDetailPanel(id),
    onBulkDelete:(ids)=>{ DB.vehicles = DB.vehicles.filter(v=>!ids.includes(v.id)); saveDB(); logActivity("danger", ids.length+" vehicle(s) deleted"); notify("Vehicles deleted", ids.length+" record(s) removed.","danger"); renderVehiclesTable(); }
  });
}
function openVehicleDetailPanel(id){
  const v = DB.vehicles.find(x=>x.id===id); if(!v) return;
  const crossings = DB.transactions.filter(t=>t.plate.toUpperCase()===v.plate.toUpperCase()).reverse();
  const cites = DB.citations.filter(c=>c.plate.toUpperCase()===v.plate.toUpperCase()).reverse();
  const balance = crossings.filter(t=>t.status==="Unpaid").reduce((s,t)=>s+Number(t.amount),0);
  document.getElementById("detailPanel").innerHTML = `
    <div class="detail-head">
      <div><h2>${esc(v.plate)}</h2><div class="sub">${esc(v.id)}</div></div>
      <button class="cmd-icon-btn" onclick="App.closeDetail()">&times;</button>
    </div>
    <div class="detail-body">
      <div class="detail-main">
        <div class="detail-section">
          <h4>Vehicle Information</h4>
          <div class="detail-grid">
            <div class="detail-kv"><label>State</label><div>${esc(v.state)}</div></div>
            <div class="detail-kv"><label>Make / Model</label><div>${esc(v.make)} ${esc(v.model)}</div></div>
            <div class="detail-kv"><label>Year</label><div>${esc(v.year)}</div></div>
            <div class="detail-kv"><label>Color</label><div>${esc(v.color)}</div></div>
            <div class="detail-kv"><label>Owner (RP)</label><div>${esc(v.owner)||"—"}</div></div>
            <div class="detail-kv"><label>Outstanding Balance</label><div>${fmtMoney(balance)}</div></div>
            <div class="detail-kv"><label>Registration</label><div>${badgeStatus(v.registration)}</div></div>
            <div class="detail-kv"><label>Insurance</label><div>${badgeStatus(v.insurance)}</div></div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-primary btn-sm" onclick="App.openTxnModal(null,'${esc(v.plate)}')">New Transaction</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openCitationModal(null,'${esc(v.plate)}')">Issue Citation</button>
            <button class="btn btn-secondary btn-sm" onclick="App.printVehicleSummary('${v.id}')">Print Summary</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openVehicleModal('${v.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteVehicle('${v.id}')">Delete</button>
          </div>
        </div>
        <div class="detail-section">
          <h4>Vehicle History &mdash; Toll Crossings</h4>
          <div class="related-list">${crossings.length ? crossings.slice(0,10).map(t=>`<div class="related-row"><span>${esc(t.date)} &middot; ${esc(t.bridge)}</span><span class="mono">${fmtMoney(t.amount)}</span></div>`).join("") : `<div class="empty-note">No crossings on record.</div>`}</div>
        </div>
      </div>
      <div class="detail-side">
        <div class="detail-section">
          <h4>Timeline</h4>
          <div class="timeline">
            <div class="tl-item"><span class="tl-dot"></span><div class="tl-body"><div class="tl-title">Vehicle registered</div><div class="tl-time">${esc(v.id)}</div></div></div>
            ${crossings.slice(0,4).map(t=>`<div class="tl-item"><span class="tl-dot"></span><div class="tl-body"><div class="tl-title">Toll crossing &mdash; ${esc(t.bridge)}</div><div class="tl-time">${esc(t.date)} ${esc(t.time||"")}</div></div></div>`).join("")}
          </div>
        </div>
        <div class="detail-section">
          <h4>Citation History</h4>
          <div class="related-list">${cites.length ? cites.map(c=>`<div class="related-row"><span>${esc(c.date)} &middot; ${esc(c.reason)}</span>${badgeStatus(c.status)}</div>`).join("") : `<div class="empty-note">No citations on record.</div>`}</div>
        </div>
        <div class="detail-section">
          <h4>Notes</h4>
          <p class="muted">${esc(v.notes)||"No notes recorded for this vehicle."}</p>
        </div>
      </div>
    </div>`;
  document.getElementById("detailBackdrop").classList.remove("hidden");
}
function openVehicleModal(id){
  const v = id ? DB.vehicles.find(x=>x.id===id) : null;
  const isEdit = !!v;
  openModal(isEdit?"Edit Vehicle":"New Vehicle", `
    <div class="form-grid">
      <div class="f-field"><input id="f_plate" type="text" placeholder=" " value="${v?esc(v.plate):""}"><label>Plate Number<span class="req">*</span></label><span class="f-check">&check;</span></div>
      <div class="f-field"><input id="f_state" type="text" maxlength="2" placeholder=" " value="${v?esc(v.state):""}"><label>State</label></div>
      <div class="f-field"><input id="f_make" type="text" placeholder=" " value="${v?esc(v.make):""}" list="dl_makes"><label>Make</label></div>
      <div class="f-field"><input id="f_model" type="text" placeholder=" " value="${v?esc(v.model):""}"><label>Model</label></div>
      <div class="f-field"><input id="f_year" type="text" placeholder=" " value="${v?esc(v.year):""}"><label>Year</label></div>
      <div class="f-field"><input id="f_color" type="text" placeholder=" " value="${v?esc(v.color):""}"><label>Color</label></div>
      <div class="f-field"><input id="f_owner" type="text" placeholder=" " value="${v?esc(v.owner):""}"><label>Owner Name (RP)</label></div>
      <div class="f-field always-float"><label>Registration Status</label><select id="f_reg" class="filled"><option ${v?.registration==="Valid"?"selected":""}>Valid</option><option ${v?.registration==="Expired"?"selected":""}>Expired</option><option ${v?.registration==="Pending"?"selected":""}>Pending</option></select></div>
      <div class="f-field always-float"><label>Insurance Status</label><select id="f_ins" class="filled"><option ${v?.insurance==="Valid"?"selected":""}>Valid</option><option ${v?.insurance==="Expired"?"selected":""}>Expired</option><option ${v?.insurance==="Pending"?"selected":""}>Pending</option></select></div>
      <div class="f-field full"><textarea id="f_notes" placeholder=" ">${v?esc(v.notes):""}</textarea><label>Vehicle Notes</label></div>
    </div>
    <datalist id="dl_makes"><option>Toyota</option><option>Ford</option><option>Honda</option><option>Chevrolet</option><option>Nissan</option><option>BMW</option></datalist>
    <div class="autosave-note"><span class="dot"></span>Draft auto-saves locally as you type.</div>
  `, `<button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.saveVehicle(${isEdit?`'${id}'`:null})">Save Vehicle</button>`);
  wireFieldValidation("f_plate", v=>v.trim().length>0);
}
function wireFieldValidation(inputId, validFn){
  const input = document.getElementById(inputId);
  if(!input) return;
  const field = input.closest(".f-field");
  function check(){ const ok = validFn(input.value); field.classList.toggle("valid", ok && input.value.length>0); field.classList.toggle("invalid", !ok && input.value.length>0); }
  input.addEventListener("input", check); check();
}
function saveVehicle(id){
  const plate = document.getElementById("f_plate").value.trim();
  if(!plate){ notify("Plate number required","Enter a plate number to continue.","danger"); return; }
  const data = { plate:plate.toUpperCase(), state:document.getElementById("f_state").value.trim().toUpperCase(),
    make:document.getElementById("f_make").value.trim(), model:document.getElementById("f_model").value.trim(),
    year:document.getElementById("f_year").value.trim(), color:document.getElementById("f_color").value.trim(),
    owner:document.getElementById("f_owner").value.trim(), registration:document.getElementById("f_reg").value,
    insurance:document.getElementById("f_ins").value, notes:document.getElementById("f_notes").value.trim() };
  if(id){ Object.assign(DB.vehicles.find(x=>x.id===id), data); notify("Record saved", "Vehicle "+id+" updated.", "success"); logActivity("success","Vehicle "+id+" updated"); }
  else{ data.id = nextVehicleId(); DB.vehicles.push(data); notify("Vehicle registered", data.id+" created.", "success"); logActivity("success","Vehicle "+data.id+" registered"); }
  saveDB(); closeModal(); renderView("vehicles"); if(document.getElementById("view-dashboard").classList.contains("active")) renderDashboard();
}
function deleteVehicle(id){
  askConfirm("Delete Vehicle?", "This will permanently remove "+id+" from the database.", ()=>{
    DB.vehicles = DB.vehicles.filter(v=>v.id!==id);
    saveDB(); notify("Vehicle deleted", id+" removed.", "danger"); logActivity("danger", "Vehicle "+id+" deleted");
    renderView("vehicles"); renderView("lookup"); closeDetail();
  });
}

/* ======================================================================
   TRANSACTIONS TABLE + DETAIL PANEL
====================================================================== */
function renderTxnTable(){
  renderDataTable({
    id:"transactions", mount:"tbl-transactions", title:"Transactions", data:DB.transactions, defaultReverse:true, newLabel:"+ New Transaction",
    onNew:()=>openTxnModal(null), exportName:"transactions",
    columns:[
      {key:"id", label:"TXN ID", width:130, render:r=>`<span class="mono">${esc(r.id)}</span>`},
      {key:"date", label:"Date", width:100, filterable:true},
      {key:"bridge", label:"Bridge", width:150, filterable:true, type:"select", options:[...new Set(DB.bridges.map(b=>b.name))]},
      {key:"plate", label:"Plate", width:100, filterable:true, render:r=>`<span class="mono">${esc(r.plate)}</span>`},
      {key:"amount", label:"Amount", width:100, type:"number", render:r=>`<span class="mono">${fmtMoney(r.amount)}</span>`},
      {key:"status", label:"Status", width:100, filterable:true, type:"select", options:["Paid","Unpaid","Pending"], render:r=>badgeStatus(r.status)},
      {key:"employee", label:"Employee", width:120, filterable:true}
    ],
    rowActions:(t)=>`
      <button class="icon-action" title="Print Receipt" onclick="App.printReceipt('${t.receiptId}')">&#128424;</button>
      <button class="icon-action" title="Duplicate" onclick="App.duplicateTxn('${t.id}')">&#128203;</button>
      <button class="icon-action" title="Delete" onclick="App.deleteTxn('${t.id}')">&#128465;</button>`,
    onOpen:(id)=>openTxnDetailPanel(id),
    onBulkDelete:(ids)=>{
      const removedReceipts = DB.transactions.filter(t=>ids.includes(t.id)).map(t=>t.receiptId);
      DB.transactions = DB.transactions.filter(t=>!ids.includes(t.id));
      DB.receipts = DB.receipts.filter(r=>!removedReceipts.includes(r.id));
      saveDB(); logActivity("danger", ids.length+" transaction(s) deleted"); notify("Transactions deleted", ids.length+" record(s) removed.","danger");
      renderTxnTable(); renderView("receipts");
    }
  });
}
function openTxnDetailPanel(id){
  const t = DB.transactions.find(x=>x.id===id); if(!t) return;
  const r = DB.receipts.find(x=>x.id===t.receiptId);
  document.getElementById("detailPanel").innerHTML = `
    <div class="detail-head"><div><h2>${esc(t.id)}</h2><div class="sub">${esc(t.plate)} &middot; ${esc(t.bridge)}</div></div><button class="cmd-icon-btn" onclick="App.closeDetail()">&times;</button></div>
    <div class="detail-body">
      <div class="detail-main">
        <div class="detail-section"><h4>Transaction Information</h4>
          <div class="detail-grid">
            <div class="detail-kv"><label>Date / Time</label><div>${esc(t.date)} ${esc(t.time)}</div></div>
            <div class="detail-kv"><label>Bridge</label><div>${esc(t.bridge)}</div></div>
            <div class="detail-kv"><label>Lane</label><div>${esc(t.lane)}</div></div>
            <div class="detail-kv"><label>Direction</label><div>${esc(t.direction)}</div></div>
            <div class="detail-kv"><label>Entry / Exit</label><div>${esc(t.entry)||"—"} &rarr; ${esc(t.exit)||"—"}</div></div>
            <div class="detail-kv"><label>Vehicle</label><div>${esc(t.vehicle)}</div></div>
            <div class="detail-kv"><label>Amount</label><div>${fmtMoney(t.amount)}</div></div>
            <div class="detail-kv"><label>Status</label><div>${badgeStatus(t.status)}</div></div>
            <div class="detail-kv"><label>Employee</label><div>${esc(t.employee)}</div></div>
            <div class="detail-kv"><label>Receipt</label><div class="mono">${esc(t.receiptId)}</div></div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-primary btn-sm" onclick="App.printReceipt('${esc(t.receiptId)}')">Print Receipt</button>
            <button class="btn btn-secondary btn-sm" onclick="App.duplicateTxn('${t.id}')">Duplicate</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openTxnModal('${t.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteTxn('${t.id}')">Delete</button>
          </div>
        </div>
        <div class="detail-section"><h4>Notes</h4><p class="muted">${esc(t.notes)||"No notes recorded."}</p></div>
      </div>
      <div class="detail-side">
        <div class="detail-section"><h4>Timeline</h4>
          <div class="timeline">
            <div class="tl-item"><span class="tl-dot"></span><div class="tl-body"><div class="tl-title">Transaction recorded</div><div class="tl-time">${esc(t.date)} ${esc(t.time)}</div></div></div>
            <div class="tl-item"><span class="tl-dot success"></span><div class="tl-body"><div class="tl-title">Receipt ${esc(t.receiptId)} generated</div><div class="tl-time">${esc(t.employee)}</div></div></div>
          </div>
        </div>
        <div class="detail-section"><h4>Receipt Preview</h4>${r?receiptHTML(r):`<div class="empty-note">Receipt not found.</div>`}</div>
      </div>
    </div>`;
  document.getElementById("detailBackdrop").classList.remove("hidden");
}
function openTxnModal(id, prefillPlate){
  const t = id ? DB.transactions.find(x=>x.id===id) : null;
  const isEdit = !!t;
  const bridgeOpts = DB.bridges.map(b=>`<option value="${esc(b.name)}" ${t?.bridge===b.name?"selected":""}>${esc(b.name)}</option>`).join("");
  const empOpts = DB.employees.map(e=>`<option ${((t?.employee)||DB.settings.defaultEmployee)===e?"selected":""}>${esc(e)}</option>`).join("");
  openModal(isEdit?"Edit Transaction":"New Transaction", `
    <div class="form-grid">
      <div class="f-field"><input id="f_plate" type="text" placeholder=" " value="${esc(t?t.plate:(prefillPlate||""))}" list="dl_plates"><label>Plate Number<span class="req">*</span></label><span class="f-check">&check;</span></div>
      <div class="f-field always-float"><label>Bridge<span class="req">*</span></label><select id="f_bridge" class="filled">${bridgeOpts || `<option value="">No bridges — add one first</option>`}</select></div>
      <div class="f-field"><input id="f_lane" type="text" placeholder=" " value="${t?esc(t.lane):"Lane 1"}"><label>Toll Lane</label></div>
      <div class="f-field always-float"><label>Direction</label><select id="f_dir" class="filled"><option ${t?.direction==="Northbound"?"selected":""}>Northbound</option><option ${t?.direction==="Southbound"?"selected":""}>Southbound</option><option ${t?.direction==="Eastbound"?"selected":""}>Eastbound</option><option ${t?.direction==="Westbound"?"selected":""}>Westbound</option></select></div>
      <div class="f-field"><input id="f_entry" type="text" placeholder=" " value="${t?esc(t.entry):""}"><label>Entry Point</label></div>
      <div class="f-field"><input id="f_exit" type="text" placeholder=" " value="${t?esc(t.exit):""}"><label>Exit Point</label></div>
      <div class="f-field always-float"><label>Date</label><input id="f_date" type="date" value="${t?t.date:nowDate()}"></div>
      <div class="f-field always-float"><label>Time</label><input id="f_time" type="time" value="${t?t.time:nowTime()}"></div>
      <div class="f-field"><input id="f_amount" type="number" step="0.01" placeholder=" " value="${t?t.amount:"5.00"}"><label>Toll Amount (RP)<span class="req">*</span></label></div>
      <div class="f-field always-float"><label>Payment Status</label><select id="f_status" class="filled"><option ${t?.status==="Paid"?"selected":""}>Paid</option><option ${t?.status==="Unpaid"?"selected":""}>Unpaid</option><option ${t?.status==="Pending"?"selected":""}>Pending</option></select></div>
      <div class="f-field always-float"><label>Employee</label><select id="f_emp" class="filled">${empOpts || `<option value="">No employees</option>`}</select></div>
      <div class="f-field full"><textarea id="f_notes" placeholder=" ">${t?esc(t.notes):""}</textarea><label>Notes</label></div>
    </div>
    <datalist id="dl_plates">${DB.vehicles.map(v=>`<option value="${esc(v.plate)}">`).join("")}</datalist>
    <div class="autosave-note"><span class="dot"></span>Draft auto-saves locally as you type.</div>
  `, `<button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.saveTxn(${isEdit?`'${id}'`:null})">Save${isEdit?"":" &amp; Generate Receipt"}</button>`);
  wireFieldValidation("f_plate", v=>v.trim().length>0);
}
function saveTxn(id){
  const plate = document.getElementById("f_plate").value.trim().toUpperCase();
  const bridge = document.getElementById("f_bridge").value;
  const amount = parseFloat(document.getElementById("f_amount").value)||0;
  if(!plate || !bridge){ notify("Missing required fields","Plate and bridge are required.","danger"); return; }
  const data = { plate, bridge, lane:document.getElementById("f_lane").value.trim(), direction:document.getElementById("f_dir").value,
    entry:document.getElementById("f_entry").value.trim(), exit:document.getElementById("f_exit").value.trim(),
    date:document.getElementById("f_date").value||nowDate(), time:document.getElementById("f_time").value||nowTime(),
    amount, status:document.getElementById("f_status").value, employee:document.getElementById("f_emp").value,
    notes:document.getElementById("f_notes").value.trim() };
  const vehicle = findVehicleByPlate(plate);
  data.vehicle = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unregistered";

  if(id){
    const t = DB.transactions.find(x=>x.id===id);
    Object.assign(t, data);
    const r = DB.receipts.find(r=>r.id===t.receiptId);
    if(r) Object.assign(r, { plate:data.plate, bridge:data.bridge, lane:data.lane, vehicle:data.vehicle, amount:data.amount, status:data.status, employee:data.employee, date:data.date, time:data.time });
    notify("Record saved", "Transaction "+id+" updated.", "success"); logActivity("success","Transaction "+id+" updated");
  }else{
    data.id = nextTxnId(); data.receiptId = nextReceiptId();
    DB.transactions.push(data);
    DB.receipts.push({ id:data.receiptId, txnId:data.id, plate:data.plate, bridge:data.bridge, lane:data.lane, vehicle:data.vehicle, amount:data.amount, status:data.status, employee:data.employee, date:data.date, time:data.time });
    notify("Transaction created", "Receipt "+data.receiptId+" generated.", "success"); logActivity("success","Transaction "+data.id+" created &middot; Receipt "+data.receiptId);
  }
  saveDB(); closeModal(); renderView("transactions"); renderView("receipts");
  if(document.getElementById("view-dashboard").classList.contains("active")) renderDashboard();
}
function duplicateTxn(id){
  const t = DB.transactions.find(x=>x.id===id); if(!t) return;
  const copy = Object.assign({}, t, { id:nextTxnId(), receiptId:nextReceiptId(), date:nowDate(), time:nowTime() });
  DB.transactions.push(copy);
  DB.receipts.push({ id:copy.receiptId, txnId:copy.id, plate:copy.plate, bridge:copy.bridge, lane:copy.lane, vehicle:copy.vehicle, amount:copy.amount, status:copy.status, employee:copy.employee, date:copy.date, time:copy.time });
  saveDB(); notify("Transaction duplicated", copy.id+" created.", "success"); logActivity("info","Transaction "+t.id+" duplicated as "+copy.id);
  renderView("transactions"); renderView("receipts");
}
function deleteTxn(id){
  askConfirm("Delete Transaction?", "This will remove "+id+" and its associated receipt.", ()=>{
    const t = DB.transactions.find(x=>x.id===id);
    DB.transactions = DB.transactions.filter(x=>x.id!==id);
    if(t) DB.receipts = DB.receipts.filter(r=>r.id!==t.receiptId);
    saveDB(); notify("Transaction deleted", id+" removed.", "danger"); logActivity("danger","Transaction "+id+" deleted");
    renderView("transactions"); renderView("receipts"); closeDetail();
  });
}

/* ======================================================================
   RECEIPTS TABLE
====================================================================== */
function renderReceiptTable(){
  renderDataTable({
    id:"receipts", mount:"tbl-receipts", title:"Receipts", data:DB.receipts, defaultReverse:true, exportName:"receipts",
    columns:[
      {key:"id", label:"Receipt #", width:180, render:r=>`<span class="mono">${esc(r.id)}</span>`},
      {key:"date", label:"Date", width:100, filterable:true},
      {key:"bridge", label:"Bridge", width:150, filterable:true},
      {key:"plate", label:"Plate", width:100, filterable:true, render:r=>`<span class="mono">${esc(r.plate)}</span>`},
      {key:"amount", label:"Amount", width:100, type:"number", render:r=>`<span class="mono">${fmtMoney(r.amount)}</span>`},
      {key:"status", label:"Status", width:100, filterable:true, type:"select", options:["Paid","Unpaid","Pending","Duplicate"], render:r=>badgeStatus(r.status)},
      {key:"employee", label:"Employee", width:120, filterable:true}
    ],
    rowActions:(r)=>`
      <button class="icon-action" title="View/Print" onclick="App.printReceipt('${r.id}')">&#128065;</button>
      <button class="icon-action" title="Duplicate" onclick="App.duplicateReceipt('${r.id}')">&#128203;</button>
      <button class="icon-action" title="Delete" onclick="App.deleteReceipt('${r.id}')">&#128465;</button>`,
    onOpen:(id)=>printReceipt(id),
    onBulkDelete:(ids)=>{ DB.receipts = DB.receipts.filter(r=>!ids.includes(r.id)); saveDB(); logActivity("danger", ids.length+" receipt(s) deleted"); notify("Receipts deleted", ids.length+" record(s) removed.","danger"); renderReceiptTable(); }
  });
}
function duplicateReceipt(id){
  const r = DB.receipts.find(x=>x.id===id); if(!r) return;
  const copy = Object.assign({}, r, { id:nextReceiptId(), status:"Duplicate" });
  DB.receipts.push(copy); saveDB(); notify("Receipt duplicated", copy.id+" created.", "success"); logActivity("info","Receipt "+id+" duplicated as "+copy.id); renderReceiptTable();
}
function deleteReceipt(id){
  askConfirm("Delete Receipt?", "This will permanently remove receipt "+id+".", ()=>{
    DB.receipts = DB.receipts.filter(r=>r.id!==id);
    saveDB(); notify("Receipt deleted", id+" removed.", "danger"); logActivity("danger","Receipt "+id+" deleted"); renderReceiptTable();
  });
}
function barcodeBars(seed){
  let bars=""; let s=0; for(let i=0;i<seed.length;i++) s+=seed.charCodeAt(i);
  let rnd=s;
  for(let i=0;i<38;i++){ rnd=(rnd*9301+49297)%233280; const h=12+(rnd/233280)*24; bars+=`<span style="height:${h}px"></span>`; }
  return bars;
}
function receiptHTML(r){
  return `<div class="receipt-card">
    <div class="r-logo">BridgeTrack</div><div class="r-sub">TOLL AUTHORITY</div><hr>
    <div class="receipt-row"><span>Receipt #</span><b>${esc(r.id)}</b></div>
    <div class="receipt-row"><span>Transaction ID</span><b>${esc(r.txnId||"—")}</b></div>
    <div class="receipt-row"><span>Date</span><b>${esc(r.date)}</b></div>
    <div class="receipt-row"><span>Time</span><b>${esc(r.time||"—")}</b></div>
    <div class="receipt-row"><span>Bridge</span><b>${esc(r.bridge)}</b></div>
    <div class="receipt-row"><span>Lane</span><b>${esc(r.lane||"—")}</b></div><hr>
    <div class="receipt-row"><span>Plate</span><b>${esc(r.plate)}</b></div>
    <div class="receipt-row"><span>Vehicle</span><b>${esc(r.vehicle||"—")}</b></div>
    <div class="receipt-row"><span>Employee</span><b>${esc(r.employee||"—")}</b></div>
    <div class="receipt-row"><span>Status</span><b>${esc(r.status)}</b></div><hr>
    <div class="receipt-amt">${fmtMoney(r.amount)}</div>
    <div class="receipt-code"><div class="barcode">${barcodeBars(r.id)}</div><div style="font-size:10px;letter-spacing:1px;">${esc(r.id)}</div></div>
    <div class="receipt-footer">This receipt is generated for fictional roleplay purposes only.<br>BridgeTrack Toll Authority &middot; Not a real transaction.</div>
  </div>`;
}
function printReceipt(id){
  const r = DB.receipts.find(x=>x.id===id);
  if(!r){ notify("Receipt not found","","danger"); return; }
  openModal("Receipt "+r.id, `<div>${receiptHTML(r)}</div>`,
    `<button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
     <button class="btn btn-secondary" onclick="App.duplicateReceipt('${r.id}')">Duplicate</button>
     <button class="btn btn-primary" onclick="App.doPrint('${r.id}')">Print / Export PDF</button>`);
}
function doPrint(id){
  const r = DB.receipts.find(x=>x.id===id);
  document.getElementById("printArea").innerHTML = receiptHTML(r);
  window.print();
  notify("Receipt printed", r.id+" sent to printer.", "success"); logActivity("info","Receipt "+r.id+" printed"); saveDB();
}
function printVehicleSummary(id){
  const v = DB.vehicles.find(x=>x.id===id); if(!v) return;
  const crossings = DB.transactions.filter(t=>t.plate.toUpperCase()===v.plate.toUpperCase());
  const cites = DB.citations.filter(c=>c.plate.toUpperCase()===v.plate.toUpperCase());
  document.getElementById("printArea").innerHTML = `<div class="receipt-card" style="max-width:500px;">
    <div class="r-logo">BridgeTrack</div><div class="r-sub">VEHICLE SUMMARY</div><hr>
    <div class="receipt-row"><span>Vehicle ID</span><b>${esc(v.id)}</b></div>
    <div class="receipt-row"><span>Plate</span><b>${esc(v.plate)} (${esc(v.state)})</b></div>
    <div class="receipt-row"><span>Vehicle</span><b>${esc(v.year)} ${esc(v.make)} ${esc(v.model)} · ${esc(v.color)}</b></div>
    <div class="receipt-row"><span>Owner</span><b>${esc(v.owner)}</b></div>
    <div class="receipt-row"><span>Registration</span><b>${esc(v.registration)}</b></div>
    <div class="receipt-row"><span>Insurance</span><b>${esc(v.insurance)}</b></div><hr>
    <div class="receipt-row"><span>Total Crossings</span><b>${crossings.length}</b></div>
    <div class="receipt-row"><span>Total Citations</span><b>${cites.length}</b></div>
    <div class="receipt-footer">Generated ${new Date().toLocaleString()} &middot; Fictional roleplay purposes only.</div>
  </div>`;
  window.print();
  logActivity("info","Vehicle summary printed for "+v.id); saveDB();
}

/* ======================================================================
   BRIDGES
====================================================================== */
function renderBridges(){
  const q = (document.getElementById("bridgeSearch").value||"").toLowerCase();
  let list = DB.bridges.filter(b=>!q || [b.id,b.name,b.location].join(" ").toLowerCase().includes(q));
  const el = document.getElementById("bridgeCards");
  if(!list.length){ el.innerHTML = `<div class="panel"><div class="empty-note">No bridges found. Add one to get started.</div></div>`; return; }
  el.innerHTML = list.map((b,i)=>{
    const usage = DB.transactions.filter(t=>t.bridge===b.name).length;
    return `<div class="stat-card" style="animation-delay:${i*35}ms">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><div class="stat-label">${esc(b.id)}</div><div style="font-family:var(--font-display);font-size:17px;font-weight:800;margin-top:4px;">${esc(b.name)}</div></div>
        ${badgeStatus(b.status)}
      </div>
      <div class="muted" style="margin-top:8px;">${esc(b.location)} &middot; ${esc(b.type)}</div>
      <div class="muted">Lanes: ${esc(b.lanes)} &middot; Speed Limit: ${esc(b.speedLimit)} mph</div>
      <div class="muted">Crossings recorded: ${usage}</div>
      ${b.notes?`<div class="muted" style="margin-top:6px;">${esc(b.notes)}</div>`:""}
      <div class="detail-actions" style="margin-top:12px;">
        <button class="btn btn-secondary btn-sm" onclick="App.openBridgeModal('${b.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="App.deleteBridge('${b.id}')">Delete</button>
      </div>
    </div>`;
  }).join("");
}
function openBridgeModal(id){
  const b = id? DB.bridges.find(x=>x.id===id) : null;
  openModal(b?"Edit Bridge":"New Bridge", `
    <div class="form-grid">
      <div class="f-field full"><input id="f_name" type="text" placeholder=" " value="${b?esc(b.name):""}"><label>Bridge Name<span class="req">*</span></label></div>
      <div class="f-field"><input id="f_loc" type="text" placeholder=" " value="${b?esc(b.location):""}"><label>Location</label></div>
      <div class="f-field"><input id="f_type" type="text" placeholder=" " value="${b?esc(b.type):""}"><label>Bridge Type</label></div>
      <div class="f-field"><input id="f_lanes" type="number" placeholder=" " value="${b?b.lanes:"4"}"><label>Number of Lanes</label></div>
      <div class="f-field"><input id="f_speed" type="number" placeholder=" " value="${b?b.speedLimit:"45"}"><label>Speed Limit</label></div>
      <div class="f-field always-float"><label>Status</label><select id="f_status" class="filled"><option ${b?.status==="Open"?"selected":""}>Open</option><option ${b?.status==="Closed"?"selected":""}>Closed</option><option ${b?.status==="Construction"?"selected":""}>Construction</option></select></div>
      <div class="f-field full"><textarea id="f_notes" placeholder=" ">${b?esc(b.notes):""}</textarea><label>Notes</label></div>
    </div>
  `, `<button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.saveBridge(${id?`'${id}'`:null})">Save Bridge</button>`);
  wireFieldValidation("f_name", v=>v.trim().length>0);
}
function saveBridge(id){
  const name = document.getElementById("f_name").value.trim();
  if(!name){ notify("Bridge name required","","danger"); return; }
  const data = { name, location:document.getElementById("f_loc").value.trim(), type:document.getElementById("f_type").value.trim(),
    lanes:document.getElementById("f_lanes").value, speedLimit:document.getElementById("f_speed").value,
    status:document.getElementById("f_status").value, notes:document.getElementById("f_notes").value.trim() };
  if(id){ Object.assign(DB.bridges.find(b=>b.id===id), data); notify("Record saved","Bridge updated.","success"); logActivity("success","Bridge "+id+" updated"); }
  else{ data.id = nextBridgeId(); DB.bridges.push(data); notify("Bridge created", data.id+" added.", "success"); logActivity("success","Bridge "+data.id+" created"); }
  saveDB(); closeModal(); renderView("bridges");
}
function deleteBridge(id){
  const b = DB.bridges.find(x=>x.id===id);
  askConfirm("Delete Bridge?", "This will remove "+(b?b.name:id)+" from the database.", ()=>{
    DB.bridges = DB.bridges.filter(x=>x.id!==id);
    saveDB(); notify("Bridge deleted", (b?b.name:id)+" removed.", "danger"); logActivity("danger","Bridge "+id+" deleted"); renderView("bridges");
  });
}

/* ======================================================================
   CITATIONS TABLE
====================================================================== */
function renderCitationTable(){
  renderDataTable({
    id:"citations", mount:"tbl-citations", title:"Citations", data:DB.citations, defaultReverse:true, newLabel:"+ Issue Citation",
    onNew:()=>openCitationModal(null), exportName:"citations",
    columns:[
      {key:"id", label:"Citation ID", width:140, render:r=>`<span class="mono">${esc(r.id)}</span>`},
      {key:"date", label:"Date", width:100, filterable:true},
      {key:"plate", label:"Plate", width:100, filterable:true, render:r=>`<span class="mono">${esc(r.plate)}</span>`},
      {key:"reason", label:"Reason", width:170, filterable:true},
      {key:"fine", label:"Fine", width:100, type:"number", render:r=>`<span class="mono">${fmtMoney(r.fine)}</span>`},
      {key:"status", label:"Status", width:100, filterable:true, type:"select", options:["Issued","Paid","Disputed","Resolved"], render:r=>badgeStatus(r.status)}
    ],
    rowActions:(c)=>`
      <button class="icon-action" title="Edit" onclick="App.openCitationModal('${c.id}')">&#9998;</button>
      <button class="icon-action" title="Delete" onclick="App.deleteCitation('${c.id}')">&#128465;</button>`,
    onOpen:(id)=>openCitationModal(id),
    onBulkDelete:(ids)=>{ DB.citations = DB.citations.filter(c=>!ids.includes(c.id)); saveDB(); logActivity("danger", ids.length+" citation(s) deleted"); notify("Citations deleted", ids.length+" record(s) removed.","danger"); renderCitationTable(); }
  });
}
function openCitationModal(id, prefillPlate){
  const c = id? DB.citations.find(x=>x.id===id) : null;
  const bridgeOpts = DB.bridges.map(b=>`<option value="${esc(b.name)}" ${c?.bridge===b.name?"selected":""}>${esc(b.name)}</option>`).join("");
  const empOpts = DB.employees.map(e=>`<option ${((c?.employee)||DB.settings.defaultEmployee)===e?"selected":""}>${esc(e)}</option>`).join("");
  openModal(c?"Edit Citation":"Issue Citation", `
    <div class="form-grid">
      <div class="f-field"><input id="f_plate" type="text" placeholder=" " value="${esc(c?c.plate:(prefillPlate||""))}" list="dl_plates2"><label>Plate Number<span class="req">*</span></label></div>
      <div class="f-field always-float"><label>Bridge</label><select id="f_bridge" class="filled">${bridgeOpts||`<option value="">—</option>`}</select></div>
      <div class="f-field full"><input id="f_reason" type="text" placeholder=" " value="${c?esc(c.reason):""}"><label>Reason<span class="req">*</span></label></div>
      <div class="f-field"><input id="f_fine" type="number" step="0.01" placeholder=" " value="${c?c.fine:"75.00"}"><label>Fine Amount (RP)</label></div>
      <div class="f-field always-float"><label>Date</label><input id="f_date" type="date" value="${c?c.date:nowDate()}"></div>
      <div class="f-field always-float"><label>Employee</label><select id="f_emp" class="filled">${empOpts||`<option value="">—</option>`}</select></div>
      <div class="f-field always-float"><label>Status</label><select id="f_status" class="filled"><option ${c?.status==="Issued"?"selected":""}>Issued</option><option ${c?.status==="Paid"?"selected":""}>Paid</option><option ${c?.status==="Disputed"?"selected":""}>Disputed</option><option ${c?.status==="Resolved"?"selected":""}>Resolved</option></select></div>
      <div class="f-field full"><textarea id="f_notes" placeholder=" ">${c?esc(c.notes):""}</textarea><label>Notes</label></div>
    </div>
    <datalist id="dl_plates2">${DB.vehicles.map(v=>`<option value="${esc(v.plate)}">`).join("")}</datalist>
  `, `<button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.saveCitation(${id?`'${id}'`:null})">Save Citation</button>`);
  wireFieldValidation("f_plate", v=>v.trim().length>0);
}
function saveCitation(id){
  const plate = document.getElementById("f_plate").value.trim().toUpperCase();
  const reason = document.getElementById("f_reason").value.trim();
  if(!plate || !reason){ notify("Missing required fields","Plate and reason are required.","danger"); return; }
  const data = { plate, reason, bridge:document.getElementById("f_bridge").value, fine:parseFloat(document.getElementById("f_fine").value)||0,
    date:document.getElementById("f_date").value||nowDate(), employee:document.getElementById("f_emp").value,
    status:document.getElementById("f_status").value, notes:document.getElementById("f_notes").value.trim() };
  const v = findVehicleByPlate(plate); data.vehicle = v? `${v.year} ${v.make} ${v.model}` : "Unregistered";
  if(id){ Object.assign(DB.citations.find(c=>c.id===id), data); notify("Record saved","Citation updated.","success"); logActivity("success","Citation "+id+" updated"); }
  else{ data.id = nextCitationId(); DB.citations.push(data); notify("Citation issued", data.id+" created.", "warn"); logActivity("warn","Citation "+data.id+" issued"); }
  saveDB(); closeModal(); renderView("citations");
  if(document.getElementById("view-dashboard").classList.contains("active")) renderDashboard();
}
function deleteCitation(id){
  askConfirm("Delete Citation?", "This will permanently remove citation "+id+".", ()=>{
    DB.citations = DB.citations.filter(c=>c.id!==id);
    saveDB(); notify("Citation deleted", id+" removed.", "danger"); logActivity("danger","Citation "+id+" deleted"); renderView("citations");
  });
}

/* ======================================================================
   REPORTS
====================================================================== */
function rangeStart(range){
  const d = new Date();
  if(range==="daily"){ d.setHours(0,0,0,0); return d; }
  if(range==="weekly"){ d.setDate(d.getDate()-7); return d; }
  if(range==="monthly"){ d.setMonth(d.getMonth()-1); return d; }
  if(range==="yearly"){ d.setFullYear(d.getFullYear()-1); return d; }
  return new Date(0);
}
function renderReports(){
  const range = document.getElementById("reportRange").value;
  const start = rangeStart(range);
  const txns = DB.transactions.filter(t=> new Date(t.date+"T"+(t.time||"00:00")) >= start);
  const cites = DB.citations.filter(c=> new Date(c.date) >= start);
  const revenue = txns.filter(t=>t.status==="Paid").reduce((s,t)=>s+Number(t.amount),0);
  const bridgeCounts = {}; txns.forEach(t=>bridgeCounts[t.bridge]=(bridgeCounts[t.bridge]||0)+1);
  const topBridge = Object.entries(bridgeCounts).sort((a,b)=>b[1]-a[1])[0];
  const plateCounts = {}; txns.forEach(t=>plateCounts[t.plate]=(plateCounts[t.plate]||0)+1);
  const topPlate = Object.entries(plateCounts).sort((a,b)=>b[1]-a[1])[0];
  const empCounts = {}; txns.forEach(t=>empCounts[t.employee]=(empCounts[t.employee]||0)+1);
  const topEmp = Object.entries(empCounts).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById("reportCards").innerHTML = [
    ["Total Transactions", txns.length, ""], ["Revenue (RP)", fmtMoney(revenue), "accent-success"],
    ["Top Used Bridge", topBridge? topBridge[0]+" ("+topBridge[1]+")":"—", ""],
    ["Most Active Plate", topPlate? topPlate[0]+" ("+topPlate[1]+")":"—", ""],
    ["Most Active Employee", topEmp? topEmp[0]+" ("+topEmp[1]+")":"—", ""],
    ["Total Citations", cites.length, "accent-danger"]
  ].map((c,i)=>`<div class="stat-card" style="animation-delay:${i*35}ms"><div class="stat-label">${c[0]}</div><div class="stat-value ${c[2]}">${c[1]}</div></div>`).join("");

  drawBarChart("chartRevenue", groupByDay(txns, t=>t.status==="Paid"?Number(t.amount):0), "#3FA679");
  drawBarChart("chartTxns", groupByDay(txns, ()=>1), "#3B6FD9");
  drawBarChart("chartBridges", Object.entries(bridgeCounts).map(([k,v])=>({label:k.split(" ")[0],value:v})), "#8FB3FA");
  drawBarChart("chartCitations", groupByDay(cites, ()=>1), "#E8963C");
}
function groupByDay(items, valFn){
  const map={}; items.forEach(it=>{ const d=it.date; map[d]=(map[d]||0)+valFn(it); });
  return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14).map(([k,v])=>({label:k.slice(5),value:v}));
}
function drawBarChart(canvasId, data, color){
  const canvas = document.getElementById(canvasId); const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio||1; const w=canvas.clientWidth||300, h=180;
  canvas.width=w*dpr; canvas.height=h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  if(!data.length){ ctx.fillStyle="#5B6A87"; ctx.font="12px Inter"; ctx.fillText("No data for this range",10,90); return; }
  const max = Math.max(...data.map(d=>d.value),1);
  const padL=10, padB=24, padT=10, barGap=6;
  const barW = (w-padL*2)/data.length - barGap;
  data.forEach((d,i)=>{
    const bh = ((h-padB-padT) * (d.value/max));
    const x = padL+i*(barW+barGap); const y = h-padB-bh;
    ctx.fillStyle=color; ctx.globalAlpha=.9;
    roundRectPath(ctx,x,y,Math.max(barW,3),Math.max(bh,2),3); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle="#5B6A87"; ctx.font="9px 'IBM Plex Mono'"; ctx.textAlign="center"; ctx.fillText(d.label, x+barW/2, h-8);
    if(d.value>0){ ctx.fillStyle="#E8EDF6"; ctx.font="9px Inter"; ctx.fillText(String(d.value), x+barW/2, y-4); }
  });
}
function roundRectPath(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function printReport(){
  const range = document.getElementById("reportRange").value;
  const cards = document.getElementById("reportCards").innerHTML;
  document.getElementById("printArea").innerHTML = `<div class="receipt-card" style="max-width:520px;">
    <div class="r-logo">BridgeTrack</div><div class="r-sub">${range.toUpperCase()} REPORT</div><hr>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${cards.replace(/class="stat-card"[^>]*/g,'style="border:1px solid #ddd;border-radius:8px;padding:8px;"').replace(/class="stat-label"/g,'style="font-size:9px;color:#666;"').replace(/class="stat-value[^"]*"/g,'style="font-size:16px;font-weight:800;"')}</div>
    <div class="receipt-footer">Generated ${new Date().toLocaleString()} &middot; Fictional roleplay purposes only.</div>
  </div>`;
  window.print();
  notify("Report printed", range+" report sent to printer.", "success"); logActivity("info", range+" report printed"); saveDB();
}

/* ======================================================================
   SETTINGS
====================================================================== */
function renderSettings(){
  document.getElementById("employeeList").innerHTML = DB.employees.length? DB.employees.map(e=>`<div class="chip">${esc(e)}<button onclick="App.removeEmployee('${esc(e)}')">&times;</button></div>`).join("") : `<div class="empty-note">No employees added yet.</div>`;
  const sel = document.getElementById("defaultEmployee");
  sel.innerHTML = DB.employees.map(e=>`<option ${DB.settings.defaultEmployee===e?"selected":""}>${esc(e)}</option>`).join("") || `<option value="">—</option>`;
}
function addEmployee(){
  const input = document.getElementById("employeeName"); const name = input.value.trim();
  if(!name){ notify("Enter a name","","warn"); return; }
  if(DB.employees.includes(name)){ notify("Employee already exists","","warn"); return; }
  DB.employees.push(name); if(!DB.settings.defaultEmployee) DB.settings.defaultEmployee = name;
  saveDB(); input.value=""; notify("Employee added", name, "success"); logActivity("success","Employee "+name+" added"); renderSettings();
}
function removeEmployee(name){
  DB.employees = DB.employees.filter(e=>e!==name);
  if(DB.settings.defaultEmployee===name) DB.settings.defaultEmployee = DB.employees[0]||"";
  saveDB(); renderSettings(); notify("Employee removed", name, "danger"); logActivity("danger","Employee "+name+" removed");
}
function exportDb(){
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href=url; a.download="bridgetrack-backup-"+nowDate()+".json"; a.click(); URL.revokeObjectURL(url);
  notify("Backup successful", "Database exported to JSON.", "success"); logActivity("success","Database exported"); saveDB();
}
function importDb(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{ DB = Object.assign(defaultDB(), JSON.parse(reader.result)); saveDB(); notify("Database imported","Import successful.","success"); logActivity("success","Database imported"); saveDB(); gotoView("dashboard"); }
    catch(e){ notify("Import failed","Invalid database file.","danger"); }
  };
  reader.readAsText(file);
}
function resetDb(){
  askConfirm("Reset Entire Database?", "This will permanently delete all vehicles, transactions, receipts, bridges, citations, and settings. This cannot be undone.", ()=>{
    DB = seedDB(defaultDB()); saveDB(); notify("Database reset","All records cleared.","warn"); gotoView("dashboard");
  }, "Reset");
}

/* ======================================================================
   GLOBAL SEARCH
====================================================================== */
function globalSearch(q){
  const box = document.getElementById("globalSearchResults");
  q = q.trim();
  if(!q){ box.classList.add("hidden"); box.innerHTML=""; return; }
  const ql = q.toLowerCase(); const results = [];
  DB.vehicles.forEach(v=>{ if(v.plate.toLowerCase().includes(ql)||v.id.toLowerCase().includes(ql)) results.push({tag:"Vehicle", label:`${v.plate} — ${v.make} ${v.model}`, action:()=>{gotoView("lookup"); showVehicleDetail(v.id);}}); });
  DB.transactions.forEach(t=>{ if(t.id.toLowerCase().includes(ql)||t.plate.toLowerCase().includes(ql)) results.push({tag:"Transaction", label:`${t.id} — ${t.plate} · ${fmtMoney(t.amount)}`, action:()=>{gotoView("transactions");}}); });
  DB.receipts.forEach(r=>{ if(r.id.toLowerCase().includes(ql)||r.plate.toLowerCase().includes(ql)) results.push({tag:"Receipt", label:`${r.id} — ${r.plate}`, action:()=>{gotoView("receipts"); printReceipt(r.id);}}); });
  DB.bridges.forEach(b=>{ if(b.name.toLowerCase().includes(ql)||b.id.toLowerCase().includes(ql)) results.push({tag:"Bridge", label:`${b.id} — ${b.name}`, action:()=>{gotoView("bridges");}}); });
  DB.citations.forEach(c=>{ if(c.id.toLowerCase().includes(ql)||c.plate.toLowerCase().includes(ql)) results.push({tag:"Citation", label:`${c.id} — ${c.plate} · ${c.reason}`, action:()=>{gotoView("citations");}}); });
  DB.employees.forEach(e=>{ if(e.toLowerCase().includes(ql)) results.push({tag:"Employee", label:e, action:()=>{gotoView("settings");}}); });

  if(!results.length){ box.innerHTML = `<div class="gsr-item">No matches for "${esc(q)}"</div>`; box.classList.remove("hidden"); return; }
  box.innerHTML = results.slice(0,20).map((r,i)=>`<div class="gsr-item" data-idx="${i}"><span>${esc(r.label)}</span><span class="gsr-tag">${r.tag}</span></div>`).join("");
  box.classList.remove("hidden");
  [...box.children].forEach((el,i)=> el.onclick = ()=>{ results[i].action(); box.classList.add("hidden"); document.getElementById("globalSearch").value=""; });
}
function gotoLookupVehicle(id){ gotoView("lookup"); showVehicleDetail(id); }

/* ======================================================================
   WIRE UP UI
====================================================================== */
document.addEventListener("DOMContentLoaded", ()=>{
  document.querySelectorAll(".nav-item, .bn-item, .sheet-item").forEach(btn=> btn.addEventListener("click", ()=> gotoView(btn.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(btn=> btn.addEventListener("click", ()=> gotoView(btn.dataset.goto)));

  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
  document.getElementById("activityToggle").addEventListener("click", toggleActivity);
  document.getElementById("activityClose").addEventListener("click", toggleActivity);
  document.getElementById("scrim").addEventListener("click", ()=>{ closeMobileSidebar(); document.getElementById("moreSheet").classList.add("hidden"); document.getElementById("scrim").classList.remove("show"); });

  document.getElementById("globalSearch").addEventListener("input", e=> globalSearch(e.target.value));
  document.getElementById("bridgeSearch").addEventListener("input", renderBridges);
  document.getElementById("reportRange").addEventListener("change", renderReports);

  document.getElementById("lookupBtn").addEventListener("click", doLookup);
  document.getElementById("lookupInput").addEventListener("keydown", e=>{ if(e.key==="Enter") doLookup(); });
  document.getElementById("addBridgeBtn").addEventListener("click", ()=>openBridgeModal(null));
  document.getElementById("addEmployeeBtn").addEventListener("click", addEmployee);
  document.getElementById("employeeName").addEventListener("keydown", e=>{ if(e.key==="Enter") addEmployee(); });
  document.getElementById("defaultEmployee").addEventListener("change", e=>{ DB.settings.defaultEmployee=e.target.value; saveDB(); notify("On-duty employee updated", e.target.value, "success"); });
  document.getElementById("exportDbBtn").addEventListener("click", exportDb);
  document.getElementById("importDbBtn").addEventListener("click", ()=> document.getElementById("importFileInput").click());
  document.getElementById("importFileInput").addEventListener("change", e=>{ if(e.target.files[0]) importDb(e.target.files[0]); e.target.value=""; });
  document.getElementById("resetDbBtn").addEventListener("click", resetDb);
  document.getElementById("printReportBtn").addEventListener("click", printReport);

  document.getElementById("qaNewTxn").addEventListener("click", ()=>openTxnModal(null));
  document.getElementById("qaNewVehicle").addEventListener("click", ()=>openVehicleModal(null));
  document.getElementById("qaNewCitation").addEventListener("click", ()=>openCitationModal(null));
  document.getElementById("qaLookup").addEventListener("click", ()=>gotoView("lookup"));
  document.getElementById("qaExport").addEventListener("click", exportDb);

  document.getElementById("confirmCancel").addEventListener("click", ()=> document.getElementById("confirmBackdrop").classList.add("hidden"));
  document.getElementById("confirmOk").addEventListener("click", ()=>{ document.getElementById("confirmBackdrop").classList.add("hidden"); if(confirmCallback) confirmCallback(); confirmCallback=null; });

  document.addEventListener("click", e=>{
    if(e.target.id==="modalBackdrop") closeModal();
    if(e.target.id==="detailBackdrop") closeDetail();
    if(e.target.id==="confirmBackdrop") document.getElementById("confirmBackdrop").classList.add("hidden");
    if(!e.target.closest(".cmd-search") && !e.target.closest(".global-search-results")) document.getElementById("globalSearchResults").classList.add("hidden");
  });

  // keyboard-first navigation
  document.addEventListener("keydown", e=>{
    if(e.key==="/" && document.activeElement.tagName!=="INPUT" && document.activeElement.tagName!=="TEXTAREA"){ e.preventDefault(); document.getElementById("globalSearch").focus(); }
    if(e.key==="Escape"){ closeModal(); closeDetail(); document.getElementById("confirmBackdrop").classList.add("hidden"); document.getElementById("moreSheet").classList.add("hidden"); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="b"){ e.preventDefault(); toggleSidebar(); }
  });

  tickClock(); setInterval(tickClock, 1000);
  refreshChrome();
  gotoView("dashboard");
});

/* expose API for inline handlers */
window.App = {
  closeModal, closeDetail, showVehicleDetail, gotoLookupVehicle,
  openVehicleModal, saveVehicle, deleteVehicle,
  openTxnModal, saveTxn, duplicateTxn, deleteTxn,
  printReceipt, doPrint, duplicateReceipt, deleteReceipt, printVehicleSummary,
  openBridgeModal, saveBridge, deleteBridge,
  openCitationModal, saveCitation, deleteCitation,
  removeEmployee, gotoView
};

})();
