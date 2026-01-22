// components/RealtimeBridge.jsx
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";
import { getRealtimeClient } from "../config/supabaseClient";
import { realtimeBus, RT_EVENTS } from "../utils/realtimeBus";

export default function RealtimeBridge() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const realtimeRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        if (!user?.id) return;

        // ✅ token สด (ลดอาการ realtime หลุดเพราะ token เก่า)
        const token = await getToken({ template: "supabase", skipCache: true });
        if (!token || cancelled) return;

        const realtime = getRealtimeClient(token);
        realtimeRef.current = realtime;

        // ✅ ถ้ามี channel เก่า -> ลบทิ้งก่อน
        if (channelRef.current) {
          try {
            await realtime.removeChannel(channelRef.current);
          } catch {}
          channelRef.current = null;
        }

        // ✅ 1) adoption_requests ของ owner นี้
        const adoptionChannel = realtime
          .channel(`rt-adoption-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "adoption_requests",
              filter: `owner_id=eq.${user.id}`,
            },
            (payload) => {
              realtimeBus.emit(RT_EVENTS.ADOPTION_REQUESTS_CHANGED, payload);
            },
          )
          .subscribe((status) => {
            console.log("📡 adoption_requests realtime:", status);
          });

        channelRef.current = adoptionChannel;

        // (ถ้าอยากเพิ่มตารางอื่นใน bridge นี้ เช่น reports/notifications
        // ให้สร้างอีก channel หรือใช้ channel เดียวแล้ว on หลายอันก็ได้)
      } catch (e) {
        console.error("❌ RealtimeBridge start error:", e);
      }
    };

    start();

    return () => {
      cancelled = true;
      (async () => {
        try {
          if (realtimeRef.current && channelRef.current) {
            await realtimeRef.current.removeChannel(channelRef.current);
          }
        } catch {}
        channelRef.current = null;
        realtimeRef.current = null;
      })();
    };
  }, [user?.id, getToken]);

  return null;
}
