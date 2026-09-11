import { apiClient } from "@/lib/api-client";

/**
 * Phone notifications (Web Push) for the installed app and the browser.
 *
 * - "unsupported": this browser can't do push. On iPhone that means the site isn't installed —
 *   iOS only allows push for apps added to the Home Screen.
 * - "denied": the user blocked notifications; only their browser settings can undo that.
 * - "enabled" / "disabled": subscribed or not.
 */
export type PushState = "unsupported" | "denied" | "enabled" | "disabled";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const subscription = await currentSubscription();
  return subscription && Notification.permission === "granted" ? "enabled" : "disabled";
}

/** The VAPID key arrives base64url-encoded; the browser wants raw bytes. */
function keyBytes(base64url: string): ArrayBuffer {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/** Only what the server's DTO accepts — toJSON() also carries expirationTime. */
function payloadOf(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint, keys: json.keys };
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "disabled";

  const { publicKey } = await apiClient.get<{ publicKey: string | null }>("/push/public-key");
  if (!publicKey) throw new Error("Notifications aren't switched on for this site yet.");

  // register() is idempotent — it returns the existing registration when there is one, and
  // guarantees one exists on pages that never showed the install prompt.
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  await apiClient.post("/push/subscribe", payloadOf(subscription));
  return "enabled";
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await apiClient.post("/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return "disabled";
}

/**
 * Re-tell the server about this device's existing subscription, so it belongs to whoever is
 * signed in now. Without this, on a phone shared by two accounts the notifications would keep
 * going to whichever one turned them on first.
 */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (subscription) await apiClient.post("/push/subscribe", payloadOf(subscription));
}
