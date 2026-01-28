import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

const { width } = Dimensions.get("window");

// ✨ Toast Component with Animation
const Toast = ({ visible, message, type = "success", onHide }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  const config = {
    success: { bg: "#34C759", icon: "checkmark-circle" },
    error: { bg: "#FF3B30", icon: "close-circle" },
    warning: { bg: "#FF9500", icon: "warning" },
    info: { bg: "#007AFF", icon: "information-circle" },
  }[type];

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: config.bg,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.toastIcon}>
        <Ionicons name={config.icon} size={24} color="#fff" />
      </View>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

// ✨ Confirmation Modal with Animation
const ConfirmModal = ({ visible, onClose, onConfirm, data }) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.modalOverlay, { opacity: opacityAnim }]}>
        <Animated.View
          style={[styles.modalContent, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.modalIconContainer}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="send" size={40} color="#007AFF" />
            </View>
          </View>

          <Text style={styles.modalTitle}>ยืนยันการส่งแจ้งเตือน</Text>
          <Text style={styles.modalSubtitle}>กรุณาตรวจสอบข้อมูลก่อนส่ง</Text>

          <View style={styles.modalBody}>
            <View style={styles.modalInfoCard}>
              <View style={styles.modalInfoRow}>
                <View style={styles.modalInfoIcon}>
                  <Ionicons name="people" size={18} color="#007AFF" />
                </View>
                <View style={styles.modalInfoContent}>
                  <Text style={styles.modalInfoLabel}>ผู้รับ</Text>
                  <Text style={styles.modalInfoValue}>
                    {data?.targetType === "all"
                      ? "ทุกคน (All Users)"
                      : data?.selectedUser?.full_name ||
                        data?.selectedUser?.email ||
                        "-"}
                  </Text>
                </View>
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.modalInfoRow}>
                <View style={styles.modalInfoIcon}>
                  <Ionicons name="text" size={18} color="#007AFF" />
                </View>
                <View style={styles.modalInfoContent}>
                  <Text style={styles.modalInfoLabel}>หัวข้อ</Text>
                  <Text style={styles.modalInfoValue}>{data?.title}</Text>
                </View>
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.modalInfoRow}>
                <View style={styles.modalInfoIcon}>
                  <Ionicons name="document-text" size={18} color="#007AFF" />
                </View>
                <View style={styles.modalInfoContent}>
                  <Text style={styles.modalInfoLabel}>ข้อความ</Text>
                  <Text style={styles.modalInfoValue} numberOfLines={3}>
                    {data?.body}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
              <Text style={styles.modalBtnCancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnConfirm}
              onPress={onConfirm}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.modalBtnConfirmText}>ส่งเลย</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ⏰ Format relative time helper
const formatRelativeTime = (dateString) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "เมื่อสักครู่";
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

