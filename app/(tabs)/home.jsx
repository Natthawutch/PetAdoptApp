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
import Header from "../../components/Home/header";
import { supabase } from "../../config/supabaseClient";

export default function Home() {
  const { user } = useUser();
  const router = useRouter();

  const [pets, setPets] = useState([]);
  const [filteredPets, setFilteredPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // ✅ ยึด adoption_status เป็นตัวจริง
  // available = แสดง, adopted = ไม่แสดง
  const VISIBLE_ADOPTION_STATUS = "available";

  const [filters, setFilters] = useState({
    category: "ทั้งหมด",
    sex: "ทั้งหมด",
    breed: "ทั้งหมด",
  });

  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableBreeds, setAvailableBreeds] = useState([]);

  // ✅ helper: เช็คการแสดงแบบกันทุกเคส
  const isVisiblePet = (p) => {
    const st = (p?.adoption_status ?? "").toString().trim().toLowerCase();
    // แสดงเฉพาะ available เท่านั้น
    if (st !== VISIBLE_ADOPTION_STATUS) return false;

    // กันเหนียว ถ้ามี field adopted เป็น true ก็ไม่แสดง
    if (p?.adopted === true) return false;

    return true;
  };

  const fetchPets = async () => {
    setLoadingPets(true);
    try {
      // ✅ กรองที่ DB ก่อน (หมายเหตุ: eq จะ case-sensitive บางที)
      // ถ้าคุณเก็บเป็น "available" ตัวเล็กใน DB ทั้งหมด -> ใช้ eq ได้เลย
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("adoption_status", "available")
        .neq("adopted", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // ✅ กันหลุดซ้ำในแอป (รองรับกรณีบางแถวเป็น "Available"/มีช่องว่าง)
      const petsData = (data || []).filter(isVisiblePet);

      setPets(petsData);

      const categories = [
        "ทั้งหมด",
        ...new Set(petsData.map((p) => p.category).filter(Boolean)),
      ];
      const breeds = [
        "ทั้งหมด",
        ...new Set(petsData.map((p) => p.breed).filter(Boolean)),
      ];

      setAvailableCategories(categories);
      setAvailableBreeds(breeds);
    } catch (error) {
      console.error("Error fetching pets:", error);
    } finally {
      setLoadingPets(false);
      setRefreshing(false);
    }
  };

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
  }, []);

  useEffect(() => {
    fetchPets();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, pets]);

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

  const renderPetItem = ({ item }) => {
    // ✅ ชั้นสุดท้าย กันหลุดก่อน render
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
        </View>

        <View style={styles.petInfo}>
          <View style={styles.petHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.petBreed}>{item.breed || "ทั่วไป"}</Text>
            </View>
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
              <Text style={styles.emptyText}>
                ตอนนี้ยังไม่มีน้องที่ “พร้อมรับเลี้ยง”
              </Text>
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

              <Text style={styles.groupLabel}>เพศ</Text>
              <View style={styles.chipRow}>
                {["ทั้งหมด", "ผู้", "เมีย"].map((sex) => (
                  <TouchableOpacity
                    key={sex}
                    style={[
                      styles.chip,
                      filters.sex === sex && styles.chipActive,
                    ]}
                    onPress={() => setFilters({ ...filters, sex: sex })}
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
  petImageContainer: { height: 220, width: "100%", backgroundColor: "#F1F5F9" },
  petImage: { width: "100%", height: "100%", resizeMode: "contain" },
  categoryBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  categoryBadgeText: { fontWeight: "700", color: "#8B5CF6", fontSize: 12 },
  petInfo: { padding: 16 },
  petHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  petName: { fontSize: 20, fontWeight: "800", color: "#1F2937" },
  petBreed: { fontSize: 14, color: "#9CA3AF", marginTop: 2 },
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
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: "80%",
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
});
