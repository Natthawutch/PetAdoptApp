// app/volunteer/guide.jsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function VolunteerGuide() {
  const router = useRouter();

  const items = [
    {
      icon: "medkit-outline",
      title: "ปฐมพยาบาลเบื้องต้น",
      desc: "เลือดออก/ช็อก/หายใจลำบาก",
    },
    {
      icon: "hand-left-outline",
      title: "วิธีเข้าหาอย่างปลอดภัย",
      desc: "ลดการกัด/ข่วน/หนี",
    },
    {
      icon: "cube-outline",
      title: "การเคลื่อนย้ายสัตว์เจ็บ",
      desc: "ท่าจับ/กล่อง/ผ้าห่ม",
    },
    {
      icon: "list-outline",
      title: "Checklist ก่อนออกหน้างาน",
      desc: "ถุงมือ, ผ้าห่ม, น้ำ, กรง",
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.h1}>คู่มืออาสา</Text>
      </View>

      <View style={styles.list}>
        {items.map((it) => (
          <View key={it.title} style={styles.row}>
            <View style={styles.iconBox}>
              <Ionicons name={it.icon} size={18} color="#0f766e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{it.title}</Text>
              <Text style={styles.desc}>{it.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </View>
        ))}
      </View>
    </View>
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

  list: { paddingHorizontal: 16, paddingTop: 8 },
  row: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  desc: { marginTop: 2, fontSize: 12, color: "#64748b" },
});
