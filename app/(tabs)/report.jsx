import { useAuth, useUser } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { File } from "expo-file-system"; // ✅ new filesystem API (SDK 54+)
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
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

const ANIMAL_OPTIONS = ["สุนัข", "แมว"];
const MAX_IMAGES = 8;

// helper: basic Thai phone validation (simple + forgiving)
const normalizePhone = (v) => (v || "").replace(/[^\d+]/g, "");
const isLikelyThaiPhone = (v) => {
  const p = normalizePhone(v);
  if (/^0\d{9}$/.test(p)) return true;
  if (/^\+66\d{9}$/.test(p)) return true;
  return false;
};

// helper: get safe extension
const getSafeExt = (asset) => {
  const uri = asset?.uri || "";
  const rawExt = uri.split(".").pop()?.toLowerCase();
  const mimeExt = asset?.mimeType?.split("/")?.[1]?.toLowerCase();
  const ext = rawExt || mimeExt || "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
};

const getMimeType = (ext) => {
  const e = (ext || "").toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "image/jpeg"; // jpg/jpeg default
};

// ✅ NEW: Read bytes using expo-file-system File API (no readAsStringAsync)
const readFileAsBytes = async (uri) => {
  const file = new File(uri);
  const bytes = await file.bytes(); // Uint8Array
  return bytes;
};

