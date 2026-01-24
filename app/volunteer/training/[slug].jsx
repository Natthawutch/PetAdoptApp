// ============================================
// FILE 2) app/volunteer/training/[slug].jsx
// ============================================
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

const STORAGE_KEY = "volunteer_training_completed_v1";

const COURSE_MAP = {
  basics: {
    title: "พื้นฐานการรับเคส",
    minutes: 5,
    icon: "clipboard-outline",
    objective: "รู้ขั้นตอนรับเคส-ไปหน้างาน-อัปเดตสถานะ-สรุปรายงาน",
    sections: [
      {
        heading: "ขั้นตอนมาตรฐาน",
        bullets: [
          "อ่านรายละเอียดเคสให้ครบ: สถานที่, ประเภทสัตว์, อาการ, รูปประกอบ",
          "กดยืนยันรับงาน/เริ่มงาน และแจ้งเวลาประเมินถึงหน้างาน",
          "ถึงหน้างาน: ถ่ายรูปหลักฐานก่อนเริ่ม + ประเมินสภาพแวดล้อม",
          "ระหว่างทำ: อัปเดตสถานะ และบันทึกสิ่งที่ทำ",
          "เสร็จแล้ว: สรุปผล + แนบรูปหลังช่วยเหลือ + ปิดเคส",
        ],
      },
      {
        heading: "ข้อมูลที่ควรเก็บในรายงาน",
        bullets: [
          "เวลาเริ่ม-จบงาน",
          "ตำแหน่ง/จุดสังเกต",
          "อาการ/พฤติกรรมสัตว์ก่อนและหลัง",
          "สิ่งที่ทำไปแล้ว และสิ่งที่ต้องติดตามต่อ",
        ],
      },
    ],
    caution: [
      "ถ้าไม่มั่นใจความปลอดภัย ให้ถอยและขอความช่วยเหลือ",
      "อย่าดำเนินการเกินขอบเขตหากไม่ได้รับมอบหมาย",
    ],
  },

  safety: {
    title: "ความปลอดภัยหน้างาน",
    minutes: 6,
    icon: "shield-checkmark-outline",
    objective: "ลดความเสี่ยงของอาสาและสัตว์ ก่อน-ระหว่าง-หลังปฏิบัติงาน",
    sections: [
      {
        heading: "เช็คลิสต์ก่อนเข้าพื้นที่",
        bullets: [
          "ประเมินความเสี่ยง: รถเยอะไหม, คนพลุกพล่านไหม, ทางหนีทีไล่",
          "สวมถุงมือ/หน้ากากเมื่อจำเป็น และพกแอลกอฮอล์ล้างมือ",
          "เตรียมไฟฉาย/โทรศัพท์ให้พร้อม แบตสำรองถ้ามี",
        ],
      },
      {
        heading: "ระหว่างปฏิบัติงาน",
        bullets: [
          "เว้นระยะจากสัตว์ที่ก้าวร้าว/ตื่นกลัว อย่าฝืนเข้าใกล้",
          "อย่าทำงานคนเดียวถ้าสถานการณ์เสี่ยง",
          "ล้างมือทุกครั้งหลังสัมผัส และหลีกเลี่ยงสารคัดหลั่ง",
        ],
      },
      {
        heading: "หลังเสร็จงาน",
        bullets: [
          "ทำความสะอาด/ฆ่าเชื้ออุปกรณ์ที่ใช้",
          "ถ้ามีบาดแผลกัด/ข่วน ให้ล้างแผลและพบแพทย์ตามเหมาะสม",
          "บันทึกเหตุการณ์ผิดปกติและแจ้งทีม",
        ],
      },
    ],
    caution: [
      "ถ้าสัตว์ดุ/เสี่ยงกัด อย่าพยายามจับด้วยมือเปล่า",
      "ความปลอดภัยของอาสาสำคัญที่สุด — ถอยก่อนเสมอถ้าไม่ชัวร์",
    ],
  },

  approach: {
    title: "การเข้าหาสัตว์อย่างถูกวิธี",
    minutes: 7,
    icon: "paw-outline",
    objective:
      "เข้าหาสัตว์อย่างปลอดภัย ลดความตื่นกลัว และเพิ่มโอกาสช่วยเหลือสำเร็จ",
    sections: [
      {
        heading: "หลักการเข้าหา",
        bullets: [
          "เดินช้าๆ ไม่จ้องตานาน ไม่ส่งเสียงดัง",
          "หันตัวเฉียงเล็กน้อย ลดความกดดันต่อสัตว์",
          "ถ้าปลอดภัย ใช้ของล่อเล็กน้อย (อาหาร/ขนม) เพื่อให้สัตว์สงบ",
        ],
      },
      {
        heading: "การเคลื่อนย้าย",
        bullets: [
          "ใช้กรง/กระเป๋าใส่สัตว์ให้เหมาะกับขนาดและชนิด",
          "ใช้ผ้าคลุมช่วยให้สัตว์สงบเมื่อต้องจับ/ย้าย",
          "ตรวจล็อคประตูกรงและระบายอากาศให้ดี",
        ],
      },
      {
        heading: "สัญญาณเตือนที่ควรถอย",
        bullets: [
          "ขู่, ฟ่อ, หูพับ, ขนตั้ง, ตัวเกร็ง, กัดอากาศ",
          "พยายามหนีอย่างรุนแรง หรือมีท่าทีจะพุ่งใส่",
        ],
      },
    ],
    caution: [
      "อย่าฝืนจับสัตว์ที่ตื่นกลัวมาก — เสี่ยงกัด/ข่วน",
      "หากไม่แน่ใจวิธีจับ ให้ขอคำแนะนำจากทีมก่อน",
    ],
  },

  report: {
    title: "การสื่อสารและรายงาน",
    minutes: 4,
    icon: "chatbubble-ellipses-outline",
    objective:
      "รายงานให้ทีมเข้าใจเร็ว ติดตามเคสต่อได้ง่าย และตรวจสอบย้อนหลังได้",
    sections: [
      {
        heading: "ควรรายงานอะไรบ้าง",
        bullets: [
          "ก่อนเริ่ม: รูปหน้างาน + สภาพสัตว์ + จุดสังเกต",
          "ระหว่างทำ: สิ่งที่ดำเนินการ + ปัญหาที่พบ",
          "หลังเสร็จ: รูปหลังช่วยเหลือ + สรุปผล + สิ่งที่ต้องติดตาม",
        ],
      },
      {
        heading: "หลักการสื่อสาร",
        bullets: [
          "สั้น-ชัด-ครบ: ใคร/ทำอะไร/ที่ไหน/เมื่อไหร่/ผลเป็นยังไง",
          "หลีกเลี่ยงคำกำกวม เช่น “โอเคแล้ว” → ระบุว่าดีขึ้นอย่างไร",
          "แนบรูป/ข้อมูลประกอบทุกครั้งถ้าเป็นไปได้",
        ],
      },
    ],
    caution: [
      "หากมีเหตุผิดปกติ ให้แจ้งทันที ไม่ต้องรอปิดเคส",
      "อย่าลงข้อมูลส่วนบุคคลของผู้อื่นในรายงานโดยไม่จำเป็น",
    ],
  },
};

