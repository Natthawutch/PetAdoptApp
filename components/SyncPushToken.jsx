import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { createClerkSupabaseClient } from "../config/supabaseClient";
import { registerForPushNotificationsAsync } from "../utils/registerForPushNotifications";

export default function SyncPushToken() {
  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const syncToken = async () => {
      try {
        // 1) ขอ expo token
        const expoPushToken = await registerForPushNotificationsAsync();
        if (!expoPushToken) {
          console.log("ℹ️ No expo push token (permission denied / not device)");
          return;
        }

        // 2) ขอ supabase jwt จาก Clerk
        const supabaseToken = await getToken({ template: "supabase" });
        if (!supabaseToken) {
          console.log("❌ Missing supabase token from Clerk template");
          return;
        }

        // 3) upsert ลง users table
        const supabase = createClerkSupabaseClient(supabaseToken);

        const { error } = await supabase.from("users").upsert(
          {
            clerk_id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? null,
            expo_push_token: expoPushToken,
          },
          { onConflict: "clerk_id" },
        );

        if (cancelled) return;

        if (error) {
          console.error("❌ Sync push token error:", error);
        } else {
          console.log("✅ Push token synced:", expoPushToken);
        }
      } catch (e) {
        if (!cancelled) console.error("❌ SyncPushToken crashed:", e);
      }
    };

    syncToken();

    return () => {
      cancelled = true;
    };
  }, [user?.id]); // ✅ กันยิงซ้ำตอน object user เปลี่ยนเล็กน้อย

  return null;
}
