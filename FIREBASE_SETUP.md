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

The rules allow authenticated users to read room/player/chat data, each player to write only their own player record, and chat messages to be sent under the authenticated user's UID. The room creator controls the room's info.

## 3. Deploy automatic empty-room cleanup

The repository includes a Firebase Cloud Function in `functions/index.js`. When a player record is deleted (including by the player's `onDisconnect()` handler), the function runs a Realtime Database transaction at that room. It deletes the entire room only if the players collection is still empty. The transaction protects against deleting a room if someone joins while cleanup is running.

Deployment requires the Firebase CLI and a Firebase project on the **Blaze (pay-as-you-go) plan** for Cloud Functions deployment. Review Google's current pricing and configure a budget alert before enabling billing.

From the repository root, with Node.js 22 and Firebase CLI installed:

```sh
firebase login
npm --prefix functions install
firebase deploy --only functions:deleteEmptyRoom
```

The `.firebaserc` file selects project `strikezone-48cf0`. After deployment, the cleanup runs automatically; no client-side admin credentials are needed.

## 4. Host the game

Serve the repository over HTTPS (GitHub Pages is suitable). ES modules and Firebase Auth will not work reliably when opening `index.html` directly as a local file.

## Room behavior

- Room codes are six characters.
- The room creator chooses 2, 3, or 4 players and a stage.
- Joining players receive the next free player slot.
- Player positions and completion state are synchronized through Realtime Database.
- Chat is shared by everyone in the room.
- When the last player leaves or disconnects, the Cloud Function removes the empty room (including its info and chat).
