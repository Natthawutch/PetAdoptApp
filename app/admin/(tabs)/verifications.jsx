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
  const [imageLoaded, setImageLoaded] = useState(false);

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
      friction: 3,
    }).start();
  };

  const u = item.users;

  return (
    <>
      <Animated.View
        style={{
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            },
            { scale: scaleAnim },
          ],
          opacity: slideAnim,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.95}
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
                  <View style={styles.statusIndicator}>
                    <View style={styles.statusPulse} />
                  </View>
                </View>

                <View style={styles.userDetails}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {u?.full_name || "ไม่ระบุชื่อ"}
                  </Text>
                  <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={13} color="#8E8E93" />
                    <Text style={styles.infoText} numberOfLines={1}>
                      {u?.email || "-"}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={13} color="#8E8E93" />
                    <Text style={styles.infoText}>
                      {item.phone_number || "-"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.statusBadge}>
                <View style={styles.badgeDot} />
                <Text style={styles.statusText}>รอ</Text>
              </View>
            </View>

            {/* Time Chip */}
            <View style={styles.timeChip}>
              <Ionicons name="time-outline" size={13} color="#8E8E93" />
              <Text style={styles.timeText}>
                {formatDateTime(item.created_at)}
              </Text>
            </View>

            {/* ID Card Preview */}
            {item.id_card_url ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.idCardContainer}
                onPress={() => setImageModalVisible(true)}
              >
                {!imageLoaded && (
                  <View style={styles.imagePlaceholder}>
                    <ActivityIndicator size="small" color="#007AFF" />
                  </View>
                )}
                <Image
                  source={{ uri: item.id_card_url }}
                  style={styles.idCardImage}
                  onLoad={() => setImageLoaded(true)}
                />
                <View style={styles.imageOverlay}>
                  <View style={styles.expandChip}>
                    <Ionicons name="expand" size={14} color="#fff" />
                    <Text style={styles.expandText}>ขยาย</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.noImageContainer}>
                <View style={styles.noImageIcon}>
                  <Ionicons name="document-outline" size={28} color="#C7C7CC" />
                </View>
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
                activeOpacity={0.8}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={18} color="#FF3B30" />
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
                activeOpacity={0.8}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
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
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.modalContent}>
            <Image
              source={{ uri: item.id_card_url }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.modalHint}>แตะเพื่อปิด</Text>
        </View>
      </Modal>
    </>
  );
};

// ✨ Stats Card Component
const StatsCard = ({ icon, label, count, color }) => (
  <View style={[styles.statsCard, { borderLeftColor: color }]}>
    <View style={[styles.statsIcon, { backgroundColor: `${color}10` }]}>
      <Ionicons name={icon} size={22} color={color} />
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

  const confirmReview = (item, status) => {
    const u = item.users;
    const title =
      status === "verified"
        ? "✅ อนุมัติการยืนยันตัวตน"
        : "❌ ปฏิเสธการยืนยันตัวตน";
    const msg =
      status === "verified"
        ? `ยืนยันการอนุมัติ "${u?.full_name || "ผู้ใช้"}" หรือไม่?`
        : `ยืนยันการปฏิเสธ "${u?.full_name || "ผู้ใช้"}" หรือไม่?`;

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
        "สำเร็จ",
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
            <Text style={styles.loadingText}>กำลังโหลด...</Text>
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
            <Ionicons name="shield-checkmark" size={26} color="#007AFF" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>ยืนยันตัวตน</Text>
            <Text style={styles.headerSubtitle}>ตรวจสอบและอนุมัติคำขอ</Text>
          </View>
        </View>
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
            <Ionicons name="checkmark-done-circle" size={64} color="#D1D1D6" />
          </View>
          <Text style={styles.emptyTitle}>ไม่มีคำขอรอตรวจสอบ</Text>
          <Text style={styles.emptySubtitle}>คำขอใหม่จะแสดงที่นี่</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    paddingTop: 25,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingCard: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#8E8E93",
    fontWeight: "600",
  },

  // Header Styles
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 16 : 16,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F0F8FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
    marginTop: 2,
  },

  // Stats Section
  statsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 3,
  },
  statsIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  statsContent: {
    flex: 1,
  },
  statsCount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#000",
    letterSpacing: -0.5,
  },
  statsLabel: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "600",
    marginTop: 2,
  },

  // List Content
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },

  // Card Styles
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 8,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F2F2F7",
  },
  statusIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  statusPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF9500",
  },
  userDetails: {
    flex: 1,
    paddingTop: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#FFF9E6",
    gap: 5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF9500",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#CC7A00",
    letterSpacing: 0.2,
  },

  // Time Chip
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F9F9FB",
    borderRadius: 8,
    marginBottom: 12,
  },
  timeText: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "600",
  },

  // ID Card Preview
  idCardContainer: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#F9F9FB",
    position: "relative",
  },
  imagePlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9F9FB",
    zIndex: 1,
  },
  idCardImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#F9F9FB",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  expandChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  expandText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  noImageContainer: {
    height: 120,
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    borderWidth: 2,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 8,
  },
  noImageIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  noImageText: {
    fontSize: 13,
    color: "#C7C7CC",
    fontWeight: "600",
  },

  // Action Buttons
  actionContainer: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    gap: 6,
  },
  rejectButton: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "#FFE0E0",
  },
  approveButton: {
    backgroundColor: "#34C759",
    borderWidth: 1.5,
    borderColor: "#34C759",
  },
  rejectButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FF3B30",
    letterSpacing: -0.2,
  },
  approveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 21,
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalContent: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  modalImage: {
    width: "100%",
    height: 500,
  },
  modalHint: {
    marginTop: 16,
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontWeight: "600",
  },
});
