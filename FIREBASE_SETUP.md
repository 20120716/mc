# TOGETHER Firebase setup

The game uses Firebase Authentication (anonymous sign-in) and Realtime Database.

## 1. Enable anonymous sign-in

1. Open Firebase Console: https://console.firebase.google.com/
2. Select project `strikezone-48cf0`.
3. Open **Authentication → Sign-in method**.
4. Enable **Anonymous** and save.

## 2. Publish Realtime Database rules

1. Open **Realtime Database → Rules**.
2. Replace the rules with the contents of `database.rules.json`.
3. Click **Publish**.

The rules allow authenticated users to read room/player/chat data, each player to write only their own player record, and chat messages to be sent under the authenticated user's UID. The room creator controls the room's info.

## 3. Host the game

Serve the repository over HTTPS (GitHub Pages is suitable). ES modules and Firebase Auth will not work reliably when opening `index.html` directly as a local file.

## Room behavior

- Room codes are six characters.
- The room creator chooses 2, 3, or 4 players and a stage.
- Joining players receive the next free player slot.
- Player positions and completion state are synchronized through Realtime Database.
- Chat is shared by everyone in the room.

Firebase Web API keys are identifiers, not database passwords. Actual access control is enforced by Authentication and the Realtime Database rules.
