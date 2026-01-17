import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function AdminVerifications() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState([]);

  // preview image modal
  const [previewUrl, setPreviewUrl] = useState(null);

  // per-item action loading
  const [actionLoading, setActionLoading] = useState({}); // { [id]: true }

  const pendingCount = useMemo(
    () =>
      requests.filter((r) => String(r.status).toLowerCase() === "pending")
        .length,
    [requests]
  );

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("verification_requests")
        .select(
          "id, phone_number, id_card_url, created_at, status, users:user_row_id (id, full_name, email, avatar_url)"
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
      status === "verified" ? "อนุมัติการยืนยันตัวตน" : "ปฏิเสธการยืนยันตัวตน";
    const msg =
      status === "verified"
        ? `ต้องการอนุมัติ ${u?.full_name || "ผู้ใช้"} ใช่ไหม?`
        : `ต้องการปฏิเสธ ${u?.full_name || "ผู้ใช้"} ใช่ไหม?`;

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
        }
      );

      if (error) throw error;

      Alert.alert(
        "สำเร็จ",
        status === "verified" ? "อนุมัติแล้ว ✅" : "ปฏิเสธแล้ว ❌"
      );

      // optimistic remove from list
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      console.error("review error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถอัปเดตสถานะได้");
    } finally {
      setActionLoading((p) => ({ ...p, [requestId]: false }));
    }
  };

  const renderItem = ({ item }) => {
    const u = item.users;
    const busy = !!actionLoading[item.id];

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(`/admin/verifications/${item.id}`)}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.userInfo}>
              <Image
                source={{
                  uri: u?.avatar_url || "https://www.gravatar.com/avatar/?d=mp",
                }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>
                  {u?.full_name || "-"}
                </Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {u?.email || "-"}
                </Text>
              </View>
            </View>

            <View style={styles.badge}>
              <Ionicons name="time-outline" size={14} color="#92400E" />
              <Text style={styles.badgeText}>PENDING</Text>
            </View>
          </View>

          {/* Meta */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="call-outline" size={16} color="#6B7280" />
              <Text style={styles.metaText}>{item.phone_number || "-"}</Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={16} color="#6B7280" />
              <Text style={styles.metaText}>
                {formatDateTime(item.created_at)}
              </Text>
            </View>
          </View>

          {/* Document thumbnail */}
          {!!item.id_card_url ? (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.docWrap}
              onPress={() => setPreviewUrl(item.id_card_url)}
            >
              <Image
                source={{ uri: item.id_card_url }}
                style={styles.idCardImage}
              />
              <View style={styles.docOverlay}>
                <Ionicons name="expand-outline" size={18} color="#fff" />
                <Text style={styles.docOverlayText}>ดูรูปเต็มจอ</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.noDoc}>
              <Ionicons name="image-outline" size={20} color="#9CA3AF" />
              <Text style={styles.noDocText}>ไม่มีรูปเอกสาร</Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* Actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.rejectBtn,
                busy && styles.btnDisabled,
              ]}
              disabled={busy}
              onPress={() => confirmReview(item, "rejected")}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.rejectText}>ปฏิเสธ</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.approveBtn,
                busy && styles.btnDisabled,
              ]}
              disabled={busy}
              onPress={() => confirmReview(item, "verified")}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.approveText}>อนุมัติ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>กำลังโหลดคำขอ...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>คำขอยืนยันตัวตน</Text>
          <Text style={styles.headerSub}>รอตรวจสอบ: {pendingCount} รายการ</Text>
        </View>

        <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}>
          <Ionicons name="refresh" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryPill}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#8B5CF6" />
          <Text style={styles.summaryText}>Pending</Text>
          <Text style={styles.summaryCount}>{pendingCount}</Text>
        </View>

        <Text style={styles.summaryHint}>แตะการ์ดเพื่อดูรายละเอียด</Text>
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>ไม่มีคำขอรอตรวจสอบ</Text>
          <Text style={styles.emptyText}>
            ถ้ามีผู้ใช้ส่งคำขอใหม่ จะปรากฏที่นี่
          </Text>

          <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>รีเฟรช</Text>
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Image Preview Modal */}
      <Modal visible={!!previewUrl} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setPreviewUrl(null)}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          <View style={styles.modalCard}>
            {!!previewUrl && (
              <Image source={{ uri: previewUrl }} style={styles.modalImage} />
            )}
          </View>

          <Text style={styles.modalHint}>แตะ ✕ เพื่อปิด</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#6B7280", fontWeight: "600" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  headerSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 10,
  },
  summaryPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
  },
  summaryText: { fontWeight: "700", color: "#6D28D9" },
  summaryCount: {
    fontWeight: "900",
    color: "#6D28D9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#EDE9FE",
  },
  summaryHint: { color: "#6B7280", fontSize: 13 },

  listContent: { padding: 16, paddingBottom: 28 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
  },
  userName: { fontSize: 16, fontWeight: "800", color: "#111827" },
  userEmail: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  badgeText: { fontSize: 12, fontWeight: "900", color: "#92400E" },

  metaRow: { flexDirection: "row", gap: 12, marginTop: 6, marginBottom: 12 },
  metaItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  metaText: { color: "#374151", fontWeight: "600", fontSize: 13 },

  docWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  idCardImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#F3F4F6",
  },
  docOverlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(17,24,39,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  docOverlayText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  noDoc: {
    height: 90,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  noDocText: { color: "#9CA3AF", fontWeight: "700" },

  divider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 12 },

  cardActions: { flexDirection: "row", gap: 12 },

  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
  },
  rejectBtn: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  approveBtn: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  rejectText: { fontWeight: "900", color: "#EF4444" },
  approveText: { fontWeight: "900", color: "#10B981" },
  btnDisabled: { opacity: 0.6 },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  emptyText: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  emptyBtn: {
    marginTop: 10,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "800" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalClose: {
    position: "absolute",
    top: 60,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  modalImage: { width: "100%", height: 520, resizeMode: "contain" },
  modalHint: {
    marginTop: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
  },
});
