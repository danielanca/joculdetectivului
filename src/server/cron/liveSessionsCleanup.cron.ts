import cron from "node-cron";
import { firestore } from "../firestore";

const COLLECTION = "live_sessions";
const RETENTION_DAYS = 30;
const BATCH_LIMIT = 400;

async function runCleanup(): Promise<void> {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const db = firestore();

    let totalDeleted = 0;
    // Delete in batches until nothing older than the cutoff remains.
    for (;;) {
      const snap = await db
        .collection(COLLECTION)
        .where("startedAtMs", "<", cutoff)
        .orderBy("startedAtMs", "asc")
        .limit(BATCH_LIMIT)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snap.size;

      if (snap.size < BATCH_LIMIT) break;
    }

    if (totalDeleted > 0) {
      console.log(`[live-sessions-cleanup] Deleted ${totalDeleted} session(s) older than ${RETENTION_DAYS} days`);
    }
  } catch (error) {
    console.error("[live-sessions-cleanup] failed:", error);
  }
}

export function startLiveSessionsCleanupCron(): void {
  // Daily at 04:20
  cron.schedule("20 4 * * *", runCleanup);
  console.log("[live-sessions-cleanup] Started - daily at 04:20");
}
