import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, push, onDisconnect, remove, runTransaction } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const HEARTBEAT_MS = 1000;
const STALE_AFTER_MS = 15000;
const CLEANUP_CHECK_MS = 3000;
let roomCode = null, slot = -1, info = null, playersRef = null, chatRef = null;
let stopPlayers = null, stopChat = null, heartbeatTimer = null, cleanupTimer = null;
let lastHeartbeatWrite = 0;
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
async function cleanupEmptyRoom(code) {
  if (!code) return;
  const roomRef = ref(db, `rooms/${code}`);
  await runTransaction(roomRef, current => {
    if (!current) return;
    const players = current.players || {};
    if (Object.keys(players).length !== 0) return;
    return null;
  }, {applyLocally:false});
}
async function pruneStalePlayers(rows) {
  if (!roomCode) return;
  const now = Date.now();
  const entries = Object.entries(rows || {});
  await Promise.all(entries.map(async ([playerUid, player]) => {
    if (playerUid === uid) return;
    const heartbeat = Number(player.heartbeatAt || player.updatedAt || 0);
    if (heartbeat > 0 && now - heartbeat > STALE_AFTER_MS) {
      try { await remove(ref(db, `rooms/${roomCode}/players/${playerUid}`)); } catch (error) { console.warn("stale player cleanup failed", error); }
    }
  }));
  const latest = await get(playersRef);
  if (!latest.exists() || Object.keys(latest.val() || {}).length === 0) {
    try { await cleanupEmptyRoom(roomCode); } catch (error) { console.warn("empty room cleanup failed", error); }
  }
}
function startHeartbeat() {
  stopHeartbeat();
  const beat = async () => {
    if (!roomCode || !uid) return;
    const now = Date.now();
    if (now - lastHeartbeatWrite < HEARTBEAT_MS - 100) return;
    lastHeartbeatWrite = now;
    try {
      await update(ref(db, `rooms/${roomCode}/players/${uid}`), {heartbeatAt: now});
    } catch (error) {
      console.warn("heartbeat update failed", error);
    }
  };
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  cleanupTimer = setInterval(async () => {
    if (!roomCode || !playersRef) return;
    try {
      const snap = await get(playersRef);
      await pruneStalePlayers(snap.val() || {});
    } catch (error) { console.warn("WDT check failed", error); }
  }, CLEANUP_CHECK_MS);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  heartbeatTimer = null;
  cleanupTimer = null;
}
async function passwordRecord(password) {
  if (!password) return null;
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes, b => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + password));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return {passwordSalt:salt, passwordHash:hash};
}
async function passwordMatches(password, roomInfo) {
  if (!roomInfo.passwordHash) return !password;
  if (!password) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(roomInfo.passwordSalt + password));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return hash === roomInfo.passwordHash;
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
    x: 55 + slot*42, y: 405, done: false,
    updatedAt: Date.now(), heartbeatAt: Date.now()
  });
  await onDisconnect(ref(db,`rooms/${code}/players/${uid}`)).remove();
  roomCode = code; info = roomInfo;
  playersRef = pRef; chatRef = ref(db,`rooms/${code}/chat`);
  lastHeartbeatWrite = 0;
  startHeartbeat();
  return {roomCode, slot, info, uid};
}
export async function createRoom(playerCount, stageNo, name, password = "") {
  await ready();
  let code;
  for(let i=0;i<8;i++){
    code = makeCode();
    const snap = await get(ref(db,`rooms/${code}/info`));
    if(!snap.exists()) break;
    code = null;
  }
  if(!code) throw new Error("ルームコードを作成できませんでした。もう一度試してください");
  const credentials = await passwordRecord(password);
  const roomInfo = {hostUid:uid, playerCount:Number(playerCount), stageNo:Number(stageNo), createdAt:Date.now(), ...(credentials || {})};
  await set(ref(db,`rooms/${code}/info`), roomInfo);
  return reserveSlot(code,name,roomInfo);
}
export async function joinRoom(codeInput, name, password = "") {
  await ready();
  const code = String(codeInput).trim().toUpperCase();
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("6桁のルームコードを確認してください");
  const roomRef = ref(db,`rooms/${code}`);
  const snap = await get(ref(db,`rooms/${code}/info`));
  if(!snap.exists()) throw new Error("ルームが見つかりません");
  if (!(await passwordMatches(password, snap.val()))) throw new Error(snap.val().passwordHash ? "パスワードが違います" : "このルームにはパスワードが設定されていません");
  const playerSnap = await get(ref(db,`rooms/${code}/players`));
  const players = playerSnap.val() || {};
  const now = Date.now();
  for (const [playerUid, player] of Object.entries(players)) {
    const heartbeat = Number(player.heartbeatAt || player.updatedAt || 0);
    if (heartbeat > 0 && now - heartbeat > STALE_AFTER_MS) {
      await remove(ref(db,`rooms/${code}/players/${playerUid}`));
    }
  }
  const afterCleanup = await get(ref(db,`rooms/${code}/players`));
  if (!afterCleanup.exists() || Object.keys(afterCleanup.val() || {}).length === 0) {
    await cleanupEmptyRoom(code);
    throw new Error("このルームは終了しています。新しいルームを作成してください");
  }
  return reserveSlot(code,name,snap.val());
}
export function watchPlayers(callback) {
  if(stopPlayers) stopPlayers();
  stopPlayers = onValue(playersRef, snap => {
    const rows = snap.val() || {};
    callback(rows);
    pruneStalePlayers(rows).catch(error => console.warn("WDT cleanup failed", error));
  });
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
  stopHeartbeat();
  const code = roomCode;
  if(code && uid) {
    await remove(ref(db,`rooms/${code}/players/${uid}`));
    await cleanupEmptyRoom(code);
  }
  roomCode=null; slot=-1; info=null; playersRef=null; chatRef=null;
}
