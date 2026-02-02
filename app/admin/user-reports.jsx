import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

// ✅ ใส่อีเมลแอดมินของคุณ (ถ้าไม่ใส่ = ทุกคนเข้าได้)  ⚠️ production แนะนำอย่าปล่อยว่าง
const ADMIN_EMAILS = [
  // "your_email@gmail.com",
];

const STATUS_OPTIONS = ["open", "reviewing", "resolved", "dismissed"];

export default function AdminUserReports() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const isAdmin = useMemo(() => {
    const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || "";
    return ADMIN_EMAILS.length === 0
      ? true
      : ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
  }, [user?.primaryEmailAddress?.emailAddress]);

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState("open");
  const [editingNote, setEditingNote] = useState("");
  const [saving, setSaving] = useState(false);

  const getSupabase = async () => {
    const token = await getTokenRef.current({ template: "supabase" });
    if (!token) throw new Error("Missing Clerk token (template: supabase)");
    return createClerkSupabaseClient(token);
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const supabase = await getSupabase();

      // ✅ Step 1: ดึงรายงาน + pets ก่อน
      const { data: rawReports, error } = await supabase
        .from("user_reports")
        .select(
          `
          id, pet_id,
          reporter_clerk_id, reported_clerk_id,
          reason, details, evidence_urls,
          status, admin_note,
          created_at, updated_at,
          pets (
            id, name, category, breed, image_url, user_id
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("fetchReports error:", error);
        throw error;
      }

      // ✅ Step 2: ดึงชื่อ users แยก (เพราะ FK ไม่มี)
      const clerkIds = new Set();
      (rawReports || []).forEach((r) => {
        if (r.reporter_clerk_id) clerkIds.add(r.reporter_clerk_id);
        if (r.reported_clerk_id) clerkIds.add(r.reported_clerk_id);
      });

      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("clerk_id, full_name, avatar_url")
        .in("clerk_id", Array.from(clerkIds));

      if (usersError) {
        console.error("fetchUsers error:", usersError);
      }

      // ✅ Step 3: แปะชื่อเข้าไปใน reports
      const usersMap = new Map((usersData || []).map((u) => [u.clerk_id, u]));

      const data = (rawReports || []).map((r) => ({
        ...r,
        reporter: usersMap.get(r.reporter_clerk_id) || null,
        reported: usersMap.get(r.reported_clerk_id) || null,
      }));

      console.log("✅ Fetched reports:", data?.length || 0);
      setReports(data || []);
    } catch (e) {
      console.error("fetchReports error:", e);
      Alert.alert(
        "ดึงข้อมูลไม่ได้",
        "ตรวจสอบ RLS policy ของ user_reports (SELECT) และ pets (SELECT)",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) return;
    if (!isAdmin) return;
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, !!user, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;

    return reports.filter((r) => {
      const pet = r.pets;
      const hay = [
        r.reason,
        r.details,
        r.status,
        r.reporter_clerk_id,
        r.reported_clerk_id,
        r.pet_id,
        r.reporter?.full_name,
        r.reported?.full_name,
        pet?.name,
        pet?.category,
        pet?.breed,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [reports, query]);

  const openDetail = (report) => {
    setSelected(report);
    setEditingStatus(report.status || "open");
    setEditingNote(report.admin_note || "");
    setShowModal(true);
  };

  const saveUpdate = async () => {
    if (!selected?.id) return;

    if (!STATUS_OPTIONS.includes(editingStatus)) {
      Alert.alert(
        "สถานะไม่ถูกต้อง",
        "ต้องเป็น open/reviewing/resolved/dismissed",
      );
      return;
    }

    try {
      setSaving(true);
      const supabase = await getSupabase();

      const payload = {
        status: editingStatus,
        admin_note: editingNote?.trim() ? editingNote.trim() : null,
      };

      const { error } = await supabase
        .from("user_reports")
        .update(payload)
        .eq("id", selected.id);

      if (error) throw error;

      setReports((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, ...payload } : r)),
      );

      Alert.alert("บันทึกแล้ว", "อัปเดตสถานะเรียบร้อย ✅");
      setShowModal(false);
      setSelected(null);
    } catch (e) {
      console.error("saveUpdate error:", e);
      Alert.alert("บันทึกไม่ได้", e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  // ✅ ลบโพสต์ (pets) จากรายงานนี้
  const deletePetPost = async () => {
    if (!selected?.pet_id) {
      Alert.alert("ลบไม่ได้", "รายงานนี้ไม่มี pet_id หรือโพสต์ถูกลบไปแล้ว");
      return;
    }

    Alert.alert("ยืนยันลบโพสต์", "ลบแล้วกู้คืนไม่ได้ แน่ใจไหม?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            setSaving(true);
            const supabase = await getSupabase();

            // 1) ลบโพสต์ในตาราง pets
            const { error: delError } = await supabase
              .from("pets")
              .delete()
              .eq("id", selected.pet_id);

            if (delError) throw delError;

            // 2) อัปเดต report ให้ resolved + note
            const note = [
              (editingNote || "").trim(),
              "[Action] deleted pet post",
              `pet_id=${selected.pet_id}`,
            ]
              .filter(Boolean)
              .join("\n");

            const { error: repError } = await supabase
              .from("user_reports")
              .update({
                status: "resolved",
                admin_note: note || null,
              })
              .eq("id", selected.id);

            if (repError) throw repError;

            Alert.alert("สำเร็จ", "ลบโพสต์แล้ว และปิดเคสเรียบร้อย ✅");
            setShowModal(false);
            setSelected(null);
            fetchReports();
          } catch (e) {
            console.error("deletePetPost error:", e);
            Alert.alert("ลบไม่ได้", e?.message || "เกิดข้อผิดพลาด");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const statusBadge = (st) => {
    switch (st) {
      case "open":
        return { bg: "#FEF3C7", fg: "#92400E" };
      case "reviewing":
        return { bg: "#DBEAFE", fg: "#1D4ED8" };
      case "resolved":
        return { bg: "#DCFCE7", fg: "#166534" };
      case "dismissed":
        return { bg: "#F3F4F6", fg: "#374151" };
      default:
        return { bg: "#F3F4F6", fg: "#374151" };
    }
  };

  const renderPetImage = (imageUrl, height = 160) => {
    if (!imageUrl) {
      return (
        <View
          style={[
            styles.petImagePlaceholder,
            { height, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Ionicons name="image-outline" size={30} color="#94A3B8" />
          <Text style={{ marginTop: 6, color: "#64748b", fontWeight: "700" }}>
            ไม่มีรูปโพสต์
          </Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.petImage, { height }]}
        resizeMode="cover"
      />
    );
  };

  // ====== States ======
  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6B7280" }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={{ fontWeight: "900" }}>กรุณาเข้าสู่ระบบ</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={44} color="#9CA3AF" />
          <Text style={{ fontSize: 18, fontWeight: "900", color: "#111827" }}>
            ไม่ใช่แอดมิน
          </Text>
          <Text style={{ color: "#6B7280", fontWeight: "700" }}>
            หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ====== UI ======
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>📌 User Reports</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchReports}>
          <Ionicons name="refresh" size={18} color="#111827" />
          <Text style={styles.refreshText}>รีเฟรช</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#6B7280" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหา reason/ชื่อผู้รายงาน/ชื่อสัตว์/pet_id..."
          style={styles.searchInput}
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6B7280" }}>กำลังโหลด…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          onRefresh={onRefresh}
          refreshing={refreshing}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="document-text-outline"
                size={50}
                color="#D1D5DB"
              />
              <Text
                style={{ marginTop: 10, color: "#6B7280", fontWeight: "800" }}
              >
                ไม่มีรายงาน
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const b = statusBadge(item.status);
            const pet = item.pets;

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openDetail(item)}
                activeOpacity={0.9}
              >
                {renderPetImage(pet?.image_url, 165)}

                <View style={{ marginTop: 12 }}>
                  <View style={styles.cardTop}>
                    <View style={[styles.badge, { backgroundColor: b.bg }]}>
                      <Text style={[styles.badgeText, { color: b.fg }]}>
                        {item.status}
                      </Text>
                    </View>
                    <Text style={styles.dateText}>
                      {new Date(item.created_at).toLocaleString("th-TH")}
                    </Text>
                  </View>

                  <Text style={styles.petTitle} numberOfLines={1}>
                    {pet?.name
                      ? `🐾 ${pet.name} • ${pet?.breed || "ทั่วไป"}`
                      : item.pet_id
                        ? `🐾 Pet ID: ${item.pet_id.slice(0, 8)}...`
                        : "🐾 ไม่มี pet_id"}
                  </Text>

                  <Text style={styles.reasonText} numberOfLines={1}>
                    เหตุผล: {item.reason || "-"}
                  </Text>

                  <Text style={styles.detailText} numberOfLines={2}>
                    {item.details || "-"}
                  </Text>

                  <View style={{ marginTop: 10, gap: 6 }}>
                    <View style={styles.userPreview}>
                      <Text style={styles.userPreviewLabel}>ผู้รายงาน:</Text>
                      <Text style={styles.userPreviewName} numberOfLines={1}>
                        {item?.reporter?.full_name || "ไม่พบชื่อ"}
                      </Text>
                    </View>
                    <View style={styles.userPreview}>
                      <Text style={styles.userPreviewLabel}>ถูกรายงาน:</Text>
                      <Text style={styles.userPreviewName} numberOfLines={1}>
                        {item?.reported?.full_name || "ไม่พบชื่อ"}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ===== Modal Detail ===== */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียดรายงาน</Text>
              <TouchableOpacity
                onPress={() => (!saving ? setShowModal(false) : null)}
                disabled={saving}
              >
                <Ionicons name="close-circle" size={32} color="#D1D5DB" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 10 }}>
              {renderPetImage(selected?.pets?.image_url, 210)}

              <Text style={styles.label}>Report ID</Text>
              <Text style={styles.mono}>{selected?.id}</Text>

              <Text style={styles.label}>Pet</Text>
              <Text style={styles.value}>
                {selected?.pets?.name
                  ? `${selected.pets.name} • ${selected?.pets?.breed || "ทั่วไป"}`
                  : selected?.pet_id
                    ? `ไม่พบข้อมูลโพสต์ (pet_id: ${selected.pet_id})`
                    : "ไม่มี pet_id"}
              </Text>

              <Text style={styles.label}>ผู้รายงาน</Text>
              <View style={styles.userBox}>
                <Text style={styles.userName}>
                  {selected?.reporter?.full_name || "ไม่พบชื่อ"}
                </Text>
                <Text style={styles.mono} numberOfLines={1}>
                  {selected?.reporter_clerk_id || "-"}
                </Text>
              </View>

              <Text style={styles.label}>ถูกรายงาน</Text>
              <View style={styles.userBox}>
                <Text style={styles.userName}>
                  {selected?.reported?.full_name || "ไม่พบชื่อ"}
                </Text>
                <Text style={styles.mono} numberOfLines={1}>
                  {selected?.reported_clerk_id || "-"}
                </Text>
              </View>

              <Text style={styles.label}>Reason</Text>
              <Text style={styles.value}>{selected?.reason || "-"}</Text>

              <Text style={styles.label}>Details</Text>
              <Text style={styles.value}>{selected?.details || "-"}</Text>

              <Text style={styles.label}>Status</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((st) => {
                  const active = editingStatus === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.statusBtn,
                        active && styles.statusBtnActive,
                      ]}
                      onPress={() => setEditingStatus(st)}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          active && styles.statusTextActive,
                        ]}
                      >
                        {st}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Admin note</Text>
              <TextInput
                value={editingNote}
                onChangeText={setEditingNote}
                placeholder="บันทึกของแอดมิน..."
                multiline
                editable={!saving}
                style={styles.noteInput}
              />

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowModal(false)}
                  disabled={saving}
                >
                  <Text style={styles.cancelText}>ปิด</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.cancelBtn,
                    { backgroundColor: "#FEE2E2" },
                    saving && { opacity: 0.6 },
                  ]}
                  onPress={deletePetPost}
                  disabled={saving}
                >
                  <Text style={[styles.cancelText, { color: "#991B1B" }]}>
                    ลบโพสต์
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={saveUpdate}
                  disabled={saving}
                >
                  <Text style={styles.saveText}>
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 12 }} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "900", color: "#111827" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  refreshText: { fontWeight: "800", color: "#111827" },

  searchBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontWeight: "600", color: "#111827" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },

  petImage: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  petImagePlaceholder: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontWeight: "900", fontSize: 12 },
  dateText: { color: "#6B7280", fontWeight: "700", fontSize: 11 },

  petTitle: {
    marginTop: 10,
    fontWeight: "900",
    fontSize: 15,
    color: "#0F172A",
  },

  reasonText: {
    marginTop: 8,
    fontWeight: "900",
    fontSize: 14,
    color: "#111827",
  },
  detailText: {
    marginTop: 6,
    color: "#374151",
    fontWeight: "600",
    lineHeight: 18,
  },

  userPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  userPreviewLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#6B7280",
  },
  userPreviewName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "92%",
  },
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },

  label: { marginTop: 6, color: "#6B7280", fontWeight: "800" },
  mono: {
    fontFamily: "Courier",
    color: "#111827",
    fontWeight: "700",
    fontSize: 12,
  },
  value: { color: "#111827", fontWeight: "700" },

  userBox: {
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  userName: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
  },

  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  statusBtnActive: { backgroundColor: "#111827" },
  statusText: { fontWeight: "900", color: "#374151" },
  statusTextActive: { color: "#FFFFFF" },

  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 12,
    fontWeight: "700",
    color: "#111827",
    textAlignVertical: "top",
  },

  modalFooter: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  cancelText: { fontWeight: "900", color: "#374151" },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  saveText: { fontWeight: "900", color: "#FFFFFF" },
});
