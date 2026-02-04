// app/volunteer/(tabs)/notifications.jsx
// ✅ รวม "notifications" + "adoption_requests" ให้แสดงใน NotificationCard เดียวกัน
// ✅ NotificationCard รองรับทั้ง 2 แบบ + กดเข้า request detail ได้
// ✅ ไม่แสดงสถานะเชื่อมต่อ (ไม่มี status UI)

import { useAuth, useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../../../config/supabaseClient";

const { width } = Dimensions.get("window");

/* ================= HELPERS ================= */
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "เมื่อสักครู่";
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return time.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: diffDays > 365 ? "numeric" : undefined,
  });
};

const getTypeIcon = (title = "") => {
  if (title.includes("อนุมัติ") || title.includes("ยืนยัน"))
    return { icon: "✅", color: "#34C759" };
  if (title.includes("ปฏิเสธ") || title.includes("ยกเลิก"))
    return { icon: "❌", color: "#FF3B30" };
  if (title.includes("รอ") || title.includes("พิจารณา"))
    return { icon: "⏳", color: "#FF9500" };
  if (title.includes("ข้อความ") || title.includes("แจ้ง"))
    return { icon: "💬", color: "#007AFF" };
  return { icon: "🔔", color: "#5856D6" };
};

const getEmojiByCategory = (cat) => {
  if (!cat) return "🐾";
  const lower = String(cat).toLowerCase();
  if (lower.includes("สุนัข") || lower.includes("dog")) return "🐶";
  if (lower.includes("แมว") || lower.includes("cat")) return "🐱";
  return "🐾";
};

const REQUEST_STATUS_TEXT = {
  pending: "รอดำเนินการ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธแล้ว",
};
const REQUEST_STATUS_COLOR = {
  pending: "#FF9500",
  approved: "#34C759",
  rejected: "#FF3B30",
};

