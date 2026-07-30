
try{
document.getElementById("fb-text").textContent="ALIVE";
(function(){
  const CATEGORIES = [
    {id:"work",label:"Công việc",color:"#e53935"},
    {id:"study",label:"Học tập",color:"#1e88e5"},
    {id:"health",label:"Sức khỏe",color:"#43a047"},
    {id:"personal",label:"Cá nhân",color:"#fb8c00"},
    {id:"finance",label:"Tài chính",color:"#8e24aa"},
    {id:"other",label:"Khác",color:"#757575"}
  ];
  const PRIORITIES = {high:{label:"Cao",color:"#e53935"},medium:{label:"TB",color:"#fb8c00"},low:{label:"Thấp",color:"#43a047"}};
  const FB_BASE="https://hagiang-planner-default-rtdb.firebaseio.com";

  function fbFetch(path,method,body){
    const enc=path?path.split("/").map(s=>encodeURIComponent(s)).join("/"):"";
    const url=FB_BASE+"/daily-tracker/"+enc+".json";
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),8000);
    return fetch(url,method?{method,signal:ctrl.signal,body:body?JSON.stringify(body):void 0,headers:{"Content-Type":"application/json"}}:{signal:ctrl.signal})
      .then(async r=>{
        clearTimeout(timer);
        if(!r.ok) throw new Error(r.status+" "+r.statusText);
        const text=await r.text();
        if(!text) return null;
        try{return JSON.parse(text)}catch(e){throw new Error("JSON parse: "+text.slice(0,200))}
      })
      .catch(e=>{
        clearTimeout(timer);
        console.error("fbFetch error:",e.message,url);
        const dt=$("#fb-dot"),txt=$("#fb-text");
        if(dt){dt.className="dot red";txt.textContent=e.name==="AbortError"?"Hết thời gian chờ":e.message.slice(0,40)}
        return null
      });
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
    return Object.entries(tasks).filter(([_,t])=>t.date===date);
  }
  function getTotal(date){return getDayTasks(date).length}
  function getDone(date){return getDayTasks(date).filter(([_,t])=>t.done).length}
  function getCompleted(date){return getDayTasks(date).filter(([_,t])=>t.done).length}
  function getPending(date){return getDayTasks(date).filter(([_,t])=>!t.done).length}
  function getRate(date){const t=getTotal(date);return t?Math.round(getDone(date)/t*100):0}

  function getStreak(){
    let streak=0,d=new Date();
    while(true){
      const ds=d.toISOString().slice(0,10);
      const rate=getRate(ds);
      if(rate>=50) streak++;
      else break;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  function getHistory(period){
    const now=new Date(),r=[];
    let days=period==="week"?7:period==="month"?30:period==="year"?365:999;
    for(let i=0;i<days;i++){
      const d=new Date(now);d.setDate(d.getDate()-i);
      const ds=d.toISOString().slice(0,10);
      r.push({date:ds,total:getTotal(ds),done:getDone(ds),rate:getRate(ds)});
    }
    return r.reverse();
  }

  function getCatData(date){
    const r={};
    CATEGORIES.forEach(c=>r[c.id]={done:0,total:0});
    getDayTasks(date).forEach(([_,t])=>{
      const c=t.category||"other";
      if(r[c]){r[c].total++;if(t.done)r[c].done++}
    });
    return r;
  }

  function renderStats(){
    const total=getTotal(currentDate),done=getDone(currentDate),pending=getPending(currentDate),rate=getRate(currentDate),streak=getStreak();
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

    const grouped={};
    CATEGORIES.forEach(c=>grouped[c.id]=[]);
    dayTasks.forEach(([id,t])=>{
      const cat=t.category||"other";
      if(!grouped[cat]) grouped[cat]=[];
      grouped[cat].push([id,t]);
    });

    const sortedCats=CATEGORIES.filter(c=>grouped[c.id]&&grouped[c.id].length>0);
    sortedCats.forEach(c=>{
      const items=grouped[c.id];
      const doneCount=items.filter(([_,t])=>t.done).length;
      const section=document.createElement("div");section.className="cat-section";
      section.innerHTML=`<div class="cat-header" style="border-left:3px solid ${c.color}"><span>${c.label}</span><span class="cat-count">${doneCount}/${items.length}</span></div>`;
      host.appendChild(section);

      items.forEach(([id,task])=>{
        const p=task.priority||"medium";
        const pr=PRIORITIES[p];
        const nowH=new Date();
        const taskH=task.scheduledTime?new Date(currentDate+"T"+task.scheduledTime):null;
        const isOverdue=!task.done&&taskH&&nowH>taskH;
        const card=document.createElement("div");
        card.className="task-card"+(task.done?" done":"")+(isOverdue?" overdue":"");
        const timeBadge=task.scheduledTime?`<span class="time-badge">${task.scheduledTime}${isOverdue?" ⏰":""}</span>`:"";
        const pColor=pr?pr.color:"#fb8c00";
        card.innerHTML=`
          <div class="task-left">
            <input type="checkbox" ${task.done?"checked":""} data-id="${id}">
            <div>
              <div class="task-title">${task.title}</div>
              <div class="task-meta">
                <span class="task-pri" style="background:${pColor}20;color:${pColor}">${pr?pr.label:"TB"}</span>
                ${timeBadge}
              </div>
            </div>
          </div>
          <div class="task-actions">
            <button class="edit-btn" data-id="${id}">Sửa</button>
            <button class="del-btn" data-id="${id}">Xoá</button>
          </div>`;
        host.appendChild(card);
        card.querySelector("input[type=checkbox]").addEventListener("change",function(){
          tasks[id].done=this.checked;
          tasks[id].completedAt=this.checked?Date.now():null;
          saveTask(id,tasks[id]);
          renderTasks();
          renderHistory("week");
          updateCharts("week");
        });
        card.querySelector(".del-btn").addEventListener("click",()=>{
          if(confirm("Xoá công việc này?")){deleteTask(id);renderTasks();renderHistory("week");updateCharts("week")}
        });
        card.querySelector(".edit-btn").addEventListener("click",()=>editTask(id,task));
      });
    });
    renderStats();
  }

  // Edit modal
  function editTask(id,task){
    const ov=document.createElement("div");ov.className="modal-overlay";
    ov.style.alignItems="flex-start";ov.style.paddingTop="60px";
    const catOpts=CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===(task.category||"other")?"selected":""}>${c.label}</option>`).join("");
    ov.innerHTML=`
      <div class="add-section" style="width:90%;max-width:500px;margin:0 auto">
        <h3 style="margin-bottom:12px">Sửa công việc</h3>
        <div class="row">
          <input type="date" id="edit-date" value="${task.date}" style="flex:1">
          <input type="time" id="edit-time" value="${task.scheduledTime||""}" style="min-width:100px;flex:0.5">
        </div>
        <div class="row" style="margin-top:8px">
          <input type="text" id="edit-title" value="${task.title.replace(/"/g,"&quot;")}" style="flex:1">
        </div>
        <div class="row" style="margin-top:8px">
          <select id="edit-cat">${catOpts}</select>
          <select id="edit-priority">
            <option value="high" ${task.priority==="high"?"selected":""}>🔴 Cao</option>
            <option value="medium" ${task.priority==="medium"||!task.priority?"selected":""}>🟡 TB</option>
            <option value="low" ${task.priority==="low"?"selected":""}>🟢 Thấp</option>
          </select>
          <select id="edit-status">
            <option value="false" ${!task.done?"selected":""}>Chưa xong</option>
            <option value="true" ${task.done?"selected":""}>Hoàn thành</option>
          </select>
        </div>
        <div class="add-btn-row" style="margin-top:12px">
          <button id="edit-save" class="primary">Lưu</button>
          <button id="edit-cancel">Huỷ</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#edit-cancel").addEventListener("click",()=>ov.remove());
    ov.querySelector("#edit-save").addEventListener("click",()=>{
      tasks[id]={...task,date:ov.querySelector("#edit-date").value,title:ov.querySelector("#edit-title").value,scheduledTime:ov.querySelector("#edit-time").value||null,category:ov.querySelector("#edit-cat").value,priority:ov.querySelector("#edit-priority").value,done:ov.querySelector("#edit-status").value==="true"};
      saveTask(id,tasks[id]);
      renderTasks();
      renderHistory("week");
      updateCharts("week");
      ov.remove();
    });
    ov.querySelector("#edit-title").focus();
    ov.addEventListener("click",e=>{if(e.target===ov) ov.remove()});
  }

  // Alert system
  let audioCtx=null;
  function initAudio(){
    if(audioCtx) return;
    try{audioCtx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}
  }
  function playSound(){
    if(!audioCtx) return;
    try{
      const now=audioCtx.currentTime;
      [523,587,659,784].forEach((freq,i)=>{
        const o=audioCtx.createOscillator();const g=audioCtx.createGain();
        o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(0.15,now+i*0.12);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.12+0.35);
        const h=audioCtx.createOscillator();h.type="sine";h.frequency.value=freq*2;
        h.connect(g);o.connect(g);g.connect(audioCtx.destination);
        o.start(now+i*0.12);o.stop(now+i*0.12+0.4);
        h.start(now+i*0.12);h.stop(now+i*0.12+0.4);
      });
    }catch(e){}
  }
  function getAlertKey(){return "dt_alert_"+currentDate}

  function startBurstAlert(){
    let roundCounter=0;
    const maxRounds=3;
    let burstInterval=null;
    function stopBurst(){if(burstInterval){clearInterval(burstInterval);burstInterval=null}}
    function playBurst(){
      if(roundCounter>=maxRounds){stopBurst();setTimeout(startBurstAlert,5*60*1000);return}
      roundCounter++;
      let playCount=0;const maxPlays=30;
      const playInterval=setInterval(()=>{
        if(playCount>=maxPlays){clearInterval(playInterval);return}
        playSound();playCount++;
      },2000);
    }
    if(burstInterval) clearInterval(burstInterval);
    burstInterval=setTimeout(playBurst,1000);
    setTimeout(stopBurst,60*1000+1000);
  }

  function checkOverdueTasks(){
    if(!me) return;
    const alerted=localStorage.getItem(getAlertKey());
    if(alerted==="1") return;
    const now=new Date();
    const todayTasks=getDayTasks(currentDate);
    let hasOverdue=false;
    todayTasks.forEach(([id,task])=>{
      if(task.done||!task.scheduledTime||task.lastAlerted) return;
      const taskTime=new Date(currentDate+"T"+task.scheduledTime);
      if(now>=taskTime&&now-taskTime<60000){
        hasOverdue=true;
        tasks[id].lastAlerted=Date.now();
        saveTask(id,tasks[id]);
      }
    });
    if(hasOverdue){initAudio();startBurstAlert()}
  }

  function addTask(title,cat,pri,date,time){
    if(!me||!title.trim()) return;
    const id=genId();
    tasks[id]={title:title.trim(),category:cat||"other",priority:pri||"medium",date,createdAt:Date.now(),done:false,scheduledTime:time||null};
    saveTask(id,tasks[id]);
    renderTasks();
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

  function renderHistory(period){
    const data=getHistory(period);
    const host=$("#history-list");
    if(!host) return;
    let html='<table class="history-table"><thead><tr><th>Ngày</th><th>Tổng</th><th>Đã làm</th><th>Tỉ lệ</th></tr></thead><tbody>';
    data.forEach(d=>{
      const color=d.rate>=80?"green":d.rate>=50?"orange":"red";
      html+=`<tr><td>${shortDate(d.date)}</td><td>${d.total}</td><td>${d.done}</td><td class="${color}">${d.rate}%</td></tr>`;
    });
    html+="</tbody></table>";
    host.innerHTML=html;
  }

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

    if(dailyChart) dailyChart.destroy();
    dailyChart=new Chart($("#daily-chart"),{
      type:"line",
      data:{labels,datasets:[
        {label:"Đã làm",data:dones,borderColor:"#2e7d32",backgroundColor:"rgba(46,125,50,.1)",fill:true,tension:.3,pointRadius:3},
        {label:"Tổng",data:totals,borderColor:"#b25a3a",backgroundColor:"rgba(178,90,58,.1)",fill:true,tension:.3,pointRadius:3,borderDash:[5,5]}
      ]},
      options:{...chartOpts,plugins:{legend:{display:true,position:"top"}},scales:{y:{beginAtZero:true,grid:{color:"rgba(0,0,0,.05)"}},x:{grid:{display:false}}}}
    });

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
  }

  function setDate(date){
    currentDate=date;
    $("#date-display").textContent=fmtDate(date);
    renderTasks();
    renderHistory("week");
    updateCharts("week");
  }

  function initUser(name){
    if(!name) return;
    me=name.trim();
    localStorage.setItem("dt_me",me);
    loadFromLocal();
    startPolling(me);
    $("#me").value=me;
    $("#who").textContent="👤 "+me;
  }

  function exportCSV(){
    const items=getDayTasks(currentDate);
    let csv="Ngày;Tiêu đề;Danh mục;Ưu tiên;Giờ;Trạng thái\n";
    items.forEach(([_,t])=>{
      const st=t.done?"Hoàn thành":"Chưa xong";
      csv+=`${t.date};${t.title};${CATEGORIES.find(c=>c.id===(t.category||"other"))?.label||""};${t.priority||""};${t.scheduledTime||""};${st}\n`;
    });
    const bom="\uFEFF";
    const blob=new Blob([bom+csv],{type:"text/csv;charset=utf-8;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tasks-"+currentDate+".csv";a.click();
  }

  function exportWord(){
    const items=getDayTasks(currentDate);
    let html=`<html><meta charset="utf-8"><body><h2>Công việc ngày ${fmtDate(currentDate)}</h2><table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif"><tr><th>STT</th><th>Công việc</th><th>Danh mục</th><th>Giờ</th><th>Trạng thái</th></tr>`;
    items.forEach(([_,t],i)=>{
      const st=t.done?"✓":"○";
      html+=`<tr><td>${i+1}</td><td>${t.title}</td><td>${CATEGORIES.find(c=>c.id===(t.category||"other"))?.label||""}</td><td>${t.scheduledTime||""}</td><td>${st}</td></tr>`;
    });
    html+=`</table></body></html>`;
    const blob=new Blob([html],{type:"application/msword;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tasks-"+currentDate+".doc";a.click();
  }

  // Events
  $("#save-me").addEventListener("click",()=>{initAudio();initUser($("#me").value)});
  $("#me").addEventListener("keydown",e=>{if(e.key==="Enter"){initAudio();initUser($("#me").value)}});
  $("#add-task").addEventListener("click",()=>{
    addTask($("#task-input").value,$("#cat-select").value,$("#priority-select").value,currentDate,$("#task-time").value||null);
    $("#task-input").value="";$("#task-time").value="";
  });
  $("#task-input").addEventListener("keydown",e=>{if(e.key==="Enter"){$("#add-task").click()}});
  $("#add-bulk").addEventListener("click",()=>{initAudio();bulkAdd()});
  $("#prev-day").addEventListener("click",()=>{
    const d=new Date(currentDate+"T12:00:00");d.setDate(d.getDate()-1);setDate(d.toISOString().slice(0,10));
  });
  $("#next-day").addEventListener("click",()=>{
    const d=new Date(currentDate+"T12:00:00");d.setDate(d.getDate()+1);setDate(d.toISOString().slice(0,10));
  });
  $("#today-btn").addEventListener("click",()=>setDate(today()));
  $("#clear-done").addEventListener("click",()=>{
    getDayTasks(currentDate).filter(([_,t])=>t.done).forEach(([id])=>deleteTask(id));renderTasks();
  });
  $("#export-today").addEventListener("click",()=>{
    const dt=currentDate;const items=getDayTasks(dt);
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
