// app/volunteer/settings.jsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function VolunteerSettings() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.h1}>ตั้งค่า</Text>
      </View>

      <View style={styles.card}>
        <Row
          icon="person-outline"
          title="โปรไฟล์"
          desc="แก้ไขข้อมูลอาสา"
          onPress={() => router.push("/volunteer/profile")}
        />
        <Row
          icon="notifications-outline"
          title="การแจ้งเตือน"
          desc="เลือกแจ้งเตือนเคสด่วน/ข้อความ"
          onPress={() => router.push("/volunteer/notifications")}
        />
        <Row
          icon="shield-checkmark-outline"
          title="ความปลอดภัย"
          desc="แนวทางการทำงานหน้างาน"
          onPress={() => router.push("/volunteer/guide")}
        />
      </View>
    </View>
  );
}

function Row({ icon, title, desc, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.9}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color="#ea580c" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  h1: { fontSize: 18, fontWeight: "900", color: "#0f172a" },

  card: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    padding: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  desc: { marginTop: 2, fontSize: 12, color: "#64748b" },
});
