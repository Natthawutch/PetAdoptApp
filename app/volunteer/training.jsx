// =====================================
// FILE 1) app/volunteer/training.jsx
// =====================================
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const STORAGE_KEY = "volunteer_training_completed_v1";

const TRAINING = [
  {
    slug: "basics",
    title: "พื้นฐานการรับเคส",
    desc: "เข้าใจขั้นตอนตั้งแต่รับงาน → ไปหน้างาน → อัปเดตสถานะ",
    icon: "clipboard-outline",
    minutes: 5,
  },
  {
    slug: "safety",
    title: "ความปลอดภัยหน้างาน",
    desc: "ประเมินความเสี่ยง และวิธีรับมือสถานการณ์ไม่คาดคิด",
    icon: "shield-checkmark-outline",
    minutes: 6,
  },
  {
    slug: "approach",
    title: "การเข้าหาสัตว์อย่างถูกวิธี",
    desc: "ลดการตื่นกลัวของสัตว์ และป้องกันการกัด/ข่วน",
    icon: "paw-outline",
    minutes: 7,
  },
  {
    slug: "report",
    title: "การสื่อสารและรายงาน",
    desc: "ถ่ายรูปหลักฐาน, บันทึกข้อมูล, สรุปเคสให้ชัดเจน",
    icon: "chatbubble-ellipses-outline",
    minutes: 4,
  },
];

export default function VolunteerTraining() {
  const router = useRouter();
  const [completed, setCompleted] = useState({}); // { [slug]: true }

  const loadCompleted = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      setCompleted(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setCompleted({});
    }
  }, []);

  // ✅ ชัวร์: เรียกทุกครั้งที่กลับมาหน้านี้
  useFocusEffect(
    useCallback(() => {
      loadCompleted();
    }, [loadCompleted]),
  );

  const total = TRAINING.length;
  const doneCount = useMemo(
    () => TRAINING.filter((t) => completed[t.slug]).length,
    [completed],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>อบรม</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Progress Card */}
        <View style={styles.topCard}>
          <View style={styles.topIcon}>
            <Ionicons name="school-outline" size={18} color="#7c3aed" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>อบรมแบบอ่าน</Text>
            <Text style={styles.topSub} numberOfLines={2}>
              อ่านแล้วกด “อ่านจบแล้ว” เพื่อเก็บสถานะในเครื่อง
            </Text>

            <View style={styles.progressRow}>
              <View style={styles.progressPill}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color="#22c55e"
                />
                <Text style={styles.progressText}>
                  อ่านแล้ว {doneCount}/{total} บท
                </Text>
              </View>
            </View>
          </View>
        </View>

        {TRAINING.map((c) => {
          const isDone = !!completed[c.slug];
          return (
            <Pressable
              key={c.slug}
              style={styles.courseCard}
              onPress={() => router.push(`/volunteer/training/${c.slug}`)}
            >
              <View
                style={[
                  styles.courseIcon,
                  { backgroundColor: isDone ? "#dcfce7" : "#f3e8ff" },
                ]}
              >
                <Ionicons
                  name={isDone ? "checkmark-done-outline" : c.icon}
                  size={18}
                  color={isDone ? "#16a34a" : "#7c3aed"}
                />
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.courseTitle}>{c.title}</Text>

                  {isDone ? (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>อ่านแล้ว</Text>
                    </View>
                  ) : (
                    <View style={styles.todoBadge}>
                      <Text style={styles.todoBadgeText}>ยังไม่อ่าน</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.courseDesc} numberOfLines={2}>
                  {c.desc}
                </Text>

                <Text style={styles.courseMeta}>{c.minutes} นาที</Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          );
        })}

        <View style={styles.hint}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#64748b"
          />
          <Text style={styles.hintText}>
            * สถานะ “อ่านแล้ว” เก็บในเครื่อง (AsyncStorage) เหมาะสำหรับโปรเจคจบ
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

  progressRow: { marginTop: 10 },
  progressPill: {
    alignSelf: "flex-start",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressText: { fontSize: 11, fontWeight: "800", color: "#0f172a" },

  courseCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  courseIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  courseTitle: { flex: 1, fontSize: 13, fontWeight: "900", color: "#0f172a" },

  doneBadge: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  doneBadgeText: { fontSize: 10, fontWeight: "900", color: "#16a34a" },

  todoBadge: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  todoBadgeText: { fontSize: 10, fontWeight: "900", color: "#d97706" },

  courseDesc: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 4,
  },
  courseMeta: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7c3aed",
    marginTop: 6,
  },

  hint: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 12,
  },
  hintText: { flex: 1, fontSize: 11, fontWeight: "600", color: "#64748b" },
});
