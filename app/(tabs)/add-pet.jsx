import { useAuth, useUser } from "@clerk/clerk-expo";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AuthWrapper from "../../components/AuthWrapper";
import {
  createClerkSupabaseClient,
  supabase,
} from "../../config/supabaseClient";

export default function AddNewPetForm() {
  const { user } = useUser();
  const { getToken } = useAuth();

  // ----- Form States (ตรงตาม Database Columns) -----
  const [petName, setPetName] = useState("");
  const [category, setCategory] = useState("สุนัข"); // Default เป็นสุนัข
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [sex, setSex] = useState("ผู้");
  const [address, setAddress] = useState("");
  const [about, setAbout] = useState("");
  const [personality, setPersonality] = useState("");
  const [vaccineHistory, setVaccineHistory] = useState("");
  const [isNeutered, setIsNeutered] = useState("ยังไม่ได้ทำ");
  const [postStatus, setPostStatus] = useState("Available");

  // ----- Media States -----
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });

  
  /* -------------------- Media Picker Logic -------------------- */

  const pickImages = async () => {
    if (images.length >= 5)
      return Alert.alert("จำกัดรูป", "เลือกได้สูงสุด 5 รูป");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - images.length,
      quality: 0.7,
    });
    if (!result.canceled) setImages([...images, ...result.assets]);
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) setVideo(result.assets[0]);
  };

  const uploadFile = async (uri, userId, isVideo = false) => {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const ext = isVideo ? "mp4" : "jpg";
    const bucket = isVideo ? "pets-videos" : "pets-images";
    const path = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: isVideo ? "video/mp4" : "image/jpeg",
      });

    if (error) throw error;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };

  const resetForm = () => {
    setPetName("");
    setCategory("สุนัข");
    setBreed("");
    setAge("");
    setWeight("");
    setSex("ผู้");
    setAddress("");
    setAbout("");
    setPersonality("");
    setVaccineHistory("");
    setIsNeutered("ยังไม่ได้ทำ");
    setPostStatus("Available");

    setImages([]);
    setVideo(null);
  };

  /* -------------------- Submit Logic -------------------- */

  const submitPet = async () => {
    if (!petName || !category || !sex || images.length === 0) {
      return Alert.alert(
        "ข้อมูลไม่ครบ",
        "กรุณาระบุชื่อ ประเภท เพศ และเพิ่มรูปอย่างน้อย 1 รูป"
      );
    }

    setUploading(true);
    try {
      const token = await getToken({ template: "supabase" });
      const supabaseClerk = createClerkSupabaseClient(token);

      // 1. Upload Images
      const imageUrls = await Promise.all(
        images.map((img) => uploadFile(img.uri, user.id, false))
      );

      // 2. Upload Video (if any)
      let videoUrl = video ? await uploadFile(video.uri, user.id, true) : null;

      // 3. Insert into Database
      const { error } = await supabaseClerk.from("pets").insert([
        {
          name: petName,
          category,
          breed,
          age: parseInt(age) || 0,
          weight: parseFloat(weight) || 0,
          sex,
          address,
          about,
          personality,
          vaccine_history: vaccineHistory,
          is_neutered: isNeutered,
          post_status: postStatus,
          image_url: imageUrls[0], // รูปหลัก (รูปแรก)
          images: imageUrls, // บันทึกเป็น Array ของ URL
          video_url: videoUrl,
          user_id: user.id,
          username: user.fullName || user.firstName || "Unknown User",
          email: user.primaryEmailAddress?.emailAddress || "",
          userImage: user.imageUrl || "",
        },
      ]);

      if (error) throw error;

      Alert.alert("สำเร็จ! 🎉", "เพิ่มข้อมูลน้องเรียบร้อยแล้ว", [
        {
          text: "ตกลง",
          onPress: () => {
            resetForm();
          },
        },
      ]);

      // Reset Form...
    } catch (err) {
      Alert.alert("เกิดข้อผิดพลาด", err.message);
    } finally {
      setUploading(false);
    }
  };

  /* -------------------- UI Components -------------------- */

  return (
    <AuthWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>เพิ่มสัตว์เลี้ยงใหม่ 🐾</Text>
            <Text style={styles.subtitle}>
              แชร์ข้อมูลน้องๆ เพื่อช่วยให้พวกเขาได้บ้านใหม่
            </Text>
          </View>

          {/* Media Section */}
          <View style={styles.card}>
            <Text style={styles.label}>รูปภาพน้องๆ (สูงสุด 5 รูป) *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mediaRow}
            >
              <TouchableOpacity style={styles.addMediaBox} onPress={pickImages}>
                <Text style={styles.plusIcon}>+</Text>
                <Text style={styles.addText}>{images.length}/5</Text>
              </TouchableOpacity>

              {images.map((img, index) => (
                <View key={index} style={styles.previewWrapper}>
                  <Image
                    source={{ uri: img.uri }}
                    style={styles.previewImage}
                  />
                  <TouchableOpacity
                    style={styles.removeBadge}
                    onPress={() =>
                      setImages(images.filter((_, i) => i !== index))
                    }
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <Text style={styles.label}>วิดีโอ (ถ้ามี)</Text>
            {video ? (
              <View style={styles.videoStatusBox}>
                <Text style={styles.videoStatusText}>✅ เลือกวิดีโอแล้ว</Text>
                <TouchableOpacity onPress={() => setVideo(null)}>
                  <Text style={styles.deleteLink}>ลบวิดีโอ</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.videoPicker} onPress={pickVideo}>
                <Text style={styles.videoPickerText}>
                  🎥 เพิ่มวิดีโอแนะนำตัวน้อง
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Base Information Section */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>ข้อมูลทั่วไป</Text>

            <Text style={styles.label}>ประเภท *</Text>
            <View style={styles.choiceRow}>
              {["สุนัข", "แมว"].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.choiceBtn,
                    category === cat && styles.categoryActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      category === cat && styles.choiceTextActive,
                    ]}
                  >
                    {cat === "สุนัข" ? "🐶 สุนัข" : "🐱 แมว"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="ชื่อน้อง"
              value={petName}
              onChangeText={setPetName}
            />

            <TextInput
              style={styles.input}
              placeholder="สายพันธุ์ (เช่น พันธุ์ทาง, ชิบะ)"
              value={breed}
              onChangeText={setBreed}
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.label}>อายุ (ปี)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  keyboardType="numeric"
                  value={age}
                  onChangeText={setAge}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>น้ำหนัก (กก.)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.0"
                  keyboardType="numeric"
                  value={weight}
                  onChangeText={setWeight}
                />
              </View>
            </View>

            <Text style={styles.label}>เพศ *</Text>
            <View style={styles.choiceRow}>
              {["ผู้", "เมีย"].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.choiceBtn, sex === s && styles.sexActive]}
                  onPress={() => setSex(s)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      sex === s && styles.choiceTextActive,
                    ]}
                  >
                    {s === "ผู้" ? "♂️ ตัวผู้" : "♀️ ตัวเมีย"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Health & Detail Section */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>สุขภาพและสถานที่</Text>
            <TextInput
              style={styles.input}
              placeholder="สถานที่ (เช่น เขต, จังหวัด)"
              value={address}
              onChangeText={setAddress}
            />
            <TextInput
              style={styles.input}
              placeholder="ประวัติการได้รับวัคซีน"
              value={vaccineHistory}
              onChangeText={setVaccineHistory}
            />

            <Text style={styles.label}>การทำหมัน</Text>
            <View style={styles.choiceRow}>
              {["ทำแล้ว", "ยังไม่ได้ทำ"].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.choiceBtn,
                    isNeutered === item && styles.sexActive,
                  ]}
                  onPress={() => setIsNeutered(item)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      isNeutered === item && styles.choiceTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>เกี่ยวกับน้อง</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="ลักษณะนิสัย (เช่น เข้ากับแมวตัวอื่นได้ง่าย)"
              multiline
              value={personality}
              onChangeText={setPersonality}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="รายละเอียดอื่นๆ หรือประวัติความเป็นมาของน้อง"
              multiline
              value={about}
              onChangeText={setAbout}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, uploading && { opacity: 0.7 }]}
            onPress={submitPet}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitText}>ลงประกาศหาบ้าน 🐾</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 50 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB", paddingHorizontal: 20 },
  header: { marginTop: 30, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "800", color: "#1F2937" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 4 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 10,
    marginTop: 5,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  textArea: { height: 90, textAlignVertical: "top" },
  row: { flexDirection: "row" },
  mediaRow: { flexDirection: "row", marginBottom: 15 },
  addMediaBox: {
    width: 80,
    height: 80,
    backgroundColor: "#EEF2FF",
    borderRadius: 15,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  plusIcon: { fontSize: 28, color: "#6366F1" },
  addText: { fontSize: 12, color: "#6366F1", fontWeight: "600" },
  previewWrapper: { marginLeft: 12, position: "relative" },
  previewImage: { width: 80, height: 80, borderRadius: 15 },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  removeText: { color: "#FFF", fontSize: 10, fontWeight: "bold" },
  videoPicker: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#22C55E",
    borderStyle: "dashed",
    alignItems: "center",
  },
  videoPickerText: { color: "#166534", fontWeight: "600" },
  videoStatusBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
  },
  videoStatusText: { color: "#166534", fontWeight: "600" },
  deleteLink: { color: "#EF4444", fontWeight: "700" },
  choiceRow: { flexDirection: "row", marginBottom: 15 },
  choiceBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  choiceText: { color: "#4B5563", fontWeight: "600" },
  choiceTextActive: { color: "#FFF" },
  categoryActive: { backgroundColor: "#F59E0B" }, // สีส้ม Amber สำหรับประเภท
  sexActive: { backgroundColor: "#6366F1" }, // สี Indigo สำหรับเพศและอื่นๆ
  submitBtn: {
    backgroundColor: "#6366F1",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#6366F1",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  submitText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
});
