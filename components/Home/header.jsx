// components/Header.jsx
// ✅ Fix realtime “CLOSED บ่อย” ใน Header:
// - ใช้ rtRef + removeChannel แทน unsubscribe
// - เพิ่ม backoff reconnect เมื่อ CLOSED / TIMED_OUT / CHANNEL_ERROR
// - reconnect ตอนกลับ foreground
// - กัน setup ซ้ำถี่ ๆ

import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../../config/supabaseClient";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function jitter(ms, pct = 0.2) {
  const delta = ms * pct;
  return Math.floor(ms - delta + Math.random() * (delta * 2));
}

export default function Header() {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser, isLoaded } = useUser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [locationText, setLocationText] = useState("กำลังตรวจสอบตำแหน่ง...");

  const channelRef = useRef(null);
  const rtRef = useRef(null);

  const reconnectTimerRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const setupRealtimeRef = useRef(null);

  const appStateRef = useRef(AppState.currentState);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const removeChannel = useCallback(async () => {
    try {
      if (rtRef.current && channelRef.current) {
        await rtRef.current.removeChannel(channelRef.current);
      }
    } catch (e) {
      console.log("Header removeChannel error:", e);
    } finally {
      channelRef.current = null;
      rtRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (reason = "unknown") => {
      clearReconnectTimer();
      retryAttemptRef.current += 1;

      const attempt = retryAttemptRef.current;
      const base = clamp(800 * Math.pow(1.8, attempt - 1), 800, 12000);
      const waitMs = jitter(base, 0.25);

      reconnectTimerRef.current = setTimeout(() => {
        setupRealtimeRef.current?.({ force: true, reason });
      }, waitMs);
    },
    [removeChannel],
  );

  /* ========================= HELPER: GET CLERK TOKEN ========================= */
  const getClerkToken = async () => {
    const token = await getToken({ template: "supabase", skipCache: true });
    if (!token) throw new Error("Missing Clerk token");
    return token;
  };

  /* ========================= LOAD USER (SUPABASE) ========================= */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser) return;

    const loadUser = async () => {
      try {
        const token = await getClerkToken();
        const supabase = createClerkSupabaseClient(token);

        let retries = 0;
        let data = null;

        while (!data && retries < 3) {
          const result = await supabase
            .from("users")
            .select("full_name, avatar_url")
            .eq("clerk_id", clerkUser.id)
            .maybeSingle();

          if (result.data) {
            data = result.data;
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
          retries++;
        }

        setUser({
          id: clerkUser.id,
          full_name: data?.full_name || clerkUser.fullName || "ผู้ใช้งาน",
          avatar_url:
            data?.avatar_url ||
            clerkUser.imageUrl ||
            "https://www.gravatar.com/avatar/?d=mp",
        });
      } catch (e) {
        console.log("HEADER LOAD USER ERROR:", e);
        setUser({
          id: clerkUser.id,
          full_name: clerkUser.fullName || "ผู้ใช้งาน",
          avatar_url:
            clerkUser.imageUrl || "https://www.gravatar.com/avatar/?d=mp",
        });
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [isLoaded, isSignedIn, clerkUser?.id]);

  /* ========================= UNREAD INBOX COUNT ========================= */
  const loadInboxCount = useCallback(async () => {
    if (!user?.id) return;

    try {
      const token = await getClerkToken();
      const supabase = createClerkSupabaseClient(token);

      const { data: chats, error: chatsErr } = await supabase
        .from("chats")
        .select("id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (chatsErr || !chats) {
        setInboxCount(0);
        return;
      }

      const chatIds = chats.map((c) => c.id);
      if (chatIds.length === 0) {
        setInboxCount(0);
        return;
      }

      let unreadChats = 0;

      for (const chatId of chatIds) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chatId)
          .neq("sender_id", user.id)
          .eq("is_read", false);

        if ((count || 0) > 0) unreadChats++;
      }

      setInboxCount(unreadChats);
    } catch (err) {
      console.error("loadInboxCount error:", err);
      setInboxCount(0);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadInboxCount();
  }, [user?.id, loadInboxCount]);

  /* ========================= REALTIME INBOX (STABLE) ========================= */
  useEffect(() => {
    if (!user?.id) return;

    const setupRealtime = async ({ force = false, reason = "init" } = {}) => {
      try {
        // กัน setup ซ้ำ ถ้ามี channel แล้ว และไม่ได้ force
        if (channelRef.current && !force) return;

        const token = await getClerkToken();
        const rt = getRealtimeClient(token);
        rtRef.current = rt;

        await removeChannel();

        const channel = rt
          .channel(`header-inbox-${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages" },
            () => {
              loadInboxCount();
            },
          )
          .subscribe((status) => {
            console.log("📬 Header realtime status:", status);

            if (status === "SUBSCRIBED") {
              retryAttemptRef.current = 0;
              return;
            }

            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              scheduleReconnect(`status:${status}:${reason}`);
              return;
            }

            if (status === "CLOSED") {
              scheduleReconnect(`status:CLOSED:${reason}`);
            }
          });

        channelRef.current = channel;
      } catch (err) {
        console.error("Header setupRealtime error:", err);
        scheduleReconnect(`exception:${reason}`);
      }
    };

    setupRealtimeRef.current = setupRealtime;

    // init
    setupRealtime({ force: true, reason: "init" });

    // reconnect ตอนกลับ foreground
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === "active") {
        loadInboxCount();
        setupRealtimeRef.current?.({ force: true, reason: "foreground" });
      }
    });

    return () => {
      sub.remove();
      clearReconnectTimer();
      removeChannel();
    };
  }, [user?.id, loadInboxCount, removeChannel, scheduleReconnect]);

  /* ========================= LOCATION ========================= */
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationText("ไม่สามารถระบุตำแหน่งได้");
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (reverseGeocode.length > 0) {
          const { city, region, country } = reverseGeocode[0];
          setLocationText(`${city || region || "ไม่ทราบ"}, ${country || ""}`);
        }
      } catch {
        setLocationText("ไม่สามารถระบุตำแหน่งได้");
      }
    })();
  }, []);

  /* ========================= LOADING ========================= */
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }

  /* ========================= UI ========================= */
  return (
    <View style={styles.container}>
      {/* LEFT */}
      <TouchableOpacity
        style={styles.leftSection}
        onPress={() => router.push("/(tabs)/profile")}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{
              uri: user?.avatar_url || "https://www.gravatar.com/avatar/?d=mp",
            }}
            style={styles.avatar}
          />
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {user?.full_name}
          </Text>
          <View style={styles.locationRow}>
            <Ionicons
              name="location-sharp"
              size={12}
              color="rgba(255,255,255,0.8)"
            />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationText}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* RIGHT */}
      <View style={styles.rightIcons}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/Favorite/favorite")}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name="heart" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/Inbox/inbox")}
        >
          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons
              name="message-text"
              size={22}
              color="#fff"
            />
            {inboxCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {inboxCount > 99 ? "99+" : inboxCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ========================= STYLES ========================= */

const styles = StyleSheet.create({
  loadingContainer: {
    backgroundColor: "#8B5CF6",
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 20,
    alignItems: "center",
    justifyContent: "center",
    height: 100,
  },
  container: {
    backgroundColor: "#8B5CF6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 20,
    elevation: 4,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: { marginRight: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "#e5e7eb",
  },
  userInfo: { flex: 1 },
  userName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: { padding: 4 },
  iconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
