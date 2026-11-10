import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, onValue, push,
  onDisconnect, remove, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const HEARTBEAT_INTERVAL_MS = 1000;
const PLAYER_TIMEOUT_MS = 15000;
const WATCHDOG_INTERVAL_MS = 3000;

let roomCode = null;
let slot = -1;
let info = null;
let playersRef = null;
let chatRef = null;
let playerRef = null;
let playerName = "Player";
let stopPlayers = null;
let stopChat = null;
let heartbeatTimer = null;
let watchdogTimer = null;
let disconnectOperation = null;
let watchdogRunning = false;
let serverOffset = 0;

export let uid = null;

export async function ready() {
  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;

  try {
    const offsetSnapshot = await get(ref(db, ".info/serverTimeOffset"));
    serverOffset = Number(offsetSnapshot.val()) || 0;
  } catch {
    serverOffset = 0;
  }

  return uid;
}

function serverNow() {
  return Date.now() + serverOffset;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function clearPresenceTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (watchdogTimer) clearInterval(watchdogTimer);
  heartbeatTimer = null;
  watchdogTimer = null;
}

async function removeStalePlayers(code) {
  const pRef = ref(db, `rooms/${code}/players`);
  const snapshot = await get(pRef);
  const players = snapshot.val() || {};
  const now = serverNow();

  const staleUids = Object.entries(players)
    .filter(([playerUid, player]) => {
      if (playerUid === uid || !player) return false;
      const stamp = Number.isFinite(Number(player.heartbeatAt))
        ? Number(player.heartbeatAt)
        : Number(player.updatedAt);
      return Number.isFinite(stamp) && stamp > 0 && now - stamp > PLAYER_TIMEOUT_MS;
    })
    .map(([playerUid]) => playerUid);

  await Promise.all(
    staleUids.map(playerUid =>
      remove(ref(db, `rooms/${code}/players/${playerUid}`)).catch(() => {})
    )
  );
}

async function deleteRoomIfEmpty(code, minimumAgeMs = 0) {
  const targetRef = ref(db, `rooms/${code}`);
  const before = await get(targetRef);
  if (!before.exists()) return false;

  if (minimumAgeMs > 0) {
    const createdAt = Number(before.child("info/createdAt").val()) || 0;
    if (createdAt && serverNow() - createdAt < minimumAgeMs) return false;
  }

  const result = await runTransaction(
    targetRef,
    current => {
      if (!current) return;
      const players = current.players || {};
      if (Object.keys(players).length !== 0) return;

      if (minimumAgeMs > 0) {
        const createdAt = Number(current.info?.createdAt) || 0;
        if (createdAt && serverNow() - createdAt < minimumAgeMs) return;
      }

      return null;
    },
    { applyLocally: false }
  );

  return result.committed;
}

async function sweepRoom(code, minimumEmptyAgeMs = 0) {
  await removeStalePlayers(code);
  await deleteRoomIfEmpty(code, minimumEmptyAgeMs);
}

