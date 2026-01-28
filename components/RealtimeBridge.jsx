import { useAuth, useUser } from "@clerk/clerk-expo";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
  resetRealtimeClient,
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

  const rtRef = useRef(null);
  const channelRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const reconnectTimerRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const ensureInFlightRef = useRef(false);

  const debounceRef = useRef(null);

  // ✅ Kill switch: ถ้า sign out แล้วให้หยุดทุกอย่างทันที
  const stopRef = useRef(false);

  // ✅ Track ว่าเคย log "no token" ไปแล้วหรือยัง เพื่อไม่ให้ spam
  const hasLoggedNoTokenRef = useRef(false);

  const signedInReady = isLoaded && isSignedIn && !!clerkUser?.id;

  /* ========================= TIMER HELPERS ========================= */
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  /* ========================= REMOVE CHANNEL ========================= */
  const removeChannel = useCallback(async () => {
    try {
      if (rtRef.current && channelRef.current) {
        await rtRef.current.removeChannel(channelRef.current);
      }
    } catch (e) {
      // Silent - ไม่ต้อง log error ตอน cleanup
    } finally {
      channelRef.current = null;
    }
  }, []);

  /* ========================= HARD STOP (LOGOUT) ========================= */
  const hardStop = useCallback(async () => {
    stopRef.current = true;
    clearReconnectTimer();
    clearTimeout(debounceRef.current);

    try {
      await removeChannel();
    } catch {}

    // ✅ ปิด realtime client singleton ด้วย (กัน websocket พยายาม reconnect)
    try {
      await resetRealtimeClient();
    } catch {}

    rtRef.current = null;
    retryAttemptRef.current = 0;
    ensureInFlightRef.current = false;
    hasLoggedNoTokenRef.current = false; // ✅ Reset flag
  }, [clearReconnectTimer, removeChannel]);

  /* ========================= TOKEN ========================= */
  const getClerkToken = useCallback(async () => {
    if (!signedInReady) {
      // ✅ ถ้ายังไม่ ready ก็ไม่ต้องพยายามเลย
      return null;
    }

    // ✅ ลองเรียก token แค่ครั้งเดียว ไม่ต้อง retry loop
    try {
      const token = await getToken({ template: "supabase" });
      if (token) {
        hasLoggedNoTokenRef.current = false; // ✅ Reset flag เมื่อได้ token
        return token;
      }
    } catch (e) {
      // Silent - token อาจจะยังไม่พร้อม
    }

    // ✅ Log แค่ครั้งแรกที่ไม่มี token
    if (!hasLoggedNoTokenRef.current) {
      console.log("⚠️ RealtimeBridge: waiting for token...");
      hasLoggedNoTokenRef.current = true;
    }

    return null;
  }, [signedInReady, getToken]);

  /* ========================= COUNT (QUERY) ========================= */
  const loadInboxCount = useCallback(async () => {
    if (!signedInReady) return;

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
  }, [signedInReady, clerkUser?.id, getClerkToken, setInboxCount]);

  /* ========================= SCHEDULE RECONNECT ========================= */
  const scheduleReconnect = useCallback(
    (reason = "unknown") => {
      // ✅ ถ้าไม่ได้ sign in แล้ว ห้าม schedule
      if (!signedInReady) return;
      if (stopRef.current) return;
      if (appStateRef.current !== "active") return;
      if (reconnectTimerRef.current) return;

      retryAttemptRef.current += 1;
      const attempt = retryAttemptRef.current;

      // ✅ เพิ่ม delay ให้มากขึ้นเมื่อไม่มี token เพื่อลด spam
      const base = clamp(1500 * Math.pow(2, attempt - 1), 1500, 30000);
      const waitMs = jitter(base, 0.25);

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        ensureRealtime(true, `retry:${reason}`);
      }, waitMs);
    },
    [signedInReady],
  );

  /* ========================= ENSURE REALTIME ========================= */
  const ensureRealtime = useCallback(
    async (force = false, reason = "ensure") => {
      if (!signedInReady) return;
      if (stopRef.current) return;
      if (ensureInFlightRef.current) return;

      ensureInFlightRef.current = true;

      try {
        if (channelRef.current && !force) return;

        const token = await getClerkToken();
        if (!token) {
          // ✅ ตอน logout / session หลุด ไม่ต้อง log spam
          // แค่ schedule retry ด้วย backoff ที่นานขึ้น
          scheduleReconnect("no_token");
          return;
        }

        const rt = getRealtimeClient(token);
        rtRef.current = rt;

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
            () => {
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => loadInboxCount(), 500);
            },
          )
          .subscribe((status) => {
            console.log(`🌉 RealtimeBridge [${channel.topic}]:`, status);

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
              channelRef.current = null;

              try {
                rtRef.current?.realtime?.connect();
              } catch {}

              scheduleReconnect(`${status}:${reason}`);
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
      signedInReady,
      clerkUser?.id,
      getClerkToken,
      loadInboxCount,
      clearReconnectTimer,
      scheduleReconnect,
    ],
  );

  /* ========================= LIFECYCLE ========================= */
  useEffect(() => {
    // ✅ เมื่อ sign out: หยุดทันที + ปิด realtime
    if (!signedInReady) {
      hardStop();
      return;
    }

    // ✅ เมื่อ sign in: เปิดใหม่
    stopRef.current = false;
    retryAttemptRef.current = 0;
    hasLoggedNoTokenRef.current = false;

    loadInboxCount();
    ensureRealtime(false, "init");

    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (!signedInReady || stopRef.current) return;

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
      hardStop();
    };
  }, [signedInReady, loadInboxCount, ensureRealtime, hardStop]);

  return null;
}
