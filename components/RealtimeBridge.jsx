import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";
import { getRealtimeClient } from "../config/supabaseClient";

export default function RealtimeBridge() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const channelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user?.id) return;

      const token = await getToken({ template: "supabase", skipCache: true });
      const realtime = getRealtimeClient(token);

      if (cancelled) return;

      // ปิด channel เก่าก่อน
      if (channelRef.current) {
        try {
          await channelRef.current.unsubscribe();
        } catch {}
        channelRef.current = null;
      }

      channelRef.current = realtime
        .channel(`adoption-requests-global-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "adoption_requests",
            filter: `owner_id=eq.${user.id}`,
          },
          (payload) => {
            // ยิง event กลางให้หน้าอื่นฟังได้
            // เช่น ใช้ EventEmitter หรือ Zustand/Redux
            // ตัวอย่างง่ายสุด: console.log
            console.log("🔔 adoption_requests changed:", payload.eventType);
          }
        )
        .subscribe((status) => {
          console.log("📡 Global realtime:", status);
        });
    })();

    return () => {
      cancelled = true;
      (async () => {
        if (channelRef.current) {
          try {
            await channelRef.current.unsubscribe();
          } catch {}
          channelRef.current = null;
        }
      })();
    };
  }, [user?.id, getToken]);

  return null;
}
