import { useAuth } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

// Helper Components
const InfoItem = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value || "-"}</Text>
  </View>
);

const LongTextItem = ({ label, value }) => (
  <View style={styles.longTextSection}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.longTextBox}>
      <Text style={styles.longTextValue}>{value || "-"}</Text>
    </View>
  </View>
);

export default function RequestDetail() {
  const { id } = useLocalSearchParams();
  const { getToken } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchRequest = async () => {
    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("adoption_requests")
        .select("*, pets(id, name, adoption_status)")
        .eq("id", id)
        .single();

      if (error) {
        console.error("fetchRequest error:", error);
        setLoading(false);
        return;
      }

      const { data: requesterUser, error: reqErr } = await supabase
        .from("users")
        .select(
          "id, clerk_id, full_name, avatar_url, verification_status, verified_at, phone_verified, id_verified"
        )
        .eq("clerk_id", data.requester_id)
        .maybeSingle();

      if (reqErr) console.error("fetch requesterUser error:", reqErr);

      setRequest({ ...data, requesterUser });
      setLoading(false);
    } catch (e) {
      console.error("fetchRequest exception:", e);
      setLoading(false);
    }
  };

  const updateStatus = async (status) => {
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);

    setProcessing(true);

    try {
      if (status === "approved") {
        const { data: reqUser, error: reqErr } = await supabase
          .from("users")
          .select("verification_status")
          .eq("clerk_id", request.requester_id)
          .single();

        if (reqErr) throw reqErr;

        if (reqUser?.verification_status !== "verified") {
          Alert.alert("อนุมัติไม่ได้", "ผู้ขอยังไม่ได้ยืนยันตัวตน");
          setProcessing(false);
          return;
        }

        const { data: currentPet, error: petCheckErr } = await supabase
          .from("pets")
          .select("adoption_status")
          .eq("id", request.pet_id)
          .single();

        if (petCheckErr) throw petCheckErr;

        if (currentPet?.adoption_status === "adopted") {
          Alert.alert("ไม่สามารถอนุมัติได้", "สัตว์ตัวนี้ถูกรับเลี้ยงไปแล้ว");
          setProcessing(false);
          router.back();
          return;
        }

        const { error: updatePetError } = await supabase
          .from("pets")
          .update({ adoption_status: "adopted" })
          .eq("id", request.pet_id);

        if (updatePetError) throw updatePetError;

        const { error: rejectOthersErr } = await supabase
          .from("adoption_requests")
          .update({ status: "rejected" })
          .eq("pet_id", request.pet_id)
          .eq("status", "pending")
          .neq("id", id);

        if (rejectOthersErr) throw rejectOthersErr;
      }

      const { error } = await supabase
        .from("adoption_requests")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      Alert.alert(
        "สำเร็จ",
        status === "approved"
          ? "คุณตอบรับคำขอแล้ว คำขออื่นๆ จะถูกปฏิเสธอัตโนมัติ"
          : "คุณปฏิเสธคำขอแล้ว"
      );

      router.back();
    } catch (err) {
      console.error("Update status error:", err);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถอัปเดตสถานะได้");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>😕 ไม่พบข้อมูลคำขอ</Text>
      </View>
    );
  }

  const isAlreadyAdopted = request.pets?.adoption_status === "adopted";
  const requesterVerified =
    request.requesterUser?.verification_status === "verified";
  const answers = request?.application_answers ?? {};

  const getStatusBadge = () => {
    const statusConfig = {
      pending: { bg: "#FFF4E6", color: "#F76E11", text: "รอดำเนินการ" },
      approved: { bg: "#E8F5E9", color: "#2E7D32", text: "อนุมัติแล้ว" },
      rejected: { bg: "#FFEBEE", color: "#C62828", text: "ปฏิเสธแล้ว" },
    };

    const config = statusConfig[request.status] || statusConfig.pending;

    return (
      <View style={[styles.badge, { backgroundColor: config.bg }]}>
        <Text style={[styles.badgeText, { color: config.color }]}>
          {config.text}
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.petName}>🐾 {request.pets?.name}</Text>
          {getStatusBadge()}
        </View>
        <Text style={styles.requestId}>คำขอ #{id.slice(0, 8)}</Text>
      </View>

      {/* Already Adopted Warning */}
      {isAlreadyAdopted && (
        <View style={styles.warningCard}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>สัตว์ตัวนี้ถูกรับเลี้ยงไปแล้ว</Text>
        </View>
      )}

      {/* Requester Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 ข้อมูลผู้ขอรับเลี้ยง</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>ชื่อผู้ขอ</Text>
          <Text style={styles.value}>
            {request.requesterUser?.full_name ?? "-"}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.verificationSection}>
          <Text style={styles.label}>สถานะการยืนยันตัวตน</Text>
          {requesterVerified ? (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓ ยืนยันตัวตนแล้ว</Text>
            </View>
          ) : (
            <View style={styles.unverifiedBadge}>
              <Text style={styles.unverifiedText}>⚠ ยังไม่ได้ยืนยันตัวตน</Text>
            </View>
          )}
        </View>

        {request.requester_verification_status && (
          <Text style={styles.snapshotText}>
            ณ เวลาส่งคำขอ: {request.requester_verification_status}
          </Text>
        )}
      </View>

      {/* Application Answers Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 รายละเอียดคำขอ</Text>

        <InfoItem label="ชื่อ-นามสกุล" value={answers.fullName} />
        <InfoItem label="เบอร์โทรศัพท์" value={answers.phone} />
        <InfoItem label="ประเภทที่พักอาศัย" value={answers.homeType} />
        <InfoItem label="อยู่กับ" value={answers.family} />
        <InfoItem label="มีสัตว์เลี้ยงเดิม" value={answers.hasPets} />
        <InfoItem label="ประสบการณ์การเลี้ยง" value={answers.experience} />

        <View style={styles.divider} />

        <LongTextItem
          label="เหตุผลที่ต้องการรับเลี้ยง"
          value={answers.reason}
        />
        <LongTextItem
          label="ความพร้อมด้านค่าใช้จ่ายและเวลา"
          value={answers.readyCosts}
        />
        <LongTextItem label="ข้อมูลเพิ่มเติม" value={answers.notes} />
      </View>

      {/* Action Buttons */}
      {request.status === "pending" && !isAlreadyAdopted && (
        <View style={styles.actionSection}>
          {!requesterVerified && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>
                ⚠️ ผู้ขอต้องยืนยันตัวตนก่อนจึงจะอนุมัติได้
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.approveButton,
              (!requesterVerified || processing) && styles.buttonDisabled,
            ]}
            onPress={() => updateStatus("approved")}
            disabled={!requesterVerified || processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.approveButtonText}>✓ ตอบรับคำขอ</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rejectButton, processing && styles.buttonDisabled]}
            onPress={() => updateStatus("rejected")}
            disabled={processing}
          >
            <Text style={styles.rejectButtonText}>✕ ปฏิเสธคำขอ</Text>
          </TouchableOpacity>
        </View>
      )}

      {request.status !== "pending" && (
        <View style={styles.completedCard}>
          <Text style={styles.completedText}>
            ✓ คำขอนี้ดำเนินการเรียบร้อยแล้ว
          </Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    color: "#666",
  },

  // Header Card
  headerCard: {
    backgroundColor: "#FFF",
    padding: 20,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  petName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#212121",
  },
  requestId: {
    marginTop: 4,
    fontSize: 14,
    color: "#999",
  },

  // Status Badge
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "700",
  },

  // Warning Card
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#F57C00",
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#E65100",
  },

  // Card
  card: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#212121",
    marginBottom: 16,
  },

  // Info Rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  label: {
    fontSize: 15,
    color: "#666",
    flex: 1,
  },
  value: {
    fontSize: 15,
    fontWeight: "600",
    color: "#212121",
    flex: 1,
    textAlign: "right",
  },

  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 12,
  },

  // Verification Section
  verificationSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  verifiedBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  verifiedText: {
    color: "#2E7D32",
    fontSize: 14,
    fontWeight: "700",
  },
  unverifiedBadge: {
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  unverifiedText: {
    color: "#E65100",
    fontSize: 14,
    fontWeight: "700",
  },
  snapshotText: {
    marginTop: 8,
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },

  // Long Text Section
  longTextSection: {
    marginTop: 12,
  },
  longTextBox: {
    marginTop: 8,
    backgroundColor: "#F8F9FA",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  longTextValue: {
    fontSize: 15,
    color: "#424242",
    lineHeight: 22,
  },

  // Action Section
  actionSection: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  noticeCard: {
    backgroundColor: "#FFF3E0",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 14,
    color: "#E65100",
    fontWeight: "600",
    textAlign: "center",
  },

  approveButton: {
    backgroundColor: "#4CAF50",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  approveButtonText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "700",
  },

  rejectButton: {
    backgroundColor: "#FFF",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#F44336",
  },
  rejectButtonText: {
    color: "#F44336",
    fontSize: 17,
    fontWeight: "700",
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  // Completed Card
  completedCard: {
    backgroundColor: "#E8F5E9",
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  completedText: {
    color: "#2E7D32",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
