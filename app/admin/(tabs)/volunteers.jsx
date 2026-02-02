import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

// ✨ Animated Card Component
const VolunteerCard = ({ item, onPress, onReject, onApprove, busy }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

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

  return (
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
        style={styles.card}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.95}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(item.user?.full_name || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.name} numberOfLines={1}>
              {item.user?.full_name || "ไม่ทราบชื่อ"}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {item.user?.email || item.requester_id}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.badgeDot} />
            <Text style={styles.statusText}>รอ</Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color="#8E8E93" />
            <Text style={styles.infoText}>
              {new Date(item.created_at).toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>

          {!!item.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={14} color="#8E8E93" />
              <Text style={styles.infoText}>{item.phone}</Text>
            </View>
          )}

          {!!item.area && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={14} color="#8E8E93" />
              <Text style={styles.infoText}>{item.area}</Text>
            </View>
          )}

          {!!item.reason && (
            <View style={styles.reasonContainer}>
              <Ionicons name="chatbubble-outline" size={14} color="#8B5CF6" />
              <Text style={styles.reasonText} numberOfLines={2}>
                {item.reason}
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              busy && styles.btnDisabled,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onReject();
            }}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color="#FF3B30" size="small" />
            ) : (
              <>
                <Ionicons name="close-circle" size={18} color="#FF3B30" />
                <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.approveBtn,
              busy && styles.btnDisabled,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.approveBtnText}>อนุมัติ</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function AdminVolunteers() {
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const channelRef = useRef(null);
  const refreshTimerRef = useRef(null);

  /* ---------------- GET FRESH SUPABASE CLIENT ---------------- */

  const getSupabase = async () => {
    try {
      const token = await getToken({ template: "supabase", skipCache: true });

      if (!token) {
        throw new Error("ไม่สามารถดึง token ได้");
      }

      const supabase = createClerkSupabaseClient(token);

      return supabase;
    } catch (error) {
      console.error("❌ getSupabase error:", error);
      Alert.alert("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
      throw error;
    }
  };

  /* ---------------- LOAD DATA ---------------- */

  const load = async () => {
    try {
      setLoading(true);

      const supabase = await getSupabase();

      const { data: reqs, error: reqErr } = await supabase
        .from("volunteer_requests")
        .select(
          "id, requester_id, user_id, phone, area, reason, motivation, availability, experience, status, created_at",
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
    }
  };

  /* ---------------- REALTIME ---------------- */

  const subscribeRealtime = async () => {
    try {
      const supabase = await getSupabase();

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
          },
        )
        .subscribe((status, err) => {
          console.log("📡 Realtime status Volunteer:", status);
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

    refreshTimerRef.current = setInterval(
      async () => {
        try {
          console.log("🔁 refreshing token + resubscribe realtime...");
          await subscribeRealtime();
          await load();
        } catch (e) {
          console.log("❌ auto refresh error:", e);
        }
      },
      3 * 60 * 1000,
    );
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
    setActionLoading((p) => ({ ...p, [request.id]: true }));
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
      Alert.alert("สำเร็จ", "อนุมัติอาสาสมัครเรียบร้อยแล้ว ✅");
      await load();
    } catch (e) {
      console.error("❌ Approve error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถอนุมัติได้");
    } finally {
      setActionLoading((p) => ({ ...p, [request.id]: false }));
    }
  };

  const reject = async (request) => {
    setActionLoading((p) => ({ ...p, [request.id]: true }));
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
      Alert.alert("สำเร็จ", "ปฏิเสธคำขอเรียบร้อยแล้ว ❌");
      await load();
    } catch (e) {
      console.error("❌ Reject error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถปฏิเสธได้");
    } finally {
      setActionLoading((p) => ({ ...p, [request.id]: false }));
    }
  };

  const openDetail = (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
  };

  const confirmReject = (item) => {
    Alert.alert(
      "❌ ปฏิเสธคำขอ",
      `ยืนยันการปฏิเสธ "${item.user?.full_name || "ผู้ใช้"}" หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ปฏิเสธ",
          onPress: () => reject(item),
          style: "destructive",
        },
      ],
    );
  };

  const confirmApprove = (item) => {
    Alert.alert(
      "✅ อนุมัติอาสาสมัคร",
      `ยืนยันการอนุมัติ "${item.user?.full_name || "ผู้ใช้"}" หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "อนุมัติ",
          onPress: () => approve(item),
        },
      ],
    );
  };

  /* ---------------- UI ---------------- */

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>กำลังโหลด...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <Ionicons name="people" size={26} color="#8B5CF6" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>คำขออาสาสมัคร</Text>
            <Text style={styles.subtitle}>ตรวจสอบและอนุมัติ</Text>
          </View>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      </View>

      {/* List or Empty State */}
      {list.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="checkmark-done-circle" size={64} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>ไม่มีคำขอรอพิจารณา</Text>
          <Text style={styles.emptySubtitle}>
            คำขอทั้งหมดได้รับการจัดการแล้ว
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => (
            <VolunteerCard
              item={item}
              onPress={() => openDetail(item)}
              onReject={() => confirmReject(item)}
              onApprove={() => confirmApprove(item)}
              busy={!!actionLoading[item.id]}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียดคำขอ</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Modal Body */}
            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              {selectedRequest && (
                <>
                  {/* User Info */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>ข้อมูลผู้สมัคร</Text>
                    <View style={styles.modalInfoCard}>
                      <View style={styles.modalInfoRow}>
                        <Ionicons
                          name="person-outline"
                          size={18}
                          color="#8E8E93"
                        />
                        <Text style={styles.modalInfoText}>
                          {selectedRequest.user?.full_name || "ไม่ทราบชื่อ"}
                        </Text>
                      </View>
                      <View style={styles.modalInfoRow}>
                        <Ionicons
                          name="mail-outline"
                          size={18}
                          color="#8E8E93"
                        />
                        <Text style={styles.modalInfoText}>
                          {selectedRequest.user?.email || "ไม่มีอีเมล"}
                        </Text>
                      </View>
                      <View style={styles.modalInfoRow}>
                        <Ionicons
                          name="call-outline"
                          size={18}
                          color="#8E8E93"
                        />
                        <Text style={styles.modalInfoText}>
                          {selectedRequest.phone || "ไม่มีเบอร์"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Reason */}
                  {!!selectedRequest.reason && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        เหตุผล/แรงบันดาลใจ
                      </Text>
                      <View style={styles.modalDetailCard}>
                        <Text style={styles.modalDetailText}>
                          {selectedRequest.reason}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Area */}
                  {!!selectedRequest.area && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        พื้นที่ที่สะดวก
                      </Text>
                      <View style={styles.modalDetailCard}>
                        <Text style={styles.modalDetailText}>
                          {selectedRequest.area}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Availability */}
                  {!!selectedRequest.availability && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        ช่วงเวลาที่ว่าง
                      </Text>
                      <View style={styles.modalDetailCard}>
                        <Text style={styles.modalDetailText}>
                          {selectedRequest.availability}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Experience */}
                  {!!selectedRequest.experience && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>ประสบการณ์</Text>
                      <View style={styles.modalDetailCard}>
                        <Text style={styles.modalDetailText}>
                          {selectedRequest.experience}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[
                  styles.modalActionBtn,
                  styles.modalRejectBtn,
                  actionLoading[selectedRequest?.id] && styles.btnDisabled,
                ]}
                onPress={() => confirmReject(selectedRequest)}
                disabled={actionLoading[selectedRequest?.id]}
                activeOpacity={0.8}
              >
                {actionLoading[selectedRequest?.id] ? (
                  <ActivityIndicator color="#FF3B30" size="small" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    <Text style={styles.modalRejectText}>ปฏิเสธ</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalActionBtn,
                  styles.modalApproveBtn,
                  actionLoading[selectedRequest?.id] && styles.btnDisabled,
                ]}
                onPress={() => confirmApprove(selectedRequest)}
                disabled={actionLoading[selectedRequest?.id]}
                activeOpacity={0.8}
              >
                {actionLoading[selectedRequest?.id] ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.modalApproveText}>อนุมัติ</Text>
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
    backgroundColor: "#F2F2F7",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
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

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 16 : 40,
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
    backgroundColor: "#F3EEFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 36,
    alignItems: "center",
  },
  countText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  // List
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginBottom: 12,
    overflow: "hidden",
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
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F3EEFF",
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
    color: "#000",
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  email: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
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
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
  reasonContainer: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FAFAFA",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  reasonText: {
    fontSize: 13,
    color: "#6B21A8",
    flex: 1,
    lineHeight: 18,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F2F2F7",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  rejectBtn: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "#FFE0E0",
  },
  approveBtn: {
    backgroundColor: "#10B981",
    borderWidth: 1.5,
    borderColor: "#10B981",
  },
  rejectBtnText: {
    color: "#FF3B30",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  approveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  btnDisabled: {
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
    backgroundColor: "#D1FAE5",
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
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#000",
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBody: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  modalSection: {
    paddingVertical: 16,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B5CF6",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalInfoCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  modalInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalInfoText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
  modalDetailCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 14,
  },
  modalDetailText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    fontWeight: "500",
  },
  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F2F2F7",
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
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "#FFE0E0",
  },
  modalApproveBtn: {
    backgroundColor: "#10B981",
    borderWidth: 1.5,
    borderColor: "#10B981",
  },
  modalRejectText: {
    color: "#FF3B30",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  modalApproveText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
