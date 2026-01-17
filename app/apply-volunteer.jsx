import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
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
import { createClerkSupabaseClient } from "../config/supabaseClient";
import Colors from "../constants/Colors";

export default function ApplyVolunteer() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [motivation, setMotivation] = useState("");
  const [availability, setAvailability] = useState("");
  const [experience, setExperience] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    const m = motivation.trim().length >= 20;
    const p = phone.trim().length >= 9;
    return m && p && !submitting;
  }, [motivation, phone, submitting]);

  const submit = async () => {
    if (!user) return;

    const reason = motivation.trim();
    const p = phone.trim();

    if (reason.length < 20) {
      Alert.alert("กรอกข้อมูลไม่ครบ", "กรุณาเขียนเหตุผลอย่างน้อย 20 ตัวอักษร");
      return;
    }
    if (p.length < 9) {
      Alert.alert("เบอร์ติดต่อไม่ถูกต้อง", "กรุณากรอกเบอร์ติดต่อให้ถูกต้อง");
      return;
    }

    try {
      setSubmitting(true);

      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data: userData, error: userErr } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_id", user.id)
        .single();

      if (userErr || !userData?.id) {
        console.log("❌ ไม่พบข้อมูล user ใน Supabase:", userErr);
        Alert.alert("ข้อผิดพลาด", "ไม่พบข้อมูลผู้ใช้ในระบบ");
        return;
      }

      const userId = userData.id;

      const { data: existing, error: existErr } = await supabase
        .from("volunteer_requests")
        .select("id,status,created_at")
        .eq("requester_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existErr) {
        console.log("❌ check existing request error:", existErr);
      }

      if (existing?.id) {
        Alert.alert("ส่งคำขอแล้ว", "คุณมีคำขอสมัครอาสาที่กำลังรออนุมัติอยู่");
        return;
      }

      const { error: reqErr } = await supabase
        .from("volunteer_requests")
        .insert({
          user_id: userId,
          requester_id: user.id,
          phone: p,
          area: area.trim() || null,
          reason,
          motivation: reason,
          availability: availability.trim() || null,
          experience: experience.trim() || null,
          status: "pending",
        });

      if (reqErr) {
        console.log("❌ INSERT volunteer_requests error:", reqErr);
        throw reqErr;
      }

      console.log("✅ ส่งคำขอสมัครอาสาสำเร็จ");

      Alert.alert("สำเร็จ", "ส่งคำขอสมัครอาสาแล้ว (รออนุมัติ)", [
        { text: "ตกลง", onPress: () => router.back() },
      ]);
    } catch (e) {
      console.log("❌ submit volunteer error:", e);
      Alert.alert("ผิดพลาด", e?.message || "ไม่สามารถส่งใบสมัครได้");
    } finally {
      setSubmitting(false);
    }
  };

  const motivationCount = motivation.trim().length;
  const phoneCount = phone.trim().length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with gradient effect */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <View style={styles.iconCircle}>
              <Ionicons name="heart" size={32} color={Colors.PURPLE} />
            </View>
            <Text style={styles.title}>สมัครอาสาสมัคร</Text>
            <Text style={styles.subtitle}>
              ร่วมเป็นส่วนหนึ่งในการช่วยเหลือสัตว์ที่ต้องการความช่วยเหลือ
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Progress indicator */}
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Ionicons
                  name={
                    motivationCount >= 20
                      ? "checkmark-circle"
                      : "ellipse-outline"
                  }
                  size={20}
                  color={motivationCount >= 20 ? "#10b981" : "#d1d5db"}
                />
                <Text style={styles.progressText}>เหตุผล</Text>
              </View>
              <View style={styles.progressItem}>
                <Ionicons
                  name={
                    phoneCount >= 9 ? "checkmark-circle" : "ellipse-outline"
                  }
                  size={20}
                  color={phoneCount >= 9 ? "#10b981" : "#d1d5db"}
                />
                <Text style={styles.progressText}>เบอร์ติดต่อ</Text>
              </View>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Motivation */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  <Ionicons name="bulb" size={16} color={Colors.PURPLE} />{" "}
                  ทำไมถึงอยากเป็นอาสา?
                </Text>
                <Text style={styles.required}>*</Text>
              </View>
              <TextInput
                value={motivation}
                onChangeText={setMotivation}
                placeholder="แบ่งปันเหตุผลและแรงบันดาลใจของคุณ..."
                placeholderTextColor="#9ca3af"
                multiline
                style={[styles.input, styles.textarea]}
              />
              <View style={styles.characterCount}>
                <Text
                  style={[
                    styles.countText,
                    motivationCount >= 20
                      ? styles.countValid
                      : styles.countInvalid,
                  ]}
                >
                  {motivationCount}/20 ตัวอักษร
                </Text>
              </View>
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  <Ionicons name="call" size={16} color={Colors.PURPLE} />{" "}
                  เบอร์ติดต่อ
                </Text>
                <Text style={styles.required}>*</Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="08xxxxxxxx"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                style={styles.input}
              />
              <Text
                style={[
                  styles.hint,
                  phoneCount >= 9 ? styles.hintValid : undefined,
                ]}
              >
                {phoneCount >= 9 ? "✓ ถูกต้อง" : "กรุณากรอกเบอร์โทรศัพท์"}
              </Text>
            </View>

            {/* Area */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                <Ionicons name="location" size={16} color="#6b7280" />{" "}
                พื้นที่/เขตที่สะดวก
              </Text>
              <TextInput
                value={area}
                onChangeText={setArea}
                placeholder="เช่น บางนา, รังสิต, เมืองเชียงใหม่"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>

            {/* Availability */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                <Ionicons name="time" size={16} color="#6b7280" />{" "}
                ว่างวัน/เวลาไหนบ้าง?
              </Text>
              <TextInput
                value={availability}
                onChangeText={setAvailability}
                placeholder="เช่น เสาร์-อาทิตย์, หลังเลิกงาน, ตามนัด"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>

            {/* Experience */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                <Ionicons name="star" size={16} color="#6b7280" />{" "}
                ประสบการณ์ที่เกี่ยวข้อง
              </Text>
              <TextInput
                value={experience}
                onChangeText={setExperience}
                placeholder="เช่น เคยช่วยให้อาหารสัตว์, เคยดูแลสัตว์ป่วย..."
                placeholderTextColor="#9ca3af"
                multiline
                style={[styles.input, styles.textarea]}
              />
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#3b82f6" />
            <Text style={styles.infoText}>
              หลังส่งใบสมัคร คุณจะได้รับสถานะ "รออนุมัติอาสา"
              และทีมงานจะติดต่อกลับภายใน 3-5 วันทำการ
            </Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            disabled={!canSubmit}
            onPress={submit}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={20} color="#fff" />
                <Text style={styles.submitText}>ส่งใบสมัคร</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },

  // Header
  header: {
    backgroundColor: Colors.PURPLE,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 16,
  },
  headerContent: {
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // Content
  content: {
    marginTop: -20,
    paddingHorizontal: 16,
  },

  // Progress Card
  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  progressItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  // Form Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },

  fieldGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontWeight: "600",
    fontSize: 15,
    color: "#1f2937",
    flex: 1,
  },
  required: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 4,
  },

  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: 12,
  },

  characterCount: {
    alignItems: "flex-end",
    marginTop: 6,
  },
  countText: {
    fontSize: 13,
    fontWeight: "600",
  },
  countValid: {
    color: "#10b981",
  },
  countInvalid: {
    color: "#9ca3af",
  },

  hint: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 6,
  },
  hintValid: {
    color: "#10b981",
    fontWeight: "600",
  },

  // Info Box
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  infoText: {
    flex: 1,
    color: "#1e40af",
    fontSize: 13,
    lineHeight: 18,
  },

  // Submit Button
  submitBtn: {
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtnDisabled: {
    backgroundColor: "#d1d5db",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 17,
  },
});
