const {setGlobalOptions} = require("firebase-functions/v2");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({
  region: "asia-east1",
  maxInstances: 10,
});

const db = admin.firestore();
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function matchesTarget(tokenData, eventData) {
  if (tokenData.enabled === false) return false;

  const target = eventData.target || "all";
  if (target === "all") return true;

  if (target === "roles") {
    return Array.isArray(eventData.roles) &&
      eventData.roles.includes(tokenData.role);
  }

  if (target === "playerIndexes") {
    const allowed = Array.isArray(eventData.playerIndexes) ?
      eventData.playerIndexes.map(Number) : [];
    return allowed.includes(Number(tokenData.playerIndex));
  }

  console.warn(`Unknown notification target: ${target}`);
  return false;
}

function splitIntoChunks(items, size = 500) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

exports.sendNotification = onDocumentCreated(
  "rooms/{roomId}/notificationEvents/{eventId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const eventData = snapshot.data() || {};
    const {roomId, eventId} = event.params;

    // Avoid accidental duplicate work if the document is retried after success.
    if (eventData.processed === true) return;

    const title = String(eventData.title || "Railopoly");
    const body = String(eventData.body || "你有一則新訊息");
    const type = String(eventData.type || "notification");
    const target = String(eventData.target || "all");
    const url = String(
      eventData.url ||
      `https://leeahh-c.github.io/-/?room=${encodeURIComponent(roomId)}`,
    );

    try {
      const tokenSnapshot = await db
        .collection("rooms")
        .doc(roomId)
        .collection("pushTokens")
        .get();

      const recipients = [];
      tokenSnapshot.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data() || {};
        if (tokenData.token && matchesTarget(tokenData, eventData)) {
          recipients.push({token: tokenData.token, ref: tokenDoc.ref});
        }
      });

      if (recipients.length === 0) {
        await snapshot.ref.set({
          processed: true,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          successCount: 0,
          failureCount: 0,
          note: "No matching push tokens",
        }, {merge: true});
        return;
      }

      let successCount = 0;
      let failureCount = 0;
      const invalidRefs = [];

      for (const chunk of splitIntoChunks(recipients)) {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: chunk.map((recipient) => recipient.token),
          notification: {title, body},
          data: {
            title,
            body,
            roomId: String(roomId),
            eventId: String(eventId),
            type,
            target,
            url,
            tag: `railopoly-${type}`,
          },
          webpush: {
            fcmOptions: {link: url},
            notification: {
              icon: "https://leeahh-c.github.io/-/icon-192.png",
              badge: "https://leeahh-c.github.io/-/icon-192.png",
              tag: `railopoly-${type}`,
            },
          },
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        response.responses.forEach((result, index) => {
          if (result.success) return;
          const code = result.error?.code || "unknown";
          console.error("Push failed", code, result.error?.message || "");
          if (INVALID_TOKEN_CODES.has(code)) invalidRefs.push(chunk[index].ref);
        });
      }

      for (const refs of splitIntoChunks(invalidRefs, 450)) {
        const batch = db.batch();
        refs.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      await snapshot.ref.set({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        successCount,
        failureCount,
        invalidTokenCount: invalidRefs.length,
      }, {merge: true});

      console.log(
        `Push ${eventId}: success=${successCount}, failure=${failureCount}`,
      );
    } catch (error) {
      console.error(`Push ${eventId} failed`, error);
      await snapshot.ref.set({
        processed: false,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error?.message || "Unknown push error",
      }, {merge: true});
      throw error;
    }
  },
);
