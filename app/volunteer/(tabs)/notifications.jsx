import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

export default function VolunteerNotifications() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("DISCONNECTED");
  const [unreadCount, setUnreadCount] = useState(0);

  const channelRef = useRef(null);
  const realtimeClientRef = useRef(null);
  const supabaseRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;
    let channel = null;

    const init = async () => {
      try {
        setLoading(true);

        const token = await getToken({ template: "supabase" });
        if (!mounted) return;

        supabaseRef.current = createClerkSupabaseClient(token);
        realtimeClientRef.current = getRealtimeClient(token);

        await loadNotifications();

        if (!mounted) return;
        channel = setupRealtime();
        channelRef.current = channel;
      } catch (error) {
        console.error("❌ Init error:", error);
        if (mounted) setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;

      if (channel) {
        console.log("🧹 Cleaning up channel...");
        realtimeClientRef.current?.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [user?.id]);

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabaseRef.current
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Load error:", error);
      } else {
        console.log(`✅ Loaded ${data?.length || 0} notifications`);
        setNotifications(data || []);
        setUnreadCount(data?.filter((n) => n.unread).length || 0);
      }
    } catch (error) {
      console.error("❌ Load exception:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (notificationId) => {
    try {
      const { error } = await supabaseRef.current
        .from("notifications")
        .update({ unread: false })
        .eq("id", notificationId);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, unread: false } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("❌ Mark as read error:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter((n) => n.unread).map((n) => n.id);

      if (unreadIds.length === 0) {
        Alert.alert("แจ้งเตือน", "ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน");
        return;
      }

      const { error } = await supabaseRef.current
        .from("notifications")
        .update({ unread: false })
        .in("id", unreadIds);

      if (!error) {
        setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
        setUnreadCount(0);
        Alert.alert("สำเร็จ", "ทำเครื่องหมายอ่านทั้งหมดแล้ว");
      }
    } catch (error) {
      console.error("❌ Mark all as read error:", error);
      Alert.alert("ผิดพลาด", "ไม่สามารถทำเครื่องหมายอ่านได้");
    }
  };

  const deleteNotification = async (notificationId) => {
    Alert.alert("ยืนยันการลบ", "คุณต้องการลบการแจ้งเตือนนี้ใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabaseRef.current
              .from("notifications")
              .delete()
              .eq("id", notificationId);

            if (!error) {
              const deletedNotif = notifications.find(
                (n) => n.id === notificationId
              );
              setNotifications((prev) =>
                prev.filter((n) => n.id !== notificationId)
              );
              if (deletedNotif?.unread) {
                setUnreadCount((prev) => Math.max(0, prev - 1));
              }
            }
          } catch (error) {
            console.error("❌ Delete error:", error);
            Alert.alert("ผิดพลาด", "ไม่สามารถลบได้");
          }
        },
      },
    ]);
  };

  const setupRealtime = () => {
    if (!realtimeClientRef.current) {
      console.error("❌ No realtime client");
      return null;
    }

    const channelName = `notifications:${user.id}`;
    console.log("📡 Setting up channel:", channelName);

    const channel = realtimeClientRef.current
      .channel(channelName, {
        config: {
          broadcast: { self: true },
          presence: { key: user.id },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("🔔 New notification:", payload);
          setNotifications((prev) => {
            if (prev.some((n) => n.id === payload.new.id)) {
              console.log("⚠️ Duplicate notification, skipping");
              return prev;
            }
            return [payload.new, ...prev];
          });
          if (payload.new.unread) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("📝 Updated notification:", payload);
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? payload.new : n))
          );
          // อัพเดท unread count
          const oldUnread = payload.old.unread;
          const newUnread = payload.new.unread;
          if (oldUnread && !newUnread) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          } else if (!oldUnread && newUnread) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("🗑️ Deleted notification:", payload);
          setNotifications((prev) =>
            prev.filter((n) => n.id !== payload.old.id)
          );
          if (payload.old.unread) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Realtime status:", status);

        if (status === "CHANNEL_ERROR") {
          console.warn("⚠️ Channel error (may auto-recover)");
          setTimeout(() => {
            setStatus((current) =>
              current === "CHANNEL_ERROR" ? current : ""
            );
          }, 2000);
        } else if (status === "TIMED_OUT") {
          console.error("❌ Connection timed out");
          setStatus(status);
        } else {
          setStatus(status);
        }
      });

    return channel;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>กำลังโหลด...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      {/* Header with status and actions */}
      <View
        style={[
          styles.header,
          { backgroundColor: status === "SUBSCRIBED" ? "#d4edda" : "#f8d7da" },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.status}>
            {status === "SUBSCRIBED"
              ? "🟢 เชื่อมต่อแล้ว"
              : "🔴 กำลังเชื่อมต่อ..."}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>อ่านทั้งหมด</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#007bff"]}
            tintColor="#007bff"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => item.unread && markAsRead(item.id)}
            onLongPress={() => deleteNotification(item.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.card, item.unread && styles.cardUnread]}>
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  {item.unread && <View style={styles.unreadDot} />}
                  <Text
                    style={[styles.title, item.unread && styles.titleUnread]}
                  >
                    {item.title}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => deleteNotification(item.id)}
                  style={styles.deleteBtn}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.desc}>{item.description}</Text>

              <View style={styles.footer}>
                <Text style={styles.time}>
                  {new Date(item.created_at).toLocaleString("th-TH", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>

                {item.unread && (
                  <TouchableOpacity
                    onPress={() => markAsRead(item.id)}
                    style={styles.markReadBtn}
                  >
                    <Text style={styles.markReadText}>
                      ทำเครื่องหมายว่าอ่านแล้ว
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>ไม่มีการแจ้งเตือน</Text>
            <Text style={styles.emptySubtext}>
              การแจ้งเตือนใหม่จะปรากฏที่นี่
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  status: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#dc3545",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#007bff",
    borderRadius: 6,
  },
  markAllText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  listContainer: {
    paddingVertical: 8,
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardUnread: {
    backgroundColor: "#f0f8ff",
    borderLeftWidth: 4,
    borderLeftColor: "#007bff",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007bff",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  titleUnread: {
    fontWeight: "700",
    color: "#000",
  },
  deleteBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#f8f9fa",
  },
  deleteText: {
    fontSize: 18,
    color: "#6c757d",
    fontWeight: "600",
  },
  desc: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  time: {
    fontSize: 11,
    color: "#888",
  },
  markReadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#007bff10",
    borderRadius: 4,
  },
  markReadText: {
    fontSize: 11,
    color: "#007bff",
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.3,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
});