// ✅ Upload single image with retry (NO blob/fetch(uri), NO readAsStringAsync)
const uploadImageWithRetry = async (
  supabase,
  img,
  fileName,
  maxRetries = 3,
) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `📤 Uploading ${fileName} (attempt ${attempt}/${maxRetries})`,
      );

      const safeExt = getSafeExt(img);
      const contentType = getMimeType(safeExt);

      // ✅ Read bytes via File API
      const bytes = await readFileAsBytes(img.uri);

      // ✅ Check file size (max 5MB)
      if (bytes.byteLength > 5 * 1024 * 1024) {
        throw new Error("ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่า");
      }

      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(fileName, bytes, {
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-images").getPublicUrl(fileName);

      console.log(`✅ Uploaded ${fileName}`);
      return publicUrl;
    } catch (error) {
      lastError = error;
      console.log(
        `❌ Upload attempt ${attempt} failed:`,
        error?.message || error,
      );

      // wait before retry
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
};

export default function Report() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [animalType, setAnimalType] = useState("");
  const [detail, setDetail] = useState("");

  const [contactPhone, setContactPhone] = useState("");
  const [placeText, setPlaceText] = useState("");

  const [images, setImages] = useState([]); // ImagePickerAsset[]
  const [location, setLocation] = useState(null);

  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(null);

  const gpsReady = !!location && !locating;

  const composedDetail = useMemo(() => {
    const phone = contactPhone.trim();
    const base = `เบอร์ติดต่อ: ${phone || "-"}`;
    if (!detail.trim()) return base;
    return `${base}\nรายละเอียด: ${detail.trim()}`;
  }, [contactPhone, detail]);

  const openAppSettings = () => {
    if (Platform.OS === "ios") Linking.openURL("app-settings:");
    else Linking.openSettings();
  };

  // ✅ Get location on mount + reverse geocode
  useEffect(() => {
    (async () => {
      try {
        setLocating(true);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "ไม่สามารถเข้าถึงตำแหน่งได้",
            "กรุณาเปิดการเข้าถึง GPS ในการตั้งค่า",
            [
              { text: "ยกเลิก", style: "cancel" },
              { text: "ไปที่การตั้งค่า", onPress: openAppSettings },
            ],
          );
          setLocating(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);

        try {
          const places = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          const p = places?.[0];
          const readable = p
            ? `${p.name || ""} ${p.street || ""} ${p.subdistrict || ""} ${
                p.district || ""
              } ${p.city || ""} ${p.region || ""} ${p.postalCode || ""}`
                .replace(/\s+/g, " ")
                .trim()
            : "";
          setPlaceText(readable);
        } catch {
          setPlaceText("");
        }

        setLocating(false);
      } catch (e) {
        console.error("❌ Location error:", e);
        setLocating(false);
        setLocation(null);
      }
    })();
  }, []);

  // ✅ Pick images from library (multiple)
  const pickImages = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "ไม่สามารถเข้าถึงรูปภาพได้",
          "กรุณาอนุญาตการเข้าถึงรูปภาพในการตั้งค่า",
          [
            { text: "ยกเลิก", style: "cancel" },
            { text: "ไปที่การตั้งค่า", onPress: openAppSettings },
          ],
        );
        return;
      }

      const remaining = Math.max(0, MAX_IMAGES - images.length);
      if (remaining === 0) {
        Alert.alert("เพิ่มรูปไม่ได้แล้ว", `เพิ่มได้สูงสุด ${MAX_IMAGES} รูป`);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.7,
      });

      if (!result.canceled) {
        const picked = result.assets || [];
        if (picked.length > 0) {
          setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
        }
      }
    } catch (e) {
      console.error("❌ pickImages error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถเลือกรูปภาพได้");
    }
  };

  // ✅ Take photo (append one)
  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "ไม่สามารถเข้าถึงกล้องได้",
          "กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่า",
          [
            { text: "ยกเลิก", style: "cancel" },
            { text: "ไปที่การตั้งค่า", onPress: openAppSettings },
          ],
        );
        return;
      }

      if (images.length >= MAX_IMAGES) {
        Alert.alert("เพิ่มรูปไม่ได้แล้ว", `เพิ่มได้สูงสุด ${MAX_IMAGES} รูป`);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        const shot = result.assets?.[0];
        if (shot) setImages((prev) => [...prev, shot].slice(0, MAX_IMAGES));
      }
    } catch (e) {
      console.error("❌ takePhoto error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถถ่ายรูปได้");
    }
  };

  const deleteImageAt = (idx) => {
    Alert.alert("ลบรูปภาพ", "คุณต้องการลบรูปนี้ใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: () => setImages((prev) => prev.filter((_, i) => i !== idx)),
      },
    ]);
  };

  const clearAllImages = () => {
    Alert.alert("ลบรูปทั้งหมด", "คุณต้องการลบรูปทั้งหมดใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      { text: "ลบทั้งหมด", style: "destructive", onPress: () => setImages([]) },
    ]);
  };

  const chooseImageSource = () => {
    Alert.alert("เพิ่มรูปภาพ", "เลือกวิธีเพิ่มรูป", [
      { text: "ยกเลิก", style: "cancel" },
      { text: "📸 ถ่ายรูป", onPress: takePhoto },
      { text: "🖼️ เลือกรูปจากเครื่อง", onPress: pickImages },
    ]);
  };

  const handleSubmit = async () => {
    if (!animalType) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาเลือกประเภทสัตว์");
      return;
    }
    if (!images.length) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาเพิ่มรูปภาพอย่างน้อย 1 รูป");
      return;
    }
    if (!gpsReady) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณารอพิกัด GPS");
      return;
    }
    if (!contactPhone.trim()) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณากรอกเบอร์ติดต่อ");
      return;
    }
    if (!isLikelyThaiPhone(contactPhone)) {
      Alert.alert(
        "เบอร์ไม่ถูกต้อง",
        "กรุณากรอกเบอร์ให้ถูกต้อง เช่น 0812345678",
      );
      return;
    }
    if (!user) {
      Alert.alert("ข้อผิดพลาด", "กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    try {
      setLoading(true);
      setUploadProgress("กำลังเตรียมข้อมูล...");

      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      // 1) Upload images sequentially with progress
      const evidenceUrls = [];
      const batchId = Date.now();

      for (let i = 0; i < images.length; i++) {
        setUploadProgress(`กำลังอัพโหลดรูปที่ ${i + 1}/${images.length}...`);

        const img = images[i];
        const safeExt = getSafeExt(img);
        const fileName = `${user.id}-${batchId}-${i}.${safeExt}`;

        const publicUrl = await uploadImageWithRetry(
          supabase,
          img,
          fileName,
          3,
        );
        evidenceUrls.push(publicUrl);
      }

      const mainImageUrl = evidenceUrls[0];

      // 2) Insert into reports
      setUploadProgress("กำลังบันทึกข้อมูล...");

      const { error: reportError } = await supabase.from("reports").insert({
        user_id: user.id,
        animal_type: animalType,
        location: placeText || "ไม่ทราบชื่อสถานที่",
        detail: composedDetail,
        image_url: mainImageUrl,
        evidence_urls: evidenceUrls,
        latitude: location.latitude,
        longitude: location.longitude,
        status: "pending",
      });

      if (reportError) throw reportError;

      // 3) Notify volunteers
      setUploadProgress("กำลังแจ้งเตือนอาสาสมัคร...");

      const { data: volunteers, error: volError } = await supabase
        .from("users")
        .select("id")
        .eq("role", "volunteer");

      if (volError) console.error("❌ Error fetching volunteers:", volError);

      if (volunteers?.length > 0) {
        const notifications = volunteers.map((v) => ({
          user_id: v.id,
          title: "มีเคสใหม่ 🐾",
          description: `พบ${animalType}: ${detail.trim() || "ต้องการความช่วยเหลือ"}`,
          type: "urgent",
          unread: true,
        }));

        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifications);

        if (notifError)
          console.error("❌ Error inserting notifications:", notifError);
      }

      Alert.alert("สำเร็จ", "แจ้งเหตุเรียบร้อย อาสาสมัครกำลังรับทราบ ❤️");

      // reset form (keep GPS)
      setAnimalType("");
      setDetail("");
      setContactPhone("");
      setImages([]);
    } catch (err) {
      console.error("❌ Submit error raw:", err);
      console.error("❌ Submit error json:", JSON.stringify(err, null, 2));

      Alert.alert(
        "เกิดข้อผิดพลาด",
        err?.message || "ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  if (!isLoaded) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={{ marginTop: 10, color: "#6b7280" }}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={{ color: "#6b7280" }}>กรุณาเข้าสู่ระบบ</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>แจ้งขอความช่วยเหลือ</Text>
        <Text style={styles.headerSubtitle}>
          ระบุรายละเอียดเพื่อให้ความช่วยเหลือรวดเร็วขึ้น
        </Text>

        {/* Images Card */}
        <View style={styles.card}>
          <View style={styles.imagesHeaderRow}>
            <Text style={styles.sectionLabel}>
              รูปภาพประกอบ (อย่างน้อย 1 รูป)
            </Text>

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Text style={styles.countText}>
                {images.length}/{MAX_IMAGES} รูป
              </Text>
              {images.length > 0 && (
                <Pressable onPress={clearAllImages} hitSlop={10}>
                  <Text style={styles.clearAllText}>ลบทั้งหมด</Text>
                </Pressable>
              )}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            <Pressable style={styles.addCard} onPress={chooseImageSource}>
              <View style={styles.cameraCircle}>
                <Ionicons name="camera" size={26} color="#fff" />
              </View>
              <Text style={styles.addCardText}>เพิ่มรูป</Text>
              <Text style={styles.addCardSubText}>ถ่าย/เลือกหลายรูป</Text>
            </Pressable>

            {images.map((img, idx) => (
              <View key={`${img.uri}-${idx}`} style={styles.imageCard}>
                <Image source={{ uri: img.uri }} style={styles.cardImage} />

                <Pressable
                  style={styles.deleteBadge}
                  onPress={() => deleteImageAt(idx)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>

                {idx === 0 && (
                  <View style={styles.mainBadge}>
                    <Text style={styles.mainBadgeText}>รูปหลัก</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {images.length === 0 && (
            <Text style={styles.hintText}>
              กด "เพิ่มรูป" เพื่อถ่ายรูปหรือเลือกรูปจากคลัง (เลือกได้หลายรูป)
            </Text>
          )}
        </View>

        {/* Animal type Card */}
        <View style={styles.card}>
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
        </View>

        {/* Contact Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>เบอร์ติดต่อ</Text>
          <TextInput
            placeholder="เช่น 0812345678"
            style={styles.input}
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Detail Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>รายละเอียด (ถ้ามี)</Text>
          <TextInput
            placeholder="ระบุอาการบาดเจ็บ หรือจุดสังเกต..."
            style={[styles.input, styles.textArea]}
            multiline
            value={detail}
            onChangeText={setDetail}
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Location Card */}
        <View style={[styles.card, styles.locationCard]}>
          <View style={styles.locationRow}>
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
                  ระบุตำแหน่งสำเร็จ ✅
                </Text>

                {!!placeText && (
                  <Text style={styles.placeText} numberOfLines={2}>
                    {placeText}
                  </Text>
                )}

                <View style={styles.mapRow}>
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`,
                      )
                    }
                    style={styles.mapLink}
                  >
                    <Text style={styles.mapLinkText}>เช็คตำแหน่งบนแผนที่</Text>
                  </Pressable>

                  <Text style={styles.coordsText}>
                    {location.latitude.toFixed(5)},{" "}
                    {location.longitude.toFixed(5)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={[styles.locationText, { color: "#b91c1c" }]}>
                  เข้าถึงพิกัดไม่ได้
                </Text>
                <Pressable onPress={openAppSettings} style={{ marginLeft: 8 }}>
                  <Text style={styles.mapLinkText}>ไปที่การตั้งค่า</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Upload Progress */}
        {uploadProgress && (
          <View style={styles.progressCard}>
            <ActivityIndicator color="#ef4444" size="small" />
            <Text style={styles.progressText}>{uploadProgress}</Text>
          </View>
        )}

        {/* Submit */}
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

        <Text style={styles.footerHint}>
          ข้อมูลของคุณจะถูกส่งให้อาสาสมัครใกล้เคียงเพื่อช่วยเหลืออย่างรวดเร็ว
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    backgroundColor: "#f8fafc",
    paddingTop: 56,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerTitle: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 18,
    marginTop: 6,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },

  imagesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  countText: { color: "#64748b", fontWeight: "800", fontSize: 13 },
  clearAllText: {
    color: "#ef4444",
    fontWeight: "900",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  hScroll: { gap: 12, paddingVertical: 4 },

  addCard: {
    width: 150,
    height: 180,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  addCardText: {
    marginTop: 10,
    color: "#111827",
    fontWeight: "900",
    fontSize: 15,
  },
  addCardSubText: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
  },

  imageCard: {
    width: 150,
    height: 180,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardImage: { width: "100%", height: "100%" },

  deleteBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(239, 68, 68, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  mainBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  mainBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  hintText: { marginTop: 10, color: "#64748b", fontSize: 13, lineHeight: 18 },

  cameraCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },

  chipGroup: { flexDirection: "row", gap: 10 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#ef4444", borderColor: "#ef4444" },
  chipText: { color: "#334155", fontWeight: "800" },
  chipTextActive: { color: "#fff" },

  input: {
    backgroundColor: "#f8fafc",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 16,
    color: "#0f172a",
  },
  textArea: { height: 120, textAlignVertical: "top" },

  locationCard: { paddingBottom: 12 },
  locationRow: { flexDirection: "row", alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center" },
  locationText: { marginLeft: 8, fontWeight: "900", fontSize: 14 },
  placeText: {
    marginLeft: 8,
    marginTop: 4,
    color: "#065f46",
    fontSize: 12,
    lineHeight: 16,
  },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginLeft: 8,
    justifyContent: "space-between",
  },
  mapLink: { paddingRight: 10 },
  mapLinkText: {
    color: "#2563eb",
    fontSize: 12,
    textDecorationLine: "underline",
    fontWeight: "900",
  },
  coordsText: { color: "#64748b", fontSize: 11, fontWeight: "800" },

  progressCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  progressText: {
    color: "#991b1b",
    fontWeight: "800",
    fontSize: 14,
  },

  button: {
    backgroundColor: "#ef4444",
    height: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ef4444",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    marginTop: 4,
  },
  buttonDisabled: {
    backgroundColor: "#fecaca",
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 18 },

  footerHint: {
    marginTop: 10,
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 10,
  },
});
