import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

// ✅ ใส่อีเมลแอดมินของคุณ (ถ้าไม่ใส่ = ทุกคนเข้าได้)
const ADMIN_EMAILS = [
  // "your_email@gmail.com",
];

const STATUS_OPTIONS = ["open", "reviewing", "resolved", "dismissed"];

const POST_STATUS_ACTIVE = "active";
const POST_STATUS_HIDDEN = "hidden";

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

// ✅ UI Components
const GlassCard = ({ children, style }) => (
  <View style={[styles.glassCard, style]}>{children}</View>
);

const InfoRow = ({
  icon,
  label,
  value,
  iconColor = "#8b5cf6",
  mono = false,
}) => (
  <View style={styles.infoRow}>
    <View style={[styles.infoIcon, { backgroundColor: `${iconColor}15` }]}>
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, mono && styles.monoText]}
        numberOfLines={3}
      >
        {value || "-"}
      </Text>
    </View>
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
        "ตรวจสอบ RLS policy ของ user_reports และ pets",
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

  const updateStatus = async (newStatus) => {
    if (!selected?.id) return;

    try {
      setSaving(true);
      const supabase = await getSupabase();

      const payload = {
        status: newStatus,
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

      Alert.alert("สำเร็จ", "อัปเดตสถานะเรียบร้อย ✅");
      setEditingStatus(newStatus);
    } catch (e) {
      console.error("updateStatus error:", e);
      Alert.alert("ทำไม่สำเร็จ", e?.message || "เกิดข้อผิดพลาด");
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

            if (hideError) {
              Alert.alert(
                "ซ่อนไม่ได้",
                hideError.message || "RLS policy บล็อคอยู่",
              );
              return;
            }

            const note = [
              (editingNote || "").trim(),
              "[Action] hidden pet post",
              `pet_id=${selected.pet_id}`,
              `timestamp: ${new Date().toISOString()}`,
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

            if (error) {
              Alert.alert("คืนไม่ได้", error.message || "RLS policy บล็อคอยู่");
              return;
            }

            const note = [
              (editingNote || "").trim(),
              "[Action] restored pet post",
              `pet_id=${selected.pet_id}`,
              `timestamp: ${new Date().toISOString()}`,
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const getStatusConfig = (st) => {
    switch (st) {
      case "open":
        return {
          gradient: ["#fef3c7", "#fde68a"],
          color: "#d97706",
          icon: "alert-circle",
          label: "เปิดอยู่",
        };
      case "reviewing":
        return {
          gradient: ["#dbeafe", "#bfdbfe"],
          color: "#2563eb",
          icon: "eye",
          label: "กำลังตรวจสอบ",
        };
      case "resolved":
        return {
          gradient: ["#dcfce7", "#bbf7d0"],
          color: "#16a34a",
          icon: "checkmark-circle",
          label: "แก้ไขแล้ว",
        };
      case "dismissed":
        return {
          gradient: ["#f3f4f6", "#e5e7eb"],
          color: "#6b7280",
          icon: "close-circle",
          label: "ยกเลิก",
        };
      default:
        return {
          gradient: ["#f3f4f6", "#e5e7eb"],
          color: "#6b7280",
          icon: "help-circle",
          label: "ไม่ทราบ",
        };
    }
  };

  const getPostStatusConfig = (st) => {
    const s = (st || "").toLowerCase();
    if (s === POST_STATUS_HIDDEN)
      return {
        gradient: ["#fee2e2", "#fecaca"],
        color: "#dc2626",
        label: "ซ่อนแล้ว",
      };
    if (s === POST_STATUS_ACTIVE)
      return {
        gradient: ["#dcfce7", "#bbf7d0"],
        color: "#16a34a",
        label: "แสดงอยู่",
      };
    return {
      gradient: ["#e5e7eb", "#d1d5db"],
      color: "#6b7280",
      label: "ไม่ทราบ",
    };
  };

  // ====== States ======
  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.screen}>
        <LinearGradient
          colors={["#8b5cf6", "#6366f1"]}
          style={styles.loadingContainer}
        >
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>กำลังโหลด...</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Ionicons name="log-in-outline" size={64} color="#8b5cf6" />
          <Text style={styles.centerTitle}>กรุณาเข้าสู่ระบบ</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.screen}>
        <LinearGradient
          colors={["#ef4444", "#dc2626"]}
          style={styles.errorContainer}
        >
          <View style={styles.errorCard}>
            <View style={styles.errorIconContainer}>
              <Ionicons name="lock-closed" size={48} color="#ef4444" />
            </View>
            <Text style={styles.errorTitle}>ไม่ใช่แอดมิน</Text>
            <Text style={styles.errorText}>
              หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
            </Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ====== Main UI ======
  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <LinearGradient
        colors={["#8b5cf6", "#7c3aed"]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View>
          <Text style={styles.headerTitle}>🚨 User Reports</Text>
          <Text style={styles.headerSubtitle}>
            จัดการรายงานจากผู้ใช้ • ทั้งหมด {reports.length} รายการ
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={fetchReports}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={20} color="#8b5cf6" />
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>กำลังโหลดรายงาน...</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          onRefresh={onRefresh}
          refreshing={refreshing}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={64}
                  color="#cbd5e1"
                />
              </View>
              <Text style={styles.emptyTitle}>ไม่มีรายงาน</Text>
              <Text style={styles.emptyText}>ยังไม่มีรายงานจากผู้ใช้</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusConfig = getStatusConfig(item.status);
            const postConfig = getPostStatusConfig(item.pets?.post_status);
            const pet = item.pets;

            return (
              <TouchableOpacity
                style={styles.reportCard}
                onPress={() => openDetail(item)}
                activeOpacity={0.95}
              >
                {/* Pet Image */}
                {pet?.image_url ? (
                  <View style={styles.imageContainer}>
                    <Image
                      source={{ uri: pet.image_url }}
                      style={styles.petImage}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.6)"]}
                      style={styles.imageGradient}
                    />
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={40} color="#cbd5e1" />
                  </View>
                )}

                {/* Card Content */}
                <View style={styles.cardContent}>
                  {/* Status Badges */}
                  <View style={styles.badgeRow}>
                    <LinearGradient
                      colors={statusConfig.gradient}
                      style={styles.statusBadge}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Ionicons
                        name={statusConfig.icon}
                        size={14}
                        color={statusConfig.color}
                      />
                      <Text
                        style={[
                          styles.badgeText,
                          { color: statusConfig.color },
                        ]}
                      >
                        {statusConfig.label}
                      </Text>
                    </LinearGradient>

                    <LinearGradient
                      colors={postConfig.gradient}
                      style={styles.statusBadge}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text
                        style={[styles.badgeText, { color: postConfig.color }]}
                      >
                        {postConfig.label}
                      </Text>
                    </LinearGradient>
                  </View>

                  {/* Pet Info */}
                  <Text style={styles.petName} numberOfLines={1}>
                    🐾 {pet?.name || "ไม่มีข้อมูลโพสต์"}
                    {pet?.breed && ` • ${pet.breed}`}
                  </Text>

                  {/* Reason */}
                  {item.reason && (
                    <View style={styles.reasonTag}>
                      <Ionicons name="flag" size={14} color="#ef4444" />
                      <Text style={styles.reasonText}>{item.reason}</Text>
                    </View>
                  )}

                  {/* Details */}
                  <Text style={styles.detailsText} numberOfLines={2}>
                    {item.details || "ไม่มีรายละเอียด"}
                  </Text>

                  {/* Users Info */}
                  <View style={styles.usersRow}>
                    <View style={styles.userTag}>
                      <Text style={styles.userLabel}>ผู้รายงาน:</Text>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.reporter?.full_name || "ไม่พบชื่อ"}
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color="#94a3b8" />
                    <View style={styles.userTag}>
                      <Text style={styles.userLabel}>ถูกรายงาน:</Text>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.reported?.full_name || "ไม่พบชื่อ"}
                      </Text>
                    </View>
                  </View>

                  {/* Date */}
                  <View style={styles.dateRow}>
                    <Ionicons name="time-outline" size={14} color="#94a3b8" />
                    <Text style={styles.dateText}>
                      {formatThaiDateTime(item.created_at)}
                    </Text>
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
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <LinearGradient
              colors={["#8b5cf6", "#7c3aed"]}
              style={styles.modalHeader}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>รายละเอียดรายงาน</Text>
                <Text style={styles.modalSubtitle}>
                  {formatThaiDateTime(selected?.created_at)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => (!saving ? setShowModal(false) : null)}
                disabled={saving}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Pet Section */}
              <GlassCard>
                <View style={styles.sectionHeader}>
                  <Ionicons name="paw" size={22} color="#8b5cf6" />
                  <Text style={styles.sectionTitle}>ข้อมูลโพสต์</Text>
                </View>

                {selected?.pets?.image_url ? (
                  <View style={styles.modalImageContainer}>
                    <Image
                      source={{ uri: selected.pets.image_url }}
                      style={styles.modalPetImage}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={styles.modalImagePlaceholder}>
                    <Ionicons name="image-outline" size={48} color="#cbd5e1" />
                    <Text style={styles.placeholderText}>ไม่มีรูปภาพ</Text>
                  </View>
                )}

                <InfoRow
                  icon="information-circle"
                  label="ชื่อสัตว์เลี้ยง"
                  value={
                    selected?.pets?.name
                      ? `${selected.pets.name} • ${selected.pets.breed || "ทั่วไป"}`
                      : "ไม่พบข้อมูล"
                  }
                  iconColor="#8b5cf6"
                />

                <InfoRow
                  icon="code-slash"
                  label="Pet ID"
                  value={selected?.pet_id || "-"}
                  iconColor="#8b5cf6"
                  mono
                />

                <View style={styles.divider} />

                <View style={styles.postStatusRow}>
                  <Text style={styles.postStatusLabel}>สถานะโพสต์:</Text>
                  <LinearGradient
                    colors={
                      getPostStatusConfig(selected?.pets?.post_status).gradient
                    }
                    style={styles.postStatusBadge}
                  >
                    <Text
                      style={[
                        styles.postStatusText,
                        {
                          color: getPostStatusConfig(
                            selected?.pets?.post_status,
                          ).color,
                        },
                      ]}
                    >
                      {getPostStatusConfig(selected?.pets?.post_status).label}
                    </Text>
                  </LinearGradient>
                </View>
              </GlassCard>

              {/* Users Section */}
              <GlassCard>
                <View style={styles.sectionHeader}>
                  <Ionicons name="people" size={22} color="#3b82f6" />
                  <Text style={styles.sectionTitle}>ผู้เกี่ยวข้อง</Text>
                </View>

                <InfoRow
                  icon="person"
                  label="ผู้รายงาน"
                  value={selected?.reporter?.full_name || "ไม่พบชื่อ"}
                  iconColor="#3b82f6"
                />

                <InfoRow
                  icon="code-slash"
                  label="Reporter Clerk ID"
                  value={selected?.reporter_clerk_id || "-"}
                  iconColor="#3b82f6"
                  mono
                />

                <View style={styles.divider} />

                <InfoRow
                  icon="alert-circle"
                  label="ถูกรายงาน"
                  value={selected?.reported?.full_name || "ไม่พบชื่อ"}
                  iconColor="#ef4444"
                />

                <InfoRow
                  icon="code-slash"
                  label="Reported Clerk ID"
                  value={selected?.reported_clerk_id || "-"}
                  iconColor="#ef4444"
                  mono
                />
              </GlassCard>

              {/* Report Details Section */}
              <GlassCard>
                <View style={styles.sectionHeader}>
                  <Ionicons name="document-text" size={22} color="#f59e0b" />
                  <Text style={styles.sectionTitle}>รายละเอียดรายงาน</Text>
                </View>

                <InfoRow
                  icon="code-slash"
                  label="Report ID"
                  value={selected?.id || "-"}
                  iconColor="#f59e0b"
                  mono
                />

                <InfoRow
                  icon="flag"
                  label="เหตุผลการรายงาน"
                  value={selected?.reason || "-"}
                  iconColor="#f59e0b"
                />

                <View style={styles.divider} />

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsLabel}>รายละเอียดเพิ่มเติม</Text>
                  <View style={styles.detailsBox}>
                    <Text style={styles.detailsValue}>
                      {selected?.details || "ไม่มีรายละเอียด"}
                    </Text>
                  </View>
                </View>

                {selected?.admin_note && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.detailsSection}>
                      <Text style={styles.detailsLabel}>บันทึกของแอดมิน</Text>
                      <View
                        style={[
                          styles.detailsBox,
                          { backgroundColor: "#fef3c7" },
                        ]}
                      >
                        <Text style={styles.detailsValue}>
                          {selected.admin_note}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </GlassCard>

              {/* Status & Admin Section */}
              <GlassCard>
                <View style={styles.sectionHeader}>
                  <Ionicons name="settings" size={22} color="#6366f1" />
                  <Text style={styles.sectionTitle}>การจัดการ</Text>
                </View>

                <Text style={styles.inputLabel}>สถานะการตรวจสอบ</Text>
                <View style={styles.statusChipsContainer}>
                  {STATUS_OPTIONS.map((st) => {
                    const active = editingStatus === st;
                    const config = getStatusConfig(st);

                    return (
                      <TouchableOpacity
                        key={st}
                        onPress={() => {
                          setEditingStatus(st);
                          updateStatus(st);
                        }}
                        disabled={saving}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={
                            active ? config.gradient : ["#f3f4f6", "#f3f4f6"]
                          }
                          style={styles.statusChip}
                        >
                          <Ionicons
                            name={config.icon}
                            size={16}
                            color={active ? config.color : "#9ca3af"}
                          />
                          <Text
                            style={[
                              styles.statusChipText,
                              { color: active ? config.color : "#9ca3af" },
                            ]}
                          >
                            {config.label}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {editingStatus === "dismissed" && (
                  <>
                    <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                      เหตุผลที่ dismiss
                    </Text>
                    <TextInput
                      value={dismissReason}
                      onChangeText={setDismissReason}
                      placeholder="ระบุเหตุผล เช่น ตรวจสอบแล้วไม่พบความผิด"
                      multiline
                      editable={!saving}
                      style={styles.textInput}
                    />

                    <TouchableOpacity
                      style={[styles.dismissButton, saving && { opacity: 0.6 }]}
                      onPress={dismissAsFalseReport}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={["#ef4444", "#dc2626"]}
                        style={styles.buttonGradient}
                      >
                        <Ionicons name="close-circle" size={18} color="#fff" />
                        <Text style={styles.buttonText}>ยืนยัน Dismiss</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}

                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  บันทึกของแอดมิน (ไม่บังคับ)
                </Text>
                <TextInput
                  value={editingNote}
                  onChangeText={setEditingNote}
                  placeholder="บันทึกเพิ่มเติม..."
                  multiline
                  editable={!saving}
                  style={styles.textInput}
                />
              </GlassCard>

              <View style={{ height: 120 }} />
            </ScrollView>

            {/* Action Bar - เหลือแค่ 2 ปุ่ม */}
            <View style={styles.actionBar}>
              <TouchableOpacity
                style={[styles.actionButtonFull, saving && { opacity: 0.6 }]}
                onPress={hidePetPost}
                disabled={saving}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#ef4444", "#dc2626"]}
                  style={styles.actionButtonGradient}
                >
                  <Ionicons name="eye-off" size={20} color="#fff" />
                  <Text style={styles.actionButtonTextFull}>ซ่อนโพสต์</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButtonFull, saving && { opacity: 0.6 }]}
                onPress={restorePetPost}
                disabled={saving}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#22c55e", "#16a34a"]}
                  style={styles.actionButtonGradient}
                >
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <Text style={styles.actionButtonTextFull}>คืนโพสต์</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },

  /* Loading & Error States */
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },

  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorCard: {
    backgroundColor: "#fff",
    padding: 32,
    borderRadius: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  errorIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },

  /* Header */
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 50,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
  },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  /* List */
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
  },

  /* Report Card */
  reportCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  imageContainer: {
    height: 200,
    position: "relative",
  },
  petImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#e5e7eb",
  },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },

  imagePlaceholder: {
    height: 200,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  cardContent: {
    padding: 16,
    gap: 12,
  },

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },

  petName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1e293b",
  },

  reasonTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    gap: 6,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#dc2626",
  },

  detailsText: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
  },

  usersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  userTag: {
    flex: 1,
  },
  userLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 2,
  },
  userName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "95%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    gap: 16,
  },

  /* Glass Card */
  glassCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e293b",
  },

  /* Modal Pet Image */
  modalImageContainer: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  modalPetImage: {
    width: "100%",
    height: 240,
    backgroundColor: "#e5e7eb",
  },
  modalImagePlaceholder: {
    width: "100%",
    height: 240,
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  placeholderText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
  },

  /* Info Row */
  infoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    lineHeight: 20,
  },
  monoText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    color: "#475569",
  },

  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },

  postStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  postStatusLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  postStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  postStatusText: {
    fontSize: 13,
    fontWeight: "700",
  },

  /* Details Section */
  detailsSection: {
    gap: 8,
  },
  detailsLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  detailsBox: {
    padding: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailsValue: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },

  /* Status Chips */
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 10,
  },
  statusChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: "700",
  },

  /* Text Input */
  textInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    textAlignVertical: "top",
  },

  /* Buttons */
  dismissButton: {
    marginTop: 12,
    borderRadius: 14,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

  /* Action Bar - ปรับให้มี 2 ปุ่มเต็มพื้นที่ */
  actionBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    gap: 12,
  },
  actionButtonFull: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  actionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  actionButtonTextFull: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
