import { createRoom, joinRoom, listRooms, watchPlayers, watchChat, updateMyPlayer, sendChat, leaveRoom } from "./online.js?v=20261110d";
const $=id=>document.getElementById(id),canvas=$("game"),ctx=canvas.getContext("2d"),W=960,H=540;
const colors=["#4ed8ff","#ffae58","#b89cff","#83e28c"],maps=[{l:"a",r:"d",j:"w"},{l:"ArrowLeft",r:"ArrowRight",j:"ArrowUp"},{l:"j",r:"l",j:"i"},{l:"4",r:"6",j:"8"}];
let L=null,P=[],K={},T={left:false,right:false,jump:false},selected=0,gateOpen=false,won=false,running=false,online=false,mySlot=-1,myUid=null,roomName="Player",lastSync=0,currentStage=1;
function showError(msg){$("error").textContent=msg||""}
function requireOnlineName(){
 const name=String($("playerName").value||"").trim().slice(0,16);
 if(!name){
  showError("⚠ プレイヤー名が未入力です。名前を入力してからオンラインに参加してください。");
  $("playerName").setCustomValidity("プレイヤー名を入力してください");
  $("playerName").focus();
  $("playerName").reportValidity();
  return "";
 }
 $("playerName").setCustomValidity("");
 showError("");
 return name;
}

