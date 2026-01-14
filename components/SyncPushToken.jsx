import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { createClerkSupabaseClient } from "../config/supabaseClient";
import { registerForPushNotificationsAsync } from "../utils/registerForPushNotifications";

export default function SyncPushToken() {
  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    if (!user) return;

    const syncToken = async () => {
      const expoPushToken = await registerForPushNotificationsAsync();
      if (!expoPushToken) return;

      const supabaseToken = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(supabaseToken);

      const { error } = await supabase
        .from("users")
        .upsert(
          {
            clerk_id: user.id,
            email: user.primaryEmailAddress?.emailAddress,
            expo_push_token: expoPushToken,
          },
          { onConflict: "clerk_id" }
        );

      if (error) {
        console.error("❌ Sync push token error:", error);
      } else {
        console.log("✅ Push token synced to users table");
      }
    };

    syncToken();
  }, [user]);

  return null;
}
