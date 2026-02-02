import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
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
import Header from "../../components/Home/header";
import {
  createClerkSupabaseClient,
  supabase,
} from "../../config/supabaseClient";

export default function Home() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [pets, setPets] = useState([]);
  const [filteredPets, setFilteredPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const VISIBLE_ADOPTION_STATUS = "available";

  const [filters, setFilters] = useState({
    category: "ทั้งหมด",
    sex: "ทั้งหมด",
    breed: "ทั้งหมด",
  });

  const [availableCategories, setAvailableCategories] = useState([]);

  // =========================
  // ✅ REPORT (user_reports)
  // =========================
  const [showReportModal, setShowReportModal] = useState(false);

  // shape:
  // {
  //   pet_id,
  //   reported_clerk_id,
  //   preview: { name, breed, category, image_url, owner_full_name, owner_avatar_url }
  // }
  const [reportTarget, setReportTarget] = useState(null);

  const [reportReason, setReportReason] = useState("สแปม/หลอกลวง");
  const [reportDetail, setReportDetail] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const REPORT_REASONS = [
    "สแปม/หลอกลวง",
    "ข้อมูลเท็จ",
    "เนื้อหาไม่เหมาะสม",
    "ทารุณสัตว์/อันตราย",
    "ขายสัตว์",
    "อื่นๆ",
  ];

  const getAuthedSupabase = async () => {
    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("Missing Clerk token (template: supabase)");
    return createClerkSupabaseClient(token);
  };

  const isVisiblePet = (p) => {
    const st = (p?.adoption_status ?? "").toString().trim().toLowerCase();
    if (st !== VISIBLE_ADOPTION_STATUS) return false;
    if (p?.adopted === true) return false;
    return true;
  };

  const fetchPets = async () => {
    setLoadingPets(true);
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("adoption_status", "available")
        .neq("adopted", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const myClerkId = (user?.id ?? "").toString().trim();

      // ✅ กรองเฉพาะที่ควรเห็น + ไม่ใช่โพสต์ของตัวเอง
      const petsData = (data || []).filter(isVisiblePet).filter((p) => {
        const ownerId = (p?.user_id ?? "").toString().trim();
        if (!myClerkId) return true; // ไม่ได้ล็อกอิน -> ไม่ตัด
        return ownerId !== myClerkId;
      });

      setPets(petsData);

      const categories = [
        "ทั้งหมด",
        ...new Set(petsData.map((p) => p.category).filter(Boolean)),
      ];
      setAvailableCategories(categories);
    } catch (error) {
      console.error("Error fetching pets:", error);
    } finally {
      setLoadingPets(false);
      setRefreshing(false);
    }
  };

  // ✅ availableBreeds คำนวณตาม "ประเภท" ที่เลือกอยู่เสมอ
  const availableBreeds = useMemo(() => {
    const base =
      filters.category === "ทั้งหมด"
        ? pets
        : pets.filter((p) => p.category === filters.category);

    return ["ทั้งหมด", ...new Set(base.map((p) => p.breed).filter(Boolean))];
  }, [pets, filters.category]);

  const applyFilters = () => {
    let result = pets.filter(isVisiblePet);

    if (filters.category !== "ทั้งหมด") {
      result = result.filter((pet) => pet.category === filters.category);
    }

    if (filters.sex !== "ทั้งหมด") {
      result = result.filter(
        (pet) =>
          pet.sex?.toString().toLowerCase() === filters.sex.toLowerCase(),
      );
    }

    if (filters.breed !== "ทั้งหมด") {
      result = result.filter((pet) => pet.breed === filters.breed);
    }

    setFilteredPets(result);
  };

  useEffect(() => {
    const channel = supabase
      .channel("pets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pets" },
        () => fetchPets(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ เพิ่ม: เมื่อ user.id พร้อม -> fetch ใหม่เพื่อซ่อนโพสต์ตัวเองให้ชัวร์
  useEffect(() => {
    if (user?.id) fetchPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pets]);

  // ✅ ถ้าเปลี่ยนประเภทแล้ว breed เดิมไม่อยู่ใน list ใหม่ -> reset เป็น "ทั้งหมด"
  useEffect(() => {
    if (
      filters.breed !== "ทั้งหมด" &&
      !availableBreeds.includes(filters.breed)
    ) {
      setFilters((prev) => ({ ...prev, breed: "ทั้งหมด" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, pets]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPets();
  };

  const handlePetPress = (pet) => {
    router.push({ pathname: "/pet-details", params: { ...pet } });
  };

  const getGenderIcon = (sex) => {
    const s = sex?.toLowerCase();
    if (s === "ผู้" || s === "male")
      return { icon: "male", color: "#3B82F6", label: "ผู้" };
    if (s === "เมีย" || s === "female")
      return { icon: "female", color: "#EC4899", label: "เมีย" };
    return { icon: "help-circle-outline", color: "#6B7280", label: "ไม่ระบุ" };
  };

  // =========================
  // ✅ REPORT HANDLERS
  // =========================
  const openReport = async (pet) => {
    try {
      const reportedClerkId = (pet?.user_id ?? "").toString().trim();

      if (!user?.id) {
        Alert.alert("กรุณาเข้าสู่ระบบ", "ต้องเข้าสู่ระบบก่อนจึงรายงานได้");
        return;
      }

      if (!reportedClerkId) {
        Alert.alert("ไม่สามารถรายงานได้", "ไม่พบข้อมูลเจ้าของโพสต์นี้");
        return;
      }

      if (!reportedClerkId.startsWith("user_")) {
        Alert.alert(
          "รายงานไม่ได้",
          "ข้อมูลเจ้าของโพสต์ไม่ถูกต้อง (user_id ไม่ใช่ Clerk ID)",
        );
        return;
      }

      if (user.id === reportedClerkId) {
        Alert.alert("ไม่สามารถทำได้", "คุณไม่สามารถรายงานตัวเองได้");
        return;
      }

      if (!pet?.id || typeof pet.id !== "string") {
        Alert.alert("รายงานไม่ได้", "ไม่พบ Pet ID ของโพสต์นี้");
        return;
      }

      const authed = await getAuthedSupabase();

      const { data: users, error: usersErr } = await authed
        .from("users")
        .select("clerk_id, full_name, avatar_url")
        .in("clerk_id", [user.id, reportedClerkId]);

      if (usersErr) console.log("fetch users error:", usersErr);

      const usersMap = new Map((users || []).map((u) => [u.clerk_id, u]));
      const reporter = usersMap.get(user.id);
      const reported = usersMap.get(reportedClerkId);

      setReportTarget({
        pet_id: pet.id,
        reported_clerk_id: reportedClerkId,
        preview: {
          name: pet?.name ?? "-",
          breed: pet?.breed ?? "ทั่วไป",
          category: pet?.category ?? "-",
          image_url: pet?.image_url ?? null,
          reporter_full_name: reporter?.full_name ?? null,
          owner_full_name: reported?.full_name ?? null,
          owner_avatar_url: reported?.avatar_url ?? null,
        },
      });

      setReportReason("สแปม/หลอกลวง");
      setReportDetail("");
      setShowReportModal(true);
    } catch (e) {
      console.error("openReport error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถเปิดรายงานได้ กรุณาลองใหม่");
    }
  };

  const canSubmit = useMemo(() => {
    return (
      !!user?.id &&
      !!reportTarget?.pet_id &&
      !!reportTarget?.reported_clerk_id &&
      !submittingReport
    );
  }, [
    user?.id,
    reportTarget?.pet_id,
    reportTarget?.reported_clerk_id,
    submittingReport,
  ]);

  const submitReport = async () => {
    const petId = reportTarget?.pet_id;

    if (!user?.id || !reportTarget?.reported_clerk_id || !petId) {
      Alert.alert("ข้อผิดพลาด", "ข้อมูลไม่ครบถ้วน กรุณาลองใหม่");
      return;
    }

    if (typeof petId !== "string") {
      Alert.alert("ข้อผิดพลาด", "Pet ID รูปแบบไม่ถูกต้อง");
      return;
    }

    if (reportReason === "อื่นๆ" && !reportDetail.trim()) {
      Alert.alert(
        "กรุณาระบุรายละเอียด",
        'เมื่อเลือก "อื่นๆ" กรุณากรอกรายละเอียด',
      );
      return;
    }

    try {
      setSubmittingReport(true);

      const authed = await getAuthedSupabase();

      const reporterName = reportTarget?.preview?.reporter_full_name
        ? `ผู้รายงาน: ${reportTarget.preview.reporter_full_name}\n`
        : "";

      const ownerName = reportTarget?.preview?.owner_full_name
        ? `เจ้าของโพสต์: ${reportTarget.preview.owner_full_name}\n`
        : "";

      const petInfo = `${reporterName}${ownerName}Pet ID: ${petId}`;
      const fullDetails = reportDetail.trim()
        ? `${petInfo}\n\nรายละเอียด: ${reportDetail.trim()}`
        : petInfo;

      const payload = {
        pet_id: petId,
        reporter_clerk_id: user.id,
        reported_clerk_id: reportTarget.reported_clerk_id,
        reason: reportReason,
        details: fullDetails,
        evidence_urls: [],
        status: "open",
        admin_note: null,
      };

      const { data, error } = await authed
        .from("user_reports")
        .insert(payload)
        .select("id, pet_id")
        .single();

      if (error) throw error;

      Alert.alert(
        "ส่งรายงานสำเร็จ",
        "ขอบคุณที่แจ้งปัญหา ทีมงานจะตรวจสอบโดยเร็วที่สุด 🙏",
      );

      setShowReportModal(false);
      setReportTarget(null);
      setReportDetail("");
    } catch (err) {
      console.error("submitReport error:", err);
      Alert.alert("เกิดข้อผิดพลาด", err?.message || "ไม่สามารถส่งรายงานได้");
    } finally {
      setSubmittingReport(false);
    }
  };

  const renderPetItem = ({ item }) => {
    if (!isVisiblePet(item)) return null;

    const gender = getGenderIcon(item.sex);

    return (
      <TouchableOpacity
        style={styles.petCard}
        activeOpacity={0.9}
        onPress={() => handlePetPress(item)}
      >
        <View style={styles.petImageContainer}>
          <Image
            source={{
              uri: item.image_url || "https://via.placeholder.com/400",
            }}
            style={styles.petImage}
          />

          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {item.category === "สุนัข"
                ? "🐶"
                : item.category === "แมว"
                  ? "🐱"
                  : "🐾"}{" "}
              {item.category}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.reportFloatingBtn}
            onPress={() => openReport(item)}
            activeOpacity={0.85}
          >
            <Ionicons name="flag-outline" size={16} color="#EF4444" />
            <Text style={styles.reportFloatingText}>รายงานโพสต์</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.petInfo}>
          <View style={styles.petHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.petBreed}>{item.breed || "ทั่วไป"}</Text>
            </View>

            <View style={styles.rightHeader}>
              <View
                style={[
                  styles.sexBadge,
                  { backgroundColor: gender.color + "15" },
                ]}
              >
                <Ionicons name={gender.icon} size={14} color={gender.color} />
                <Text style={[styles.sexText, { color: gender.color }]}>
                  {gender.label}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.petFooter}>
            <View style={styles.locationBox}>
              <Ionicons name="location-sharp" size={14} color="#8B5CF6" />
              <Text style={styles.locationText} numberOfLines={1}>
                {item.address || "ไม่ระบุพิกัด"}
              </Text>
            </View>
            <Text style={styles.ageText}>
              {item.age > 0 ? `${item.age} ปี` : "ไม่ระบุอายุ"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header />

      <FlatList
        ListHeaderComponent={
          <View style={styles.filterTitleArea}>
            <Text style={styles.mainTitle}>สัตว์เลี้ยงใกล้คุณ</Text>
            <TouchableOpacity
              style={styles.filterTrigger}
              onPress={() => setShowFilterModal(true)}
            >
              <Ionicons name="options" size={20} color="#FFF" />
              <Text style={styles.filterTriggerText}>ตัวกรอง</Text>
            </TouchableOpacity>
          </View>
        }
        data={filteredPets}
        renderItem={renderPetItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          !loadingPets && (
            <View style={styles.emptyBox}>
              <Ionicons name="paw-outline" size={60} color="#DDD" />
              <Text style={styles.emptyText}>ตอนนี้ยังไม่มีรายการให้แสดง</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ตัวกรองละเอียด</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close-circle" size={32} color="#CCC" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.groupLabel}>ประเภท</Text>
              <View style={styles.chipRow}>
                {availableCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      filters.category === cat && styles.chipActive,
                    ]}
                    onPress={() =>
                      setFilters((prev) => ({
                        ...prev,
                        category: cat,
                        breed: "ทั้งหมด", // ✅ เปลี่ยนประเภทแล้ว reset breed
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters.category === cat && styles.chipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.groupLabel}>เพศ</Text>
              <View style={styles.chipRow}>
                {["ทั้งหมด", "ผู้", "เมีย"].map((sex) => (
                  <TouchableOpacity
                    key={sex}
                    style={[
                      styles.chip,
                      filters.sex === sex && styles.chipActive,
                    ]}
                    onPress={() => setFilters((prev) => ({ ...prev, sex }))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters.sex === sex && styles.chipTextActive,
                      ]}
                    >
                      {sex}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.groupLabel}>สายพันธุ์</Text>
              <View style={styles.chipRow}>
                {availableBreeds.map((brd) => (
                  <TouchableOpacity
                    key={brd}
                    style={[
                      styles.chip,
                      filters.breed === brd && styles.chipActive,
                    ]}
                    onPress={() =>
                      setFilters((prev) => ({ ...prev, breed: brd }))
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters.breed === brd && styles.chipTextActive,
                      ]}
                    >
                      {brd}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() =>
                  setFilters({
                    category: "ทั้งหมด",
                    sex: "ทั้งหมด",
                    breed: "ทั้งหมด",
                  })
                }
              >
                <Text style={styles.resetBtnText}>ล้างค่า</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.applyBtnText}>
                  ดู {filteredPets.length} รายการ
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ Report Modal */}
      <Modal visible={showReportModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🚨 รายงานโพสต์</Text>
              <TouchableOpacity
                onPress={() => setShowReportModal(false)}
                disabled={submittingReport}
              >
                <Ionicons name="close-circle" size={32} color="#CCC" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.groupLabel}>โพสต์ที่ถูกรายงาน</Text>

              <View style={styles.reportPreview}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {!!reportTarget?.preview?.image_url && (
                    <Image
                      source={{ uri: reportTarget.preview.image_url }}
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 12,
                        backgroundColor: "#F3F4F6",
                      }}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", fontSize: 16 }}>
                      {reportTarget?.preview?.name ?? "-"}
                    </Text>

                    <Text style={{ color: "#6B7280", marginTop: 4 }}>
                      {(reportTarget?.preview?.breed ?? "ทั่วไป") +
                        " • " +
                        (reportTarget?.preview?.category ?? "-")}
                    </Text>

                    <Text
                      style={{
                        color: "#111827",
                        marginTop: 6,
                        fontWeight: "900",
                      }}
                    >
                      เจ้าของโพสต์:{" "}
                      {reportTarget?.preview?.owner_full_name || "ไม่พบชื่อ"}
                    </Text>

                    <Text
                      style={{
                        color: "#9CA3AF",
                        marginTop: 6,
                        fontWeight: "700",
                      }}
                    >
                      Pet ID: {reportTarget?.pet_id ?? "-"}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.groupLabel}>
                เหตุผลในการรายงาน <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <View style={styles.chipRow}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.chip,
                      reportReason === r && styles.chipActive,
                    ]}
                    onPress={() => setReportReason(r)}
                    activeOpacity={0.9}
                    disabled={submittingReport}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        reportReason === r && styles.chipTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.groupLabel}>
                รายละเอียดเพิ่มเติม
                {reportReason === "อื่นๆ" && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <TextInput
                value={reportDetail}
                onChangeText={setReportDetail}
                placeholder="พิมพ์รายละเอียด เช่น เหตุการณ์/ข้อความ/สิ่งที่น่าสงสัย..."
                multiline
                style={styles.textAreaInput}
                editable={!submittingReport}
              />

              <View style={styles.warningBox}>
                <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                <Text style={styles.warningText}>
                  รายงานจะถูกส่งให้แอดมินตรวจสอบ{"\n"}
                  การรายงานเท็จอาจส่งผลต่อบัญชีของคุณ
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => setShowReportModal(false)}
                disabled={submittingReport}
              >
                <Text style={styles.resetBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.applyBtn,
                  (!canSubmit || submittingReport) && { opacity: 0.6 },
                ]}
                onPress={submitReport}
                disabled={!canSubmit || submittingReport}
              >
                <Text style={styles.applyBtnText}>
                  {submittingReport ? "กำลังส่ง..." : "ส่งรายงาน"}
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
  screen: { flex: 1, backgroundColor: "#F8F9FA" },
  listContainer: { paddingHorizontal: 16, paddingBottom: 40 },
  filterTitleArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 20,
  },
  mainTitle: { fontSize: 22, fontWeight: "800", color: "#1A1A1A" },
  filterTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  filterTriggerText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  petCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginBottom: 18,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    overflow: "hidden",
  },

  petImageContainer: {
    height: 220,
    width: "100%",
    backgroundColor: "#F1F5F9",
    position: "relative",
  },
  petImage: { width: "100%", height: "100%", resizeMode: "cover" },

  categoryBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryBadgeText: { fontWeight: "700", color: "#8B5CF6", fontSize: 12 },

  reportFloatingBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 999,
    elevation: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportFloatingText: { color: "#EF4444", fontWeight: "800", fontSize: 11 },

  petInfo: { padding: 16 },
  petHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  petName: { fontSize: 20, fontWeight: "800", color: "#1F2937" },
  petBreed: { fontSize: 14, color: "#9CA3AF", marginTop: 2 },

  rightHeader: { flexDirection: "row", alignItems: "center", gap: 10 },

  sexBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  sexText: { fontSize: 13, fontWeight: "700" },

  petFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    alignItems: "center",
  },
  locationBox: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  locationText: { fontSize: 13, color: "#6B7280" },
  ageText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#8B5CF6",
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },

  groupLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
    marginTop: 10,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
  chipText: { color: "#6B7280", fontWeight: "600" },
  chipTextActive: { color: "#FFF" },

  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  resetBtn: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
  },
  resetBtnText: { color: "#6B7280", fontWeight: "700" },
  applyBtn: {
    flex: 2,
    backgroundColor: "#8B5CF6",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  applyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },

  emptyBox: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: "#9CA3AF", fontWeight: "600" },

  reportPreview: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },
  textAreaInput: {
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 16,
    textAlignVertical: "top",
    color: "#111827",
    fontWeight: "600",
    fontSize: 14,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FEF3C7",
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    color: "#92400E",
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 18,
  },
});