/* ================= NotificationCard (รองรับ 2 แบบ) ================= */
const NotificationCard = ({ item, onPress, onLongPress }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [slideAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const isRequest = item?.__type === "request";

  const createdAt = item.created_at;

  const title = isRequest ? item.title : item.title;
  const description = isRequest ? item.description : item.description;

  const accentColor = isRequest
    ? item.accentColor
    : getTypeIcon(item.title).color;
  const iconEmoji = isRequest ? item.icon : getTypeIcon(item.title).icon;

  const unread = !isRequest && !!item.unread;

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [50, 0],
            }),
          },
          { scale: scaleAnim },
        ],
        opacity: slideAnim,
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={[styles.card, unread && styles.unreadCard]}>
          {/* accent bar เฉพาะ notification ที่ unread */}
          {unread && (
            <View
              style={[styles.accentBar, { backgroundColor: accentColor }]}
            />
          )}

          <View style={styles.cardContent}>
            {/* LEFT: request = pet avatar, notification = icon circle */}
            {isRequest ? (
              item.petImage ? (
                <Image
                  source={{ uri: item.petImage }}
                  style={styles.petAvatar}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={["#667eea", "#764ba2"]}
                  style={styles.petAvatar}
                >
                  <Text style={styles.petEmoji}>
                    {getEmojiByCategory(item.petCategory)}
                  </Text>
                </LinearGradient>
              )
            ) : (
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${accentColor}15` },
                ]}
              >
                <Text style={styles.iconText}>{iconEmoji}</Text>
              </View>
            )}

            <View style={styles.textContainer}>
              <View style={styles.titleRow}>
                <Text
                  style={[styles.title, unread && styles.unreadTitle]}
                  numberOfLines={2}
                >
                  {title}
                </Text>
                {unread && <View style={styles.unreadDot} />}
              </View>

              <Text
                style={[
                  styles.description,
                  isRequest && { color: accentColor, fontWeight: "600" },
                ]}
                numberOfLines={2}
              >
                {description}
              </Text>

              <View style={styles.footer}>
                <Text style={styles.timestamp}>{formatTimeAgo(createdAt)}</Text>
                {!isRequest && (
                  <Text style={styles.longPressHint}>กดค้างเพื่อลบ</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function VolunteerNotifications() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // supabase user (uuid) สำหรับ notifications table
  const [supabaseUserId, setSupabaseUserId] = useState(null);

  const supabaseRef = useRef(null);
  const realtimeRef = useRef(null);

  const notifChannelRef = useRef(null);
  const reqChannelRef = useRef(null);

  const lastLoadRef = useRef(0);
  const isMountedRef = useRef(true);

  const subscribeRunIdRef = useRef(0);

  /* ================= GET “FRESH” SUPABASE CLIENT ================= */
  const getSupabase = useCallback(async () => {
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);
    supabaseRef.current = supabase;
    return supabase;
  }, [getToken]);

  /* ================= GET “FRESH” REALTIME CLIENT ================= */
  const getRealtime = useCallback(async () => {
    const token = await getToken({ template: "supabase" });
    const realtime = getRealtimeClient(token); // realtime object
    realtimeRef.current = realtime;
    return realtime;
  }, [getToken]);

  /* ================= FETCH SUPABASE USER ID (uuid) ================= */
  useEffect(() => {
    if (!isLoaded || !user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        const supabase = await getSupabase();
        if (cancelled) return;

        const { data, error } = await supabase
          .from("users")
          .select("id")
          .eq("clerk_id", user.id)
          .single();

        if (cancelled) return;

        if (error) {
          console.error("❌ Fetch user id error:", error);
          return;
        }

        if (!data?.id) {
          console.error("❌ Fetch user id: no data");
          return;
        }

        setSupabaseUserId((prev) => (prev === data.id ? prev : data.id));
      } catch (e) {
        if (!cancelled) console.error("❌ Exception in fetch user id:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user?.id, getSupabase]);

  /* ================= LOAD NOTIFICATIONS TABLE ================= */
  const loadNotifications = useCallback(async () => {
    if (!supabaseUserId) return;

    const now = Date.now();
    if (now - lastLoadRef.current < 600) return;
    lastLoadRef.current = now;

    try {
      const supabase = await getSupabase();

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", supabaseUserId)
        .order("created_at", { ascending: false });

      if (error) {
        if (String(error?.message || "").includes("JWT expired")) {
          const supabase2 = await getSupabase();
          const retry = await supabase2
            .from("notifications")
            .select("*")
            .eq("user_id", supabaseUserId)
            .order("created_at", { ascending: false });

          if (retry.error) {
            console.error("❌ Load notifications retry error:", retry.error);
            return;
          }

          if (!isMountedRef.current) return;
          setNotifications(retry.data || []);
          setUnreadCount((retry.data || []).filter((n) => n.unread).length);
          return;
        }

        console.error("❌ Load notifications error:", error);
        return;
      }

      if (!isMountedRef.current) return;

      setNotifications(data || []);
      setUnreadCount((data || []).filter((n) => n.unread).length);
    } catch (e) {
      console.error("❌ Exception in loadNotifications:", e);
    }
  }, [supabaseUserId, getSupabase]);

  /* ================= LOAD ADOPTION REQUESTS (owner_id = Clerk user.id) ================= */
  const loadRequests = useCallback(async () => {
    if (!user?.id) return;

    try {
      const supabase = await getSupabase();

      const { data, error } = await supabase
        .from("adoption_requests")
        .select(
          `
          id,
          status,
          created_at,
          pets (
            name,
            image_url,
            category
          )
        `,
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        if (String(error?.message || "").includes("JWT expired")) {
          const supabase2 = await getSupabase();
          const retry = await supabase2
            .from("adoption_requests")
            .select(
              `
              id,
              status,
              created_at,
              pets (
                name,
                image_url,
                category
              )
            `,
            )
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false });

          if (retry.error) {
            console.error("❌ Load requests retry error:", retry.error);
            return;
          }

          if (!isMountedRef.current) return;
          setRequests(retry.data || []);
          return;
        }

        console.error("❌ Load requests error:", error);
        return;
      }

      if (!isMountedRef.current) return;
      setRequests(data || []);
    } catch (e) {
      console.error("❌ Exception in loadRequests:", e);
    }
  }, [user?.id, getSupabase]);

  /* ================= INIT REALTIME (2 CHANNELS) ================= */
  useEffect(() => {
    if (!supabaseUserId || !user?.id) return;

    let mounted = true;
    const runId = ++subscribeRunIdRef.current;

    (async () => {
      try {
        // initial loads
        await Promise.all([loadNotifications(), loadRequests()]);
        if (!mounted || runId !== subscribeRunIdRef.current) return;

        const realtime = await getRealtime();
        if (!mounted || runId !== subscribeRunIdRef.current) return;

        // cleanup old channels
        try {
          if (notifChannelRef.current && realtimeRef.current) {
            realtimeRef.current.removeChannel(notifChannelRef.current);
            notifChannelRef.current = null;
          }
        } catch {}
        try {
          if (reqChannelRef.current && realtimeRef.current) {
            realtimeRef.current.removeChannel(reqChannelRef.current);
            reqChannelRef.current = null;
          }
        } catch {}

        // notifications channel (by supabase user uuid)
        notifChannelRef.current = realtime
          .channel(`notifications:${supabaseUserId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${supabaseUserId}`,
            },
            (payload) => {
              if (!mounted) return;

              if (payload.eventType === "INSERT") {
                setNotifications((prev) => [payload.new, ...prev]);
                if (payload.new?.unread) setUnreadCount((c) => c + 1);
                return;
              }

              if (payload.eventType === "UPDATE") {
                setNotifications((prev) => {
                  const old = prev.find((n) => n.id === payload.new.id);
                  const next = prev.map((n) =>
                    n.id === payload.new.id ? payload.new : n,
                  );

                  if (old?.unread !== payload.new?.unread) {
                    setUnreadCount((c) =>
                      payload.new?.unread ? c + 1 : Math.max(0, c - 1),
                    );
                  }
                  return next;
                });
                return;
              }

              if (payload.eventType === "DELETE") {
                setNotifications((prev) => {
                  const deleted = prev.find((n) => n.id === payload.old.id);
                  if (deleted?.unread)
                    setUnreadCount((c) => Math.max(0, c - 1));
                  return prev.filter((n) => n.id !== payload.old.id);
                });
              }
            },
          )
          .subscribe();

        // adoption_requests channel (by owner_id = Clerk user.id)
        reqChannelRef.current = realtime
          .channel(`adoption-requests:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "adoption_requests",
              filter: `owner_id=eq.${user.id}`,
            },
            () => {
              // reload requests (simple + safe)
              loadRequests();
            },
          )
          .subscribe();
      } catch (e) {
        console.error("❌ Exception in realtime setup:", e);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      try {
        if (notifChannelRef.current && realtimeRef.current) {
          realtimeRef.current.removeChannel(notifChannelRef.current);
        }
      } catch {}
      try {
        if (reqChannelRef.current && realtimeRef.current) {
          realtimeRef.current.removeChannel(reqChannelRef.current);
        }
      } catch {}
      notifChannelRef.current = null;
      reqChannelRef.current = null;
    };
  }, [supabaseUserId, user?.id, loadNotifications, loadRequests, getRealtime]);

  /* ================= COMPONENT LIFECYCLE ================= */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ================= COMBINED FEED ================= */
  const combinedItems = useMemo(() => {
    const reqItems = (requests || []).map((r) => {
      const petName = r.pets?.name || "สัตว์เลี้ยง";
      const status = r.status;
      const color = REQUEST_STATUS_COLOR[status] || "#5856D6";
      const icon =
        status === "approved" ? "✅" : status === "rejected" ? "❌" : "⏳";

      return {
        __type: "request",
        id: r.id,
        created_at: r.created_at,
        title: `คำขอรับเลี้ยง ${petName}`,
        description: `สถานะ: ${REQUEST_STATUS_TEXT[status] || status}`,
        accentColor: color,
        icon,
        petImage: r.pets?.image_url || null,
        petCategory: r.pets?.category || null,
      };
    });

    const notiItems = (notifications || []).map((n) => ({
      __type: "notification",
      ...n,
    }));

    return [...reqItems, ...notiItems].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    );
  }, [requests, notifications]);

  /* ================= REFRESH ================= */
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadNotifications(), loadRequests()]);
    setRefreshing(false);
  };

  /* ================= MARK AS READ ================= */
  const markAsRead = useCallback(
    async (id) => {
      try {
        const supabase = await getSupabase();

        // optimistic update
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));

        const { error } = await supabase
          .from("notifications")
          .update({ unread: false })
          .eq("id", id);

        if (error) {
          console.error("❌ Mark as read error:", error);
          await loadNotifications();
          return;
        }
      } catch (e) {
        console.error("❌ Exception in markAsRead:", e);
        await loadNotifications();
      }
    },
    [getSupabase, loadNotifications],
  );

  /* ================= DELETE NOTIFICATION ================= */
  const deleteNotification = useCallback(
    async (id) => {
      try {
        const supabase = await getSupabase();

        setNotifications((prev) => {
          const toDelete = prev.find((n) => n.id === id);
          if (toDelete?.unread) setUnreadCount((c) => Math.max(0, c - 1));
          return prev.filter((n) => n.id !== id);
        });

        const { error } = await supabase
          .from("notifications")
          .delete()
          .eq("id", id);

        if (error) {
          console.error("❌ Delete error:", error);
          await loadNotifications();
        }
      } catch (e) {
        console.error("❌ Exception in deleteNotification:", e);
        await loadNotifications();
      }
    },
    [getSupabase, loadNotifications],
  );

  /* ================= UI ================= */
  if (!isLoaded || loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>กำลังโหลด...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>การแจ้งเตือน</Text>
        </View>

        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {/* Feed */}
      <FlatList
        data={combinedItems}
        keyExtractor={(i) => `${i.__type}-${i.id}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={["#007AFF"]}
          />
        }
        renderItem={({ item }) => (
          <NotificationCard
            item={item}
            onPress={() => {
              if (item.__type === "request") {
                router.push(`/requests/${item.id}`);
                return;
              }
              if (item.unread) markAsRead(item.id);
            }}
            onLongPress={() => {
              if (item.__type === "notification") deleteNotification(item.id);
            }}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
            </View>
            <Text style={styles.emptyTitle}>ไม่มีการแจ้งเตือน</Text>
            <Text style={styles.emptySubtitle}>
              คุณจะได้รับการแจ้งเตือนที่นี่
            </Text>
          </View>
        }
      />
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
  loadingCard: {
    backgroundColor: "#fff",
    padding: 32,
    borderRadius: 20,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#8E8E93",
    fontWeight: "500",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  badge: {
    backgroundColor: "#FF3B30",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  unreadCard: {
    backgroundColor: "#F0F8FF",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardContent: {
    flexDirection: "row",
    padding: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 24,
  },
  petAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  petEmoji: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    lineHeight: 22,
  },
  unreadTitle: {
    fontWeight: "700",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007AFF",
    marginLeft: 8,
  },
  description: {
    fontSize: 14,
    color: "#3C3C43",
    lineHeight: 20,
    marginBottom: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timestamp: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "500",
  },
  longPressHint: {
    fontSize: 11,
    color: "#C7C7CC",
    fontStyle: "italic",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 22,
  },
});
