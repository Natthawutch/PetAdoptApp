import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

export default function Header() {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser, isLoaded } = useUser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [locationText, setLocationText] = useState("กำลังตรวจสอบตำแหน่ง...");

  const channelRef = useRef(null);

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
        // ✅ ใช้ authenticated client
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
  const loadInboxCount = async () => {
    if (!user?.id) return;

    try {
      // ✅ ใช้ authenticated client
      const token = await getClerkToken();
      const supabase = createClerkSupabaseClient(token);

      // ✅ นับ unread messages ในแชทที่ user เป็น participant
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

      // นับแชทที่มี unread messages
      let unreadChats = 0;

      for (const chatId of chatIds) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chatId)
          .neq("sender_id", user.id)
          .eq("is_read", false);

        if (count > 0) unreadChats++;
      }

      setInboxCount(unreadChats);
    } catch (err) {
      console.error("loadInboxCount error:", err);
      setInboxCount(0);
    }
  };

  useEffect(() => {
    if (user?.id) loadInboxCount();
  }, [user?.id]);

  /* ========================= REALTIME INBOX ========================= */
  useEffect(() => {
    if (!user?.id) return;

    const setupRealtime = async () => {
      try {
        // ✅ ใช้ authenticated realtime client
        const token = await getClerkToken();
        const rt = getRealtimeClient(token);

        if (channelRef.current) {
          await channelRef.current.unsubscribe();
          channelRef.current = null;
        }

        const channel = rt
          .channel(`header-inbox-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
            },
            () => {
              console.log("📬 Header: message changed, reloading inbox count");
              loadInboxCount();
            }
          )
          .subscribe((status) => {
            console.log("📬 Header realtime status:", status);
          });

        channelRef.current = channel;
      } catch (err) {
        console.error("setupRealtime error:", err);
      }
    };

    setupRealtime();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [user?.id]);

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
