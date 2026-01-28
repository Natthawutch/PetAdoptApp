import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

const { width } = Dimensions.get("window");

// ✨ Format DateTime Helper
function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "เมื่อสักครู่";
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ✨ Animated Verification Card Component
const VerificationCard = ({ item, onPress, onReject, onApprove, busy }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [imageModalVisible, setImageModalVisible] = useState(false);

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
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const u = item.users;

  return (
    <>
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
          activeOpacity={1}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.card}>
            {/* Header Section */}
            <View style={styles.cardHeader}>
              <View style={styles.userSection}>
                <View style={styles.avatarContainer}>
                  <Image
                    source={{
                      uri:
                        u?.avatar_url ||
                        "https://www.gravatar.com/avatar/?d=mp",
                    }}
                    style={styles.avatar}
                  />
                  <View style={styles.statusIndicator} />
                </View>

                <View style={styles.userDetails}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {u?.full_name || "ไม่ระบุชื่อ"}
                  </Text>
                  <Text style={styles.userEmail} numberOfLines={1}>
                    {u?.email || "-"}
                  </Text>
                  <View style={styles.phoneRow}>
                    <Ionicons name="call" size={12} color="#8E8E93" />
                    <Text style={styles.phoneText}>
                      {item.phone_number || "-"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.statusBadge}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusText}>รอตรวจสอบ</Text>
              </View>
            </View>

            {/* Time Info */}
            <View style={styles.timeInfo}>
              <Ionicons name="time-outline" size={14} color="#8E8E93" />
              <Text style={styles.timeText}>
                {formatDateTime(item.created_at)}
              </Text>
            </View>

            {/* ID Card Preview */}
            {item.id_card_url ? (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.idCardContainer}
                onPress={() => setImageModalVisible(true)}
              >
                <Image
                  source={{ uri: item.id_card_url }}
                  style={styles.idCardImage}
                />
                <View style={styles.imageOverlay}>
                  <View style={styles.expandButton}>
                    <Ionicons name="expand" size={16} color="#fff" />
                    <Text style={styles.expandText}>ดูรูปเต็ม</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.noImageContainer}>
                <Ionicons name="image-outline" size={32} color="#C7C7CC" />
                <Text style={styles.noImageText}>ไม่มีเอกสารแนบ</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionContainer}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.rejectButton,
                  busy && styles.buttonDisabled,
                ]}
                disabled={busy}
                onPress={onReject}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    <Text style={styles.rejectButtonText}>ปฏิเสธ</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.approveButton,
                  busy && styles.buttonDisabled,
                ]}
                disabled={busy}
                onPress={onApprove}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#34C759" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#34C759"
                    />
                    <Text style={styles.approveButtonText}>อนุมัติ</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Image Preview Modal */}
      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setImageModalVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={styles.modalContent}>
            <Image
              source={{ uri: item.id_card_url }}
              style={styles.modalImage}
            />
          </View>

          <Text style={styles.modalHint}>แตะ × เพื่อปิด</Text>
        </View>
      </Modal>
    </>
  );
};

