import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

export default function ReportDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [report, setReport] = useState(null);
  const [reporter, setReporter] = useState(null);
  const [volunteer, setVolunteer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // 1. ดึงข้อมูล report
      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("*")
        .eq("id", id)
        .single();

      console.log("📄 Report:", reportData, reportError);

      if (reportError) throw reportError;
      setReport(reportData);

      // 2. ดึงข้อมูลผู้แจ้ง
      if (reportData.user_id) {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("clerk_id", reportData.user_id)
          .single();

        console.log("👤 Reporter:", userData);
        setReporter(userData);
      }

      // 3. ดึงข้อมูลอาสาสมัคร (ถ้ามี)
      if (reportData.assigned_volunteer_id) {
        const { data: volunteerData } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", reportData.assigned_volunteer_id)
          .single();

        console.log("🦸 Volunteer:", volunteerData);
        setVolunteer(volunteerData);
      }
    } catch (e) {
      console.error("❌ Load report error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    Alert.alert("รับเคสนี้", "คุณต้องการรับผิดชอบเคสนี้หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ยืนยัน",
        onPress: async () => {
          try {
            const token = await getToken({ template: "supabase" });
            const supabase = createClerkSupabaseClient(token);

            // ดึง user uuid จาก users table
            const { data: currentUser } = await supabase
              .from("users")
              .select("id")
              .eq("clerk_id", user.id)
              .single();

            if (!currentUser) {
              Alert.alert("เกิดข้อผิดพลาด", "ไม่พบข้อมูลผู้ใช้");
              return;
            }

            const { error } = await supabase
              .from("reports")
              .update({
                status: "in_progress",
                assigned_volunteer_id: currentUser.id,
              })
              .eq("id", report.id);

            if (error) throw error;

            Alert.alert("สำเร็จ", "คุณรับเคสนี้แล้ว");
            loadReport(); // Reload เพื่อแสดงข้อมูลใหม่
          } catch (e) {
            console.error("❌ Accept error:", e);
            Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถรับเคสได้");
          }
        },
      },
    ]);
  };

  const openMap = () => {
    if (report?.latitude && report?.longitude) {
      Linking.openURL(
        `https://www.google.com/maps?q=${report.latitude},${report.longitude}`
      );
    } else {
      Alert.alert("ไม่มีพิกัด", "รายงานนี้ไม่มีข้อมูลพิกัด GPS");
    }
  };

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

    if (diffMins < 1) return "เมื่อสักครู่";
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
    return past.toLocaleDateString("th-TH");
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>กำลังโหลดรายละเอียด...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>ไม่พบรายงาน</Text>
        <Text style={styles.errorText}>รายงานนี้ถูกลบหรือไม่มีอยู่จริง</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>กลับ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = getStatusStyle(report.status);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Image Section */}
      {report.image_url ? (
        <Image source={{ uri: report.image_url }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={64} color="#cbd5e1" />
          <Text style={styles.imagePlaceholderText}>ไม่มีรูปภาพ</Text>
        </View>
      )}

      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View
            style={[
              styles.animalBadge,
              {
                backgroundColor:
                  report.animal_type === "สุนัข"
                    ? "#dbeafe"
                    : report.animal_type === "แมว"
                    ? "#fce7f3"
                    : "#f3f4f6",
              },
            ]}
          >
            <Ionicons
              name={
                report.animal_type === "สุนัข"
                  ? "paw"
                  : report.animal_type === "แมว"
                  ? "fish"
                  : "help-circle"
              }
              size={20}
              color={
                report.animal_type === "สุนัข"
                  ? "#2563eb"
                  : report.animal_type === "แมว"
                  ? "#ec4899"
                  : "#6b7280"
              }
            />
            <Text
              style={[
                styles.animalText,
                {
                  color:
                    report.animal_type === "สุนัข"
                      ? "#2563eb"
                      : report.animal_type === "แมว"
                      ? "#ec4899"
                      : "#6b7280",
                },
              ]}
            >
              {report.animal_type}
            </Text>
          </View>

          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Ionicons
              name={statusStyle.icon}
              size={14}
              color={statusStyle.text}
            />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>รายละเอียดรายงาน</Text>
        <Text style={styles.detail}>{report.detail || "ไม่มีรายละเอียด"}</Text>

        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color="#94a3b8" />
          <Text style={styles.timeText}>
            แจ้งเมื่อ {getTimeAgo(report.created_at)}
          </Text>
        </View>
      </View>

      {/* Info Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ข้อมูลเพิ่มเติม</Text>

        {/* Location Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="location" size={24} color="#ef4444" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>สถานที่</Text>
            <Text style={styles.infoValue}>
              {report.location || "ไม่ระบุตำแหน่ง"}
            </Text>
            {report.latitude && report.longitude && (
              <TouchableOpacity style={styles.mapButton} onPress={openMap}>
                <Ionicons name="map" size={14} color="#2563eb" />
                <Text style={styles.mapButtonText}>เปิดแผนที่</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Coordinates Card */}
        {report.latitude && report.longitude && (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="navigate" size={24} color="#3b82f6" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>พิกัด GPS</Text>
              <Text style={styles.coordText}>
                Lat: {report.latitude.toFixed(6)}
              </Text>
              <Text style={styles.coordText}>
                Lng: {report.longitude.toFixed(6)}
              </Text>
            </View>
          </View>
        )}

        {/* Reporter Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="person" size={24} color="#8b5cf6" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>ผู้แจ้ง</Text>
            {reporter ? (
              <>
                <Text style={styles.infoValue}>
                  {reporter.full_name || "ไม่ระบุชื่อ"}
                </Text>
                <Text style={styles.coordText}>{reporter.email}</Text>
              </>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ActivityIndicator size="small" color="#8b5cf6" />
              </View>
            )}
          </View>
        </View>

        {/* Assigned Volunteer */}
        {report.assigned_volunteer_id && (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>อาสาสมัครที่รับผิดชอบ</Text>
              {volunteer ? (
                <>
                  <Text style={styles.infoValue}>
                    {volunteer.full_name || "ไม่ระบุชื่อ"}
                  </Text>
                  <Text style={styles.coordText}>{volunteer.email}</Text>
                </>
              ) : (
                <View style={{ paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color="#22c55e" />
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {report.status === "pending" && !report.assigned_volunteer_id && (
        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.acceptButtonText}>รับเคสนี้</Text>
          </TouchableOpacity>
        </View>
      )}

      {report.status === "in_progress" && (
        <View style={styles.actionSection}>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#2563eb" />
            <Text style={styles.infoBoxText}>
              เคสนี้กำลังดำเนินการโดยอาสาสมัคร
            </Text>
          </View>
        </View>
      )}

      {report.status === "completed" && (
        <View style={styles.actionSection}>
          <View style={[styles.infoBox, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text style={[styles.infoBoxText, { color: "#16a34a" }]}>
              เคสนี้ดำเนินการเสร็จสิ้นแล้ว
            </Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  image: {
    width: "100%",
    height: 300,
    backgroundColor: "#e5e7eb",
  },
  imagePlaceholder: {
    width: "100%",
    height: 300,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#94a3b8",
  },
  header: {
    backgroundColor: "#fff",
    padding: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  animalBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  animalText: {
    fontSize: 14,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 8,
  },
  detail: {
    fontSize: 16,
    color: "#475569",
    lineHeight: 24,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    color: "#94a3b8",
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 12,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1e293b",
  },
  coordText: {
    fontSize: 13,
    color: "#475569",
    marginTop: 2,
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  mapButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  actionSection: {
    padding: 20,
  },
  acceptButton: {
    backgroundColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
});