function startPresenceTimers(code, ownPlayerRef) {
  clearPresenceTimers();

  heartbeatTimer = setInterval(() => {
    if (roomCode !== code || !uid) return;
    update(ownPlayerRef, { heartbeatAt: serverTimestamp() }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  watchdogTimer = setInterval(async () => {
    if (roomCode !== code || watchdogRunning) return;
    watchdogRunning = true;
    try {
      await sweepRoom(code);
    } catch (error) {
      console.warn("TOGETHER watchdog:", error);
    } finally {
      watchdogRunning = false;
    }
  }, WATCHDOG_INTERVAL_MS);
}

async function reserveSlot(code, name, roomInfo) {
  const playerCount = Number(roomInfo?.playerCount);
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) {
    throw new Error("ルームの人数設定が不正です。ルームを作り直してください");
  }

  await removeStalePlayers(code);

  const pRef = ref(db, `rooms/${code}/players`);
  const snapshot = await get(pRef);
  const current = snapshot.val() || {};
  const existing = current[uid];
  const existingSlot = Number(existing?.slot);

  if (
    existing &&
    Number.isInteger(existingSlot) &&
    existingSlot >= 0 &&
    existingSlot < playerCount
  ) {
    slot = existingSlot;
  } else {
    const used = new Set(
      Object.values(current)
        .map(player => Number(player?.slot))
        .filter(value => Number.isInteger(value) && value >= 0)
    );
    slot = Array.from({ length: playerCount }, (_, index) => index).find(index => !used.has(index));
    if (slot === undefined) throw new Error("このルームは満員です");
  }

  clearPresenceTimers();
  if (disconnectOperation) {
    await disconnectOperation.cancel().catch(() => {});
    disconnectOperation = null;
  }

  const cleanName = (name || "Player").trim().slice(0, 16) || "Player";
  const ownPlayerRef = ref(db, `rooms/${code}/players/${uid}`);
  const nextPlayer = {
    uid,
    name: cleanName,
    slot,
    x: 55 + slot * 42,
    y: 405,
    done: false,
    updatedAt: Date.now(),
    heartbeatAt: serverTimestamp()
  };

  // Register the server-side disconnect cleanup before publishing the player.
  const disconnect = onDisconnect(ownPlayerRef);
  await disconnect.remove();
  try {
    await set(ownPlayerRef, nextPlayer);
  } catch (error) {
    await disconnect.cancel().catch(() => {});
    throw error;
  }

  roomCode = code;
  info = roomInfo;
  playerName = cleanName;
  playersRef = pRef;
  chatRef = ref(db, `rooms/${code}/chat`);
  playerRef = ownPlayerRef;
  disconnectOperation = disconnect;

  startPresenceTimers(code, ownPlayerRef);
  return { roomCode, slot, info, uid };
}

export async function createRoom(playerCount, stageNo, name) {
  await ready();

  let code = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = makeCode();
    const roomInfoSnapshot = await get(ref(db, `rooms/${candidate}/info`));
    if (!roomInfoSnapshot.exists()) {
      code = candidate;
      break;
    }
    await sweepRoom(candidate, PLAYER_TIMEOUT_MS);
    const recheck = await get(ref(db, `rooms/${candidate}/info`));
    if (!recheck.exists()) {
      code = candidate;
      break;
    }
  }

  if (!code) throw new Error("ルームコードを作成できませんでした。もう一度試してください");

  const roomInfo = {
    hostUid: uid,
    playerCount: Number(playerCount),
    stageNo: Number(stageNo),
    createdAt: serverTimestamp()
  };

  await set(ref(db, `rooms/${code}/info`), roomInfo);
  try {
    return await reserveSlot(code, name, roomInfo);
  } catch (error) {
    await deleteRoomIfEmpty(code).catch(() => {});
    throw error;
  }
}

export async function joinRoom(codeInput, name) {
  await ready();
  const code = String(codeInput).trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    throw new Error("6桁のルームコードを確認してください");
  }

  let snapshot = await get(ref(db, `rooms/${code}/info`));
  if (!snapshot.exists()) throw new Error("ルームが見つかりません");

  // Remove timed-out players first. A truly empty old room is expired.
  await sweepRoom(code, PLAYER_TIMEOUT_MS);
  snapshot = await get(ref(db, `rooms/${code}/info`));
  if (!snapshot.exists()) throw new Error("このルームは期限切れです。新しいルームを作成してください");

  return reserveSlot(code, name, snapshot.val());
}

export function watchPlayers(callback) {
  if (stopPlayers) stopPlayers();
  stopPlayers = onValue(playersRef, snapshot => {
    const rows = snapshot.val() || {};
    callback(rows);
    if (Object.keys(rows).length === 0 && roomCode) {
      deleteRoomIfEmpty(roomCode).catch(() => {});
    }
  });
}

export function watchChat(callback) {
  if (stopChat) stopChat();
  stopChat = onValue(chatRef, snapshot => {
    const rows = Object.entries(snapshot.val() || {}).map(([id, value]) => ({ ...value, id }));
    rows.sort((a, b) => a.createdAt - b.createdAt);
    callback(rows.slice(-60));
  });
}

export function updateMyPlayer(data) {
  if (!roomCode || !uid || !playerRef) return Promise.resolve();
  return update(playerRef, {
    ...data,
    uid,
    name: playerName,
    slot,
    updatedAt: Date.now()
  });
}

export async function sendChat(name, text) {
  if (!chatRef || !uid) return;
  const body = String(text).trim().slice(0, 160);
  if (!body) return;
  await set(push(chatRef), {
    uid,
    name: (name || playerName || "Player").slice(0, 16),
    text: body,
    createdAt: Date.now()
  });
}

export async function leaveRoom() {
  const oldCode = roomCode;
  const oldPlayerRef = playerRef;

  clearPresenceTimers();
  if (stopPlayers) stopPlayers();
  if (stopChat) stopChat();
  stopPlayers = null;
  stopChat = null;

  if (disconnectOperation) {
    await disconnectOperation.cancel().catch(() => {});
    disconnectOperation = null;
  }

  if (oldPlayerRef) await remove(oldPlayerRef).catch(() => {});
  if (oldCode) await deleteRoomIfEmpty(oldCode).catch(() => {});

  roomCode = null;
  slot = -1;
  info = null;
  playersRef = null;
  chatRef = null;
  playerRef = null;
  playerName = "Player";
}
