import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    createClerkSupabaseClient,
    supabase,
} from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

const STEPS = [
  {
    n: 1,
    title: "การสอบถามข้อมูลเบื้องต้น",
    desc: "กรอกข้อมูลเกี่ยวกับครอบครัว ไลฟ์สไตล์ และความพร้อมในการดูแล",
    icon: "chatbubble-ellipses-outline",
  },
  {
    n: 2,
    title: "การสัมภาษณ์",
    desc: "สัมภาษณ์ผ่านวิดีโอคอล เพื่อให้ทีมงานประเมินความเหมาะสม",
    icon: "videocam-outline",
  },
  {
    n: 3,
    title: "การประเมินบ้าน",
    desc: "ตรวจสอบบ้านแบบลงพื้นที่จริงหรือออนไลน์ เพื่อความปลอดภัยของน้อง",
    icon: "home-outline",
  },
  {
    n: 4,
    title: "ข้อตกลงการรับเลี้ยง",
    desc: "ลงนามยืนยันความตั้งใจในการดูแลและรับผิดชอบ",
    icon: "document-text-outline",
  },
  {
    n: 5,
    title: "การจัดเตรียมการเดินทาง",
    desc: "ทีมขนส่งจัดการการเดินทาง นัดรับน้องและเริ่มชีวิตใหม่ด้วยกัน",
    icon: "car-outline",
  },
];

function Required({ label }) {
  return (
    <Text style={styles.label}>
      {label} <Text style={styles.req}>*</Text>
    </Text>
  );
}

function Optional({ label }) {
  return <Text style={styles.label}>{label}</Text>;
}

function Input({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  style,
  maxLength,
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      maxLength={maxLength}
      placeholderTextColor="#9CA3AF"
      style={[styles.input, multiline && styles.textarea, style]}
    />
  );
}

