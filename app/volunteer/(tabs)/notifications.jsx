import { useAuth, useUser } from "@clerk/clerk-expo";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
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

// ✨ Animated Notification Card Component
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
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const getTypeIcon = (title) => {
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

  const typeInfo = getTypeIcon(item.title);

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
        <View style={[styles.card, item.unread && styles.unreadCard]}>
          {/* Left Accent Bar */}
          {item.unread && (
            <View
              style={[styles.accentBar, { backgroundColor: typeInfo.color }]}
            />
          )}

          <View style={styles.cardContent}>
            {/* Icon Circle */}
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: `${typeInfo.color}15` },
              ]}
            >
              <Text style={styles.iconText}>{typeInfo.icon}</Text>
            </View>

            {/* Content */}
            <View style={styles.textContainer}>
              <View style={styles.titleRow}>
                <Text
                  style={[styles.title, item.unread && styles.unreadTitle]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {item.unread && <View style={styles.unreadDot} />}
              </View>

              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>

              <View style={styles.footer}>
                <Text style={styles.timestamp}>
                  {formatTimeAgo(item.created_at)}
                </Text>
                <Text style={styles.longPressHint}>กดค้างเพื่อลบ</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ⏰ Time formatting helper
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

export default function VolunteerNotifications() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("DISCONNECTED");
  const [unreadCount, setUnreadCount] = useState(0);
  const [supabaseUserId, setSupabaseUserId] = useState(null);

  const supabaseRef = useRef(null);
  const realtimeRef = useRef(null);
  const channelRef = useRef(null);
  const lastLoadRef = useRef(0);
  const isMountedRef = useRef(true);

  /* ================= FETCH SUPABASE USER ID (RUN ONCE) ================= */
  useEffect(() => {
    if (!isLoaded || !user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        const token = await getToken({ template: "supabase" });
        if (cancelled) return;

        const supabase = createClerkSupabaseClient(token);

        const { data, error } = await supabase
          .from("users")
          .select("id")
          .eq("clerk_id", user.id)
          .single();

        if (error || cancelled) {
          console.error("❌ Fetch user id error:", error);
          return;
        }

        console.log("✅ Supabase user ID:", data.id);
        setSupabaseUserId(data.id);
      } catch (error) {
        if (!cancelled) {
          console.error("❌ Exception in fetch user id:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user?.id]);

  /* ================= LOAD NOTIFICATIONS ================= */
  const loadNotifications = useCallback(async () => {
    if (!supabaseUserId || !supabaseRef.current) return;

    const now = Date.now();
    if (now - lastLoadRef.current < 800) {
      console.log("⏭️ Skipping load (too frequent)");
      return;
    }
    lastLoadRef.current = now;

    try {
      console.log("📥 Loading notifications...");
      const { data, error } = await supabaseRef.current
        .from("notifications")
        .select("*")
        .eq("user_id", supabaseUserId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Load notifications error:", error);
        return;
      }

      if (!isMountedRef.current) return;

      console.log(`✅ Loaded ${data.length} notifications`);
      setNotifications(data);
      setUnreadCount(data.filter((n) => n.unread).length);
      setLoading(false);
    } catch (error) {
      console.error("❌ Exception in loadNotifications:", error);
      setLoading(false);
    }
  }, [supabaseUserId]);

  /* ================= INIT SUPABASE + REALTIME (RUN ONCE) ================= */
  useEffect(() => {
    if (!supabaseUserId) return;

    let mounted = true;
    let channel = null;

    (async () => {
      try {
        const token = await getToken({ template: "supabase" });
        if (!mounted) return;

        console.log("🔑 Got Clerk token");

        supabaseRef.current = createClerkSupabaseClient(token);
        realtimeRef.current = getRealtimeClient(token);

        await loadNotifications();
        if (!mounted) return;

        console.log(`🔌 Subscribing to notifications:${supabaseUserId}`);

        channel = realtimeRef.current
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

              console.log("📨 Realtime event:", payload.eventType);

              if (payload.eventType === "INSERT") {
                setNotifications((prev) => [payload.new, ...prev]);

                if (payload.new.unread) {
                  setUnreadCount((c) => c + 1);
                  console.log("🔔 New unread notification!");
                }
              }

              if (payload.eventType === "UPDATE") {
                setNotifications((prev) =>
                  prev.map((n) => (n.id === payload.new.id ? payload.new : n)),
                );

                setUnreadCount((prevCount) => {
                  const oldNotif = notifications.find(
                    (n) => n.id === payload.new.id,
                  );

                  if (oldNotif?.unread && !payload.new.unread) {
                    return Math.max(0, prevCount - 1);
                  }

                  if (!oldNotif?.unread && payload.new.unread) {
                    return prevCount + 1;
                  }

                  return prevCount;
                });
              }

              if (payload.eventType === "DELETE") {
                setNotifications((prev) => {
                  const deleted = prev.find((n) => n.id === payload.old.id);

                  if (deleted?.unread) {
                    setUnreadCount((c) => Math.max(0, c - 1));
                  }

                  return prev.filter((n) => n.id !== payload.old.id);
                });
              }
            },
          )
          .subscribe((s) => {
            if (!mounted) return;
            console.log("📡 Subscription status:", s);
            setStatus(s);

            if (s === "SUBSCRIBED") {
              console.log("✅ Successfully subscribed to realtime");
            }
          });

        channelRef.current = channel;
      } catch (error) {
        console.error("❌ Exception in realtime setup:", error);
      }
    })();

    return () => {
      mounted = false;
      if (channel && realtimeRef.current) {
        console.log("🔌 Unsubscribing from channel");
        realtimeRef.current.removeChannel(channel);
      }
    };
  }, [supabaseUserId, loadNotifications]);

  /* ================= COMPONENT LIFECYCLE ================= */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ================= REFRESH ================= */
  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  /* ================= MARK AS READ ================= */
  const markAsRead = useCallback(
    async (id) => {
      if (!supabaseRef.current) return;

      try {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));

        const { error } = await supabaseRef.current
          .from("notifications")
          .update({ unread: false })
          .eq("id", id);

        if (error) {
          console.error("❌ Mark as read error:", error);
          await loadNotifications();
          return;
        }

        console.log("✅ Marked as read:", id);
      } catch (error) {
        console.error("❌ Exception in markAsRead:", error);
        await loadNotifications();
      }
    },
    [loadNotifications],
  );

  /* ================= DELETE ================= */
  const deleteNotification = useCallback(
    async (id) => {
      if (!supabaseRef.current) return;

      try {
        const toDelete = notifications.find((n) => n.id === id);

        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (toDelete?.unread) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }

        const { error } = await supabaseRef.current
          .from("notifications")
          .delete()
          .eq("id", id);

        if (error) {
          console.error("❌ Delete error:", error);
          await loadNotifications();
          return;
        }

        console.log("🗑️ Deleted notification:", id);
      } catch (error) {
        console.error("❌ Exception in deleteNotification:", error);
        await loadNotifications();
      }
    },
    [notifications, loadNotifications],
  );

  /* ================= RENDER ITEM ================= */
  const renderItem = useCallback(
    ({ item }) => (
      <NotificationCard
        item={item}
        onPress={() => item.unread && markAsRead(item.id)}
        onLongPress={() => deleteNotification(item.id)}
      />
    ),
    [markAsRead, deleteNotification],
  );

  /* ================= CONNECTION STATUS COMPONENT ================= */
  const ConnectionStatus = () => {
    const getStatusInfo = () => {
      switch (status) {
        case "SUBSCRIBED":
          return { icon: "●", color: "#34C759", text: "เชื่อมต่อแล้ว" };
        case "CHANNEL_ERROR":
          return { icon: "●", color: "#FF3B30", text: "ข้อผิดพลาด" };
        case "TIMED_OUT":
          return { icon: "●", color: "#FF9500", text: "หมดเวลา" };
        case "CLOSED":
          return { icon: "●", color: "#8E8E93", text: "ปิดการเชื่อมต่อ" };
        default:
          return { icon: "●", color: "#FF9500", text: "กำลังเชื่อมต่อ..." };
      }
    };

    const statusInfo = getStatusInfo();

    return (
      <View style={styles.statusContainer}>
        <Text style={[styles.statusDot, { color: statusInfo.color }]}>
          {statusInfo.icon}
        </Text>
        <Text style={styles.statusText}>{statusInfo.text}</Text>
      </View>
    );
  };

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
          <ConnectionStatus />
        </View>

        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(i) => String(i.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={["#007AFF"]}
          />
        }
        renderItem={renderItem}
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
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  statusDot: {
    fontSize: 8,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
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
