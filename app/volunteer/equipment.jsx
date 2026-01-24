import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const EQUIPMENT_SECTIONS = [
  {
    title: "อุปกรณ์พื้นฐาน (ต้องมี)",
    icon: "construct-outline",
    items: [
      "ถุงมือยาง/ไนไตรล์",
      "หน้ากากอนามัย",
      "แอลกอฮอล์ล้างมือ",
      "ถุงขยะ/ถุงซิปล็อก",
      "ทิชชู่/ผ้าเช็ด",
      "ไฟฉาย/ไฟฉายคาดหัว",
      "น้ำดื่มสำหรับตัวเอง",
    ],
  },
  {
    title: "อุปกรณ์สำหรับสัตว์",
    icon: "paw-outline",
    items: [
      "สายจูง + ปลอกคอ (สุนัข)",
      "กรง/กระเป๋าใส่สัตว์ (แมว/สัตว์เล็ก)",
      "ผ้าคลุม/ผ้าห่ม (ช่วยให้สัตว์สงบ)",
      "อาหาร/ขนมล่อเล็กน้อย",
      "ถ้วยน้ำพกพา",
    ],
  },
  {
    title: "อุปกรณ์เสริม (แนะนำ)",
    icon: "medkit-outline",
    items: [
      "น้ำยาฆ่าเชื้อ (สำหรับอุปกรณ์/มือ)",
      "สเปรย์ไล่หมัด/เห็บ (ถ้ามีแนวทางองค์กร)",
      "ชุดปฐมพยาบาลเล็กๆ",
      "เทป/เชือก/เคเบิลไทร์",
      "พาวเวอร์แบงก์",
    ],
  },
  {
    title: "ความปลอดภัย",
    icon: "shield-checkmark-outline",
    items: [
      "รองเท้าหุ้มส้นกันลื่น",
      "เสื้อแขนยาว/หมวกกันแดด",
      "หลีกเลี่ยงจับสัตว์ที่ก้าวร้าวคนเดียว",
      "ถ่ายรูปหลักฐานก่อน-หลัง และแจ้งแอดมินตามขั้นตอน",
    ],
  },
];

export default function VolunteerEquipment() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>อุปกรณ์ที่ต้องมี</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topCard}>
          <View style={styles.topIcon}>
            <Ionicons
              name="checkmark-circle-outline"
              size={18}
              color="#7c3aed"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>เช็กลิสต์ก่อนออกเคส</Text>
            <Text style={styles.topSub} numberOfLines={2}>
              เลือกเตรียมอุปกรณ์ให้ครบ จะช่วยลดความเสี่ยง และทำงานได้เร็วขึ้น
            </Text>
          </View>
        </View>

        {EQUIPMENT_SECTIONS.map((sec) => (
          <View key={sec.title} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons name={sec.icon} size={18} color="#7c3aed" />
              </View>
              <Text style={styles.sectionTitle}>{sec.title}</Text>
            </View>

            {sec.items.map((t, idx) => (
              <View key={`${sec.title}-${idx}`} style={styles.row}>
                <Ionicons name="ellipse" size={8} color="#94a3b8" />
                <Text style={styles.rowText}>{t}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.note}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#64748b"
          />
          <Text style={styles.noteText}>
            * รายการนี้เป็นคำแนะนำทั่วไป คุณสามารถปรับตามนโยบายของทีม/องค์กรได้
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
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

  content: { padding: 16, paddingBottom: 28 },

  topCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  topIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ede9fe",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  topSub: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 2 },

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 14,
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#f3e8ff",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a" },

  row: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8 },
  rowText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#334155" },

  note: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 11, fontWeight: "600", color: "#64748b" },
});
