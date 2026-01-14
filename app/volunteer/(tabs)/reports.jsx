import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

export default function VolunteerReports() {
  const router = useRouter();
  const { getToken } = useAuth();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      // console.log("📋 Reports:", data, error);

      if (error) throw error;
      setReports(data || []);
    } catch (e) {
      console.error("❌ Load reports error:", e);
    } finally {
      setLoading(false);
    }
  };

  const filters = [
    { id: "all", label: "ทั้งหมด", count: reports.length },
    {
      id: "pending",
      label: "รอดำเนินการ",
      count: reports.filter((r) => r.status === "pending").length,
    },
    {
      id: "in_progress",
      label: "กำลังทำ",
      count: reports.filter((r) => r.status === "in_progress").length,
    },
    {
      id: "completed",
      label: "เสร็จสิ้น",
      count: reports.filter((r) => r.status === "completed").length,
    },
  ];

  const getStatusStyle = (status) => {
    switch (status) {
      case "pending":
        return {
          bg: "#fee2e2",
          text: "#dc2626",
          icon: "alert-circle",
          label: "รอดำเนินการ",
        };
      case "in_progress":
        return {
          bg: "#dcfce7",
          text: "#16a34a",
          icon: "sync",
          label: "กำลังดำเนินการ",
        };
      case "completed":
        return {
          bg: "#dbeafe",
          text: "#2563eb",
          icon: "checkmark-circle",
          label: "เสร็จสิ้น",
        };
      default:
        return {
          bg: "#f1f5f9",
          text: "#64748b",
          icon: "help-circle",
          label: "ไม่ทราบสถานะ",
        };
    }
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
    return past.toLocaleDateString("th-TH");
  };

  const filteredReports = reports.filter((report) => {
    // Filter by status
    if (selectedFilter !== "all" && report.status !== selectedFilter) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        report.animal_type?.toLowerCase().includes(query) ||
        report.detail?.toLowerCase().includes(query) ||
        report.location?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>รายงานสัตว์</Text>
        <Text style={styles.subtitle}>รายงานที่ต้องการความช่วยเหลือ</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterTab,
              selectedFilter === filter.id && styles.filterTabActive,
            ]}
            onPress={() => setSelectedFilter(filter.id)}
          >
            <Text
              style={[
                styles.filterText,
                selectedFilter === filter.id && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
            <View
              style={[
                styles.filterBadge,
                selectedFilter === filter.id && styles.filterBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.filterBadgeText,
                  selectedFilter === filter.id && styles.filterBadgeTextActive,
                ]}
              >
                {filter.count}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    const statusStyle = getStatusStyle(item.status);

    return (
      <TouchableOpacity
        style={[styles.card, item.status === "pending" && styles.cardUrgent]}
        onPress={() =>
          router.push({
            pathname: "/volunteer/report-detail",
            params: { id: item.id },
          })
        }
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View
              style={[
                styles.animalBadge,
                {
                  backgroundColor:
                    item.animal_type === "สุนัข" ? "#dbeafe" : "#fce7f3",
                },
              ]}
            >
              <Ionicons
                name={item.animal_type === "สุนัข" ? "paw" : "fish"}
                size={16}
                color={item.animal_type === "สุนัข" ? "#2563eb" : "#ec4899"}
              />
            </View>
            <Text style={styles.animalType}>{item.animal_type}</Text>
          </View>

          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Ionicons
              name={statusStyle.icon}
              size={12}
              color={statusStyle.text}
            />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        {/* Title/Detail */}
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.detail || "ไม่มีรายละเอียด"}
        </Text>

        {/* Location */}
        <View style={styles.locationRow}>
          <Ionicons name="location" size={16} color="#64748b" />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.location || "ไม่ระบุตำแหน่ง"}
          </Text>
        </View>

        {/* Info Row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={14} color="#94a3b8" />
            <Text style={styles.infoText}>{getTimeAgo(item.created_at)}</Text>
          </View>

          {item.latitude && item.longitude && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Ionicons name="navigate-outline" size={14} color="#94a3b8" />
                <Text style={styles.infoText}>มีพิกัด GPS</Text>
              </View>
            </>
          )}
        </View>

        {/* Assigned To (if exists) */}
        {item.assigned_volunteer_id && (
          <View style={styles.assignedRow}>
            <Ionicons name="person" size={14} color="#8b5cf6" />
            <Text style={styles.assignedText}>มีผู้รับผิดชอบแล้ว</Text>
          </View>
        )}

        {/* Action Button */}
        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>ดูรายละเอียด</Text>
            <Ionicons name="arrow-forward" size={16} color="#8b5cf6" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
      </View>
      <Text style={styles.emptyTitle}>ไม่พบรายงาน</Text>
      <Text style={styles.emptyDesc}>
        ยังไม่มีรายงานสัตว์ที่ต้องการความช่วยเหลือในขณะนี้
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>กำลังโหลดรายงาน...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={loadReports}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748b",
  },
  listContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  titleContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#1e293b",
  },
  filterContainer: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: "#8b5cf6",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  filterTextActive: {
    color: "#fff",
  },
  filterBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
  },
  filterBadgeActive: {
    backgroundColor: "#7c3aed",
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  filterBadgeTextActive: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardUrgent: {
    borderColor: "#fee2e2",
    backgroundColor: "#fffbfb",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  animalBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  animalType: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: "#64748b",
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 10,
  },
  infoText: {
    fontSize: 12,
    color: "#94a3b8",
  },
  assignedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  assignedText: {
    fontSize: 13,
    color: "#8b5cf6",
    fontWeight: "600",
  },
  cardFooter: {
    marginTop: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f3ff",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8b5cf6",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
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
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
});
