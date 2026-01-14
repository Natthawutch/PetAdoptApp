import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { supabase } from "../../config/supabaseClient";

export default function Inbox() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [chats, setChats] = useState([]);
  const [filteredChats, setFilteredChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const channelRef = useRef(null);

  // โหลด chats ครั้งแรก
  const loadChats = async () => {
    if (!user?.id) return;

    try {
      // console.log("Current user.id:", user.id);

      const { data: chatRows, error } = await supabase
        .from("chats")
        .select("*")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order("last_message_at", { ascending: false });

      if (error) {
        console.error("Error loading chats:", error);
        throw error;
      }

      // console.log("Chat rows:", chatRows);

      const result = [];
      for (const chat of chatRows || []) {
        const otherUserId =
          chat.user1_id === user.id ? chat.user2_id : chat.user1_id;

        // console.log("Other user ID:", otherUserId);

        // ดึงข้อมูลจากตาราง users โดยใช้ clerk_id
        const { data: userProfile, error: userError } = await supabase
          .from("users")
          .select("full_name, avatar_url")
          .eq("clerk_id", otherUserId)
          .single();

        if (userError) {
          console.error("Error loading user profile:", userError);
        }

        // console.log("User profile:", userProfile);

        const { data: lastMsg } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const { count: unreadCount } = await supabase
          .from("messages")
          .select("*", { count: "exact" })
          .eq("chat_id", chat.id)
          .neq("sender_id", user.id)
          .is("is_read", false);

        result.push({
          ...chat,
          otherUser: {
            display_name: userProfile?.full_name || "Unknown User",
            avatar_url: userProfile?.avatar_url || null,
          },
          last_message: lastMsg?.text || "",
          last_message_at: lastMsg?.created_at || chat.last_message_at,
          unread_count: unreadCount || 0,
        });
      }

      // console.log("Final result:", result);
      setChats(result);
      setFilteredChats(result);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } catch (err) {
      console.error("Inbox loadChats error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Realtime: รับ message ใหม่เข้ามา
  const setupRealtime = () => {
    if (!user?.id) return;

    channelRef.current = supabase
      .channel(`inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", table: "messages", schema: "public" },
        async (payload) => {
          const newMsg = payload.new;

          setChats((prevChats) => {
            return prevChats.map((chat) => {
              if (chat.id === newMsg.chat_id) {
                return {
                  ...chat,
                  last_message: newMsg.text,
                  last_message_at: newMsg.created_at,
                  unread_count:
                    chat.unread_count + (newMsg.sender_id !== user.id ? 1 : 0),
                };
              }
              return chat;
            });
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", table: "messages", schema: "public" },
        async (payload) => {
          // เมื่อมีการอ่านข้อความ ให้ reload chats
          await loadChats();
        }
      )
      .subscribe();
  };

  useEffect(() => {
    loadChats();
  }, [user?.id]);

  useEffect(() => {
    setupRealtime();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [user?.id]);

  // Search filter
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredChats(chats);
    } else {
      const filtered = chats.filter((chat) =>
        chat.otherUser?.display_name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase())
      );
      setFilteredChats(filtered);
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
    Alert.alert(
      "ลบการสนทนา",
      "คุณแน่ใจหรือไม่ว่าต้องการลบการสนทนานี้ การกระทำนี้ไม่สามารถย้อนกลับได้",
      [
        {
          text: "ยกเลิก",
          style: "cancel",
        },
        {
          text: "ลบ",
          style: "destructive",
          onPress: async () => {
            try {
              // ลบข้อความทั้งหมดใน chat นี้
              await supabase.from("messages").delete().eq("chat_id", chatId);

              // ลบ chat
              await supabase.from("chats").delete().eq("id", chatId);

              // Reload chats
              await loadChats();
            } catch (error) {
              console.error("Error deleting chat:", error);
              Alert.alert(
                "Error",
                "Failed to delete conversation. Please try again."
              );
            }
          },
        },
      ]
    );
  };

  const renderChatItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => router.push(`/chat/${item.id}`)}
      onLongPress={() => handleDeleteChat(item.id)}
      style={styles.chatItem}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Image
          source={{
            uri: item.otherUser?.avatar_url || "https://via.placeholder.com/56",
          }}
          style={styles.avatar}
        />
      </View>

      {/* Message Content */}
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

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>

        {/* Search Bar */}
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

      {/* Chat List */}
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
            keyExtractor={(item) => item.id}
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
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 16,
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
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
  },
  messageContent: {
    flex: 1,
  },
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
  userNameUnread: {
    fontWeight: "700",
    color: "#111827",
  },
  timeText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
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
  lastMessageUnread: {
    fontWeight: "600",
    color: "#374151",
  },
  unreadBadge: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  separator: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 90,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingContainer: {
    alignItems: "center",
  },
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
