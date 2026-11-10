import { createRoom, joinRoom, watchPlayers, watchChat, updateMyPlayer, sendChat, leaveRoom } from "./online.js";
const $=id=>document.getElementById(id),canvas=$("game"),ctx=canvas.getContext("2d"),W=960,H=540;
const colors=["#4ed8ff","#ffae58","#b89cff","#83e28c"],maps=[{l:"a",r:"d",j:"w"},{l:"ArrowLeft",r:"ArrowRight",j:"ArrowUp"},{l:"j",r:"l",j:"i"},{l:"4",r:"6",j:"8"}];
let L=null,P=[],K={},T={left:false,right:false,jump:false},selected=0,gateOpen=false,won=false,running=false,online=false,mySlot=-1,myUid=null,roomName="Player",lastSync=0,currentStage=1;
function showError(msg){$("error").textContent=msg||""}
function showMenu(){ const menu=$("menu");menu.classList.remove("hide","is-leaving");$("transitionScreen").classList.remove("active"); } 
function hideMenu(){const menu=$("menu");menu.classList.add("is-leaving");setTimeout(()=>menu.classList.add("hide"),360);}
function showTransition(title,detail){$("transitionTitle").textContent=title;$("transitionDetail").textContent=detail;$("transitionScreen").classList.add("active");}
function hideTransition(){ $("transitionScreen").classList.remove("active"); }
function setBusy(button,busy){button.classList.toggle("is-loading",busy);button.disabled=busy;}
function setStatus(s){$("status").textContent=s}
function unlockedStage(){return Math.max(1,Math.min(2,Number(localStorage.getItem("together-unlocked-stage")||1)));}
function refreshStageOptions(){
 const unlocked=unlockedStage(),select=$("stageNo"),stage2=select.querySelector('option[value="2"]');
 stage2.disabled=unlocked<2;
 stage2.textContent=unlocked>=2?"STAGE 02":"🔒 STAGE 02（STAGE 01クリアで解放）";
 if(Number(select.value)>unlocked)select.value="1";
}
function unlockAfterClear(stage){
 const next=Math.min(2,stage+1);
 if(next>unlockedStage()){
  localStorage.setItem("together-unlocked-stage",String(next));
  refreshStageOptions();
  $("goal").textContent="STAGE CLEAR！ STAGE 02 解放！";
 }
}
async function loadGame(n,s,room=null){
 if(!room&&s>unlockedStage())throw new Error("このステージは未解放です。前のステージをクリアしてください");
 currentStage=s;
 const response=await fetch(`mnt/${n}/s${s}.json`);
 if(!response.ok)throw new Error("ステージデータを読み込めません");
 L=await response.json();P=L.spawns.map(([x,y],i)=>({x,y,vx:0,vy:0,w:28,h:42,done:false,ground:false,active:!room||i===room.slot,name:"P"+(i+1)}));
 online=!!room;mySlot=room?room.slot:-1;myUid=room?.uid||null;selected=online?mySlot:0;won=false;gateOpen=false;running=true;document.querySelector("main")?.classList.add("game-enter");requestAnimationFrame(()=>setTimeout(()=>document.querySelector("main")?.classList.remove("game-enter"),800));
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
 if(active.length===P.length&&active.length>0&&active.every(p=>p.done)){won=true;unlockAfterClear(currentStage);$("goal").textContent=currentStage===1?"STAGE CLEAR！ STAGE 02 解放！":"全員クリア！";}
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
$("createPasswordMode").onchange=()=>{const enabled=$("createPasswordMode").value==="password";$("createPassword").disabled=!enabled;if(!enabled)$("createPassword").value="";};
$("create").onclick=async()=>{const button=$("create");try{setBusy(button,true);showError("");showTransition("ルームを作成中","オンライン環境を準備しています");const n=+$("count").value,s=+$("stageNo").value;roomName=$("playerName").value.trim()||"Player";const password=$("createPasswordMode").value==="password"?$("createPassword").value:"";if(password&&password.length<4)throw new Error("パスワードは4文字以上にしてください");if($("createPasswordMode").value==="password"&&!password)throw new Error("パスワードを入力してください");const room=await createRoom(n,s,roomName,password);$("transitionTitle").textContent="ルーム準備完了";$("transitionDetail").textContent="ゲーム画面へ移動しています";await loadGame(n,s,room);hideTransition();showError("");}catch(e){hideTransition();showError(e.message||"ルーム作成に失敗しました");}finally{setBusy(button,false);}};
$("join").onclick=async()=>{const button=$("join");try{setBusy(button,true);showError("");showTransition("ルームに参加中","コードとパスワードを確認しています");roomName=$("playerName").value.trim()||"Player";const room=await joinRoom($("roomCode").value,roomName,$("joinPassword").value);$("transitionTitle").textContent="参加しました！";$("transitionDetail").textContent="メンバーとゲームを同期しています";await loadGame(room.info.playerCount,room.info.stageNo,room);hideTransition();showError("");}catch(e){hideTransition();showError(e.message||"参加できませんでした");}finally{setBusy(button,false);}};
$("local").onclick=async()=>{const button=$("local");try{setBusy(button,true);showError("");showTransition("ゲームを準備中","ステージデータを読み込んでいます");await loadGame(+$("count").value,+$("stageNo").value);hideTransition();}catch(e){hideTransition();showError(e.message);}finally{setBusy(button,false);}};
$("back").onclick=async()=>{running=false;if(online){await leaveRoom();online=false;myUid=null;mySlot=-1;}setStatus("未接続");showMenu();};
$("swap").onclick=()=>{if(!online&&P.length){selected=(selected+1)%P.length;members();}};
document.querySelectorAll("[data-k]").forEach(btn=>{const k=btn.dataset.k;btn.onpointerdown=e=>{e.preventDefault();T[k]=true;};btn.onpointerup=btn.onpointerleave=btn.onpointercancel=()=>T[k]=false;});
$("chatForm").onsubmit=async e=>{e.preventDefault();const v=$("chatInput").value.trim();if(!v)return;if(!online){const p=document.createElement("p");p.className="msg";p.textContent="Player: "+v;$("chatlog").append(p);}else{try{await sendChat(roomName,v);}catch(err){showError("チャット送信に失敗しました");}}$("chatInput").value="";};
refreshStageOptions();
draw();loop();
