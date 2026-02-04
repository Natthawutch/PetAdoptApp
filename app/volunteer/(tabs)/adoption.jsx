import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../config/supabaseClient";

// ✅ เพิ่ม Header (ปรับ path ให้ตรงกับโปรเจกต์คุณ)
import Header from "../../../components/Home/header";

export default function VolunteerAdoptionList() {
  const { user } = useUser();
  const router = useRouter();

  const [pets, setPets] = useState([]);
  const [filteredPets, setFilteredPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [feedMode, setFeedMode] = useState("ALL");

  // ✅ ตัด status ออก
  const [filters, setFilters] = useState({
    category: "ทั้งหมด",
    sex: "ทั้งหมด",
    breed: "ทั้งหมด",
  });

  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableBreeds, setAvailableBreeds] = useState([]);
  const [availableBreedsAll, setAvailableBreedsAll] = useState([]); // ✅ NEW

  // ✅ ซ่อน adopted (และกัน adopted=true เผื่อใช้ด้วย)
  const isHiddenPet = (p) => {
    const st = (p?.adoption_status ?? "").toString().trim().toLowerCase();
    if (st === "adopted") return true;
    if (p?.adopted === true) return true;
    return false;
  };

  const fetchPets = async () => {
    setLoadingPets(true);
    try {
      let query = supabase
        .from("pets")
        .select("*")
        .order("created_at", { ascending: false });

      if (feedMode === "MINE" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // ✅ ซ่อน adopted ตั้งแต่ตอน setPets
      const petsData = (data || []).filter((p) => !isHiddenPet(p));
      setPets(petsData);

      const categories = [
        "ทั้งหมด",
        ...new Set(petsData.map((p) => p.category).filter(Boolean)),
      ];

      // ✅ เก็บสายพันธุ์รวมทั้งหมดไว้ก่อน
      const breeds = [
        "ทั้งหมด",
        ...new Set(petsData.map((p) => p.breed).filter(Boolean)),
      ];

      setAvailableCategories(categories);

      // ✅ NEW: เก็บ breeds ทั้งหมด + ตั้งค่าเริ่มต้นให้ availableBreeds ด้วย
      setAvailableBreedsAll(breeds);
      setAvailableBreeds(breeds);
    } catch (error) {
      console.error("Error fetching pets:", error);
    } finally {
      setLoadingPets(false);
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    // ✅ กันหลุดอีกชั้น: เอา adopted ออกเสมอ
    let result = pets.filter((p) => !isHiddenPet(p));

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
      .channel("pets-realtime-volunteer")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pets" },
        () => fetchPets(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [feedMode, user?.id]);

  useEffect(() => {
    fetchPets();
  }, [feedMode, user?.id]);

  useEffect(() => {
    applyFilters();
  }, [filters, pets]);

  // ✅ NEW: กรอง “สายพันธุ์” ตามประเภทสัตว์ที่เลือก
  useEffect(() => {
    // ถ้า category = ทั้งหมด -> ใช้รายการทั้งหมด
    if (filters.category === "ทั้งหมด") {
      setAvailableBreeds(availableBreedsAll);
      return;
    }

    // ดึงเฉพาะ breeds ของ category ที่เลือก
    const breedsByCategory = [
      "ทั้งหมด",
      ...new Set(
        pets
          .filter((p) => !isHiddenPet(p))
          .filter((p) => p.category === filters.category)
          .map((p) => p.breed)
          .filter(Boolean),
      ),
    ];

    setAvailableBreeds(breedsByCategory);

    // ถ้า breed ที่เลือกอยู่ ไม่อยู่ใน list ใหม่ -> รีเซ็ตเป็นทั้งหมด
    if (
      filters.breed !== "ทั้งหมด" &&
      !breedsByCategory.includes(filters.breed)
    ) {
      setFilters((prev) => ({ ...prev, breed: "ทั้งหมด" }));
    }
  }, [filters.category, pets, availableBreedsAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPets();
  };

  const goCreatePost = () => {
    router.push("/volunteer/create-post");
  };

  const handlePetPress = (pet) => {
    router.push({ pathname: "/pet-details", params: { id: String(pet.id) } });
  };

  const getGenderIcon = (sex) => {
    const s = sex?.toLowerCase();
    if (s === "ผู้" || s === "male")
      return { icon: "male", color: "#3B82F6", label: "ผู้" };
    if (s === "เมีย" || s === "female")
      return { icon: "female", color: "#EC4899", label: "เมีย" };
    return { icon: "help-circle-outline", color: "#6B7280", label: "ไม่ระบุ" };
  };

  const hasActiveFilters = () => {
    return (
      filters.category !== "ทั้งหมด" ||
      filters.sex !== "ทั้งหมด" ||
      filters.breed !== "ทั้งหมด"
    );
  };

  const renderPetItem = ({ item }) => {
    if (isHiddenPet(item)) return null;

    const gender = getGenderIcon(item.sex);

    return (
      <TouchableOpacity
        style={styles.petCard}
        activeOpacity={0.7}
        onPress={() => handlePetPress(item)}
      >
        <View style={styles.petImageContainer}>
          <Image
            source={{
              uri: item.image_url || "https://via.placeholder.com/400",
            }}
            style={styles.petImage}
          />

          <View style={styles.imageGradient} />

          <View style={styles.topBadges}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>
                {item.category === "สุนัข"
                  ? "🐶"
                  : item.category === "แมว"
                    ? "🐱"
                    : "🐾"}{" "}
                {item.category || "ไม่ระบุ"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.petInfo}>
          <View style={styles.petHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName} numberOfLines={1}>
                {item.name || "ไม่ระบุชื่อ"}
              </Text>
              <View style={styles.breedRow}>
                <Text style={styles.petBreed}>{item.breed || "ทั่วไป"}</Text>
                <View style={styles.separator} />
                <Text style={styles.ageText}>
                  {item.age > 0 ? `${item.age} ปี` : "ไม่ระบุอายุ"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.sexBadge,
                { backgroundColor: gender.color + "15" },
              ]}
            >
              <Ionicons name={gender.icon} size={16} color={gender.color} />
            </View>
          </View>

          <View style={styles.petFooter}>
            <Ionicons name="location" size={14} color="#8B5CF6" />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.address || "ไม่ระบุตำแหน่ง"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* ✅ Header fixed on top */}
      <Header />

      <FlatList
        data={filteredPets}
        renderItem={renderPetItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.headerSection}>
              <View style={styles.titleArea}>
                <Text style={styles.mainTitle}>โพสต์หาบ้าน</Text>
                <Text style={styles.subTitle}>
                  ช่วยน้องหาบ้านใหม่ที่อบอุ่น 🏡
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.filterButton,
                  hasActiveFilters() && styles.filterButtonActive,
                ]}
                onPress={() => setShowFilterModal(true)}
              >
                <Ionicons
                  name={hasActiveFilters() ? "funnel" : "funnel-outline"}
                  size={20}
                  color={hasActiveFilters() ? "#FFF" : "#8B5CF6"}
                />
                {hasActiveFilters() && <View style={styles.filterDot} />}
              </TouchableOpacity>
            </View>

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[
                  styles.modeChip,
                  feedMode === "ALL" && styles.modeChipActive,
                ]}
                onPress={() => setFeedMode("ALL")}
              >
                <Ionicons
                  name="apps"
                  size={18}
                  color={feedMode === "ALL" ? "#FFF" : "#6B7280"}
                />
                <Text
                  style={[
                    styles.modeChipText,
                    feedMode === "ALL" && styles.modeChipTextActive,
                  ]}
                >
                  ทั้งหมด
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeChip,
                  feedMode === "MINE" && styles.modeChipActive,
                ]}
                onPress={() => setFeedMode("MINE")}
              >
                <Ionicons
                  name="person"
                  size={18}
                  color={feedMode === "MINE" ? "#FFF" : "#6B7280"}
                />
                <Text
                  style={[
                    styles.modeChipText,
                    feedMode === "MINE" && styles.modeChipTextActive,
                  ]}
                >
                  ของฉัน
                </Text>
              </TouchableOpacity>
            </View>

            {hasActiveFilters() && (
              <View style={styles.activeFiltersBar}>
                <Ionicons name="filter" size={14} color="#8B5CF6" />
                <Text style={styles.activeFiltersText}>
                  กำลังกรอง {filteredPets.length} รายการ
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setFilters({
                      category: "ทั้งหมด",
                      sex: "ทั้งหมด",
                      breed: "ทั้งหมด",
                    })
                  }
                >
                  <Text style={styles.clearFiltersText}>ล้าง</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loadingPets && (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="paw" size={48} color="#8B5CF6" />
              </View>
              <Text style={styles.emptyTitle}>ยังไม่มีโพสต์</Text>
              <Text style={styles.emptyText}>
                เริ่มต้นช่วยน้องหาบ้านใหม่กันเลย!
              </Text>

              <TouchableOpacity style={styles.emptyCta} onPress={goCreatePost}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.emptyCtaText}>สร้างโพสต์แรก</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={goCreatePost}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowFilterModal(false)}
          />

          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>ตัวกรอง</Text>
                <Text style={styles.modalSubtitle}>
                  เลือกเงื่อนไขที่ต้องการ
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowFilterModal(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.filterSection}>
                <Text style={styles.groupLabel}>
                  <Ionicons name="apps" size={16} color="#374151" /> ประเภทสัตว์
                </Text>
                <View style={styles.chipRow}>
                  {availableCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        filters.category === cat && styles.chipActive,
                      ]}
                      onPress={() => setFilters({ ...filters, category: cat })}
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
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.groupLabel}>
                  <Ionicons name="male-female" size={16} color="#374151" /> เพศ
                </Text>
                <View style={styles.chipRow}>
                  {["ทั้งหมด", "ผู้", "เมีย"].map((sex) => (
                    <TouchableOpacity
                      key={sex}
                      style={[
                        styles.chip,
                        filters.sex === sex && styles.chipActive,
                      ]}
                      onPress={() => setFilters({ ...filters, sex })}
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
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.groupLabel}>
                  <Ionicons name="ribbon" size={16} color="#374151" /> สายพันธุ์
                </Text>
                <View style={styles.chipRow}>
                  {availableBreeds.map((brd) => (
                    <TouchableOpacity
                      key={brd}
                      style={[
                        styles.chip,
                        filters.breed === brd && styles.chipActive,
                      ]}
                      onPress={() => setFilters({ ...filters, breed: brd })}
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
                <Ionicons name="refresh" size={20} color="#6B7280" />
                <Text style={styles.resetBtnText}>รีเซ็ต</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.applyBtnText}>
                  แสดง {filteredPets.length} รายการ
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ✅ Styles */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAFAFA" },
  listContainer: { paddingBottom: 100 },

  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleArea: { flex: 1 },
  mainTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    fontWeight: "500",
  },

  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: "relative",
  },
  filterButtonActive: { backgroundColor: "#8B5CF6" },
  filterDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  modeRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
  },
  modeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modeChipActive: {
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.3,
  },
  modeChipText: { fontWeight: "700", fontSize: 15, color: "#6B7280" },
  modeChipTextActive: { color: "#FFF" },

  activeFiltersBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F5F3FF",
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E9D5FF",
  },
  activeFiltersText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#7C3AED",
  },
  clearFiltersText: { fontSize: 13, fontWeight: "700", color: "#8B5CF6" },

  petCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  petImageContainer: {
    height: 200,
    width: "100%",
    backgroundColor: "#F1F5F9",
    position: "relative",
  },
  petImage: { width: "100%", height: "100%", resizeMode: "contain" },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  topBadges: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryBadge: {
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryBadgeText: { fontWeight: "800", color: "#8B5CF6", fontSize: 12 },

  petInfo: { padding: 16 },
  petHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  petName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  breedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  petBreed: { fontSize: 14, color: "#6B7280", fontWeight: "600" },
  separator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#D1D5DB",
  },
  ageText: { fontSize: 13, fontWeight: "700", color: "#8B5CF6" },

  sexBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  petFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  locationText: { flex: 1, fontSize: 13, color: "#6B7280", fontWeight: "500" },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F5F3FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyCta: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: { fontSize: 22, fontWeight: "900", color: "#111827" },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
    fontWeight: "500",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },

  modalScroll: { paddingHorizontal: 24 },
  filterSection: { marginTop: 24 },
  groupLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 12,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  chipActive: { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
  chipText: { color: "#6B7280", fontWeight: "700", fontSize: 14 },
  chipTextActive: { color: "#FFF", fontWeight: "800" },

  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingBottom: 30,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FAFAFA",
  },
  resetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  resetBtnText: { color: "#6B7280", fontWeight: "800", fontSize: 15 },
  applyBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#8B5CF6",
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  applyBtnText: { color: "#FFF", fontWeight: "900", fontSize: 16 },
});