let activeMenuView="online",roomRefreshBusy=false;
function updateOnlineNameButtons(){
 const hasName=String($("playerName").value||"").trim().length>0;
 const create=$("create");
 if(create)create.disabled=create.classList.contains("is-loading")||!hasName;
 document.querySelectorAll(".room-join").forEach(button=>{
  button.disabled=button.classList.contains("is-loading")||button.dataset.roomFull==="true"||!hasName;
  button.title=!hasName?"先にプレイヤー名を入力してください":"";
 });
}
function showMenuView(view){
 activeMenuView=view;
 document.querySelectorAll(".nav-tile").forEach(button=>button.classList.toggle("active",button.dataset.view===view));
 document.querySelectorAll(".view-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===view));
 if(view==="online") refreshRooms();
 if(view==="settings") $("settingsName").value=$("playerName").value;
}
function renderRooms(rooms){
 const list=$("roomList");list.replaceChildren();
 if(!rooms.length){const empty=document.createElement("div");empty.className="room-empty";empty.innerHTML='<span class="room-empty-icon">⌁</span><b>公開ルームはありません</b><small>新しくルームを作成して友達を招待しよう</small>';list.append(empty);return;}
 rooms.forEach(room=>{
  const card=document.createElement("div");card.className="room-card";
  const main=document.createElement("div");main.className="room-card-main";
  const title=document.createElement("div");title.className="room-card-title";
  const lock=document.createElement("span");lock.className=room.hasPassword?"room-lock":"room-open";lock.textContent=room.hasPassword?"🔒":"🌐";
  const code=document.createElement("span");code.textContent=room.code;
  title.append(lock,code);
  const meta=document.createElement("div");meta.className="room-card-meta";meta.textContent=String(room.playersNow||0)+"/"+String(room.playerCount)+"人 · STAGE "+String(room.stageNo).padStart(2,"0");
  main.append(title,meta);card.append(main);
  if(room.hasPassword){const pass=document.createElement("input");pass.className="room-password";pass.type="password";pass.placeholder="パスワード";pass.maxLength=32;pass.autocomplete="current-password";card.append(pass);card._password=pass;}
  const join=document.createElement("button");join.className="room-join";join.textContent="参加 →";join.dataset.roomFull=String(Number(room.playersNow)>=Number(room.playerCount));join.disabled=join.dataset.roomFull==="true"||!String($("playerName").value||"").trim();join.title=!String($("playerName").value||"").trim()?"先にプレイヤー名を入力してください":"";
  join.onclick=async()=>{roomName=requireOnlineName();if(!roomName)return;try{setBusy(join,true);showError("");showTransition("ルームに参加中","部屋の情報を確認しています");const joined=await joinRoom(room.code,roomName,card._password?.value||"");await loadGame(joined.info.playerCount,joined.info.stageNo,joined);hideTransition();}catch(error){hideTransition();showError(error.message||"参加できませんでした");setBusy(join,false);}};
  card.append(join);list.append(card);
 });
}
async function refreshRooms(){
 if(roomRefreshBusy)return;
 roomRefreshBusy=true;
 const button=$("refreshRooms");if(button)button.classList.add("is-loading");
 try{renderRooms(await listRooms());}
 catch(error){const list=$("roomList");list.replaceChildren();const box=document.createElement("div");box.className="room-empty";const title=document.createElement("b");title.textContent="ルーム一覧を取得できません";const detail=document.createElement("small");detail.textContent="Firebaseの公開ルーム一覧ルールを確認してください";box.append(title,detail);list.append(box);}
 finally{if(button)button.classList.remove("is-loading");roomRefreshBusy=false;}
}

function showMenu(){ const menu=$("menu");menu.classList.remove("hide","is-leaving");$("transitionScreen").classList.remove("active"); } 
function hideMenu(){const menu=$("menu");menu.classList.add("is-leaving");setTimeout(()=>menu.classList.add("hide"),360);}
function showTransition(title,detail){$("transitionTitle").textContent=title;$("transitionDetail").textContent=detail;$("transitionScreen").classList.add("active");}
function hideTransition(){ $("transitionScreen").classList.remove("active"); }
function setBusy(button,busy){button.classList.toggle("is-loading",busy);button.disabled=busy;}
function setStatus(s){$("status").textContent=s}
function unlockedStage(){return Math.max(1,Math.min(10,Number(localStorage.getItem("together-unlocked-stage")||1)));}
function refreshStageOptions(){
 const unlocked=unlockedStage();
 ["stageNo","offlineStage"].forEach(id=>{
  const select=$(id);if(!select)return;
  const previous=Number(select.value)||1;
  select.replaceChildren();
  for(let stage=1;stage<=10;stage++){
   const option=document.createElement("option");
   option.value=String(stage);
   option.textContent=stage<=unlocked?"STAGE "+String(stage).padStart(2,"0"):"🔒 STAGE "+String(stage).padStart(2,"0")+"（STAGE "+String(stage-1).padStart(2,"0")+"クリアで解放）";
   option.disabled=stage>unlocked;
   select.append(option);
  }
  select.value=String(Math.min(previous,unlocked));
 });
}
function unlockAfterClear(stage){
 const next=Math.min(10,stage+1);
 if(next>unlockedStage()){
  localStorage.setItem("together-unlocked-stage",String(next));
  refreshStageOptions();
  $("goal").textContent="STAGE CLEAR！ STAGE "+String(next).padStart(2,"0")+" 解放！";
 }
}
async function loadGame(n,s,room=null){
 if(!room&&s>unlockedStage())throw new Error("このステージは未解放です。前のステージをクリアしてください");
 currentStage=s;
 const response=await fetch(`mnt/${n}/s${s}.json`);
 if(!response.ok)throw new Error("ステージデータを読み込めません");
 L=await response.json();P=L.spawns.map(([x,y],i)=>({x,y,vx:0,vy:0,w:28,h:42,done:false,ground:false,active:!room||i===room.slot,name:"P"+(i+1)}));
 online=!!room;mySlot=room?room.slot:-1;myUid=room?.uid||null;selected=online?mySlot:0;won=false;gateOpen=false;running=true;document.querySelector("main")?.classList.remove("game-enter");
 hideMenu();$("stage").textContent=n+" PLAYERS · STAGE "+String(s).padStart(2,"0");
 $("goal").textContent=online?"ルームコード "+room.roomCode+" · 協力して出口へ！":"全員で出口へ！";
 if(online){
  setStatus("ONLINE · "+room.roomCode);
  watchPlayers(rows=>{
   Object.values(rows).forEach(row=>{
    if(row.uid===myUid)return;
    const p=P[row.slot];if(!p)return;
    p.x=Number(row.x)||0;p.y=Number(row.y)||0;p.done=!!row.done;p.active=true;p.name=row.name||("P"+(row.slot+1));
   });
   P.forEach((p,i)=>{if(i!==mySlot&&!Object.values(rows).some(row=>row.slot===i))p.active=false;});
   members();
  });
  watchChat(rows=>{const log=$("chatlog");log.replaceChildren();rows.forEach(m=>{const p=document.createElement("p");p.className="msg";p.textContent=m.name+": "+m.text;log.append(p)});log.scrollTop=log.scrollHeight;});
 }else{setStatus("LOCAL");members();}
}
function members(){$("members").innerHTML=P.map((p,i)=>(p.active?["🔵","🟠","🟣","🟢"][i]:"⚫")+" P"+(i+1)+" "+(p.active?"· "+p.name:"· 待機中")+(i===selected?"（操作中）":"")+(p.done?" ✓":"")).join("<br>");}
function update(){
 if(!running||won||!L)return;
 const sw=L.switch,gate=L.gate;
 gateOpen=P.some(p=>p.active&&p.x+p.w>sw.x&&p.x<sw.x+sw.w&&Math.abs(p.y+p.h-L.floorY)<4);
 const now=performance.now();
 P.forEach((p,i)=>{
  if(!p.active)return;
  if(online&&i!==mySlot)return;
  const m=maps[i],left=!!K[m.l],right=!!K[m.r],jump=!!K[m.j];
  if(!online&&i===selected){if(T.left){} }
  const l=left||(!online&&i===selected&&T.left),r=right||(!online&&i===selected&&T.right),j=jump||(!online&&i===selected&&T.jump);
  const oldX=p.x,oldY=p.y;p.x=Math.max(0,Math.min(W-p.w,p.x+(r?3.5:0)-(l?3.5:0)));
  p.vy=Math.min(14,p.vy+.62);p.y+=p.vy;p.ground=false;
  L.platforms.forEach(q=>{if(p.x+p.w>q.x&&p.x<q.x+q.w&&oldY+p.h<=q.y&&p.y+p.h>=q.y&&p.vy>=0){p.y=q.y-p.h;p.vy=0;p.ground=true;}});
  if(j&&p.ground){p.vy=-12.2;p.ground=false;}
  if(!gateOpen&&p.x+p.w>gate.x&&p.x<gate.x+gate.w&&p.y+p.h>gate.y&&p.y<gate.y+gate.h){if(oldX+p.w<=gate.x)p.x=gate.x-p.w;else if(oldX>=gate.x+gate.w)p.x=gate.x+gate.w;else p.x=oldX;}
  if(p.y>620){[p.x,p.y]=L.spawns[i];p.vy=0;}
  const ex=L.exit;if(p.x+p.w>ex.x&&p.x<ex.x+ex.w&&p.y+p.h>ex.y&&p.y<ex.y+ex.h)p.done=true;
  if(online&&i===mySlot&&now-lastSync>70){lastSync=now;updateMyPlayer({x:Math.round(p.x),y:Math.round(p.y),done:p.done}).catch(()=>{});}
 });
 const active=P.filter(p=>p.active);
 if(active.length===P.length&&active.length>0&&active.every(p=>p.done)){won=true;unlockAfterClear(currentStage);$("goal").textContent=currentStage<10?"STAGE CLEAR！ 次のステージ解放！":"全10ステージ制覇！おめでとう！";}
}
function draw(){
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,"#8bd2e2");sky.addColorStop(1,"#d9f0dc");ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 if(L){
  L.platforms.forEach(p=>{ctx.fillStyle="#526d70";ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle="#a2d5a9";ctx.fillRect(p.x,p.y,p.w,7);});
  const s=L.switch;ctx.fillStyle=gateOpen?"#ffe17a":"#a65b50";ctx.fillRect(s.x,s.y,s.w,s.h);
  const b=L.gate;if(!gateOpen){ctx.fillStyle="#b54f58";ctx.fillRect(b.x,b.y,b.w,b.h);}else{ctx.strokeStyle="#6b9b8c";ctx.setLineDash([8,8]);ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.setLineDash([]);}
  const e=L.exit;ctx.fillStyle="#8af0bd";ctx.fillRect(e.x,e.y,e.w,e.h);
  P.forEach((p,i)=>{if(!p.active)return;ctx.fillStyle=p.done?"#b7e8c9":colors[i];ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle="#17364a";ctx.font="bold 13px system-ui";ctx.fillText("P"+(i+1),p.x+3,p.y-7);});
  if(won){ctx.fillStyle="#061522bb";ctx.fillRect(0,0,W,H);ctx.fillStyle="white";ctx.textAlign="center";ctx.font="bold 42px system-ui";ctx.fillText("TEAMWORK!",W/2,H/2);ctx.textAlign="left";}
 }
 requestAnimationFrame(draw);
}
function loop(){update();requestAnimationFrame(loop);}
document.addEventListener("keydown",e=>{K[e.key]=true;if(["ArrowLeft","ArrowRight","ArrowUp"," "].includes(e.key))e.preventDefault();});
document.addEventListener("keyup",e=>K[e.key]=false);
document.querySelectorAll(".nav-tile").forEach(button=>button.onclick=()=>showMenuView(button.dataset.view));
$("refreshRooms").onclick=refreshRooms;
$("settingsName").oninput=()=>{$("playerName").value=$("settingsName").value.slice(0,16);$("playerName").setCustomValidity("");showError("");updateOnlineNameButtons();};
$("playerName").oninput=()=>{$("settingsName").value=$("playerName").value.slice(0,16);$("playerName").setCustomValidity("");showError("");updateOnlineNameButtons();};
$("motionToggle").checked=localStorage.getItem("together-motion")!=="off";
$("motionToggle").onchange=()=>{localStorage.setItem("together-motion",$("motionToggle").checked?"on":"off");document.body.classList.toggle("reduce-motion",!$("motionToggle").checked);};
document.body.classList.toggle("reduce-motion",!$("motionToggle").checked);
$("offlineCount").onchange=()=>{$("count").value=$("offlineCount").value;};
$("offlineStage").onchange=()=>{$("stageNo").value=$("offlineStage").value;};
$("createPasswordMode").onchange=()=>{const enabled=$("createPasswordMode").value==="password";$("createPassword").disabled=!enabled;if(!enabled)$("createPassword").value="";};
$("create").onclick=async()=>{const button=$("create");roomName=requireOnlineName();if(!roomName)return;try{setBusy(button,true);showError("");showTransition("ルームを作成中","オンライン環境を準備しています");const n=+$("count").value,s=+$("stageNo").value;const password=$("createPasswordMode").value==="password"?$("createPassword").value:"";if(password&&password.length<4)throw new Error("パスワードは4文字以上にしてください");if($("createPasswordMode").value==="password"&&!password)throw new Error("パスワードを入力してください");const room=await createRoom(n,s,roomName,password);await loadGame(n,s,room);hideTransition();showError("");}catch(e){hideTransition();showError(e.message||"ルーム作成に失敗しました");}finally{setBusy(button,false);}};

