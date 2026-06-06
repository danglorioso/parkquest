import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushToUser(recipientId: string, payload: PushPayload) {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.clerk_user_id, recipientId));

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        // 410 Gone = subscription expired; remove it
        if ((err as { statusCode?: number }).statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, sub.endpoint))
            .catch(() => {});
        }
      }
    })
  );
}
