import { useAuth, useUser } from "@clerk/clerk-expo";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../config/supabaseClient";
import { useInboxStore } from "../store/inboxStore";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function jitter(ms, pct = 0.25) {
  const delta = ms * pct;
  return Math.floor(ms - delta + Math.random() * (delta * 2));
}

export default function RealtimeBridge() {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser, isLoaded } = useUser();

  const setInboxCount = useInboxStore((s) => s.setInboxCount);

  const rtRef = useRef(null); // SupabaseClient
  const channelRef = useRef(null); // RealtimeChannel
  const appStateRef = useRef(AppState.currentState);

  const reconnectTimerRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const ensureInFlightRef = useRef(false);

  /* ========================= TOKEN (ROBUST) ========================= */
  const getClerkToken = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return null;

    // ✅ ไม่ใช้ skipCache:true
    for (let i = 0; i < 6; i++) {
      try {
        const token = await getToken({ template: "supabase" });
        if (token) return token;
      } catch {}
      await sleep(200 + i * 150);
    }
    return null;
  }, [isLoaded, isSignedIn, getToken]);

  /* ========================= COUNT (QUERY) ========================= */
  const loadInboxCount = useCallback(async () => {
    if (!clerkUser?.id) return;

    const token = await getClerkToken();
    if (!token) return;

    try {
      const supabase = createClerkSupabaseClient(token);

      const { data: chats, error: chatsErr } = await supabase
        .from("chats")
        .select("id")
        .or(`user1_id.eq.${clerkUser.id},user2_id.eq.${clerkUser.id}`);

      if (chatsErr || !chats?.length) {
        setInboxCount(0);
        return;
      }

      let unreadChats = 0;
      for (const chat of chats) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chat.id)
          .neq("sender_id", clerkUser.id)
          .eq("is_read", false);

        if ((count || 0) > 0) unreadChats++;
      }

      setInboxCount(unreadChats);
    } catch (e) {
      console.log("RealtimeBridge loadInboxCount error:", e);
      setInboxCount(0);
    }
  }, [clerkUser?.id, getClerkToken, setInboxCount]);

  /* ========================= TIMER HELPERS ========================= */
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (reason = "unknown") => {
      // ✅ อย่า reconnect ตอน background
      if (appStateRef.current !== "active") return;

      // ✅ อย่าตั้งซ้ำ
      if (reconnectTimerRef.current) return;

      retryAttemptRef.current += 1;
      const attempt = retryAttemptRef.current;

      const base = clamp(800 * Math.pow(1.8, attempt - 1), 800, 12000);
      const waitMs = jitter(base, 0.25);

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        ensureRealtime(true, `timer:${reason}`);
      }, waitMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ========================= REMOVE CHANNEL ========================= */
  const removeChannel = useCallback(async () => {
    const rt = rtRef.current;
    const ch = channelRef.current;

    try {
      if (rt && ch) {
        await rt.removeChannel(ch);
      }
    } catch (e) {
      console.log("RealtimeBridge removeChannel error:", e);
    } finally {
      channelRef.current = null;
    }
  }, []);

  /* ========================= ENSURE REALTIME ========================= */
  const ensureRealtime = useCallback(
    async (force = false, reason = "ensure") => {
      if (!clerkUser?.id) return;

      // ✅ กันซ้อนระหว่าง await
      if (ensureInFlightRef.current) return;
      ensureInFlightRef.current = true;

      try {
        // ✅ ถ้ามีอยู่แล้วและไม่ force ก็ไม่สร้างใหม่
        if (channelRef.current && !force) return;

        const token = await getClerkToken();
        if (!token) {
          console.log("⚠️ RealtimeBridge: no token yet");
          scheduleReconnect("no_token");
          return;
        }

        const rt = getRealtimeClient(token); // SupabaseClient singleton
        rtRef.current = rt;

        // ✅ ถ้า force และมี channel เก่า -> remove ก่อน
        if (force && channelRef.current) {
          try {
            await rt.removeChannel(channelRef.current);
          } catch {}
          channelRef.current = null;
        }

        const channel = rt
          .channel(`inbox-${clerkUser.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages" },
            () => loadInboxCount(),
          )
          .subscribe((status) => {
            console.log("🌉 RealtimeBridge:", channel.topic, status);

            if (status === "SUBSCRIBED") {
              retryAttemptRef.current = 0;
              clearReconnectTimer();
              return;
            }

            if (
              status === "CLOSED" ||
              status === "TIMED_OUT" ||
              status === "CHANNEL_ERROR"
            ) {
              // ✅ สำคัญ: เคลียร์ ref เพื่อให้สร้างใหม่ได้
              channelRef.current = null;

              // ✅ ช่วยให้ socket กลับมาไวขึ้น
              try {
                rtRef.current?.realtime?.connect();
              } catch {}

              scheduleReconnect(`status:${status}:${reason}`);
            }
          });

        channelRef.current = channel;
      } catch (e) {
        console.log("RealtimeBridge ensureRealtime error:", e);
        channelRef.current = null;
        scheduleReconnect(`exception:${reason}`);
      } finally {
        ensureInFlightRef.current = false;
      }
    },
    [
      clerkUser?.id,
      getClerkToken,
      loadInboxCount,
      clearReconnectTimer,
      removeChannel,
      scheduleReconnect,
    ],
  );

  /* ========================= LIFECYCLE ========================= */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser?.id) return;

    loadInboxCount();
    ensureRealtime(false, "init");

    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === "active") {
        loadInboxCount();

        try {
          rtRef.current?.realtime?.connect();
        } catch {}

        ensureRealtime(true, "foreground");
      }
    });

    return () => {
      sub.remove();
      clearReconnectTimer();
      removeChannel();
    };
  }, [
    isLoaded,
    isSignedIn,
    clerkUser?.id,
    loadInboxCount,
    ensureRealtime,
    clearReconnectTimer,
    removeChannel,
  ]);

  return null;
}
