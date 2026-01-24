import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

export default function CaseDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);

  useEffect(() => {
    const fetchCase = async () => {
      try {
        const token = await getToken({ template: "supabase" });
        const supabase = createClerkSupabaseClient(token);

        const { data, error } = await supabase
          .from("reports")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        setCaseData(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchCase();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>กำลังโหลดเคส...</Text>
      </View>
    );
  }

  if (!caseData) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>ไม่พบข้อมูลเคส</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>รายละเอียดเคส</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.title}>
            ช่วยเหลือ{caseData.animal_type || "สัตว์"}
          </Text>
          <Text style={styles.sub}>สถานะ: {caseData.status}</Text>
        </View>

        {/* Image */}
        {caseData.image_url && (
          <Image source={{ uri: caseData.image_url }} style={styles.image} />
        )}

        {/* Info */}
        <View style={styles.card}>
          <InfoRow
            icon="location-outline"
            label="สถานที่"
            value={caseData.location || "-"}
          />
          <InfoRow
            icon="calendar-outline"
            label="วันที่แจ้ง"
            value={new Date(caseData.created_at).toLocaleDateString()}
          />
          <InfoRow
            icon="document-text-outline"
            label="รายละเอียด"
            value={caseData.detail || "-"}
          />
        </View>

        {/* Completion */}
        {caseData.completed_at && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>สรุปการช่วยเหลือ</Text>
            <Text style={styles.text}>
              เสร็จสิ้นเมื่อ: {new Date(caseData.completed_at).toLocaleString()}
            </Text>
            <Text style={styles.text}>
              หมายเหตุ: {caseData.completion_note || "-"}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color="#64748b" />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.text}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { justifyContent: "center", alignItems: "center" },

  loadingText: { marginTop: 10, color: "#64748b", fontWeight: "600" },

  header: {
    backgroundColor: "#fff",
    paddingTop: 58,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a" },

  content: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    marginBottom: 12,
  },

  title: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  sub: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 4 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },

  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  label: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  text: { fontSize: 12, fontWeight: "600", color: "#0f172a", marginTop: 2 },

  image: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: "#e5e7eb",
  },
});
