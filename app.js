
try{(function(){
  const CATEGORIES = [
    {id:"work",label:"💼 Công việc",color:"#e53935"},
    {id:"study",label:"📚 Học tập",color:"#1e88e5"},
    {id:"health",label:"🏃 Sức khỏe",color:"#43a047"},
    {id:"personal",label:"🧘 Cá nhân",color:"#fb8c00"},
    {id:"finance",label:"💰 Tài chính",color:"#8e24aa"},
    {id:"other",label:"📌 Khác",color:"#757575"}
  ];
  const PRIORITIES = {high:{label:"🔴 Cao",color:"#e53935"},medium:{label:"🟡 TB",color:"#fb8c00"},low:{label:"🟢 Thấp",color:"#43a047"}};
  const FB_BASE="https://hagiang-planner-default-rtdb.firebaseio.com";

    function fbFetch(path,method,body){
    const enc=path?path.split("/").map(s=>encodeURIComponent(s)).join("/"):"";
    const url=FB_BASE+"/daily-tracker/"+enc+".json";
    if(!method||method==="GET"){
      return new Promise(function(resolve){
        var id="cb_"+Date.now();
        window[id]=function(data){resolve(data);cleanup()};
        var s=document.createElement("script");
        s.src=url+"?callback="+id+"&t="+Date.now();
        function cleanup(){delete window[id];if(s.parentNode)s.parentNode.removeChild(s)}
        s.onerror=function(){cleanup();resolve(null)};
        s.onload=function(){if(window[id]){cleanup();resolve(null)}};
        document.body.appendChild(s);
        setTimeout(function(){if(window[id]){cleanup();resolve(null)}},8000);
      });
    }
    return fetch(url,{method:method,body:body?JSON.stringify(body):void 0,headers:{"Content-Type":"application/json"}})
      .then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
      .catch(function(e){console.error("fbFetch write error:",e.message,url);return null});
  }

  function saveToLocal(){
    try{localStorage.setItem("dt_tasks_"+me,JSON.stringify(tasks))}catch(e){}
  }
  function loadFromLocal(){
    try{
      const d=localStorage.getItem("dt_tasks_"+me);
      if(d){tasks=JSON.parse(d);return true}
    }catch(e){}
    return false;
  }

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const today = ()=>new Date().toISOString().slice(0,10);
  const fmtDate = d=>{const o=new Date(d+"T12:00:00");return o.toLocaleDateString("vi-VN",{weekday:"long",day:"numeric",month:"numeric",year:"numeric"})};
  const shortDate = d=>{const o=new Date(d+"T12:00:00");return o.toLocaleDateString("vi-VN",{day:"numeric",month:"numeric"})};
  const genId = ()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

  let me = localStorage.getItem("dt_me")||null;
  let tasks = {};
  let currentDate = today();
  let rateChart=null, dailyChart=null, catChart=null;

  // Firebase connection
  let pollTimer=null;
  function startPolling(name){
    if(pollTimer) clearInterval(pollTimer);
    if(!name) return;
    async function poll(){
      try{
        const dot=$("#fb-dot"),txt=$("#fb-text");
        const data=await fbFetch(name);
        if(data!==null){
          dot.className="dot green";txt.textContent="Đã đồng bộ";
          tasks=Object.fromEntries(Object.entries(data||{}).filter(([k])=>k!=="_categories"&&k!=="_routines"));
          saveToLocal();
          renderTasks();
          renderHistory("week");
          updateCharts("week");
        }else{
          dot.className="dot red";txt.textContent="Mất kết nối";
          if(Object.keys(tasks).length===0&&loadFromLocal()){renderTasks();renderHistory("week")}
        }
      }catch(e){console.error("poll error:",e)}
    }
    poll();
    pollTimer=setInterval(poll,5000);
  }

  function saveTask(id,task){
    if(!me) return;
    tasks[id]=task;
    saveToLocal();
    fbFetch(me+"/"+id,"PUT",task);
  }

  function deleteTask(id){
    if(!me) return;
    delete tasks[id];
    saveToLocal();
    fbFetch(me+"/"+id,"DELETE");
  }

  function getDayTasks(date){
    return Object.entries(tasks).filter(([_,t])=>t.date===date).sort((a,b)=>a.createdAt-b.createdAt);
  }

  function getCompleted(dt){
    return getDayTasks(dt).filter(([_,t])=>t.done).length;
  }

  function getTotal(dt){
    return getDayTasks(dt).length;
  }

  function getDatesInRange(start,end){
    const dates=[];
    let d=new Date(start+"T12:00:00");
    const e=new Date(end+"T12:00:00");
    while(d<=e){dates.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}
    return dates;
  }

  function calcStreak(){
    let streak=0;
    let d=new Date();
    while(true){
      const ds=d.toISOString().slice(0,10);
      const ttl=getTotal(ds);
      if(ttl===0) break;
      const done=getCompleted(ds);
      if(done/ttl<1) break;
      streak++;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  // Stats history
  function getHistory(period){
    const now=new Date();
    let start;
    switch(period){
      case"week":start=new Date(now);start.setDate(now.getDate()-6);break;
      case"month":start=new Date(now);start.setMonth(now.getMonth()-1);break;
      case"year":start=new Date(now);start.setFullYear(now.getFullYear()-1);break;
      default:start=new Date("2020-01-01");break;
    }
    const dates=getDatesInRange(start.toISOString().slice(0,10),today());
    return dates.map(d=>{
      const total=getTotal(d),done=getCompleted(d);
      return{date:d,total,done,rate:total?Math.round(done/total*100):0};
    });
  }

  function getCatData(date){
    const dayTasks=getDayTasks(date);
    const catCount={};
    CATEGORIES.forEach(c=>catCount[c.id]={total:0,done:0});
    dayTasks.forEach(([_,t])=>{
      const c=t.category||"other";
      if(!catCount[c]) catCount[c]={total:0,done:0};
      catCount[c].total++;
      if(t.done) catCount[c].done++;
    });
    return catCount;
  }

  // Sound
  let audioCtx=null;
  function initAudio(){if(!audioCtx) try{audioCtx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  function playSound(){
    try{
      if(!audioCtx) return;
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      osc.connect(gain);gain.connect(audioCtx.destination);
      osc.frequency.value=880;osc.type="sine";
      gain.gain.setValueAtTime(.3,audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.01,audioCtx.currentTime+.3);
      osc.start(audioCtx.currentTime);osc.stop(audioCtx.currentTime+.3);
    }catch(e){}
  }
  let alertNodes=[];
  function playAlert(){
    try{
      if(!audioCtx) return;
      const now=audioCtx.currentTime;
      const nodes=[];
      const melody=[523,587,659,784];
      for(let r=0;r<4;r++){
        melody.forEach((f,i)=>{
          const t0=now+r*2.1+i*0.28;
          [1,4.01].forEach((ratio,j)=>{
            const osc=audioCtx.createOscillator();
            const gain=audioCtx.createGain();
            osc.connect(gain);gain.connect(audioCtx.destination);
            osc.type="sine";
            osc.frequency.value=f*ratio;
            const vol=j===0?0.5:0.12;
            gain.gain.setValueAtTime(vol,t0);
            gain.gain.exponentialRampToValueAtTime(0.001,t0+0.35);
            osc.start(t0);osc.stop(t0+0.4);
            nodes.push(osc,gain);
          });
        });
      }
      alertNodes=alertNodes.concat(nodes);
    }catch(e){}
  }
  function stopAlertNow(){
    alertNodes.forEach(n=>{try{if(n.stop)n.stop();if(n.disconnect)n.disconnect()}catch(e){}});
    alertNodes=[];
  }

  function isOverdue(t){
    if(t.done||!t.scheduledTime||t.date!==today()) return false;
    const now=new Date();
    const [h,m]=t.scheduledTime.split(":").map(Number);
    const sched=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m);
    return (now-sched)>0;
  }

  let alertTimer=null, alertBurstTimer=null, alertRound=0;

  function startBurstAlert(){
    stopBurstAlert();
    if(!me) return;
    const hasOverdue=Object.entries(tasks).some(([id,t])=>isOverdue(t));
    if(!hasOverdue) return;
    alertRound++;
    if(alertRound>3) return;
    let count=0;
    function playRound(){
      if(count>=30||!Object.values(tasks).some(t=>!t.done&&isOverdue(t))){
        scheduleNextBurst();
        return;
      }
      playAlert();
      count++;
      alertBurstTimer=setTimeout(playRound,2000);
    }
    playRound();
  }

  function stopBurstAlert(){
    stopAlertNow();
    if(alertBurstTimer){clearTimeout(alertBurstTimer);alertBurstTimer=null}
    if(alertTimer){clearTimeout(alertTimer);alertTimer=null}
    alertRound=0;
  }

  function scheduleNextBurst(){
    if(alertBurstTimer){clearTimeout(alertBurstTimer);alertBurstTimer=null}
    if(!Object.values(tasks).some(t=>!t.done&&isOverdue(t))){alertRound=0;return}
    alertTimer=setTimeout(startBurstAlert,300000);
  }

  function checkOverdueTasks(){
    if(!me) return;
    const hasOverdue=Object.entries(tasks).some(([id,t])=>isOverdue(t));
    if(hasOverdue&&!alertTimer&&!alertBurstTimer) startBurstAlert();
    else if(!hasOverdue) stopBurstAlert();
    renderTasks();
  }
    const dt=currentDate;
    const total=getTotal(dt);
    const done=getCompleted(dt);
    const pending=total-done;
    const rate=total?Math.round(done/total*100):0;
    const streak=calcStreak();
    $("#stat-total").textContent=total;
    $("#stat-done").textContent=done;
    $("#stat-pending").textContent=pending;
    $("#stat-rate").textContent=rate+"%";
    $("#stat-streak").textContent=streak;
    $("#progress-bar").style.width=rate+"%";
    const cv=$("#mini-chart");
    if(cv){
      const ctx=cv.getContext("2d");
      const w=cv.width,h=cv.height,cx=w/2,cy=h/2,r=22;
      ctx.clearRect(0,0,w,h);
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle="#e0d8c6";ctx.lineWidth=6;ctx.stroke();
      if(rate>0){
        ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,(-Math.PI/2)+(Math.PI*2*rate/100));ctx.strokeStyle="#2e7d32";ctx.lineWidth=6;ctx.lineCap="round";ctx.stroke();
      }
      ctx.fillStyle="var(--text)";ctx.font="bold 12px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(rate+"%",cx,cy);
    }
  }

  function renderTasks(){
    const dt=currentDate;
    const dayTasks=getDayTasks(dt);
    const host=$("#task-list");
    host.innerHTML="";

    if(dayTasks.length===0){
      host.innerHTML='<div class="empty-state"><div class="icon">✅</div><p>Chưa có công việc nào hôm nay</p></div>';
      renderStats();
      return;
    }

    // Group by category
    const grouped={};
    CATEGORIES.forEach(c=>grouped[c.id]=[]);
    dayTasks.forEach(([id,t])=>{
      const cat=t.category||"other";
      if(!grouped[cat]) grouped[cat]=[];
      grouped[cat].push([id,t]);
    });

    CATEGORIES.forEach(c=>{
      if(!grouped[c.id]||grouped[c.id].length===0) return;
      const frag=document.createDocumentFragment();
      const hdr=document.createElement("div");
      hdr.className="category-header";
      hdr.innerHTML=`<span>${c.label}</span> <span style="font-size:12px;font-weight:400">(${grouped[c.id].filter(([_,t])=>t.done).length}/${grouped[c.id].length})</span>`;
      frag.appendChild(hdr);

      grouped[c.id].forEach(([id,t])=>{
        const card=document.createElement("div");
        const ov=isOverdue(t);
        card.className="task-card"+(ov?" overdue":"");
        card.innerHTML=`
          <div class="check-wrap ${t.done?"done":""}" data-id="${id}"></div>
          <div class="task-body">
            <div class="task-title ${t.done?"done":""}">${esc(t.title)}</div>
            <div class="task-meta">
              ${t.scheduledTime?`<span class="time-badge">${t.scheduledTime}</span>`:""}
              <span class="cat-badge" style="background:${c.color}22;color:${c.color}">${c.label}</span>
              <span class="priority-dot" style="background:${PRIORITIES[t.priority||"medium"].color}" title="${PRIORITIES[t.priority||"medium"].label}"></span>
              <span class="time">${t.createdAt?shortDate2(t.createdAt):""}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="small" onclick="window.dtEdit('${id}')" title="Sửa">✏️</button>
            <button class="small danger" onclick="window.dtDel('${id}')" title="Xoá">🗑️</button>
          </div>
        `;
        card.querySelector(".check-wrap").addEventListener("click",()=>toggleTask(id));
        frag.appendChild(card);
      });
      host.appendChild(frag);
    });

    // Check pending alert
    const pending=getDayTasks(dt).filter(([_,t])=>!t.done).length;
    if(pending>0&&dt===today()){
      // Show pending count
    }
    renderStats();
  }

  function shortDate2(ts){
    const d=new Date(ts);
    return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});
  }

  function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
  function escCsv(s){return `"${(s||"").replace(/"/g,'""')}"`}
  function getAllTasksFlat(){
    const all=Object.values(tasks).filter(t=>t.date);
    const dateMap={};
    all.forEach(t=>{
      if(!dateMap[t.date]) dateMap[t.date]=[];
      dateMap[t.date].push(t);
    });
    return Object.keys(dateMap).sort().map(d=>({date:d,items:dateMap[d].sort((a,b)=>a.createdAt-b.createdAt)}));
  }
  function exportCSV(){
    const data=getAllTasksFlat();
    let csv="Ngày;Giờ;Công việc;Danh mục;Ưu tiên;Trạng thái\n";
    data.forEach(({date,items})=>{
      items.forEach(t=>{
        const cat=CATEGORIES.find(c=>c.id===(t.category||"other"))?.label||"Khác";
        const pri=PRIORITIES[t.priority||"medium"]?.label||"TB";
        const st=t.done?"Hoàn thành":"Chưa xong";
        csv+=`${escCsv(date)};${escCsv(t.scheduledTime)};${escCsv(t.title)};${escCsv(cat)};${escCsv(pri)};${escCsv(st)}\n`;
      });
    });
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="daily-tracker.csv";a.click();
  }
  function exportWord(){
    const data=getAllTasksFlat();
    let html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Tracker</title><style>
      body{font-family:Calibri,sans-serif;margin:40px}
      h1{color:#b25a3a;font-size:22px}
      table{border-collapse:collapse;width:100%;margin-top:16px}
      th{background:#b25a3a;color:#fff;padding:8px 10px;text-align:left;font-size:13px}
      td{border:1px solid #ccc;padding:8px 10px;font-size:13px}
      .done{background:#e8f5e9}.pending{background:#fff3e0}
      .sum{margin-top:20px;font-size:14px;color:#666}
    </style></head><body>
    <h1>📋 Daily Tracker - Báo cáo công việc</h1>
    <p>Xuất ngày: ${new Date().toLocaleDateString("vi-VN")}</p>
    <hr>`;
    data.forEach(({date,items})=>{
      const total=items.length;
      const done=items.filter(t=>t.done).length;
      html+=`<h2>${fmtDate(date)} (${done}/${total})</h2><table><tr><th>Giờ</th><th>Công việc</th><th>Danh mục</th><th>Ưu tiên</th><th>Trạng thái</th></tr>`;
      items.forEach(t=>{
        const cat=CATEGORIES.find(c=>c.id===(t.category||"other"))?.label||"Khác";
        const pri=PRIORITIES[t.priority||"medium"]?.label||"TB";
        const rowClass=t.done?"done":"pending";
        html+=`<tr class="${rowClass}"><td>${t.scheduledTime||"-"}</td><td>${esc(t.title)}</td><td>${cat}</td><td>${pri}</td><td>${t.done?"✅ Hoàn thành":"⏳ Chưa xong"}</td></tr>`;
      });
      html+=`</table>`;
    });
    const totalAll=Object.values(tasks).filter(t=>t.date).length;
    const doneAll=Object.values(tasks).filter(t=>t.date&&t.done).length;
    html+=`<p class="sum">Tổng kết: ${doneAll}/${totalAll} công việc đã hoàn thành (${totalAll?Math.round(doneAll/totalAll*100):0}%)</p>`;
    html+=`</body></html>`;
    const blob=new Blob([html],{type:"application/msword;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="daily-tracker.doc";a.click();
  }

  function toggleTask(id){
    const t=tasks[id];
    if(!t) return;
    initAudio();
    t.done=!t.done;
    t.completedAt=t.done?Date.now():null;
    saveTask(id,t);
    if(t.done) playSound();
    renderTasks();
  }

  window.dtDel=function(id){
    if(!confirm("Xoá công việc này?")) return;
    deleteTask(id);
    renderTasks();
  };

  window.dtEdit=function(id){
    const t=tasks[id];
    if(!t) return;
    const ov=document.createElement("div");
    ov.className="modal-overlay";
    const catOpts=CATEGORIES.map(c=>`<option value="${c.id}"${c.id===(t.category||"other")?" selected":""}>${c.label}</option>`).join("");
    ov.innerHTML=`
      <div class="modal">
        <h3>✏️ Sửa công việc</h3>
        <label>Tên công việc</label>
        <input type="text" id="edit-title" value="${esc(t.title||"")}">
        <label>Ngày</label>
        <input type="date" id="edit-date" value="${t.date||""}">
        <label>Giờ</label>
        <input type="time" id="edit-time" value="${t.scheduledTime||""}">
        <label>Danh mục</label>
        <select id="edit-cat">${catOpts}</select>
        <label>Mức độ</label>
        <select id="edit-priority">
          <option value="high"${t.priority==="high"?" selected":""}>🔴 Cao</option>
          <option value="medium"${t.priority==="medium"?" selected":""}>🟡 Trung bình</option>
          <option value="low"${t.priority==="low"?" selected":""}>🟢 Thấp</option>
        </select>
        <label>Tình trạng</label>
        <select id="edit-status">
          <option value="false"${t.done?"":" selected"}>Chưa xong</option>
          <option value="true"${t.done?" selected":""}>Hoàn thành</option>
        </select>
        <div class="modal-actions">
          <button id="edit-save" class="primary">Lưu</button>
          <button id="edit-cancel">Huỷ</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#edit-cancel").addEventListener("click",()=>ov.remove());
    ov.querySelector("#edit-save").addEventListener("click",()=>{
      const title=ov.querySelector("#edit-title").value.trim();
      if(!title) return;
      t.title=title;
      t.date=ov.querySelector("#edit-date").value||t.date;
      t.scheduledTime=ov.querySelector("#edit-time").value||null;
      t.category=ov.querySelector("#edit-cat").value;
      t.priority=ov.querySelector("#edit-priority").value;
      t.done=ov.querySelector("#edit-status").value==="true";
      t.completedAt=t.done?Date.now():null;
      saveTask(id,t);
      renderTasks();
      ov.remove();
    });
    ov.querySelector("#edit-title").focus();
    ov.querySelector("#edit-title").select();
    ov.addEventListener("click",e=>{if(e.target===ov) ov.remove()});
  };

  function addTask(title,category,priority,date,scheduledTime){
    if(!me) return alert("Nhập tên và bấm Lưu tên trước!");
    if(!title.trim()) return;
    const id=genId();
    tasks[id]={title:title.trim(),category:category||"other",priority:priority||"medium",date:date||currentDate,createdAt:Date.now(),done:false,completedAt:null,scheduledTime:scheduledTime||null};
    saveTask(id,tasks[id]);
    renderTasks();
    playSound();
  }

  function bulkAdd(){
    if(!me) return alert("Nhập tên trước!");
    const ov=document.createElement("div");
    ov.className="modal-overlay";
    ov.style.alignItems="flex-start";ov.style.paddingTop="60px";
    const catOpts=CATEGORIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join("");
    ov.innerHTML=`
      <div class="add-section" style="width:90%;max-width:600px;margin:0 auto">
        <div class="row">
          <textarea id="bulk-text" style="min-height:100px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2);font:inherit;font-size:14px;color:var(--text);width:100%;box-sizing:border-box;resize:vertical" placeholder="Mỗi dòng 1 công việc:&#10;Đi chợ&#10;Họp team | 14:00&#10;Tập gym | 14:00 | health"></textarea>
        </div>
        <div class="row" style="margin-top:8px">
          <input type="time" id="bulk-time" style="min-width:100px;flex:0.5">
          <select id="bulk-cat">${catOpts}</select>
          <select id="bulk-priority">
            <option value="high">🔴 Cao</option>
            <option value="medium" selected>🟡 Trung bình</option>
            <option value="low">🟢 Thấp</option>
          </select>
          <select id="bulk-status">
            <option value="false" selected>Chưa xong</option>
            <option value="true">Hoàn thành</option>
          </select>
        </div>
        <div class="add-btn-row" style="margin-top:12px">
          <button id="bulk-save" class="primary">+ Thêm tất cả</button>
          <button id="bulk-cancel">Huỷ</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#bulk-cancel").addEventListener("click",()=>ov.remove());
    ov.querySelector("#bulk-save").addEventListener("click",()=>{
      const text=ov.querySelector("#bulk-text").value;
      if(!text.trim()) return;
      const defaultTime=ov.querySelector("#bulk-time").value||null;
      const defaultCat=ov.querySelector("#bulk-cat").value;
      const defaultPri=ov.querySelector("#bulk-priority").value;
      const defaultDone=ov.querySelector("#bulk-status").value==="true";
      const lines=text.split("\n").map(s=>s.trim()).filter(s=>s);
      lines.forEach(line=>{
        const id=genId();
        const parts=line.split("|").map(s=>s.trim());
        const title=parts[0];
        const time=parts[1]||defaultTime;
        const cat=parts[2]||defaultCat;
        const pri=parts[3]||defaultPri;
        tasks[id]={title,category:cat,priority:pri,date:currentDate,createdAt:Date.now(),done:defaultDone,completedAt:defaultDone?Date.now():null,scheduledTime:time||null};
        saveTask(id,tasks[id]);
      });
      renderTasks();
      ov.remove();
    });
    ov.querySelector("#bulk-text").focus();
    ov.addEventListener("click",e=>{if(e.target===ov) ov.remove()});
  }

  // History
  function renderHistory(period){
    const data=getHistory(period);
    const host=$("#history-list");
    if(data.length===0){host.innerHTML='<div class="empty-state"><div class="icon">📜</div><p>Chưa có dữ liệu</p></div>';return}

    host.innerHTML=data.slice().reverse().map(d=>{
      const pct=d.rate;
      const color=pct>=80?"var(--success)":pct>=50?"var(--warning)":"var(--danger)";
      return `<div class="day-group">
        <div class="day-head">
          <span class="date">${fmtDate(d.date)}</span>
          <span class="rate" style="color:${color}">${d.done}/${d.total} (${d.rate}%)</span>
        </div>
        ${d.total>0?'<div style="background:var(--border);border-radius:999px;height:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:999px"></div></div>':''}
        <div style="margin-top:6px;font-size:12px;color:var(--text2)">
          ${getDayTasks(d.date).slice(0,5).map(([_,t])=>`<div class="h-task"><span class="h-dot" style="background:${t.done?'var(--success)':'var(--danger)'}"></span>${esc(t.title)}</div>`).join("")}
          ${getDayTasks(d.date).length>5?`<div style="margin-top:4px;color:var(--text2)">…và ${getDayTasks(d.date).length-5} việc khác</div>`:""}
        </div>
      </div>`;
    }).join("");
  }

  // Charts
  function updateCharts(period){
    if(typeof Chart==="undefined") return;
    try{
    const data=getHistory(period);
    const labels=data.map(d=>shortDate(d.date));
    const rates=data.map(d=>d.rate);
    const totals=data.map(d=>d.total);
    const dones=data.map(d=>d.done);

    const chartOpts={
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false}
      },
      scales:{
        y:{beginAtZero:true,max:100,grid:{color:"rgba(0,0,0,.05)"}},
        x:{grid:{display:false}}
      }
    };

    // Rate chart
    if(rateChart) rateChart.destroy();
    rateChart=new Chart($("#rate-chart"),{
      type:"bar",
      data:{labels,datasets:[{
        label:"Tỉ lệ %",
        data:rates,
        backgroundColor:rates.map(v=>v>=80?"rgba(46,125,50,.7)":v>=50?"rgba(245,127,23,.7)":"rgba(183,28,28,.7)"),
        borderRadius:4
      }]},
      options:{...chartOpts,plugins:{...chartOpts.plugins,legend:{display:false}}}
    });

    // Daily chart
    if(dailyChart) dailyChart.destroy();
    dailyChart=new Chart($("#daily-chart"),{
      type:"line",
      data:{labels,datasets:[
        {label:"Đã làm",data:dones,borderColor:"#2e7d32",backgroundColor:"rgba(46,125,50,.1)",fill:true,tension:.3,pointRadius:3},
        {label:"Tổng",data:totals,borderColor:"#b25a3a",backgroundColor:"rgba(178,90,58,.1)",fill:true,tension:.3,pointRadius:3,borderDash:[5,5]}
      ]},
      options:{...chartOpts,plugins:{legend:{display:true,position:"top"}},scales:{y:{beginAtZero:true,grid:{color:"rgba(0,0,0,.05)"}},x:{grid:{display:false}}}}
    });

    // Category chart
    const catData=getCatData(currentDate);
    if(catChart) catChart.destroy();
    const catLabels=[],catValues=[],catColors=[];
    CATEGORIES.forEach(c=>{
      if(catData[c.id]&&catData[c.id].total>0){
        catLabels.push(c.label);
        catValues.push(Math.round(catData[c.id].done/catData[c.id].total*100)||0);
        catColors.push(c.color+"80");
      }
    });
    catChart=new Chart($("#cat-chart"),{
      type:"doughnut",
      data:{labels:catLabels,datasets:[{data:catValues.map(v=>v||1),backgroundColor:catColors}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}
    });
  }catch(e){console.error("updateCharts error:",e)}

  // Navigate date
  function setDate(date){
    currentDate=date;
    $("#date-display").textContent=fmtDate(date);
    renderTasks();
    renderHistory("week");
    updateCharts("week");
  }

  // Init
  function initUser(name){
    if(!name) return;
    me=name.trim();
    localStorage.setItem("dt_me",me);
    loadFromLocal();
    startPolling(me);
    $("#me").value=me;
    $("#who").textContent="👤 "+me;
  }

  // Events
  $("#save-me").addEventListener("click",()=>{initAudio();initUser($("#me").value)});
  $("#me").addEventListener("keydown",e=>{if(e.key==="Enter"){initAudio();initUser($("#me").value)}});
  $("#add-task").addEventListener("click",()=>{
    addTask($("#task-input").value,$("#cat-select").value,$("#priority-select").value,currentDate,$("#task-time").value||null);
    $("#task-input").value="";
    $("#task-time").value="";
  });
  $("#task-input").addEventListener("keydown",e=>{
    if(e.key==="Enter"){$("#add-task").click()}
  });
  $("#add-bulk").addEventListener("click",()=>{initAudio();bulkAdd()});
  $("#prev-day").addEventListener("click",()=>{
    const d=new Date(currentDate+"T12:00:00");
    d.setDate(d.getDate()-1);
    setDate(d.toISOString().slice(0,10));
  });
  $("#next-day").addEventListener("click",()=>{
    const d=new Date(currentDate+"T12:00:00");
    d.setDate(d.getDate()+1);
    setDate(d.toISOString().slice(0,10));
  });
  $("#today-btn").addEventListener("click",()=>setDate(today()));
  $("#clear-done").addEventListener("click",()=>{
    getDayTasks(currentDate).filter(([_,t])=>t.done).forEach(([id])=>deleteTask(id));
    renderTasks();
  });
  $("#export-today").addEventListener("click",()=>{
    const dt=currentDate;
    const items=getDayTasks(dt);
    let txt=`Công việc ngày ${fmtDate(dt)}\n${"=".repeat(40)}\n\n`;
    items.forEach(([_,t])=>{
      const st=t.done?"✓":"○";
      txt+=`${st} ${t.title} (${CATEGORIES.find(c=>c.id===(t.category||"other"))?.label||"Khác"})\n`;
    });
    txt+=`\n${getCompleted(dt)}/${getTotal(dt)} hoàn thành`;
    const blob=new Blob([txt],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tasks-"+dt+".txt";a.click();
  });
  $("#export-excel").addEventListener("click",exportCSV);
  $("#export-word").addEventListener("click",exportWord);
  setInterval(checkOverdueTasks,5000);

  // Tabs
  $$(".tabs button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      $$(".tabs button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      $$(".tab-content").forEach(t=>t.classList.remove("active"));
      const tab=document.getElementById("tab-"+btn.dataset.tab);
      if(tab) tab.classList.add("active");
      if(btn.dataset.tab==="stats")updateCharts(document.querySelector(".period-select .active")?.dataset?.period||"week");
      if(btn.dataset.tab==="history")renderHistory("week");
    });
  });

  // Period select
  $$(".period-select button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      $$(".period-select button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      updateCharts(btn.dataset.period);
    });
  });

  // Known users
  fbFetch("","GET").then(data=>{
    if(!data) return;
    const names=Object.keys(data).filter(k=>!k.startsWith("_"));
    const dl=$("#known-users");if(!dl)return;
    dl.innerHTML="";
    names.forEach(n=>{const o=document.createElement("option");o.value=n;dl.appendChild(o)});
  }).catch(()=>{});

  // Auto-load
  if(me){$("#me").value=me;initUser(me)}
  else{$("#who").textContent="Chưa đặt tên"}
  setDate(today());
})();}catch(e){console.error("App error:",e)}