// ✨ Stats Card Component
const StatsCard = ({ icon, label, count, color }) => (
  <View style={[styles.statsCard, { borderLeftColor: color }]}>
    <View style={[styles.statsIcon, { backgroundColor: `${color}15` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <View style={styles.statsContent}>
      <Text style={styles.statsCount}>{count}</Text>
      <Text style={styles.statsLabel}>{label}</Text>
    </View>
  </View>
);

export default function AdminVerifications() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState([]);
  const [actionLoading, setActionLoading] = useState({});

  const pendingCount = useMemo(
    () =>
      requests.filter((r) => String(r.status).toLowerCase() === "pending")
        .length,
    [requests],
  );

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("verification_requests")
        .select(
          "id, phone_number, id_card_url, created_at, status, users:user_row_id (id, full_name, email, avatar_url)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (e) {
      console.error("loadPending error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถโหลดคำขอได้");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPending();
    } finally {
      setRefreshing(false);
    }
  };

  const confirmReview = (item, status) => {
    const u = item.users;
    const title =
      status === "verified"
        ? "อนุมัติการยืนยันตัวตน?"
        : "ปฏิเสธการยืนยันตัวตน?";
    const msg =
      status === "verified"
        ? `ยืนยันการอนุมัติ ${u?.full_name || "ผู้ใช้"} นี้หรือไม่?`
        : `ยืนยันการปฏิเสธ ${u?.full_name || "ผู้ใช้"} นี้หรือไม่?`;

    Alert.alert(title, msg, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: status === "verified" ? "อนุมัติ" : "ปฏิเสธ",
        style: status === "verified" ? "default" : "destructive",
        onPress: () => review(item.id, status),
      },
    ]);
  };

  const review = async (requestId, status) => {
    setActionLoading((p) => ({ ...p, [requestId]: true }));
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const { error } = await supabase.rpc(
        "admin_review_verification_request",
        {
          p_request_id: requestId,
          p_status: status,
          p_reject_reason:
            status === "rejected" ? "ไม่ผ่านเกณฑ์การตรวจสอบ" : null,
        },
      );

      if (error) throw error;

      Alert.alert(
        "สำเร็จ!",
        status === "verified"
          ? "อนุมัติเรียบร้อยแล้ว ✅"
          : "ปฏิเสธเรียบร้อยแล้ว ❌",
      );

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      console.error("review error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถอัปเดตสถานะได้");
    } finally {
      setActionLoading((p) => ({ ...p, [requestId]: false }));
    }
  };

  const renderItem = ({ item }) => (
    <VerificationCard
      item={item}
      onPress={() => router.push(`/admin/verifications/${item.id}`)}
      onReject={() => confirmReview(item, "rejected")}
      onApprove={() => confirmReview(item, "verified")}
      busy={!!actionLoading[item.id]}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>กำลังโหลดคำขอยืนยันตัวตน...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-checkmark" size={28} color="#007AFF" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>ตรวจสอบตัวตน</Text>
            <Text style={styles.headerSubtitle}>
              จัดการคำขอยืนยันตัวตนของอาสาสมัคร
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Stats Section */}
      <View style={styles.statsSection}>
        <StatsCard
          icon="hourglass-outline"
          label="รอตรวจสอบ"
          count={pendingCount}
          color="#FF9500"
        />
      </View>

      {/* List */}
      {requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="checkmark-done-circle" size={64} color="#C7C7CC" />
          </View>
          <Text style={styles.emptyTitle}>ไม่มีคำขอรอตรวจสอบ</Text>
          <Text style={styles.emptySubtitle}>
            คำขอยืนยันตัวตนใหม่จะปรากฏที่นี่
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.emptyButtonText}>รีเฟรช</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#007AFF"
              colors={["#007AFF"]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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

  // Header Styles
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F0F8FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F0F8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  // Stats Section
  statsSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
  },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9F9FB",
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
  },
  statsIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  statsContent: {
    flex: 1,
  },
  statsCount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#000",
    marginBottom: 2,
  },
  statsLabel: {
    fontSize: 14,
    color: "#8E8E93",
    fontWeight: "600",
  },

  // List Content
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Card Styles
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
  },
  statusIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FF9500",
    borderWidth: 2,
    borderColor: "#fff",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 13,
    color: "#8E8E93",
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  phoneText: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFF9E6",
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF9500",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#CC7A00",
  },

  // Time Info
  timeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9F9FB",
    borderRadius: 10,
    marginBottom: 14,
  },
  timeText: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
  },

  // ID Card Preview
  idCardContainer: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#F2F2F7",
  },
  idCardImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#F2F2F7",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  expandText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  noImageContainer: {
    height: 140,
    borderRadius: 16,
    backgroundColor: "#F9F9FB",
    borderWidth: 2,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    gap: 8,
  },
  noImageText: {
    fontSize: 14,
    color: "#C7C7CC",
    fontWeight: "600",
  },

  // Action Buttons
  actionContainer: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  rejectButton: {
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  approveButton: {
    backgroundColor: "#F0FFF4",
    borderWidth: 1,
    borderColor: "#C6F6D5",
  },
  rejectButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FF3B30",
  },
  approveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#34C759",
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
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
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalContent: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  modalImage: {
    width: "100%",
    height: 500,
    resizeMode: "contain",
  },
  modalHint: {
    marginTop: 20,
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    fontWeight: "600",
  },
});
