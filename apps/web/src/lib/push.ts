import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions, expoPushTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

async function sendExpoNotifications(tokens: string[], payload: PushPayload) {
  if (tokens.length === 0) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        data: payload.url ? { url: payload.url } : undefined,
        sound: "default",
      }))
    ),
  }).catch(() => {});
}

export async function sendPushToUser(recipientId: string, payload: PushPayload) {
  const [webSubs, expoRows] = await Promise.all([
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.clerk_user_id, recipientId)),
    db.select().from(expoPushTokens).where(eq(expoPushTokens.clerk_user_id, recipientId)),
  ]);

  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  const jobs: Promise<unknown>[] = [];

  if (subject && publicKey && privateKey && webSubs.length > 0) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    jobs.push(
      ...webSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err: unknown) {
          if ((err as { statusCode?: number }).statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).catch(() => {});
          }
        }
      })
    );
  }

  if (expoRows.length > 0) {
    jobs.push(sendExpoNotifications(expoRows.map((r) => r.token), payload));
  }

  await Promise.allSettled(jobs);
}