// ✨ Animated User Card Component
const UserCard = ({ item, selected, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

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

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.userCard, selected && styles.userCardSelected]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {(item.full_name || item.email || "?")[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.full_name || "ไม่ระบุชื่อ"}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {item.email || item.clerk_id}
          </Text>
        </View>
        <View style={styles.userMeta}>
          <View
            style={[
              styles.statusDot,
              item.expo_push_token
                ? styles.statusDotOnline
                : styles.statusDotOffline,
            ]}
          />
          {selected && (
            <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function AdminNoti() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Target
  const [targetType, setTargetType] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Message
  const [title, setTitle] = useState("แจ้งเตือนจากระบบ");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // History
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  // UI State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setToast({ visible: true, message, type });
  };

  const getAuthedSupabase = async () => {
    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("Missing Clerk token");
    return createClerkSupabaseClient(token);
  };

  const checkAdmin = async () => {
    try {
      setChecking(true);
      if (!user?.id) {
        setIsAdmin(false);
        return;
      }

      const authed = await getAuthedSupabase();
      const { data, error } = await authed
        .from("users")
        .select("role")
        .eq("clerk_id", user.id)
        .maybeSingle();

      if (error) throw error;

      const role = (data?.role ?? "").toString().toLowerCase().trim();
      setIsAdmin(role === "admin");
    } catch (e) {
      console.log("checkAdmin error:", e);
      setIsAdmin(false);
    } finally {
      setChecking(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setSearchingUsers(true);
      const authed = await getAuthedSupabase();
      const q = userSearch.trim();

      let query = authed
        .from("users")
        .select("clerk_id, full_name, email, expo_push_token, role, created_at")
        .in("role", ["user", "volunteer"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (q) {
        query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setUsers(data || []);
    } catch (e) {
      console.log("fetchUsers error:", e);
      showToast("โหลดรายชื่อไม่สำเร็จ", "error");
    } finally {
      setSearchingUsers(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const authed = await getAuthedSupabase();
      const { data, error } = await authed
        .from("admin_notifications")
        .select(
          "id, target_type, target_value, title, body, status, sent_count, fail_count, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistory(data || []);
    } catch (e) {
      console.log("fetchHistory error:", e);
      showToast("โหลดประวัติไม่สำเร็จ", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    checkAdmin();
  }, [user?.id]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchHistory();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (targetType !== "user") return;
    fetchUsers();
  }, [targetType]);

  const canSend = useMemo(() => {
    if (!isAdmin) return false;
    if (sending) return false;
    if (!title.trim() || !body.trim()) return false;
    if (targetType === "all") return true;
    if (targetType === "user") return !!selectedUser?.clerk_id;
    return false;
  }, [isAdmin, sending, title, body, targetType, selectedUser?.clerk_id]);

  const handleSendPress = () => {
    if (!canSend) return;
    setShowConfirmModal(true);
  };

  const sendNotification = async () => {
    setShowConfirmModal(false);

    try {
      setSending(true);

      const token = await getToken({ template: "supabase" });
      if (!token) {
        showToast("ไม่มี token จาก Clerk", "error");
        return;
      }

      const payload = {
        target_type: targetType,
        target_value: targetType === "user" ? selectedUser?.clerk_id : "all",
        title: title.trim(),
        body: body.trim(),
        data: { deepLink: null },
      };

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-admin-noti`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      if (!res.ok) {
        showToast(`ส่งไม่สำเร็จ (${res.status})`, "error");
        return;
      }

      const data = JSON.parse(text);
      showToast(`✅ ส่งสำเร็จ ${data?.sent_count ?? 0} คน`, "success");

      fetchHistory();
      setBody("");
      if (targetType === "user") setSelectedUser(null);
    } catch (e) {
      console.log("sendNotification error:", e);
      showToast("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    } finally {
      setSending(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (filterStatus === "all") return history;
    return history.filter((item) => item.status === filterStatus);
  }, [history, filterStatus]);

  if (checking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>กำลังตรวจสอบสิทธิ์...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <View style={styles.noAccessIconContainer}>
            <Ionicons name="lock-closed" size={56} color="#FF3B30" />
          </View>
          <Text style={styles.noAccessTitle}>ไม่มีสิทธิ์เข้าถึง</Text>
          <Text style={styles.noAccessText}>
            หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loadingHistory}
            onRefresh={fetchHistory}
            tintColor="#007AFF"
            colors={["#007AFF"]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="notifications-circle" size={32} color="#007AFF" />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>ส่งการแจ้งเตือน</Text>
            <Text style={styles.headerSubtitle}>
              จัดการ Push Notification ไปยังผู้ใช้
            </Text>
          </View>
        </View>

        {/* Target Selector Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-circle" size={24} color="#007AFF" />
            <Text style={styles.cardTitle}>เลือกผู้รับ</Text>
          </View>

          <View style={styles.segmentContainer}>
            <TouchableOpacity
              style={[
                styles.segment,
                targetType === "all" && styles.segmentActive,
              ]}
              onPress={() => {
                setTargetType("all");
                setSelectedUser(null);
              }}
            >
              <Ionicons
                name="people"
                size={22}
                color={targetType === "all" ? "#fff" : "#8E8E93"}
              />
              <Text
                style={[
                  styles.segmentText,
                  targetType === "all" && styles.segmentTextActive,
                ]}
              >
                ส่งทั้งหมด
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segment,
                targetType === "user" && styles.segmentActive,
              ]}
              onPress={() => setTargetType("user")}
            >
              <Ionicons
                name="person"
                size={22}
                color={targetType === "user" ? "#fff" : "#8E8E93"}
              />
              <Text
                style={[
                  styles.segmentText,
                  targetType === "user" && styles.segmentTextActive,
                ]}
              >
                ส่งรายคน
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* User Picker */}
        {targetType === "user" && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="search-circle" size={24} color="#007AFF" />
              <Text style={styles.cardTitle}>ค้นหาผู้ใช้</Text>
            </View>

            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <Ionicons name="search" size={20} color="#8E8E93" />
                <TextInput
                  value={userSearch}
                  onChangeText={setUserSearch}
                  placeholder="ค้นหาด้วยชื่อหรืออีเมล"
                  style={styles.searchInput}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
              <TouchableOpacity
                style={styles.searchButton}
                onPress={fetchUsers}
                disabled={searchingUsers}
              >
                {searchingUsers ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <View style={styles.selectedUserCard}>
                <View style={styles.selectedUserHeader}>
                  <View style={styles.selectedUserBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#34C759"
                    />
                    <Text style={styles.selectedUserBadgeText}>
                      ผู้รับที่เลือก
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedUser(null)}>
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.selectedUserName}>
                  {selectedUser.full_name || selectedUser.email}
                </Text>
                <View style={styles.selectedUserFooter}>
                  <View
                    style={[
                      styles.tokenBadge,
                      selectedUser.expo_push_token
                        ? styles.tokenBadgeActive
                        : styles.tokenBadgeInactive,
                    ]}
                  >
                    <Ionicons
                      name={
                        selectedUser.expo_push_token ? "checkmark" : "close"
                      }
                      size={12}
                      color="#fff"
                    />
                    <Text style={styles.tokenBadgeText}>
                      {selectedUser.expo_push_token
                        ? "พร้อมรับ"
                        : "ไม่มี token"}
                    </Text>
                  </View>
                  {selectedUser.role && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>
                        {selectedUser.role}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.userListContainer}>
              {searchingUsers ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.emptyStateText}>กำลังค้นหา...</Text>
                </View>
              ) : users.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyStateIcon}>
                    <Ionicons name="people-outline" size={48} color="#C7C7CC" />
                  </View>
                  <Text style={styles.emptyStateTitle}>ยังไม่มีผลลัพธ์</Text>
                  <Text style={styles.emptyStateText}>
                    กรอกชื่อหรืออีเมลแล้วกดค้นหา
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={users}
                  keyExtractor={(it) => it.clerk_id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <UserCard
                      item={item}
                      selected={selectedUser?.clerk_id === item.clerk_id}
                      onPress={() => setSelectedUser(item)}
                    />
                  )}
                />
              )}
            </View>
          </View>
        )}

        {/* Message Form Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="create-outline" size={24} color="#007AFF" />
            <Text style={styles.cardTitle}>เนื้อหาการแจ้งเตือน</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>หัวข้อ</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={styles.input}
              placeholder="หัวข้อแจ้งเตือน"
              placeholderTextColor="#C7C7CC"
              maxLength={100}
            />
            <Text style={styles.charCount}>{title.length}/100</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>ข้อความ</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              style={[styles.input, styles.textArea]}
              placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
              placeholderTextColor="#C7C7CC"
              multiline
              maxLength={300}
            />
            <Text style={styles.charCount}>{body.length}/300</Text>
          </View>

          {/* Preview */}
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Ionicons name="eye-outline" size={18} color="#007AFF" />
              <Text style={styles.previewTitle}>ตัวอย่างการแจ้งเตือน</Text>
            </View>
            <View style={styles.previewNotification}>
              <View style={styles.previewIcon}>
                <Ionicons name="notifications" size={24} color="#007AFF" />
              </View>
              <View style={styles.previewContent}>
                <Text style={styles.previewNotiTitle} numberOfLines={1}>
                  {title || "หัวข้อแจ้งเตือน"}
                </Text>
                <Text style={styles.previewNotiBody} numberOfLines={2}>
                  {body || "ข้อความแจ้งเตือนจะแสดงที่นี่"}
                </Text>
                <Text style={styles.previewNotiTime}>เมื่อสักครู่</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            disabled={!canSend}
            onPress={handleSendPress}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.sendButtonText}>ส่งการแจ้งเตือน</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* History Card */}
        <View style={styles.card}>
          <View style={styles.historyHeader}>
            <View style={styles.cardHeader}>
              <Ionicons name="time-outline" size={24} color="#007AFF" />
              <Text style={styles.cardTitle}>ประวัติการส่ง</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchHistory}
            >
              <Ionicons name="refresh" size={20} color="#007AFF" />
            </TouchableOpacity>
          </View>

          {/* Status Filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScrollView}
            contentContainerStyle={styles.filterContainer}
          >
            {[
              { key: "all", label: "ทั้งหมด", icon: "grid" },
              { key: "sent", label: "สำเร็จ", icon: "checkmark-circle" },
              { key: "pending", label: "รอดำเนินการ", icon: "time" },
              { key: "failed", label: "ล้มเหลว", icon: "close-circle" },
            ].map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  filterStatus === filter.key && styles.filterChipActive,
                ]}
                onPress={() => setFilterStatus(filter.key)}
              >
                <Ionicons
                  name={filter.icon}
                  size={16}
                  color={filterStatus === filter.key ? "#fff" : "#8E8E93"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    filterStatus === filter.key && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingHistory ? (
            <View style={styles.historyLoading}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : filteredHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <Ionicons name="time-outline" size={48} color="#C7C7CC" />
              </View>
              <Text style={styles.emptyStateTitle}>ยังไม่มีประวัติ</Text>
              <Text style={styles.emptyStateText}>
                ประวัติการส่งจะแสดงที่นี่
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredHistory}
              keyExtractor={(it) => String(it.id)}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.historyCard}>
                  <View style={styles.historyContent}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.historyBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                    <View style={styles.historyFooter}>
                      <View
                        style={[
                          styles.historyStatusBadge,
                          item.status === "sent"
                            ? styles.historyStatusSuccess
                            : item.status === "failed"
                              ? styles.historyStatusError
                              : styles.historyStatusWarning,
                        ]}
                      >
                        <Text style={styles.historyStatusText}>
                          {item.status === "sent"
                            ? "สำเร็จ"
                            : item.status === "failed"
                              ? "ล้มเหลว"
                              : "รอดำเนินการ"}
                        </Text>
                      </View>
                      <Text style={styles.historyTime}>
                        {formatRelativeTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.historyStats}>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatNumber}>
                        {item.sent_count ?? 0}
                      </Text>
                      <Text style={styles.historyStatLabel}>สำเร็จ</Text>
                    </View>
                    <View style={styles.historyStatDivider} />
                    <View style={styles.historyStat}>
                      <Text
                        style={[
                          styles.historyStatNumber,
                          styles.historyStatNumberError,
                        ]}
                      >
                        {item.fail_count ?? 0}
                      </Text>
                      <Text style={styles.historyStatLabel}>ล้มเหลว</Text>
                    </View>
                  </View>
                </View>
              )}
            />
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals & Toast */}
      <ConfirmModal
        visible={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={sendNotification}
        data={{ targetType, selectedUser, title, body }}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    paddingTop: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },

  // Loading & No Access
  loadingCard: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
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
    fontWeight: "600",
  },
  noAccessIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFF0F0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  noAccessTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  noAccessText: {
    fontSize: 16,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 24,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "#F0F8FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    fontWeight: "500",
  },

  // Card
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },

  // Segment Control
  segmentContainer: {
    flexDirection: "row",
    gap: 12,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#F9F9FB",
  },
  segmentActive: {
    backgroundColor: "#007AFF",
  },
  segmentText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#8E8E93",
  },
  segmentTextActive: {
    color: "#fff",
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    gap: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F9F9FB",
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#000",
    fontWeight: "600",
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },

  // Selected User Card
  selectedUserCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#F0F8FF",
    borderWidth: 2,
    borderColor: "#B3D9FF",
  },
  selectedUserHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  selectedUserBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#D4EDDA",
  },
  selectedUserBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#155724",
  },
  selectedUserName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    marginBottom: 10,
  },
  selectedUserFooter: {
    flexDirection: "row",
    gap: 8,
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tokenBadgeActive: {
    backgroundColor: "#34C759",
  },
  tokenBadgeInactive: {
    backgroundColor: "#FF3B30",
  },
  tokenBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#E5E5EA",
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3C3C43",
  },

  // User List
  userListContainer: {
    marginTop: 16,
    maxHeight: 400,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F9F9FB",
    marginBottom: 10,
  },
  userCardSelected: {
    backgroundColor: "#F0F8FF",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: "#8E8E93",
  },
  userMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDotOnline: {
    backgroundColor: "#34C759",
  },
  statusDotOffline: {
    backgroundColor: "#FF3B30",
  },

  // Form
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    marginBottom: 10,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F9F9FB",
    borderRadius: 14,
    fontSize: 15,
    color: "#000",
    fontWeight: "600",
  },
  textArea: {
    height: 120,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  charCount: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "right",
    marginTop: 8,
  },

  // Preview
  previewContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#F9F9FB",
    borderRadius: 16,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#007AFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewNotification: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F0F8FF",
    justifyContent: "center",
    alignItems: "center",
  },
  previewContent: {
    flex: 1,
  },
  previewNotiTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  previewNotiBody: {
    fontSize: 14,
    color: "#8E8E93",
    lineHeight: 20,
    marginBottom: 4,
  },
  previewNotiTime: {
    fontSize: 12,
    color: "#C7C7CC",
  },

  // Send Button
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    ...Platform.select({
      ios: {
        shadowColor: "#007AFF",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },

  // History
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F0F8FF",
    justifyContent: "center",
    alignItems: "center",
  },
  filterScrollView: {
    marginBottom: 16,
  },
  filterContainer: {
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F9F9FB",
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8E8E93",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  historyLoading: {
    paddingVertical: 60,
    alignItems: "center",
  },
  historyCard: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  historyContent: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  historyBody: {
    fontSize: 14,
    color: "#8E8E93",
    lineHeight: 20,
    marginBottom: 10,
  },
  historyFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historyStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  historyStatusSuccess: {
    backgroundColor: "#D4EDDA",
  },
  historyStatusError: {
    backgroundColor: "#F8D7DA",
  },
  historyStatusWarning: {
    backgroundColor: "#FFF3CD",
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  historyTime: {
    fontSize: 12,
    color: "#C7C7CC",
  },
  historyStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  historyStat: {
    alignItems: "center",
  },
  historyStatNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#34C759",
  },
  historyStatNumberError: {
    color: "#FF3B30",
  },
  historyStatLabel: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 2,
  },
  historyStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E5E5EA",
  },

  // Empty State
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F9F9FB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.3,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  modalIconContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F0F8FF",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    marginBottom: 24,
  },
  modalBody: {
    marginBottom: 24,
  },
  modalInfoCard: {
    backgroundColor: "#F9F9FB",
    borderRadius: 16,
    padding: 16,
  },
  modalInfoRow: {
    flexDirection: "row",
    gap: 12,
  },
  modalInfoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F0F8FF",
    justifyContent: "center",
    alignItems: "center",
  },
  modalInfoContent: {
    flex: 1,
  },
  modalInfoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8E8E93",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalInfoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "#E5E5EA",
    marginVertical: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#F9F9FB",
    alignItems: "center",
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#8E8E93",
  },
  modalBtnConfirm: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#007AFF",
  },
  modalBtnConfirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },

  // Toast
  toast: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  toastIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  toastText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
