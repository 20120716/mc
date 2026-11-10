const { onValueDeleted } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp();

exports.deleteEmptyRoom = onValueDeleted(
  {
    ref: "/rooms/{roomCode}/players/{uid}",
    instance: "strikezone-48cf0-default-rtdb",
    region: "asia-southeast1"
  },
  async (event) => {
    const roomCode = event.params.roomCode;
    const roomRef = getDatabase().ref(`rooms/${roomCode}`);

    // Run a transaction at the room root. If a new player joins while
    // this transaction is running, RTDB retries it with the updated room.
    // The room is removed only when the players collection is still empty.
    await roomRef.transaction((room) => {
      if (room === null || room === undefined) {
        return; // The room was already removed.
      }

      const players = room.players;
      if (players && Object.keys(players).length > 0) {
        return; // Someone is still in the room.
      }

      return null; // No players remain: remove info, chat, and the room.
    });
  }
);
