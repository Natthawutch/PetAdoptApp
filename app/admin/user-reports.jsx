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
  ScrollView,
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

// ✅ แก้ไข: ใช้ค่าที่ตรงกับฐานข้อมูล
const POST_STATUS_ACTIVE = "active"; // โพสต์ปกติ
const POST_STATUS_HIDDEN = "hidden"; // โพสต์ที่ซ่อน

const formatThaiDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
};

// ✅ UI helper components
const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={{ gap: 8 }}>{children}</View>
  </View>
);

const Row = ({ label, value, mono }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={2}>
      {value || "-"}
    </Text>
  </View>
);

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

  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState("open");
  const [editingNote, setEditingNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ เพิ่มเหตุผลสำหรับ dismiss (รายงานไม่จริง)
  const [dismissReason, setDismissReason] = useState("");

  const getSupabase = async () => {
    const token = await getTokenRef.current({ template: "supabase" });
    if (!token) throw new Error("Missing Clerk token (template: supabase)");
    return createClerkSupabaseClient(token);
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const supabase = await getSupabase();

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
            id, name, category, breed, image_url, user_id, post_status
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("fetchReports error:", error);
        throw error;
      }

      // ✅ ดึงชื่อ users แยก (เพราะบางที FK users ไม่ตรงกับ clerk_id)
      const clerkIds = new Set();
      (rawReports || []).forEach((r) => {
        if (r.reporter_clerk_id) clerkIds.add(r.reporter_clerk_id);
        if (r.reported_clerk_id) clerkIds.add(r.reported_clerk_id);
      });

      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("clerk_id, full_name, avatar_url")
        .in("clerk_id", Array.from(clerkIds));

      if (usersError) console.error("fetchUsers error:", usersError);

      const usersMap = new Map((usersData || []).map((u) => [u.clerk_id, u]));

      const data = (rawReports || []).map((r) => ({
        ...r,
        reporter: usersMap.get(r.reporter_clerk_id) || null,
        reported: usersMap.get(r.reported_clerk_id) || null,
      }));

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

  const openDetail = (report) => {
    setSelected(report);
    setEditingStatus(report.status || "open");
    setEditingNote(report.admin_note || "");
    setDismissReason("");
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

  const dismissAsFalseReport = async () => {
    if (!selected?.id) return;

    const reason = dismissReason.trim();
    if (!reason) {
      Alert.alert("กรุณากรอกเหตุผล", "ต้องระบุเหตุผลที่ dismiss รายงาน");
      return;
    }

    Alert.alert("ยืนยัน dismiss", "ยืนยันว่ารายงานนี้ไม่จริง/ไม่เข้าข่าย?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ยืนยัน",
        style: "destructive",
        onPress: async () => {
          try {
            setSaving(true);
            const supabase = await getSupabase();

            const noteParts = [
              (editingNote || "").trim(),
              `[Dismiss] ${reason}`,
            ].filter(Boolean);

            const payload = {
              status: "dismissed",
              admin_note: noteParts.join("\n") || null,
            };

            const { error } = await supabase
              .from("user_reports")
              .update(payload)
              .eq("id", selected.id);

            if (error) throw error;

            setReports((prev) =>
              prev.map((r) =>
                r.id === selected.id ? { ...r, ...payload } : r,
              ),
            );

            Alert.alert("สำเร็จ", "Dismiss เคสเรียบร้อย ✅");
            setShowModal(false);
            setSelected(null);
          } catch (e) {
            console.error("dismissAsFalseReport error:", e);
            Alert.alert("ทำรายการไม่ได้", e?.message || "เกิดข้อผิดพลาด");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const hidePetPost = async () => {
    if (!selected?.pet_id) {
      Alert.alert("ทำไม่ได้", "รายงานนี้ไม่มี pet_id หรือโพสต์ถูกลบไปแล้ว");
      return;
    }

    Alert.alert("ยืนยันซ่อนโพสต์", "ซ่อนโพสต์นี้จากหน้า feed?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ซ่อน",
        style: "destructive",
        onPress: async () => {
          try {
            setSaving(true);
            const supabase = await getSupabase();

            const { data: updatedPet, error: hideError } = await supabase
              .from("pets")
              .update({ post_status: POST_STATUS_HIDDEN })
              .eq("id", selected.pet_id)
              .select("id, post_status")
              .single();

            console.log("HIDE result:", updatedPet, hideError);

            if (hideError) {
              Alert.alert(
                "ซ่อนไม่ได้",
                hideError.message ||
                  "RLS policy บล็อคอยู่ (เช็ค is_admin() / clerk_user_id())",
              );
              return;
            }

            const note = [
              (editingNote || "").trim(),
              "[Action] hidden pet post",
              `pet_id=${selected.pet_id}`,
            ]
              .filter(Boolean)
              .join("\n");

            const { error: repError } = await supabase
              .from("user_reports")
              .update({ status: "resolved", admin_note: note || null })
              .eq("id", selected.id);

            if (repError) throw repError;

            Alert.alert("สำเร็จ", "ซ่อนโพสต์แล้ว ✅");
            setShowModal(false);
            setSelected(null);
            fetchReports();
          } catch (e) {
            console.error("hidePetPost error:", e);
            Alert.alert("ทำไม่ได้", e?.message || "เกิดข้อผิดพลาด");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const restorePetPost = async () => {
    if (!selected?.pet_id) {
      Alert.alert("ทำไม่ได้", "รายงานนี้ไม่มี pet_id หรือโพสต์ถูกลบไปแล้ว");
      return;
    }

    Alert.alert("ยืนยันคืนโพสต์", "คืนโพสต์นี้ให้กลับมาแสดงใน feed?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "คืนโพสต์",
        onPress: async () => {
          try {
            setSaving(true);
            const supabase = await getSupabase();

            const { data: updatedPet, error } = await supabase
              .from("pets")
              .update({ post_status: POST_STATUS_ACTIVE })
              .eq("id", selected.pet_id)
              .select("id, post_status")
              .single();

            console.log("RESTORE result:", updatedPet, error);

            if (error) {
              Alert.alert("คืนไม่ได้", error.message || "RLS policy บล็อคอยู่");
              return;
            }

            const note = [
              (editingNote || "").trim(),
              "[Action] restored pet post",
              `pet_id=${selected.pet_id}`,
            ]
              .filter(Boolean)
              .join("\n");

            await supabase
              .from("user_reports")
              .update({ admin_note: note || null })
              .eq("id", selected.id);

            Alert.alert("สำเร็จ", "คืนโพสต์แล้ว ✅");
            setShowModal(false);
            setSelected(null);
            fetchReports();
          } catch (e) {
            console.error("restorePetPost error:", e);
            Alert.alert("ทำไม่ได้", e?.message || "เกิดข้อผิดพลาด");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  /**
   * ✅ สำคัญ: ตอนนี้ "ลบจริง" จะพัง เพราะ FK user_reports_pet_id_fkey + pet_id NOT NULL
   * ดังนั้น เพื่อส่งงานทัน -> ปุ่มลบให้ทำงานเป็น "ซ่อนโพสต์" แทนก่อน
   */
  const deletePetPost = async () => {
    await hidePetPost();
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

  const postStatusBadge = (st) => {
    const s = (st || "").toLowerCase();
    if (s === POST_STATUS_HIDDEN) return { bg: "#FEE2E2", fg: "#991B1B" };
    if (s === POST_STATUS_ACTIVE) return { bg: "#DCFCE7", fg: "#166534" };
    return { bg: "#E5E7EB", fg: "#374151" };
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
        <View>
          <Text style={styles.title}>🚨 User Reports</Text>
          <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "800" }}>
            จัดการรายงานจากผู้ใช้
          </Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={fetchReports}>
          <Ionicons name="refresh" size={18} color="#111827" />
          <Text style={styles.refreshText}>รีเฟรช</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6B7280" }}>กำลังโหลด…</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
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
            const pb = postStatusBadge(pet?.post_status);

            const petTitle = pet?.name
              ? `🐾 ${pet.name} • ${pet?.breed || "ทั่วไป"}`
              : item.pet_id
                ? `🐾 Pet ID: ${item.pet_id.slice(0, 8)}...`
                : "🐾 ไม่มี pet_id";

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openDetail(item)}
                activeOpacity={0.92}
              >
                {renderPetImage(pet?.image_url, 155)}

                <View style={{ marginTop: 12, gap: 10 }}>
                  <View style={styles.cardTop}>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <View style={[styles.badge, { backgroundColor: b.bg }]}>
                        <Text style={[styles.badgeText, { color: b.fg }]}>
                          {item.status}
                        </Text>
                      </View>

                      <View style={[styles.badge, { backgroundColor: pb.bg }]}>
                        <Text style={[styles.badgeText, { color: pb.fg }]}>
                          post: {pet?.post_status || "-"}
                        </Text>
                      </View>

                      {!!item.reason && (
                        <View
                          style={[styles.badge, { backgroundColor: "#F1F5F9" }]}
                        >
                          <Text
                            style={[styles.badgeText, { color: "#0F172A" }]}
                          >
                            {item.reason}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.dateText}>
                      {formatThaiDateTime(item.created_at)}
                    </Text>
                  </View>

                  <Text style={styles.petTitle} numberOfLines={1}>
                    {petTitle}
                  </Text>

                  <Text style={styles.detailText} numberOfLines={2}>
                    {item.details || "-"}
                  </Text>

                  <View style={styles.userInline}>
                    <Text style={styles.userInlineLabel}>ผู้รายงาน</Text>
                    <Text style={styles.userInlineValue} numberOfLines={1}>
                      {item?.reporter?.full_name || "ไม่พบชื่อ"}
                    </Text>
                    <Text style={styles.userInlineArrow}>→</Text>
                    <Text style={styles.userInlineLabel}>ถูกรายงาน</Text>
                    <Text style={styles.userInlineValue} numberOfLines={1}>
                      {item?.reported?.full_name || "ไม่พบชื่อ"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ===== Modal Detail (Improved UX) ===== */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ gap: 2 }}>
                <Text style={styles.modalTitle}>รายละเอียดรายงาน</Text>
                <Text style={styles.modalSub}>
                  {selected?.created_at
                    ? formatThaiDateTime(selected.created_at)
                    : ""}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => (!saving ? setShowModal(false) : null)}
                disabled={saving}
              >
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ padding: 16 }}
              contentContainerStyle={{ gap: 14, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
            >
              <Section title="โพสต์">
                {renderPetImage(selected?.pets?.image_url, 220)}

                <Row
                  label="Pet"
                  value={
                    selected?.pets?.name
                      ? `${selected.pets.name} • ${
                          selected?.pets?.breed || "ทั่วไป"
                        }`
                      : selected?.pet_id
                        ? `ไม่พบข้อมูลโพสต์ (pet_id: ${selected.pet_id})`
                        : "ไม่มี pet_id"
                  }
                />

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text style={styles.rowLabel}>Post status</Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: postStatusBadge(
                          selected?.pets?.post_status,
                        ).bg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: postStatusBadge(selected?.pets?.post_status)
                            .fg,
                        },
                      ]}
                    >
                      {selected?.pets?.post_status || "-"}
                    </Text>
                  </View>
                </View>
              </Section>

              <Section title="ผู้เกี่ยวข้อง">
                <Row
                  label="ผู้รายงาน"
                  value={selected?.reporter?.full_name || "ไม่พบชื่อ"}
                />
                <Row
                  label="reporter_clerk_id"
                  value={selected?.reporter_clerk_id}
                  mono
                />
                <View style={styles.divider} />
                <Row
                  label="ถูกรายงาน"
                  value={selected?.reported?.full_name || "ไม่พบชื่อ"}
                />
                <Row
                  label="reported_clerk_id"
                  value={selected?.reported_clerk_id}
                  mono
                />
              </Section>

              <Section title="รายละเอียดรายงาน">
                <Row label="Report ID" value={selected?.id} mono />
                <Row label="Reason" value={selected?.reason} />

                <Text style={styles.rowLabel}>Details</Text>
                <Text style={styles.longValue}>{selected?.details || "-"}</Text>

                <Text style={styles.rowLabel}>Status</Text>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((st) => {
                    const active = editingStatus === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusChip,
                          active && styles.statusChipActive,
                          saving && { opacity: 0.7 },
                        ]}
                        onPress={() => setEditingStatus(st)}
                        disabled={saving}
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            active && styles.statusChipTextActive,
                          ]}
                        >
                          {st}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {editingStatus === "dismissed" && (
                  <>
                    <Text style={styles.rowLabel}>เหตุผลที่ dismiss</Text>
                    <TextInput
                      value={dismissReason}
                      onChangeText={setDismissReason}
                      placeholder="เช่น ตรวจสอบแล้วไม่พบความผิด / หลักฐานไม่พอ / สแปมรายงาน"
                      multiline
                      editable={!saving}
                      style={styles.noteInput}
                    />

                    <TouchableOpacity
                      style={[styles.dangerBtn, saving && { opacity: 0.6 }]}
                      onPress={dismissAsFalseReport}
                      disabled={saving}
                    >
                      <Ionicons name="close-circle" size={16} color="#fff" />
                      <Text style={styles.dangerBtnText}>ยืนยัน Dismiss</Text>
                    </TouchableOpacity>
                  </>
                )}

                <Text style={styles.rowLabel}>Admin note</Text>
                <TextInput
                  value={editingNote}
                  onChangeText={setEditingNote}
                  placeholder="บันทึกของแอดมิน..."
                  multiline
                  editable={!saving}
                  style={styles.noteInput}
                />
              </Section>

              <View style={{ height: 12 }} />
            </ScrollView>

            {/* ✅ Sticky Action Bar */}
            <View style={styles.actionBar}>
              <TouchableOpacity
                style={[
                  styles.actionBarBtn,
                  { backgroundColor: "#111827" },
                  saving && { opacity: 0.6 },
                ]}
                onPress={hidePetPost}
                disabled={saving}
              >
                <Ionicons name="eye-off" size={16} color="#fff" />
                <Text style={styles.actionBarText}>ซ่อนโพสต์</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBarBtn,
                  { backgroundColor: "#16A34A" },
                  saving && { opacity: 0.6 },
                ]}
                onPress={restorePetPost}
                disabled={saving}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.actionBarText}>คืนโพสต์</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBarBtn,
                  { backgroundColor: "#DC2626" },
                  saving && { opacity: 0.6 },
                ]}
                onPress={deletePetPost}
                disabled={saving}
              >
                <Ionicons name="trash" size={16} color="#fff" />
                <Text style={styles.actionBarText}>ซ่อนแทนลบ</Text>
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
    alignItems: "flex-start",
  },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontWeight: "900", fontSize: 12 },
  dateText: { color: "#6B7280", fontWeight: "700", fontSize: 11 },

  petTitle: {
    marginTop: 2,
    fontWeight: "900",
    fontSize: 15,
    color: "#0F172A",
  },

  detailText: {
    color: "#374151",
    fontWeight: "600",
    lineHeight: 18,
  },

  userInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexWrap: "wrap",
  },
  userInlineLabel: { fontSize: 12, fontWeight: "900", color: "#6B7280" },
  userInlineValue: {
    maxWidth: 140,
    fontSize: 12,
    fontWeight: "900",
    color: "#111827",
  },
  userInlineArrow: { fontSize: 12, fontWeight: "900", color: "#94A3B8" },

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
    overflow: "hidden",
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
  modalSub: { fontSize: 12, fontWeight: "800", color: "#6B7280" },

  section: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },

  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 6 },

  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  rowLabel: { width: 120, color: "#6B7280", fontWeight: "900", fontSize: 12 },
  rowValue: { flex: 1, color: "#111827", fontWeight: "800", fontSize: 13 },

  mono: {
    fontFamily: "Courier",
    color: "#111827",
    fontWeight: "700",
    fontSize: 12,
  },

  longValue: { color: "#111827", fontWeight: "700", lineHeight: 19 },

  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statusChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  statusChipText: { fontWeight: "900", color: "#374151" },
  statusChipTextActive: { color: "#FFFFFF" },

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

  dangerBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dangerBtnText: { fontWeight: "900", color: "#fff" },

  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 10,
  },
  actionBarBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  actionBarText: { fontWeight: "900", color: "#fff" },

  saveBtn: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  saveText: { fontWeight: "900", color: "#FFFFFF" },
});
