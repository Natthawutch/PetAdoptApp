import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const chatId = String(id);

  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [otherUser, setOtherUser] = useState(null);

  const channelRef = useRef(null);
  const flatListRef = useRef(null);

  const getSb = async () => {
    const token = await getToken({ template: "supabase", skipCache: true });
    if (!token) throw new Error("No clerk token");
    const sb = createClerkSupabaseClient(token);
    sb.realtime.setAuth(token);
    return sb;
  };

  const parseIdsFromChatId = () => {
    const parts = chatId.split("_");
    if (parts.length !== 2) return null;
    return { a: parts[0], b: parts[1] };
  };

  const ensureChatExists = async (sb) => {
    const { data: chat, error } = await sb
      .from("chats")
      .select("*")
      .eq("id", chatId)
      .maybeSingle();

    if (error) throw error;
    if (chat) return chat;

    const ids = parseIdsFromChatId();
    if (!ids) throw new Error("Invalid chatId format");

    if (user?.id !== ids.a && user?.id !== ids.b) {
      throw new Error("You are not participant of this chat");
    }

    const payload = {
      id: chatId,
      user1_id: ids.a,
      user2_id: ids.b,
      last_message: "",
      last_message_at: new Date().toISOString(),
    };

    const { error: createErr } = await sb.from("chats").insert(payload);
    if (createErr) throw createErr;

    return payload;
  };

  const loadChatInfo = async () => {
    if (!user?.id || !chatId) return;

    try {
      const sb = await getSb();
      const chat = await ensureChatExists(sb);

      const otherUserId =
        chat.user1_id === user.id ? chat.user2_id : chat.user1_id;

      const { data: profile, error: profileErr } = await sb
        .from("users")
        .select("full_name, avatar_url")
        .eq("clerk_id", otherUserId)
        .maybeSingle();

      if (profileErr) console.error("profileErr:", profileErr);

      setOtherUser({
        display_name: profile?.full_name || "Unknown User",
        avatar_url: profile?.avatar_url || null,
      });
    } catch (e) {
      console.error("loadChatInfo error:", e);
      Alert.alert("โหลดแชทไม่สำเร็จ");
    }
  };

  const loadMessages = async () => {
    if (!user?.id || !chatId) return;

    try {
      const sb = await getSb();
      await ensureChatExists(sb);

      const { data, error } = await sb
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMessages(data || []);

      await sb
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    } catch (e) {
      console.error("loadMessages error:", e);
    }
  };

  const setupRealtime = async () => {
    if (!chatId || !user?.id) return;

    try {
      const sb = await getSb();
      await ensureChatExists(sb);

      // กัน subscribe ซ้ำ
      if (channelRef.current) {
        await channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      const ch = sb
        .channel(`chat-${chatId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            console.log("📩 New message received:", payload.new);
            setMessages((prev) => [...prev, payload.new]);

            // Mark as read ถ้าไม่ใช่ข้อความของเรา
            if (payload.new.sender_id !== user.id) {
              (async () => {
                const sb = await getSb();
                await sb
                  .from("messages")
                  .update({ is_read: true, read_at: new Date().toISOString() })
                  .eq("id", payload.new.id);
              })();
            }

            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 50);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            console.log("✏️ Message updated:", payload.new);
            setMessages((prev) =>
              prev.map((msg) => (msg.id === payload.new.id ? payload.new : msg))
            );
          }
        )
        .subscribe((status, err) => {
          console.log("Realtime chat status:", status);
          if (err) console.error("Realtime error:", err);
        });

      channelRef.current = ch;
    } catch (e) {
      console.error("setup realtime error:", e);
    }
  };

  // ✅ ใช้ useFocusEffect เพื่อ reconnect ทุกครั้งที่กลับมาหน้านี้
  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !chatId) return;

      console.log(
        "💬 Chat screen focused - loading messages & setting up realtime"
      );
      loadChatInfo();
      loadMessages();
      setupRealtime();

      return () => {
        console.log("👋 Chat screen unfocused - cleaning up realtime");
        if (channelRef.current) {
          channelRef.current.unsubscribe();
          channelRef.current = null;
        }
      };
    }, [chatId, user?.id])
  );

  const sendMessage = async () => {
    if (!text.trim() || !user?.id) return;

    try {
      const sb = await getSb();
      await ensureChatExists(sb);

      const msg = text.trim();
      const now = new Date().toISOString();

      const { error } = await sb.from("messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        user_id: user.id,
        user_name: user.fullName,
        user_avatar_url: user.imageUrl,
        text: msg,
        created_at: now,
        is_read: false,
      });

      if (error) throw error;

      await sb
        .from("chats")
        .update({ last_message: msg, last_message_at: now })
        .eq("id", chatId);

      setText("");
    } catch (e) {
      console.error("sendMessage error:", e);
      Alert.alert("ส่งข้อความไม่สำเร็จ");
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = ({ item, index }) => {
    const isMyMessage = item.sender_id === user.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showAvatar =
      !isMyMessage &&
      (!prevMessage || prevMessage.sender_id !== item.sender_id);

    return (
      <View
        style={[
          styles.messageRow,
          isMyMessage ? styles.myMessageRow : styles.otherMessageRow,
        ]}
      >
        {!isMyMessage && (
          <View style={styles.avatarContainer}>
            {showAvatar ? (
              <Image
                source={{
                  uri:
                    otherUser?.avatar_url || "https://via.placeholder.com/32",
                }}
                style={styles.messageAvatar}
              />
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}

        <View
          style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.otherMessageText,
            ]}
          >
            {item.text}
          </Text>
          <Text
            style={[
              styles.timeText,
              isMyMessage ? styles.myTimeText : styles.otherTimeText,
            ]}
          >
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image
            source={{
              uri: otherUser?.avatar_url || "https://via.placeholder.com/40",
            }}
            style={styles.headerAvatar}
          />
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser?.display_name || "Chat"}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              multiline
              maxLength={1000}
            />
          </View>

          <TouchableOpacity
            onPress={sendMessage}
            style={[
              styles.sendButton,
              !text.trim() && styles.sendButtonDisabled,
            ]}
            activeOpacity={0.7}
            disabled={!text.trim()}
          >
            <Ionicons
              name="send"
              size={20}
              color={text.trim() ? "#FFFFFF" : "#9CA3AF"}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: { marginRight: 8 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center" },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#F3F4F6",
  },
  headerTextContainer: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: "700", color: "#111827" },
  keyboardView: { flex: 1 },
  messagesList: { paddingHorizontal: 16, paddingVertical: 12 },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
  },
  myMessageRow: { justifyContent: "flex-end" },
  otherMessageRow: { justifyContent: "flex-start" },
  avatarContainer: { marginRight: 8, width: 32 },
  messageAvatar: { width: 32, height: 32, borderRadius: 16 },
  avatarSpacer: { width: 32, height: 32 },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  myMessageBubble: { backgroundColor: "#8B5CF6", borderBottomRightRadius: 4 },
  otherMessageBubble: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  messageText: { fontSize: 15, lineHeight: 20, marginBottom: 4 },
  myMessageText: { color: "#FFFFFF" },
  otherMessageText: { color: "#111827" },
  timeText: { fontSize: 11, fontWeight: "500" },
  myTimeText: { color: "rgba(255,255,255,0.7)", textAlign: "right" },
  otherTimeText: { color: "#9CA3AF" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 120,
  },
  input: { fontSize: 15, color: "#111827", lineHeight: 20 },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendButtonDisabled: { backgroundColor: "#F3F4F6" },
});
