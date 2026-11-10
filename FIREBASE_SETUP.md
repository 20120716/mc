# TOGETHER Firebase setup

The game uses Firebase Authentication (anonymous sign-in) and Realtime Database. Empty-room cleanup uses a client-side heartbeat/watchdog; it does not require Cloud Functions or the Blaze plan.

## 1. Enable anonymous sign-in

1. Open https://console.firebase.google.com/
2. Select project `strikezone-48cf0`.
3. Open **Authentication → Sign-in method**.
4. Enable **Anonymous** and save.

## 2. Publish Realtime Database rules

1. Open **Realtime Database → Rules**.
2. Replace the rules with the contents of `database.rules.json`.
3. Click **Publish**.

The rules allow authenticated users to read room/player/chat data. Each player can write their own record. Another authenticated room client may delete a player record only when its server-side heartbeat is older than 12 seconds. An empty room may be deleted by a signed-in client using a transaction, but only when the room has no player records.

## 3. How the heartbeat watchdog works

- Each active client updates its own `heartbeatAt` once per second using Firebase's server timestamp.
- Every client checks the room about every 3 seconds.
- A player whose heartbeat has not changed for 12 seconds is treated as disconnected and removed.
- When a room becomes empty while a client is still running (for example, the last player uses the in-game Back button), that client deletes the room with a Realtime Database transaction.
- If every browser/device disappears at once, no JavaScript remains to run the final delete. The next client that tries to join the old room checks for stale players and removes the expired room. This last edge case cannot be made instant with client-only code; an always-running server process would be required for that.

No Cloud Functions are used. The watchdog uses the existing Realtime Database and anonymous authentication.

## 4. Host the game

Serve the repository over HTTPS (GitHub Pages is suitable). ES modules and Firebase Auth will not work reliably when opening `index.html` directly as a local file.

## Room behavior

- Room codes are six characters.
- The room creator chooses 2, 3, or 4 players and a stage.
- Joining players receive the next free player slot.
- Player positions and completion state are synchronized through Realtime Database.
- Chat is shared by everyone in the room.
- Heartbeat timeout is 12 seconds; the watchdog checks every 3 seconds.
