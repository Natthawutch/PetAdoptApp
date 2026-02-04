// ✅ Inbox.js - Full code (อัปเดต store: เวลา+จำนวนเข้า)  *แก้เฉพาะส่วนที่เกี่ยวข้อง แต่ให้เป็นไฟล์เต็มตามที่คุณส่งมา*
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../../config/supabaseClient";
import { useInboxStore } from "../../store/inboxStore";

export default function Inbox() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const setInboxMeta = useInboxStore((s) => s.setInboxMeta);

  const [chats, setChats] = useState([]);
  const [filteredChats, setFilteredChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const channelRef = useRef(null);

  // ✅ NEW: กันโหลดซ้ำทุกครั้งที่กลับมาหน้า Inbox
  const didInitialLoadRef = useRef(false);

  const getClerkToken = async () => {
    const token = await getToken({ template: "supabase", skipCache: true });
    if (!token) throw new Error("Missing Clerk token");
    return token;
  };

  // ✅ helper: คำนวณ meta ใหม่จาก list
  const syncMetaFromList = (list) => {
    const totalUnread = (list || []).reduce(
      (sum, c) => sum + (c.unread_count || 0),
      0,
    );
    const latestAt = list?.[0]?.last_message_at || null;
    setInboxMeta({ inboxCount: totalUnread, lastInboxAt: latestAt });
  };

  // โหลด chats
  const loadChats = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const token = await getClerkToken();
      const sb = createClerkSupabaseClient(token);

      const { data: chatRows, error } = await sb
        .from("chats")
        .select("*")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      const result = [];

      for (const chat of chatRows || []) {
        const otherUserId =
          chat.user1_id === user.id ? chat.user2_id : chat.user1_id;

        const { data: userProfile, error: userError } = await sb
          .from("users")
          .select("full_name, avatar_url")
          .eq("clerk_id", otherUserId)
          .maybeSingle();

        if (userError) console.error("Error loading user profile:", userError);

        const { data: lastMsg, error: lastMsgErr } = await sb
          .from("messages")
          .select("text, created_at, sender_id, is_read")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsgErr)
          console.error("Error loading last message:", lastMsgErr);

        const { count: unreadCount, error: unreadErr } = await sb
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chat.id)
          .neq("sender_id", user.id)
          .eq("is_read", false);

        if (unreadErr) console.error("Error loading unread count:", unreadErr);

        result.push({
          ...chat,
          otherUser: {
            display_name: userProfile?.full_name || "Unknown User",
            avatar_url: userProfile?.avatar_url || null,
          },
          last_message: lastMsg?.text || chat.last_message || "",
          last_message_at: lastMsg?.created_at || chat.last_message_at,
          unread_count: unreadCount || 0,
        });
      }

      setChats(result);
      setFilteredChats(result);

      // ✅ update store meta (unread รวม + เวลา latest)
      syncMetaFromList(result);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } catch (err) {
      console.error("Inbox loadChats error:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ อัปเดต chat ที่มีอยู่แล้วแบบ realtime (ไม่รีโหลดทั้งหมด)
  const updateChatRealtime = async (chatId) => {
    if (!user?.id) return;

    try {
      const token = await getClerkToken();
      const sb = createClerkSupabaseClient(token);

      // ดึงข้อมูลแชทนี้อย่างเดียว
      const { data: chat, error: chatErr } = await sb
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .maybeSingle();

      if (chatErr || !chat) {
        console.error("Error fetching chat:", chatErr);
        return;
      }

      const otherUserId =
        chat.user1_id === user.id ? chat.user2_id : chat.user1_id;

      const { data: userProfile } = await sb
        .from("users")
        .select("full_name, avatar_url")
        .eq("clerk_id", otherUserId)
        .maybeSingle();

      const { data: lastMsg } = await sb
        .from("messages")
        .select("text, created_at, sender_id, is_read")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: unreadCount } = await sb
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("chat_id", chat.id)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      const updatedChat = {
        ...chat,
        otherUser: {
          display_name: userProfile?.full_name || "Unknown User",
          avatar_url: userProfile?.avatar_url || null,
        },
        last_message: lastMsg?.text || chat.last_message || "",
        last_message_at: lastMsg?.created_at || chat.last_message_at,
        unread_count: unreadCount || 0,
      };

      // ✅ อัปเดต state แบบ smooth + update store meta
      setChats((prev) => {
        const exists = prev.find((c) => c.id === chatId);

        let next;
        if (exists) {
          next = prev.map((c) => (c.id === chatId ? updatedChat : c));
        } else {
          next = [updatedChat, ...prev];
        }

        next = next.sort(
          (a, b) => new Date(b.last_message_at) - new Date(a.last_message_at),
        );

        syncMetaFromList(next);
        return next;
      });

      console.log("✅ Chat updated smoothly:", chatId);
    } catch (err) {
      console.error("updateChatRealtime error:", err);
    }
  };

  // ✅ Realtime: อัปเดตแบบ smooth ไม่รีโหลดทั้งหมด
  const setupRealtime = async () => {
    if (!user?.id) return;

    try {
      const token = await getClerkToken();
      const rt = getRealtimeClient(token);

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      const ch = rt
        .channel(`inbox-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            console.log("📩 New message inserted:", payload.new);
            updateChatRealtime(payload.new.chat_id);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload) => {
            console.log("✏️ Message updated:", payload.new);
            updateChatRealtime(payload.new.chat_id);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chats" },
          (payload) => {
            console.log("💬 Chat updated:", payload.new);
            updateChatRealtime(payload.new.id);
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "chats" },
          (payload) => {
            console.log("🗑️ Chat deleted:", payload.old);
            setChats((prev) => {
              const next = prev.filter((c) => c.id !== payload.old.id);
              syncMetaFromList(next);
              return next;
            });
          },
        )
        .subscribe((status, err) => {
          console.log("🔌 Realtime inbox status:", status);
          if (err) console.error("❌ Realtime error:", err);
        });

      channelRef.current = ch;
    } catch (e) {
      console.error("setupRealtime error:", e);
    }
  };

  // ✅ ใช้ useFocusEffect เพื่อ reconnect ทุกครั้งที่กลับมาหน้านี้
  // ❗️แต่ "โหลด chats" แค่ครั้งแรก (กันรีโหลดตอนออกจากหน้า chat แล้วกลับมา)
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;

      console.log("📱 Inbox screen focused - setting up realtime");

      // ✅ โหลดครั้งแรกเท่านั้น (หรือกรณี state ว่างจริง ๆ)
      if (!didInitialLoadRef.current || chats.length === 0) {
        console.log("📥 Initial loadChats()");
        didInitialLoadRef.current = true;
        loadChats();
      } else {
        // ไม่ต้องโหลดใหม่ แค่ fade ให้แสดง (กันกรณี opacity ยัง 0)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }

      setupRealtime();

      return () => {
        console.log("👋 Inbox screen unfocused - cleaning up realtime");
        if (channelRef.current) {
          channelRef.current.unsubscribe();
          channelRef.current = null;
        }
      };
      // ✅ ตั้งใจ "ไม่ใส่ chats" ใน deps เพื่อไม่ให้ focus effect วิ่งใหม่เพราะ state เปลี่ยน
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]),
  );

  // Search filter
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredChats(chats);
    } else {
      setFilteredChats(
        chats.filter((chat) =>
          chat.otherUser?.display_name
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()),
        ),
      );
    }
  }, [searchQuery, chats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = (now - date) / (1000 * 60 * 60);

    if (diffHours < 24)
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    if (diffHours < 168)
      return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const handleDeleteChat = async (chatId) => {
    Alert.alert("ลบการสนทนา", "ต้องการลบการสนทนานี้ใช่ไหม?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getClerkToken();
            const sb = createClerkSupabaseClient(token);

            await sb.from("messages").delete().eq("chat_id", chatId);
            await sb.from("chats").delete().eq("id", chatId);

            setChats((prev) => {
              const next = prev.filter((c) => c.id !== chatId);
              syncMetaFromList(next);
              return next;
            });
          } catch (error) {
            console.error("Error deleting chat:", error);
            Alert.alert("Error", "Failed to delete conversation.");
          }
        },
      },
    ]);
  };

  const renderChatItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => router.push(`/chat/${item.id}`)}
      onLongPress={() => handleDeleteChat(item.id)}
      style={styles.chatItem}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        <Image
          source={{
            uri: item.otherUser?.avatar_url || "https://via.placeholder.com/56",
          }}
          style={styles.avatar}
        />
      </View>

      <View style={styles.messageContent}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.userName,
              item.unread_count > 0 && styles.userNameUnread,
            ]}
            numberOfLines={1}
          >
            {item.otherUser?.display_name || "Unknown"}
          </Text>
          <Text style={styles.timeText}>
            {formatTime(item.last_message_at)}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[
              styles.lastMessage,
              item.unread_count > 0 && styles.lastMessageUnread,
            ]}
            numberOfLines={2}
          >
            {item.last_message || "ยังไม่มีข้อความ"}
          </Text>

          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unread_count > 9 ? "9+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
      </View>
      <Text style={styles.emptyTitle}>
        {searchQuery ? "No results found" : "No messages yet"}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery
          ? "Try searching with different keywords"
          : "Start a conversation to see your messages here"}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        {/* ✅ NEW: แถวบน (ปุ่มย้อนกลับ + Title) */}
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={26} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Messages</Text>

          {/* spacer ให้ title อยู่กลางสวย ๆ */}
          <View style={styles.headerRightSpacer} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={20}
            color="#9CA3AF"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาการสนทนา..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Animated.View style={[styles.listContainer, { opacity: fadeAnim }]}>
        {loading ? (
          <View style={styles.centerContainer}>
            <View style={styles.loadingContainer}>
              <Ionicons name="chatbubbles" size={48} color="#8B5CF6" />
              <Text style={styles.loadingText}>กำลังโหลดบทสนทนา...</Text>
            </View>
          </View>
        ) : filteredChats.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={filteredChats}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderChatItem}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#8B5CF6"
                colors={["#8B5CF6"]}
              />
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingTop: 48,
  },

  // ✅ NEW: Header layout
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  headerRightSpacer: { width: 40, height: 40 },

  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 0,
    textAlign: "center",
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: "#111827", paddingVertical: 0 },
  clearButton: { padding: 4 },
  listContainer: { flex: 1 },
  listContent: { paddingVertical: 8 },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
  },
  avatarContainer: { position: "relative", marginRight: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
  },
  messageContent: { flex: 1 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  userName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginRight: 8,
  },
  userNameUnread: { fontWeight: "700", color: "#111827" },
  timeText: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginRight: 8,
  },
  lastMessageUnread: { fontWeight: "600", color: "#374151" },
  unreadBadge: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  separator: { height: 1, backgroundColor: "#F3F4F6", marginLeft: 90 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingContainer: { alignItems: "center" },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
});
