import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { supabase } from "../../config/supabaseClient";

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const chatId = String(id);
  const { user } = useUser();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [otherUser, setOtherUser] = useState(null);
  const channelRef = useRef(null);
  const flatListRef = useRef(null);

  const loadChatInfo = async () => {
    if (!user?.id || !chatId) return;

    try {
      // console.log("Loading chat info for chatId:", chatId);
      // console.log("Current user.id:", user.id);

      // โหลดข้อมูล chat และ other user
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

      if (chatError) {
        console.error("Error loading chat:", chatError);
        return;
      }

      // console.log("Chat data:", chat);

      if (chat) {
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

        setOtherUser({
          display_name: userProfile?.full_name || "Unknown User",
          avatar_url: userProfile?.avatar_url || null,
        });
      }
    } catch (err) {
      console.error("loadChatInfo error:", err);
    }
  };

  const loadMessages = async () => {
    if (!user?.id || !chatId) return;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at");

      if (error) {
        console.error("Error loading messages:", error);
        return;
      }

      setMessages(data || []);

      // Mark unread as read
      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      // Update last_message_at in chats
      if (data?.length > 0) {
        const lastMsg = data[data.length - 1];
        await supabase
          .from("chats")
          .update({
            last_message: lastMsg.text,
            last_message_at: lastMsg.created_at,
          })
          .eq("id", chatId);
      }

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      console.error("loadMessages error:", err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadChatInfo();
      loadMessages();
    }, [chatId, user?.id])
  );

  useEffect(() => {
    if (!chatId) return;

    channelRef.current = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", table: "messages", schema: "public" },
        (payload) => {
          // console.log("New message received:", payload.new);
          setMessages((prev) => [...prev, payload.new]);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [chatId]);

  const sendMessage = async () => {
    if (!text.trim() || !user?.id) return;

    try {
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        user_id: user.id,
        user_name: user.fullName,
        user_avatar_url: user.imageUrl,
        text: text.trim(),
        created_at: new Date().toISOString(),
        is_read: false,
      });

      if (error) {
        console.error("Error sending message:", error);
      }

      setText("");
    } catch (err) {
      console.error("sendMessage error:", err);
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
      {/* Custom Header */}
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

        <TouchableOpacity style={styles.moreButton} activeOpacity={0.7}>
          <Ionicons name="ellipsis-vertical" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton} activeOpacity={0.7}>
            <Ionicons name="add-circle" size={28} color="#8B5CF6" />
          </TouchableOpacity>

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
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    marginRight: 8,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#F3F4F6",
  },
  headerTextContainer: {
    flex: 1,
  },
  headerName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  moreButton: {
    marginLeft: 8,
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
  },
  myMessageRow: {
    justifyContent: "flex-end",
  },
  otherMessageRow: {
    justifyContent: "flex-start",
  },
  avatarContainer: {
    marginRight: 8,
    width: 32,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
  },
  avatarSpacer: {
    width: 32,
    height: 32,
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  myMessageBubble: {
    backgroundColor: "#8B5CF6",
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  myMessageText: {
    color: "#FFFFFF",
  },
  otherMessageText: {
    color: "#111827",
  },
  timeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  myTimeText: {
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "right",
  },
  otherTimeText: {
    color: "#9CA3AF",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  attachButton: {
    marginRight: 8,
    marginBottom: 8,
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
  input: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 20,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
});