$("local").onclick=async()=>{const button=$("local");try{setBusy(button,true);showError("");roomName=$("playerName").value.trim()||$("settingsName").value.trim()||"Player";showTransition("ゲームを準備中","ステージデータを読み込んでいます");await loadGame(+$("offlineCount").value,+$("offlineStage").value);hideTransition();}catch(e){hideTransition();showError(e.message);}finally{setBusy(button,false);}};
$("back").onclick=async()=>{running=false;if(online){await leaveRoom();online=false;myUid=null;mySlot=-1;}setStatus("未接続");showMenu();};
$("swap").onclick=()=>{if(!online&&P.length){selected=(selected+1)%P.length;members();}};
document.querySelectorAll("[data-k]").forEach(btn=>{const k=btn.dataset.k;btn.oncontextmenu=e=>e.preventDefault();btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);T[k]=true;};const release=()=>{T[k]=false;};btn.onpointerup=btn.onpointercancel=btn.onlostpointercapture=release;window.addEventListener("blur",release);});
$("chatForm").onsubmit=async e=>{e.preventDefault();const v=$("chatInput").value.trim();if(!v)return;if(!online){const p=document.createElement("p");p.className="msg";p.textContent="Player: "+v;$("chatlog").append(p);}else{try{await sendChat(roomName,v);}catch(err){showError("チャット送信に失敗しました");}}$("chatInput").value="";};
refreshStageOptions();
updateOnlineNameButtons();
$("offlineStage").value=$("stageNo").value;
showMenuView("online");
setInterval(()=>{if(activeMenuView==="online"&&!$("menu").classList.contains("hide"))refreshRooms();},5000);
draw();loop();
