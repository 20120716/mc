import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, push, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
let roomCode = null, slot = -1, info = null, playersRef = null, chatRef = null, stopPlayers = null, stopChat = null;
export let uid = null;

export async function ready() {
  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;
  return uid;
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}
async function reserveSlot(code, name, roomInfo) {
  const pRef = ref(db, `rooms/${code}/players`);
  const snap = await get(pRef);
  const current = snap.val() || {};
  const existing = current[uid];
  if (existing) slot = existing.slot;
  else {
    const used = new Set(Object.values(current).map(p=>p.slot));
    slot = Array.from({length:roomInfo.playerCount},(_,i)=>i).find(i=>!used.has(i));
    if (slot === undefined) throw new Error("このルームは満員です");
  }
  await set(ref(db,`rooms/${code}/players/${uid}`), {
    uid, name: (name || "Player").slice(0,16), slot,
    x: 55 + slot*42, y: 405, done: false, updatedAt: Date.now()
  });
  await onDisconnect(ref(db,`rooms/${code}/players/${uid}`)).remove();
  roomCode = code; info = roomInfo;
  playersRef = pRef; chatRef = ref(db,`rooms/${code}/chat`);
  return {roomCode, slot, info, uid};
}
export async function createRoom(playerCount, stageNo, name) {
  await ready();
  let code;
  for(let i=0;i<8;i++){
    code = makeCode();
    const snap = await get(ref(db,`rooms/${code}/info`));
    if(!snap.exists()) break;
    code = null;
  }
  if(!code) throw new Error("ルームコードを作成できませんでした。もう一度試してください");
  const roomInfo = {hostUid:uid, playerCount:Number(playerCount), stageNo:Number(stageNo), createdAt:Date.now()};
  await set(ref(db,`rooms/${code}/info`), roomInfo);
  return reserveSlot(code,name,roomInfo);
}
export async function joinRoom(codeInput, name) {
  await ready();
  const code = String(codeInput).trim().toUpperCase();
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("6桁のルームコードを確認してください");
  const snap = await get(ref(db,`rooms/${code}/info`));
  if(!snap.exists()) throw new Error("ルームが見つかりません");
  return reserveSlot(code,name,snap.val());
}
export function watchPlayers(callback) {
  if(stopPlayers) stopPlayers();
  stopPlayers = onValue(playersRef, snap => callback(snap.val() || {}));
}
export function watchChat(callback) {
  if(stopChat) stopChat();
  stopChat = onValue(chatRef, snap => {
    const rows = Object.entries(snap.val() || {}).map(([id,v])=>({...v,id}));
    rows.sort((a,b)=>a.createdAt-b.createdAt);
    callback(rows.slice(-60));
  });
}
export function updateMyPlayer(data) {
  if(!roomCode || !uid) return;
  return update(ref(db,`rooms/${roomCode}/players/${uid}`), {...data, updatedAt:Date.now()});
}
export async function sendChat(name,text) {
  if(!chatRef || !uid) return;
  const body = String(text).trim().slice(0,160);
  if(!body) return;
  await set(push(chatRef), {uid, name:(name||"Player").slice(0,16), text:body, createdAt:Date.now()});
}
export async function leaveRoom() {
  if(stopPlayers) stopPlayers();
  if(stopChat) stopChat();
  if(roomCode && uid) await remove(ref(db,`rooms/${roomCode}/players/${uid}`));
  roomCode=null; slot=-1; info=null; playersRef=null; chatRef=null;
}
