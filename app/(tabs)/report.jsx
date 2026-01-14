import { useAuth, useUser } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

const ANIMAL_OPTIONS = ["สุนัข", "แมว", "อื่นๆ"];

export default function Report() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [animalType, setAnimalType] = useState("");
  const [detail, setDetail] = useState("");
  const [image, setImage] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);

  // ดึงตำแหน่งปัจจุบันเมื่อเปิดหน้า
  useEffect(() => {
    (async () => {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "ไม่สามารถเข้าถึงตำแหน่งได้",
          "กรุณาเปิดการเข้าถึง GPS ในการตั้งค่า"
        );
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setLocating(false);
    })();
  }, []);

  // เลือกรูปภาพ
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
    }
  };

  // ฟังก์ชันส่งข้อมูลทั้งหมด
  const handleSubmit = async () => {
    if (!animalType || !image || !location) {
      Alert.alert(
        "ข้อมูลไม่ครบ",
        "กรุณาเลือกประเภทสัตว์ ถ่ายรูป และรอพิกัด GPS"
      );
      return;
    }

    try {
      setLoading(true);
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // 1. อัปโหลดรูปภาพไปยัง Supabase Storage
      const fileExt = image.uri.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append("file", {
        uri: image.uri,
        name: fileName,
        type: `image/${fileExt}`,
      });

      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(fileName, formData, { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-images").getPublicUrl(fileName);

      // 2. บันทึกรายงานลงตาราง reports
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .insert({
          user_id: user.id,
          animal_type: animalType,
          location: "ตำแหน่งจาก GPS",
          detail: detail,
          image_url: publicUrl,
          latitude: location.latitude,
          longitude: location.longitude,
          status: "pending",
        })
        .select()
        .single();

      if (reportError) throw reportError;

      // 3. แจ้งเตือนอาสาสมัคร (Notifications)
      const { data: volunteers } = await supabase
        .from("users")
        .select("clerk_id")
        .eq("role", "volunteer");

      if (volunteers?.length > 0) {
        const notifications = volunteers.map((v) => ({
          user_id: v.clerk_id,
          title: "มีเคสใหม่ 🐾",
          description: `พบ${animalType}: ${detail || "ต้องการความช่วยเหลือ"}`,
          type: "urgent",
        }));

        await supabase.from("notifications").insert(notifications);
      }

      Alert.alert("สำเร็จ", "แจ้งเหตุเรียบร้อย อาสาสมัครกำลังรับทราบ ❤️");

      // ล้างข้อมูลหลังส่งเสร็จ
      setAnimalType("");
      setDetail("");
      setImage(null);
    } catch (err) {
      console.error(err);
      Alert.alert("เกิดข้อผิดพลาด", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>แจ้งช่วยเหลือสัตว์</Text>
        <Text style={styles.headerSubtitle}>
          ระบุรายละเอียดเพื่อให้ความช่วยเหลือรวดเร็วขึ้น
        </Text>

        {/* ส่วนรูปภาพ */}
        <Pressable
          style={[styles.imageBox, image && styles.imageBoxActive]}
          onPress={pickImage}
        >
          {image ? (
            <Image source={{ uri: image.uri }} style={styles.image} />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <View style={styles.cameraCircle}>
                <Ionicons name="camera" size={32} color="#fff" />
              </View>
              <Text style={styles.uploadText}>กดเพื่อเลือกรูปภาพ</Text>
            </View>
          )}
        </Pressable>

        {/* ส่วนประเภทสัตว์ */}
        <Text style={styles.sectionLabel}>ประเภทสัตว์</Text>
        <View style={styles.chipGroup}>
          {ANIMAL_OPTIONS.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, animalType === type && styles.chipActive]}
              onPress={() => setAnimalType(type)}
            >
              <Text
                style={[
                  styles.chipText,
                  animalType === type && styles.chipTextActive,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ส่วนรายละเอียด */}
        <Text style={styles.sectionLabel}>รายละเอียดเพิ่มเติม</Text>
        <TextInput
          placeholder="ระบุอาการบาดเจ็บ หรือจุดสังเกต..."
          style={[styles.input, styles.textArea]}
          multiline
          value={detail}
          onChangeText={setDetail}
          placeholderTextColor="#9ca3af"
        />

        {/* ส่วนแสดงตำแหน่ง */}
        <View style={styles.locationContainer}>
          <Ionicons
            name="location"
            size={20}
            color={location ? "#10b981" : "#ef4444"}
          />
          {locating ? (
            <View style={styles.row}>
              <Text style={[styles.locationText, { color: "#6b7280" }]}>
                กำลังค้นหาตำแหน่ง...
              </Text>
              <ActivityIndicator
                size="small"
                color="#6b7280"
                style={{ marginLeft: 8 }}
              />
            </View>
          ) : location ? (
            <View style={{ flex: 1 }}>
              <Text style={[styles.locationText, { color: "#065f46" }]}>
                พิกัด GPS พร้อมแล้ว
              </Text>
              <Pressable
                onPress={() =>
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
                  )
                }
                style={styles.mapLink}
              >
                <Text style={styles.mapLinkText}>เช็คตำแหน่งบนแผนที่</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.locationText, { color: "#b91c1c" }]}>
              เข้าถึงพิกัดไม่ได้
            </Text>
          )}
        </View>

        {/* ปุ่มส่งข้อมูล */}
        <Pressable
          style={[
            styles.button,
            (loading || locating) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || locating}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.buttonText}>ส่งข้อมูล</Text>
              <Ionicons
                name="send"
                size={18}
                color="#fff"
                style={{ marginLeft: 8 }}
              />
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: "#fff",
    paddingTop: 60,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#1f2937" },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 25,
    marginTop: 4,
  },
  imageBox: {
    height: 220,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    overflow: "hidden",
  },
  imageBoxActive: { borderStyle: "solid", borderColor: "#ef4444" },
  image: { width: "100%", height: "100%" },
  uploadPlaceholder: { alignItems: "center" },
  cameraCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  uploadText: { color: "#6b7280", fontWeight: "600" },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
  },
  chipGroup: { flexDirection: "row", gap: 10, marginBottom: 20 },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chipActive: { backgroundColor: "#ef4444", borderColor: "#ef4444" },
  chipText: { color: "#4b5563", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#f9fafb",
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 20,
    fontSize: 16,
  },
  textArea: { height: 100, textAlignVertical: "top" },
  locationContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    padding: 12,
    borderRadius: 12,
    marginBottom: 25,
  },
  locationText: { marginLeft: 8, fontWeight: "600", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center" },
  mapLink: { marginTop: 4, marginLeft: 8 },
  mapLinkText: {
    color: "#2563eb",
    fontSize: 12,
    textDecorationLine: "underline",
  },
  button: {
    backgroundColor: "#ef4444",
    height: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { backgroundColor: "#fda4af" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 18 },
});