export default function TrainingDetail() {
  const router = useRouter();
  const { slug } = useLocalSearchParams();

  const key = useMemo(() => (Array.isArray(slug) ? slug[0] : slug), [slug]);
  const course = COURSE_MAP[key];

  const [saving, setSaving] = useState(false);

  const markCompleted = async () => {
    try {
      setSaving(true);
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const base = raw ? JSON.parse(raw) : {};
      const next = { ...(base && typeof base === "object" ? base : {}) };
      next[key] = true;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      Alert.alert("บันทึกแล้ว", "ทำเครื่องหมายว่าอ่านจบแล้ว ✅");
      router.back();
    } catch {
      Alert.alert("ผิดพลาด", "บันทึกสถานะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!course) {
    return (
      <View style={[styles2.container, styles2.center]}>
        <Ionicons name="alert-circle-outline" size={28} color="#7c3aed" />
        <Text style={styles2.notFoundTitle}>ไม่พบบทเรียนนี้</Text>
        <Pressable onPress={() => router.back()} style={styles2.primaryBtn}>
          <Text style={styles2.primaryBtnText}>ย้อนกลับ</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles2.container}>
      {/* Header */}
      <View style={styles2.header}>
        <Pressable onPress={() => router.back()} style={styles2.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles2.headerTitle}>อบรม</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles2.content}
      >
        {/* Hero */}
        <View style={styles2.heroCard}>
          <View style={styles2.heroIcon}>
            <Ionicons name={course.icon} size={18} color="#7c3aed" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles2.courseTitle}>{course.title}</Text>
            <Text style={styles2.courseMeta}>{course.minutes} นาที</Text>
          </View>
        </View>

        {/* Objective */}
        <View style={styles2.sectionCard}>
          <Text style={styles2.sectionTitle}>เป้าหมาย</Text>
          <Text style={styles2.paragraph}>{course.objective}</Text>
        </View>

        {/* Sections */}
        {course.sections.map((sec) => (
          <View key={sec.heading} style={styles2.sectionCard}>
            <Text style={styles2.sectionTitle}>{sec.heading}</Text>
            {sec.bullets.map((t, i) => (
              <View key={i} style={styles2.row}>
                <Ionicons name="checkmark" size={16} color="#22c55e" />
                <Text style={styles2.rowText}>{t}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Caution */}
        <View style={styles2.cautionCard}>
          <View style={styles2.cautionHeader}>
            <Ionicons name="alert-circle-outline" size={18} color="#d97706" />
            <Text style={styles2.cautionTitle}>ข้อควรระวัง</Text>
          </View>
          {course.caution.map((t, i) => (
            <View key={i} style={styles2.row}>
              <Ionicons name="remove" size={18} color="#d97706" />
              <Text style={styles2.rowText}>{t}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles2.primaryBtn, saving && { opacity: 0.7 }]}
          disabled={saving}
          onPress={markCompleted}
        >
          <Text style={styles2.primaryBtnText}>
            {saving ? "กำลังบันทึก..." : "อ่านจบแล้ว"}
          </Text>
        </Pressable>

        <Text style={styles2.note}>
          * สถานะถูกเก็บในเครื่อง (AsyncStorage) เหมาะสำหรับโปรเจคจบ
        </Text>
      </ScrollView>
    </View>
  );
}

const styles2 = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { justifyContent: "center", alignItems: "center" },

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

  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#f3e8ff",
    alignItems: "center",
    justifyContent: "center",
  },
  courseTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  courseMeta: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7c3aed",
    marginTop: 4,
  },

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 14,
    marginTop: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  paragraph: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 18,
  },

  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 10,
  },
  rowText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 18,
  },

  cautionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 14,
    marginTop: 12,
  },
  cautionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cautionTitle: { fontSize: 13, fontWeight: "900", color: "#92400e" },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#7c3aed",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  note: { marginTop: 10, fontSize: 11, fontWeight: "600", color: "#64748b" },

  notFoundTitle: { marginTop: 10, fontWeight: "800", color: "#0f172a" },
});
