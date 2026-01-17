import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const cfg =
    s === "pending"
      ? { bg: "#FEF3C7", border: "#FDE68A", text: "#92400E", label: "PENDING" }
      : s === "verified" || s === "approved"
      ? { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", label: "VERIFIED" }
      : {
          bg: "#FEF2F2",
          border: "#FECACA",
          text: "#991B1B",
          label: "REJECTED",
        };

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: cfg.bg, borderColor: cfg.border },
      ]}
    >
      <Text style={[styles.pillText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ✅ ไม่ใช้ Clipboard: กดปุ่ม copy จะโชว์ Alert ให้ดู/คัดลอกเอง
function FieldRow({ icon, label, value }) {
  const v = value ?? "-";
  const canCopy = v && v !== "-";

  const showValue = () => {
    if (!canCopy) return;
    Alert.alert(label, String(v));
  };

  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLeft}>
        <Ionicons name={icon} size={18} color="#6B7280" />
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{label}</Text>

          {/* selectable ช่วยให้กดค้าง copy ได้ (รองรับใน RN) */}
          <Text style={styles.fieldValue} selectable>
            {String(v)}
          </Text>
        </View>
      </View>

      {canCopy && (
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={showValue}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="copy-outline" size={18} color="#111827" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={18} color="#111827" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function AdminVerificationDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);

  const [previewUrl, setPreviewUrl] = useState(null);

  const [rejectReason, setRejectReason] = useState("ไม่ผ่านเกณฑ์การตรวจสอบ");
  const [submitting, setSubmitting] = useState(false);

  const docs = useMemo(() => {
    if (!request) return [];
    return [
      request.id_card_url
        ? { label: "บัตรประชาชน/Passport", url: request.id_card_url }
        : null,
      request.selfie_with_id_url
        ? { label: "รูปถ่ายคู่บัตร", url: request.selfie_with_id_url }
        : null,
      request.proof_of_address_url
        ? { label: "หลักฐานที่อยู่", url: request.proof_of_address_url }
        : null,
    ].filter(Boolean);
  }, [request]);

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("verification_requests")
        .select(
          `
          id,
          user_row_id,
          phone_number,
          id_card_url,
          selfie_with_id_url,
          proof_of_address_url,
          full_name,
          address,
          province,
          postal_code,
          emergency_contact,
          emergency_phone,
          occupation,
          monthly_income,
          status,
          created_at,
          reviewed_at,
          reviewed_by,
          reject_reason,
          users:user_row_id (
            id,
            full_name,
            email,
            avatar_url,
            verification_status,
            verified_at
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      setRequest(data);
      setRejectReason(data?.reject_reason || "ไม่ผ่านเกณฑ์การตรวจสอบ");
    } catch (e) {
      console.error("fetchDetail error:", e);
      Alert.alert(
        "เกิดข้อผิดพลาด",
        e?.message || "ไม่สามารถโหลดรายละเอียดได้",
        [{ text: "ตกลง", onPress: () => router.back() }]
      );
    } finally {
      setLoading(false);
    }
  };

  const callPhone = async (phone) => {
    if (!phone) return;
    const url = `tel:${phone}`;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Alert.alert("โทรไม่ได้", "อุปกรณ์ไม่รองรับการโทร");
  };

  const confirmAction = (status) => {
    const u = request?.users;
    const title = status === "verified" ? "อนุมัติคำขอ" : "ปฏิเสธคำขอ";
    const msg =
      status === "verified"
        ? `ต้องการอนุมัติการยืนยันตัวตนของ ${u?.full_name || "ผู้ใช้"} ใช่ไหม?`
        : `ต้องการปฏิเสธคำขอของ ${u?.full_name || "ผู้ใช้"} ใช่ไหม?`;

    Alert.alert(title, msg, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: status === "verified" ? "อนุมัติ" : "ปฏิเสธ",
        style: status === "verified" ? "default" : "destructive",
        onPress: () => review(status),
      },
    ]);
  };

  const review = async (status) => {
    if (!request?.id) return;

    if (status === "rejected" && !rejectReason.trim()) {
      Alert.alert("กรุณาระบุเหตุผลการปฏิเสธ");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const { error } = await supabase.rpc(
        "admin_review_verification_request",
        {
          p_request_id: request.id,
          p_status: status,
          p_reject_reason: status === "rejected" ? rejectReason.trim() : null,
        }
      );

      if (error) throw error;

      Alert.alert(
        "สำเร็จ",
        status === "verified" ? "อนุมัติแล้ว ✅" : "ปฏิเสธแล้ว ❌",
        [{ text: "ตกลง", onPress: () => router.back() }]
      );
    } catch (e) {
      console.error("review error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถอัปเดตสถานะได้");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.muted}>กำลังโหลดรายละเอียด...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>ไม่พบข้อมูล</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryBtnText}>กลับ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const u = request.users;
  const isPending = String(request.status).toLowerCase() === "pending";

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>รายละเอียดคำขอ</Text>
          <Text style={styles.headerSub}>Request ID: {request.id}</Text>
        </View>

        <StatusPill status={request.status} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Applicant */}
        <View style={styles.card}>
          <SectionTitle icon="person-outline" title="ข้อมูลผู้ขอ" />

          <View style={styles.userRow}>
            <Image
              source={{
                uri: u?.avatar_url || "https://www.gravatar.com/avatar/?d=mp",
              }}
              style={styles.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>
                {u?.full_name || request.full_name || "-"}
              </Text>
              <Text style={styles.userEmail}>{u?.email || "-"}</Text>
            </View>

            {!!request.phone_number && (
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => callPhone(request.phone_number)}
              >
                <Ionicons name="call" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ marginTop: 10, gap: 10 }}>
            <FieldRow
              icon="call-outline"
              label="เบอร์โทร"
              value={request.phone_number}
            />
            <FieldRow
              icon="calendar-outline"
              label="ส่งเมื่อ"
              value={formatDateTime(request.created_at)}
            />
            <FieldRow
              icon="shield-checkmark-outline"
              label="สถานะยืนยันใน users"
              value={u?.verification_status ?? "-"}
            />
            <FieldRow
              icon="time-outline"
              label="verified_at (users)"
              value={u?.verified_at ? formatDateTime(u.verified_at) : "-"}
            />
          </View>
        </View>

        {/* Personal details */}
        <View style={styles.card}>
          <SectionTitle
            icon="document-text-outline"
            title="ข้อมูลส่วนตัว (ตามฟอร์ม)"
          />
          <View style={{ gap: 10 }}>
            <FieldRow
              icon="person-circle-outline"
              label="ชื่อ-นามสกุล (ฟอร์ม)"
              value={request.full_name ?? "-"}
            />
            <FieldRow
              icon="home-outline"
              label="ที่อยู่"
              value={request.address ?? "-"}
            />
            <FieldRow
              icon="map-outline"
              label="จังหวัด"
              value={request.province ?? "-"}
            />
            <FieldRow
              icon="mail-outline"
              label="รหัสไปรษณีย์"
              value={request.postal_code ?? "-"}
            />
          </View>
        </View>

        {/* Extra details */}
        <View style={styles.card}>
          <SectionTitle
            icon="information-circle-outline"
            title="ข้อมูลเพิ่มเติม"
          />
          <View style={{ gap: 10 }}>
            <FieldRow
              icon="alert-circle-outline"
              label="ผู้ติดต่อฉุกเฉิน"
              value={request.emergency_contact ?? "-"}
            />
            <FieldRow
              icon="call-outline"
              label="เบอร์ติดต่อฉุกเฉิน"
              value={request.emergency_phone ?? "-"}
            />
            <FieldRow
              icon="briefcase-outline"
              label="อาชีพ"
              value={request.occupation ?? "-"}
            />
            <FieldRow
              icon="cash-outline"
              label="รายได้ต่อเดือน"
              value={request.monthly_income ?? "-"}
            />
          </View>
        </View>

        {/* Documents */}
        <View style={styles.card}>
          <SectionTitle icon="images-outline" title="เอกสารที่แนบมา" />

          {docs.length === 0 ? (
            <View style={styles.emptyDoc}>
              <Ionicons name="image-outline" size={22} color="#9CA3AF" />
              <Text style={styles.muted}>ไม่มีเอกสารแนบ</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {docs.map((d) => (
                <TouchableOpacity
                  key={d.label}
                  activeOpacity={0.9}
                  style={styles.docCard}
                  onPress={() => setPreviewUrl(d.url)}
                >
                  <Image source={{ uri: d.url }} style={styles.docImage} />
                  <View style={styles.docFooter}>
                    <Text style={styles.docLabel}>{d.label}</Text>
                    <View style={styles.docHint}>
                      <Ionicons name="expand-outline" size={16} color="#fff" />
                      <Text style={styles.docHintText}>ดูเต็มจอ</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Admin review info */}
        <View style={styles.card}>
          <SectionTitle icon="settings-outline" title="ผลการตรวจสอบ (Admin)" />

          <View style={{ gap: 10 }}>
            <FieldRow
              icon="time-outline"
              label="reviewed_at"
              value={
                request.reviewed_at ? formatDateTime(request.reviewed_at) : "-"
              }
            />
            <FieldRow
              icon="person-outline"
              label="reviewed_by"
              value={request.reviewed_by ?? "-"}
            />
            <FieldRow
              icon="alert-outline"
              label="reject_reason (เดิม)"
              value={request.reject_reason ?? "-"}
            />
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>
            เหตุผลปฏิเสธ (กรณีปฏิเสธ)
          </Text>
          <TextInput
            value={rejectReason}
            onChangeText={setRejectReason}
            placeholder="ระบุเหตุผล..."
            style={styles.input}
            multiline
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.rejectBtn,
                (!isPending || submitting) && styles.disabled,
              ]}
              disabled={!isPending || submitting}
              onPress={() => confirmAction("rejected")}
            >
              {submitting ? (
                <ActivityIndicator color="#EF4444" />
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
                (!isPending || submitting) && styles.disabled,
              ]}
              disabled={!isPending || submitting}
              onPress={() => confirmAction("verified")}
            >
              {submitting ? (
                <ActivityIndicator color="#10B981" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.approveText}>อนุมัติ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {!isPending && (
            <Text style={[styles.muted, { marginTop: 10 }]}>
              คำขอนี้ถูกดำเนินการแล้ว
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Modal preview */}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  muted: { color: "#6B7280", fontWeight: "600" },

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
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  headerSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: "900" },

  content: { padding: 16, paddingBottom: 28, gap: 14 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: "#111827" },

  userRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
  },
  userName: { fontSize: 16, fontWeight: "900", color: "#111827" },
  userEmail: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },

  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  fieldLeft: { flexDirection: "row", gap: 10, flex: 1 },
  fieldLabel: { fontSize: 12, color: "#6B7280", fontWeight: "800" },
  fieldValue: {
    marginTop: 4,
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
  },

  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyDoc: {
    height: 90,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  docCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  docImage: { width: "100%", height: 220, backgroundColor: "#F3F4F6" },
  docFooter: {
    padding: 12,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  docLabel: { color: "#fff", fontWeight: "900", flex: 1 },
  docHint: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  docHintText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  label: { marginTop: 4, marginBottom: 8, color: "#111827", fontWeight: "900" },
  input: {
    minHeight: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    padding: 12,
    color: "#111827",
    textAlignVertical: "top",
  },

  actionsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  rejectBtn: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  approveBtn: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  rejectText: { color: "#EF4444", fontWeight: "900" },
  approveText: { color: "#10B981", fontWeight: "900" },
  disabled: { opacity: 0.5 },

  primaryBtn: {
    marginTop: 10,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
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
    fontWeight: "800",
  },
});