export default function AdoptionRequestForm() {
  const { petId } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);

  // form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeType, setHomeType] = useState("");
  const [family, setFamily] = useState("");
  const [hasPets, setHasPets] = useState("");
  const [experience, setExperience] = useState("");
  const [reason, setReason] = useState("");
  const [readyCosts, setReadyCosts] = useState("");
  const [notes, setNotes] = useState("");

  const isAdopted = useMemo(() => pet?.adoption_status === "adopted", [pet]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("pets")
          .select("*")
          .eq("id", petId)
          .single();
        if (error) throw error;
        setPet(data);
      } catch {
        Alert.alert("ไม่พบข้อมูลสัตว์เลี้ยง");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [petId]);

  useEffect(() => {
    if (!user || !pet) return;
    (async () => {
      try {
        const token = await getToken({ template: "supabase", skipCache: true });
        const supabaseAuth = createClerkSupabaseClient(token);

        const { data } = await supabaseAuth
          .from("adoption_requests")
          .select("id")
          .eq("pet_id", pet.id)
          .eq("requester_id", user.id)
          .maybeSingle();

        setAlreadySent(!!data);
      } catch {
        // ignore
      }
    })();
  }, [user, pet]);

  const validate = () => {
    if (!fullName.trim()) return "กรุณากรอกชื่อ-นามสกุล";
    if (!phone.trim()) return "กรุณากรอกเบอร์โทร";
    if (!homeType.trim()) return "กรุณาระบุประเภทที่พักอาศัย";
    if (!reason.trim()) return "กรุณาระบุเหตุผลในการรับเลี้ยง";
    return null;
  };

  const submit = async () => {
    if (!user) {
      Alert.alert("กรุณาเข้าสู่ระบบ");
      return;
    }
    if (isAdopted) {
      Alert.alert("น้องถูกรับเลี้ยงไปแล้ว 😢");
      return;
    }
    if (alreadySent) {
      Alert.alert("คุณส่งคำขอไปแล้ว", "กรุณารอเจ้าของตอบกลับ");
      return;
    }

    const err = validate();
    if (err) {
      Alert.alert("ข้อมูลไม่ครบ", err);
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabaseAuth = createClerkSupabaseClient(token);

      const { data: currentPet, error: petErr } = await supabaseAuth
        .from("pets")
        .select("adoption_status, user_id")
        .eq("id", pet.id)
        .single();
      if (petErr) throw petErr;

      if (currentPet?.adoption_status === "adopted") {
        Alert.alert("ไม่สามารถส่งคำขอได้", "สัตว์ตัวนี้ถูกรับเลี้ยงไปแล้ว 😢");
        return;
      }

      const payload = {
        fullName,
        phone,
        homeType,
        family,
        hasPets,
        experience,
        reason,
        readyCosts,
        notes,
      };

      const { error } = await supabaseAuth.from("adoption_requests").insert({
        pet_id: pet.id,
        requester_id: user.id,
        status: "pending",
        application_answers: payload,
      });

      if (error) {
        if (error.code === "23505") {
          Alert.alert("คุณส่งคำขอไปแล้ว", "กรุณารอเจ้าของตอบกลับ");
          return;
        }
        throw error;
      }

      Alert.alert("ส่งคำขอรับเลี้ยงสำเร็จ 🐶", "รอเจ้าของสัตว์ตอบกลับ");
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert("ไม่สามารถส่งคำขอได้");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !pet) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
      </View>
    );
  }

  const disableSubmit = submitting || isAdopted || alreadySent;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>ส่งคำขอรับเลี้ยง</Text>
              <Text style={styles.headerSub}>
                สำหรับ:{" "}
                <Text style={{ fontWeight: "900", color: "#111827" }}>
                  {pet?.name || "-"}
                </Text>
              </Text>

              <View
                style={{
                  marginTop: 10,
                  flexDirection: "row",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {isAdopted ? (
                  <Pill icon="paw" text="ถูกรับเลี้ยงแล้ว" tone="danger" />
                ) : alreadySent ? (
                  <Pill
                    icon="checkmark-circle"
                    text="คุณส่งคำขอแล้ว"
                    tone="ok"
                  />
                ) : (
                  <Pill icon="time" text="รอการตอบกลับจากเจ้าของ" tone="warn" />
                )}
                <Pill
                  icon="shield-checkmark"
                  text="ข้อมูลใช้เพื่อการคัดกรอง"
                  tone="info"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>

          {/* Steps */}
          <Text style={styles.h1}>ขั้นตอนการรับเลี้ยง</Text>
          <View style={{ gap: 10 }}>
            {STEPS.map((s) => (
              <View key={s.n} style={styles.stepCard}>
                <View style={styles.stepLeft}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{s.n}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepDesc}>{s.desc}</Text>
                  </View>
                </View>
                <Ionicons name={s.icon} size={18} color="#6B7280" />
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Form */}
          <Text style={styles.h1}>กรอกข้อมูลเบื้องต้น</Text>

          <View style={styles.formCard}>
            <Required label="ชื่อ-นามสกุล" />
            <Input
              value={fullName}
              onChangeText={setFullName}
              placeholder="ชื่อ-นามสกุลผู้ขอ"
            />

            <Required label="เบอร์โทร" />
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="08x-xxx-xxxx"
              keyboardType="phone-pad"
              maxLength={12}
            />

            <Required label="ประเภทที่พักอาศัย" />
            <Input
              value={homeType}
              onChangeText={setHomeType}
              placeholder="บ้าน / คอนโด / ทาวน์โฮม"
            />

            <Optional label="อยู่กับใคร" />
            <Input
              value={family}
              onChangeText={setFamily}
              placeholder="อยู่คนเดียว / คู่ / ครอบครัว"
            />

            <Optional label="มีสัตว์เลี้ยงเดิมไหม" />
            <Input
              value={hasPets}
              onChangeText={setHasPets}
              placeholder="ไม่มี / มี (ระบุชนิด)"
            />

            <Optional label="ประสบการณ์การเลี้ยงสัตว์" />
            <Input
              value={experience}
              onChangeText={setExperience}
              placeholder="เคยเลี้ยงอะไรบ้าง / ไม่เคย"
            />

            <Required label="เหตุผลที่อยากรับเลี้ยง" />
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder="เล่าให้เจ้าของฟังหน่อยว่าทำไมถึงอยากรับเลี้ยง"
              multiline
            />

            <Optional label="ความพร้อมค่าใช้จ่าย/เวลา" />
            <Input
              value={readyCosts}
              onChangeText={setReadyCosts}
              placeholder="เช่น พร้อมค่าอาหาร วัคซีน ดูแลเวลา ฯลฯ"
            />

            <Optional label="ข้อมูลเพิ่มเติม (ถ้ามี)" />
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="อื่น ๆ"
              multiline
            />
          </View>

          {/* space for sticky bottom */}
          <View style={{ height: 110 }} />
        </ScrollView>

        {/* Sticky submit bar */}
        <View style={styles.bottomBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomTitle}>
              {alreadySent
                ? "ส่งคำขอแล้ว"
                : isAdopted
                ? "ถูกรับเลี้ยงแล้ว"
                : "พร้อมส่งคำขอ"}
            </Text>
            <Text style={styles.bottomSub}>
              {disableSubmit
                ? alreadySent
                  ? "คุณส่งคำขอนี้ไปแล้ว"
                  : isAdopted
                  ? "น้องถูกรับเลี้ยงไปแล้ว"
                  : "กำลังส่งคำขอ..."
                : "ตรวจสอบข้อมูลให้ครบก่อนกดยืนยัน"}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, disableSubmit && styles.btnDisabled]}
            disabled={disableSubmit}
            onPress={submit}
            activeOpacity={0.9}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>ยืนยันส่ง</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Pill({ icon, text, tone }) {
  const toneMap = {
    ok: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
    warn: { bg: "#FEF3C7", border: "#FDE68A", text: "#92400E" },
    danger: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
    info: { bg: "#EEF2FF", border: "#C7D2FE", text: "#3730A3" },
  };
  const c = toneMap[tone] || toneMap.info;

  return (
    <View
      style={[styles.pill, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <Ionicons name={icon} size={14} color={c.text} />
      <Text style={[styles.pillText, { color: c.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  page: { padding: 16, paddingBottom: 18 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  headerSub: { marginTop: 4, color: "#6B7280", fontWeight: "700" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  pill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: "800" },

  h1: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    marginTop: 14,
    marginBottom: 10,
  },

  stepCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepLeft: { flexDirection: "row", gap: 12, flex: 1 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { fontWeight: "900", color: "#111827" },
  stepTitle: { fontSize: 14, fontWeight: "900", color: "#111827" },
  stepDesc: { fontSize: 12, color: "#6B7280", marginTop: 3, lineHeight: 18 },

  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 16 },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },

  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  req: { color: "#EF4444" },

  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
  textarea: { minHeight: 96, textAlignVertical: "top" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bottomTitle: { fontSize: 14, fontWeight: "900", color: "#111827" },
  bottomSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },

  btn: {
    backgroundColor: Colors.PURPLE,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 120,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
