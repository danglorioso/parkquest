import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions, expoPushTokens } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Expo's push API rejects batches over 100 messages per request.
const EXPO_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

async function sendExpoBatch(batch: string[], payload: PushPayload) {
  let res: Response;
  try {
    res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          title: payload.title,
          body: payload.body,
          data: payload.url ? { url: payload.url } : undefined,
          sound: "default",
        }))
      ),
    });
  } catch (err) {
    console.error("[push] Expo request failed", err);
    return;
  }

  // Expo returns HTTP 200 even when individual tickets failed (bad token,
  // wrong APNs environment, revoked credentials) — the real error is only
  // visible in the per-ticket body, so it must be read, not just the status.
  const json: { data?: ExpoTicket[] } | null = await res.json().catch(() => null);
  const tickets = json?.data ?? [];
  tickets.forEach((ticket, i) => {
    if (ticket.status !== "error") return;
    console.error("[push] Expo delivery error", { error: ticket.details?.error, message: ticket.message });
    if (ticket.details?.error === "DeviceNotRegistered") {
      db.delete(expoPushTokens).where(eq(expoPushTokens.token, batch[i])).catch(() => {});
    }
  });
}

async function sendExpoNotifications(tokens: string[], payload: PushPayload) {
  if (tokens.length === 0) return;
  await Promise.allSettled(chunk(tokens, EXPO_BATCH_SIZE).map((batch) => sendExpoBatch(batch, payload)));
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

// Same delivery as sendPushToUser, but fetches tokens for many recipients in
// two queries instead of looping a per-user lookup — for admin broadcasts.
export async function sendPushToUsers(recipientIds: string[], payload: PushPayload) {
  if (recipientIds.length === 0) return;

  const [webSubs, expoRows] = await Promise.all([
    db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.clerk_user_id, recipientIds)),
    db.select().from(expoPushTokens).where(inArray(expoPushTokens.clerk_user_id, recipientIds)),
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
