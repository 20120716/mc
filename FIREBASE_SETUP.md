# TOGETHER Firebase setup

The game uses Firebase Authentication (anonymous sign-in) and Realtime Database.

## 1. Enable anonymous sign-in

1. Open https://console.firebase.google.com/
2. Select project `strikezone-48cf0`.
3. Open **Authentication → Sign-in method**.
4. Enable **Anonymous** and save.

## 2. Publish Realtime Database rules

1. Open **Realtime Database → Rules**.
2. Replace the rules with the contents of `database.rules.json`.
3. Click **Publish**.

The rules allow authenticated users to read room/player/chat data, each player to write only their own player record, authenticated clients to remove records whose heartbeat is older than 15 seconds, and any authenticated client to delete a room only after its players collection is empty.

## 3. Room cleanup without Cloud Functions

The game uses a client-side watchdog:

- Each connected player updates `heartbeatAt` about once per second.
- Connected clients check the room about every 3 seconds.
- A player with no heartbeat for 15 seconds is treated as disconnected and removed.
- When the last player leaves, the client attempts to delete the empty room using a Realtime Database transaction.
- If every device disappears at once, no JavaScript remains running to perform cleanup. The next client that tries to join that room checks stale heartbeats and removes the expired room.

This approach does not require Cloud Functions or the Blaze plan. It is best-effort client-side cleanup, not a server-side scheduled job. A suspended browser can miss heartbeats, so the 15-second timeout is deliberately longer than the 1-second heartbeat.

## 4. Host the game

Serve the repository over HTTPS (GitHub Pages is suitable). ES modules and Firebase Auth will not work reliably when opening `index.html` directly as a local file.

## Room behavior

- Room codes are six characters.
- The room creator chooses 2, 3, or 4 players and a stage.
- Joining players receive the next free player slot.
- Player positions and completion state are synchronized through Realtime Database.
- Chat is shared by everyone in the room.
