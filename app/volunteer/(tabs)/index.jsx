// VolunteerHome.jsx
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../../../config/supabaseClient";

export default function VolunteerHome() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [urgentCount, setUrgentCount] = useState(0);

  // ตัวอย่าง Stats (อาจดึงจาก backend จริงได้)
  const stats = {
    helpedAnimals: 24,
    activeReports: 3,
    totalHours: 156,
  };

  useEffect(() => {
    let channel = null;

    const fetchUrgentReports = async () => {
      try {
        // รับ Clerk token
        const token = await getToken();
        const supabase = createClerkSupabaseClient(token);

        // 🔹 fetch จำนวนรายงาน urgent ตอนแรก
        const { data, error } = await supabase
          .from("reports")
          .select("id")
          .eq("status", "urgent");

        if (error) {
          console.log("❌ Fetch urgent reports error:", error);
          return;
        }

        setUrgentCount(data?.length || 0);

        // 🔹 สร้าง Realtime channel
        const realtime = getRealtimeClient(token);
        channel = realtime.channel("reports_updates");

        channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "reports" },
            (payload) => {
              // payload.eventType: INSERT, UPDATE, DELETE
              if (
                payload.eventType === "INSERT" &&
                payload.new.status === "urgent"
              ) {
                setUrgentCount((prev) => prev + 1);
              }
              if (
                payload.eventType === "UPDATE" &&
                payload.old.status !== "urgent" &&
                payload.new.status === "urgent"
              ) {
                setUrgentCount((prev) => prev + 1);
              }
              if (
                payload.eventType === "UPDATE" &&
                payload.old.status === "urgent" &&
                payload.new.status !== "urgent"
              ) {
                setUrgentCount((prev) => Math.max(prev - 1, 0));
              }
              if (
                payload.eventType === "DELETE" &&
                payload.old.status === "urgent"
              ) {
                setUrgentCount((prev) => Math.max(prev - 1, 0));
              }
            }
          )
          .subscribe();

        console.log("✅ Realtime subscription set for reports");
      } catch (err) {
        console.log("❌ Token fetch error:", err);
      }
    };

    fetchUrgentReports();

    // cleanup
    return () => {
      if (channel) {
        channel.unsubscribe();
        console.log("🛑 Realtime channel unsubscribed");
      }
    };
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>สวัสดี, อาสาสมัคร! 👋</Text>
        <Text style={styles.subtitle}>พร้อมช่วยเหลือสัตว์วันนี้แล้ว</Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="paw" size={24} color="#22c55e" />
          </View>
          <Text style={styles.statNumber}>{stats.helpedAnimals}</Text>
          <Text style={styles.statLabel}>สัตว์ที่ช่วยแล้ว</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: "#fef3c7" }]}>
            <Ionicons name="time-outline" size={24} color="#f59e0b" />
          </View>
          <Text style={styles.statNumber}>{stats.activeReports}</Text>
          <Text style={styles.statLabel}>กำลังดำเนินการ</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: "#dbeafe" }]}>
            <Ionicons name="ribbon-outline" size={24} color="#3b82f6" />
          </View>
          <Text style={styles.statNumber}>{stats.totalHours}</Text>
          <Text style={styles.statLabel}>ชั่วโมงอาสา</Text>
        </View>
      </View>

      {/* Main Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>งานหลัก</Text>

        <TouchableOpacity
          style={[styles.actionCard, styles.urgentCard]}
          onPress={() => router.push("/volunteer/reports")}
        >
          <View style={styles.actionLeft}>
            <View style={[styles.actionIcon, { backgroundColor: "#fee2e2" }]}>
              <Ionicons name="alert-circle" size={32} color="#ef4444" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>รายงานด่วน</Text>
              <Text style={styles.actionDesc}>
                สัตว์ต้องการความช่วยเหลือเร่งด่วน
              </Text>
            </View>
          </View>
          {urgentCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{urgentCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <View style={styles.actionLeft}>
            <View style={[styles.actionIcon, { backgroundColor: "#e0e7ff" }]}>
              <Ionicons name="list" size={32} color="#6366f1" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>รายงานทั้งหมด</Text>
              <Text style={styles.actionDesc}>ดูรายงานสัตว์ทั้งหมดในระบบ</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <View style={styles.actionLeft}>
            <View style={[styles.actionIcon, { backgroundColor: "#fce7f3" }]}>
              <Ionicons name="checkmark-done" size={32} color="#ec4899" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>งานของฉัน</Text>
              <Text style={styles.actionDesc}>รายงานที่คุณกำลังดูแล</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>เครื่องมือ</Text>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickActionCard}>
            <View
              style={[styles.quickActionIcon, { backgroundColor: "#ddd6fe" }]}
            >
              <Ionicons name="map" size={28} color="#8b5cf6" />
            </View>
            <Text style={styles.quickActionText}>แผนที่</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionCard}>
            <View
              style={[styles.quickActionIcon, { backgroundColor: "#fbcfe8" }]}
            >
              <Ionicons name="call" size={28} color="#db2777" />
            </View>
            <Text style={styles.quickActionText}>ติดต่อฉุกเฉิน</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionCard}>
            <View
              style={[styles.quickActionIcon, { backgroundColor: "#ccfbf1" }]}
            >
              <Ionicons name="document-text" size={28} color="#14b8a6" />
            </View>
            <Text style={styles.quickActionText}>คู่มือ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionCard}>
            <View
              style={[styles.quickActionIcon, { backgroundColor: "#fed7aa" }]}
            >
              <Ionicons name="settings" size={28} color="#f97316" />
            </View>
            <Text style={styles.quickActionText}>ตั้งค่า</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Styles (เหมือนเดิม)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 4,
  },
  subtitle: { fontSize: 15, color: "#64748b" },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  statLabel: { fontSize: 11, color: "#64748b", textAlign: "center" },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 12,
  },
  actionCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  urgentCard: { borderWidth: 2, borderColor: "#fee2e2" },
  actionLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  actionContent: { flex: 1 },
  actionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },
  actionDesc: { fontSize: 13, color: "#64748b" },
  badge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 8,
  },
  badgeText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  quickActions: { flexDirection: "row", gap: 12 },
  quickActionCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
});
