import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

export default function AdminVolunteers() {
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const channelRef = useRef(null);
  const refreshTimerRef = useRef(null);

  /* ---------------- GET FRESH SUPABASE CLIENT ---------------- */

  const getSupabase = async () => {
    try {
      // ✅ ขอ token ใหม่ทุกครั้ง (skipCache: true)
      const token = await getToken({ template: "supabase", skipCache: true });

      if (!token) {
        throw new Error("ไม่สามารถดึง token ได้");
      }

      // ✅ สร้าง client ใหม่ทุกครั้ง
      const supabase = createClerkSupabaseClient(token);

      return supabase;
    } catch (error) {
      console.error("❌ getSupabase error:", error);
      Alert.alert("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
      throw error;
    }
  };

  /* ---------------- LOAD DATA ---------------- */

  const load = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const supabase = await getSupabase();

      const { data: reqs, error: reqErr } = await supabase
        .from("volunteer_requests")
        .select(
          "id, requester_id, user_id, phone, area, reason, motivation, availability, experience, status, created_at"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (reqErr) {
        console.log("❌ load volunteer_requests error:", reqErr);
        Alert.alert("เกิดข้อผิดพลาด", reqErr.message);
        setList([]);
        return;
      }

      const clerkIds = [
        ...new Set((reqs || []).map((r) => r.requester_id).filter(Boolean)),
      ];

      let usersMap = {};
      if (clerkIds.length > 0) {
        const { data: users, error: usersErr } = await supabase
          .from("users")
          .select("clerk_id, full_name, email, role")
          .in("clerk_id", clerkIds);

        if (usersErr) {
          console.log("❌ load users for requests error:", usersErr);
        } else {
          usersMap = (users || []).reduce((acc, u) => {
            acc[u.clerk_id] = u;
            return acc;
          }, {});
        }
      }

      const merged = (reqs || []).map((r) => ({
        ...r,
        user: usersMap[r.requester_id] || null,
      }));

      setList(merged);
    } catch (error) {
      console.error("❌ load error:", error);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /* ---------------- REALTIME ---------------- */

  const subscribeRealtime = async () => {
    try {
      const supabase = await getSupabase();

      // ✅ ยกเลิก channel เก่าก่อน
      if (channelRef.current) {
        try {
          await supabase.removeChannel(channelRef.current);
        } catch (e) {
          console.log("remove channel error:", e);
        }
        channelRef.current = null;
      }

      channelRef.current = supabase
        .channel("admin-volunteer-requests-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "volunteer_requests" },
          (payload) => {
            console.log("🔄 realtime payload:", payload.eventType);
            load();
          }
        )
        .subscribe((status, err) => {
          console.log("📡 Realtime status Voluntrre:", status);
          if (err) console.log("❌ Realtime err:", err);
        });
    } catch (error) {
      console.error("❌ subscribeRealtime error:", error);
    }
  };

  const cleanupRealtime = async () => {
    if (channelRef.current) {
      try {
        const supabase = await getSupabase();
        await supabase.removeChannel(channelRef.current);
      } catch (e) {
        console.log("cleanup error:", e);
      }
      channelRef.current = null;
    }
  };

  /* ---------------- TOKEN AUTO REFRESH LOOP ---------------- */

  const startAutoRefresh = () => {
    if (refreshTimerRef.current) return;

    // ✅ ลด interval เหลือ 3 นาที (token Clerk มักหมดอายุ 5 นาที)
    refreshTimerRef.current = setInterval(async () => {
      try {
        console.log("🔁 refreshing token + resubscribe realtime...");
        await subscribeRealtime();
        await load();
      } catch (e) {
        console.log("❌ auto refresh error:", e);
      }
    }, 3 * 60 * 1000); // 3 นาที
  };

  const stopAutoRefresh = () => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  /* ---------------- LIFECYCLE ---------------- */

  useEffect(() => {
    (async () => {
      await load();
      await subscribeRealtime();
      startAutoRefresh();
    })();

    return () => {
      stopAutoRefresh();
      cleanupRealtime();
    };
  }, []);

  /* ---------------- ACTIONS ---------------- */

  const approve = async (request) => {
    setActionLoading(true);
    try {
      const supabase = await getSupabase();

      const { error: e1 } = await supabase
        .from("volunteer_requests")
        .update({ status: "approved" })
        .eq("id", request.id);

      if (e1) {
        Alert.alert("เกิดข้อผิดพลาด", e1.message);
        return;
      }

      const { error: e2 } = await supabase
        .from("users")
        .update({ role: "volunteer" })
        .eq("clerk_id", request.requester_id);

      if (e2) {
        Alert.alert("เกิดข้อผิดพลาด", e2.message);
        return;
      }

      setModalVisible(false);
      Alert.alert("สำเร็จ", "อนุมัติอาสาสมัครเรียบร้อยแล้ว");
      await load(); // ✅ รีโหลดข้อมูล
    } catch (e) {
      console.error("❌ Approve error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถอนุมัติได้");
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async (request) => {
    setActionLoading(true);
    try {
      const supabase = await getSupabase();

      const { error } = await supabase
        .from("volunteer_requests")
        .update({ status: "rejected" })
        .eq("id", request.id);

      if (error) {
        Alert.alert("เกิดข้อผิดพลาด", error.message);
        return;
      }

      setModalVisible(false);
      Alert.alert("สำเร็จ", "ปฏิเสธคำขอเรียบร้อยแล้ว");
      await load(); // ✅ รีโหลดข้อมูล
    } catch (e) {
      console.error("❌ Reject error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถปฏิเสธได้");
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
  };

  /* ---------------- UI ---------------- */

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="people" size={28} color="#8B5CF6" />
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>คำขออาสาสมัคร</Text>
            <View style={styles.realtimeBadge}></View>
          </View>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      </View>

      {list.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="checkmark-done" size={48} color="#10b981" />
          </View>
          <Text style={styles.emptyTitle}>ไม่มีคำขอรอพิจารณา</Text>
          <Text style={styles.emptySubtitle}>
            คำขออาสาสมัครทั้งหมดได้รับการจัดการเรียบร้อยแล้ว
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={["#8B5CF6"]}
              tintColor="#8B5CF6"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => openDetail(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(item.user?.full_name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.name}>
                    {item.user?.full_name || "ไม่ทราบชื่อ"}
                  </Text>
                  <Text style={styles.email}>
                    {item.user?.email || item.requester_id}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <Ionicons name="calendar-outline" size={16} color="#6b7280" />
                  <Text style={styles.infoText}>
                    {new Date(item.created_at).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                </View>

                {!!item.phone && (
                  <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={16} color="#6b7280" />
                    <Text style={styles.infoText}>{item.phone}</Text>
                  </View>
                )}

                {!!item.area && (
                  <View style={styles.infoRow}>
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color="#6b7280"
                    />
                    <Text style={styles.infoText}>{item.area}</Text>
                  </View>
                )}

                {!!item.reason && (
                  <View style={styles.reasonContainer}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={16}
                      color="#8B5CF6"
                    />
                    <Text style={styles.reasonText} numberOfLines={2}>
                      {item.reason}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={(e) => {
                    e.stopPropagation();
                    Alert.alert(
                      "ยืนยันการปฏิเสธ",
                      `ต้องการปฏิเสธคำขอของ ${
                        item.user?.full_name || "ผู้ใช้"
                      }?`,
                      [
                        { text: "ยกเลิก", style: "cancel" },
                        {
                          text: "ปฏิเสธ",
                          onPress: () => reject(item),
                          style: "destructive",
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="close-circle" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>ปฏิเสธ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={(e) => {
                    e.stopPropagation();
                    Alert.alert(
                      "ยืนยันการอนุมัติ",
                      `ต้องการอนุมัติ ${
                        item.user?.full_name || "ผู้ใช้"
                      } เป็นอาสาสมัคร?`,
                      [
                        { text: "ยกเลิก", style: "cancel" },
                        { text: "อนุมัติ", onPress: () => approve(item) },
                      ]
                    );
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>อนุมัติ</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียดคำขอ</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              {selectedRequest && (
                <>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>ข้อมูลผู้สมัคร</Text>
                    <View style={styles.modalInfoRow}>
                      <Ionicons name="person" size={18} color="#6b7280" />
                      <Text style={styles.modalInfoText}>
                        {selectedRequest.user?.full_name || "ไม่ทราบชื่อ"}
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Ionicons name="mail" size={18} color="#6b7280" />
                      <Text style={styles.modalInfoText}>
                        {selectedRequest.user?.email || "ไม่มีอีเมล"}
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Ionicons name="call" size={18} color="#6b7280" />
                      <Text style={styles.modalInfoText}>
                        {selectedRequest.phone || "ไม่มีเบอร์"}
                      </Text>
                    </View>
                  </View>

                  {!!selectedRequest.reason && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        เหตุผล/แรงบันดาลใจ
                      </Text>
                      <Text style={styles.modalDetailText}>
                        {selectedRequest.reason}
                      </Text>
                    </View>
                  )}

                  {!!selectedRequest.area && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        พื้นที่ที่สะดวก
                      </Text>
                      <Text style={styles.modalDetailText}>
                        {selectedRequest.area}
                      </Text>
                    </View>
                  )}

                  {!!selectedRequest.availability && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        ช่วงเวลาที่ว่าง
                      </Text>
                      <Text style={styles.modalDetailText}>
                        {selectedRequest.availability}
                      </Text>
                    </View>
                  )}

                  {!!selectedRequest.experience && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>ประสบการณ์</Text>
                      <Text style={styles.modalDetailText}>
                        {selectedRequest.experience}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalActionBtn, styles.modalRejectBtn]}
                onPress={() => {
                  Alert.alert(
                    "ยืนยันการปฏิเสธ",
                    `ต้องการปฏิเสธคำขอของ ${
                      selectedRequest?.user?.full_name || "ผู้ใช้"
                    }?`,
                    [
                      { text: "ยกเลิก", style: "cancel" },
                      {
                        text: "ปฏิเสธ",
                        onPress: () => reject(selectedRequest),
                        style: "destructive",
                      },
                    ]
                  );
                }}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                    <Text style={styles.modalActionBtnText}>ปฏิเสธ</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, styles.modalApproveBtn]}
                onPress={() => {
                  Alert.alert(
                    "ยืนยันการอนุมัติ",
                    `ต้องการอนุมัติ ${
                      selectedRequest?.user?.full_name || "ผู้ใช้"
                    } เป็นอาสาสมัคร?`,
                    [
                      { text: "ยกเลิก", style: "cancel" },
                      {
                        text: "อนุมัติ",
                        onPress: () => approve(selectedRequest),
                      },
                    ]
                  );
                }}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.modalActionBtnText}>อนุมัติ</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
  },

  // Header
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTextContainer: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  realtimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  countBadge: {
    backgroundColor: "#8B5CF6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 40,
    alignItems: "center",
  },
  countText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#d1fae5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },

  // Card
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ede9fe",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#8B5CF6",
  },
  cardHeaderInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: "#6b7280",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 16,
  },
  cardBody: {
    padding: 16,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  reasonContainer: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#faf5ff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9d5ff",
  },
  reasonText: {
    fontSize: 13,
    color: "#6b21a8",
    flex: 1,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rejectBtn: {
    backgroundColor: "#ef4444",
  },
  approveBtn: {
    backgroundColor: "#10b981",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBody: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  modalSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8B5CF6",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  modalInfoText: {
    fontSize: 15,
    color: "#374151",
  },
  modalDetailText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  modalRejectBtn: {
    backgroundColor: "#ef4444",
  },
  modalApproveBtn: {
    backgroundColor: "#10b981",
  },
  modalActionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
});
