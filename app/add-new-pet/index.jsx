import { useAuth, useUser } from "@clerk/clerk-expo";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
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

/** -------- Breed Lists -------- */
const DOG_BREEDS = [
  "ไม่ทราบ",
  "พันธุ์ผสม/พันธุ์ทาง",
  "ชิวาวา",
  "ชิบะ อินุ",
  "ปอมเมอเรเนียน",
  "พุดเดิ้ล",
  "โกลเด้น รีทรีฟเวอร์",
  "ลาบราดอร์ รีทรีฟเวอร์",
  "บีเกิ้ล",
  "ไซบีเรียน ฮัสกี",
  "คอร์กี้",
  "ปั๊ก",
  "ชเนาเซอร์",
  "ยอร์คเชียร์ เทอร์เรีย",
];

const CAT_BREEDS = [
  "ไม่ทราบ",
  "พันธุ์ผสม",
  "เปอร์เซีย",
  "สก็อตติช โฟลด์",
  "บริติช ชอร์ตแฮร์",
  "เมนคูน",
  "เบงกอล",
  "แร็กดอลล์",
  "วิเชียรมาศ",
  "อเมริกัน ชอร์ตแฮร์",
];

/** -------- Province List (TH) -------- */
const THAI_PROVINCES = [
  "ไม่ระบุ",
  "กรุงเทพมหานคร",
  "กระบี่",
  "กาญจนบุรี",
  "กาฬสินธุ์",
  "กำแพงเพชร",
  "ขอนแก่น",
  "จันทบุรี",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ชัยนาท",
  "ชัยภูมิ",
  "ชุมพร",
  "เชียงราย",
  "เชียงใหม่",
  "ตรัง",
  "ตราด",
  "ตาก",
  "นครนายก",
  "นครปฐม",
  "นครพนม",
  "นครราชสีมา",
  "นครศรีธรรมราช",
  "นครสวรรค์",
  "นนทบุรี",
  "นราธิวาส",
  "น่าน",
  "บึงกาฬ",
  "บุรีรัมย์",
  "ปทุมธานี",
  "ประจวบคีรีขันธ์",
  "ปราจีนบุรี",
  "ปัตตานี",
  "พระนครศรีอยุธยา",
  "พังงา",
  "พัทลุง",
  "พิจิตร",
  "พิษณุโลก",
  "เพชรบุรี",
  "เพชรบูรณ์",
  "แพร่",
  "พะเยา",
  "ภูเก็ต",
  "มหาสารคาม",
  "มุกดาหาร",
  "แม่ฮ่องสอน",
  "ยะลา",
  "ยโสธร",
  "ร้อยเอ็ด",
  "ระนอง",
  "ระยอง",
  "ราชบุรี",
  "ลพบุรี",
  "ลำปาง",
  "ลำพูน",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สงขลา",
  "สตูล",
  "สมุทรปราการ",
  "สมุทรสงคราม",
  "สมุทรสาคร",
  "สระแก้ว",
  "สระบุรี",
  "สิงห์บุรี",
  "สุโขทัย",
  "สุพรรณบุรี",
  "สุราษฎร์ธานี",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อ่างทอง",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุตรดิตถ์",
  "อุทัยธานี",
  "อุบลราชธานี",
];

/** -------- Vaccine Options -------- */
const DOG_VACCINES = [
  "ไม่ทราบ",
  "วัคซีนรวม (DHPP/5-in-1)",
  "พิษสุนัขบ้า (Rabies)",
  "เลปโตสไปโรซิส/ฉี่หนู (Lepto)",
  "ไอกรนสุนัข/เคนเนลคอฟ (Bordetella)",
];

const CAT_VACCINES = [
  "ไม่ทราบ",
  "วัคซีนรวมแมว (FVRCP/3-in-1)",
  "พิษสุนัขบ้า (Rabies)",
  "ลิวคีเมียแมว (FeLV)",
  "คลามัยเดีย (Chlamydia)",
];

export default function AddNewPetForm() {
  const { user } = useUser();
  const { getToken } = useAuth();

  // ----- Form States -----
  const [petName, setPetName] = useState("");
  const [category, setCategory] = useState("สุนัข");
  const [breed, setBreed] = useState("ไม่ทราบ");
  const [age, setAge] = useState(""); // ไม่ใส่ได้ (จะเก็บเป็น null)
  const [weight, setWeight] = useState("");
  const [sex, setSex] = useState("ผู้");

  // รูปแบบการเลี้ยง: ระบบปิด / ระบบเปิด
  // (ตั้งค่าเริ่มต้นเป็น "ระบบปิด" เพื่อไม่บังคับเลือก แต่มีตัวเลือกให้)
  const [careType, setCareType] = useState("ระบบปิด");

  // จังหวัด
  const [province, setProvince] = useState("ไม่ระบุ");

  const [about, setAbout] = useState("");
  const [personality, setPersonality] = useState("");

  // วัคซีน: เลือกจาก dropdown แล้วเพิ่มทันที
  const [vaccines, setVaccines] = useState([]);
  const [selectedVaccine, setSelectedVaccine] = useState(""); // ค่าใน dropdown

  // ทำหมัน: บังคับเลือก + มี 3 ตัวเลือก
  const [isNeutered, setIsNeutered] = useState(""); // "ทำแล้ว" | "ไม่ทำ" | "ไม่ทราบ"
  const [postStatus, setPostStatus] = useState("Available");

  // ----- Media States -----
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [uploading, setUploading] = useState(false);

  const breedOptions = category === "สุนัข" ? DOG_BREEDS : CAT_BREEDS;
  const vaccineOptions = category === "สุนัข" ? DOG_VACCINES : CAT_VACCINES;

  /** ขอ permission รูป */
  useEffect(() => {
    (async () => {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (lib.status !== "granted") {
        Alert.alert(
          "ขออนุญาตเข้าถึงรูปภาพ",
          "กรุณาอนุญาตให้แอปเข้าถึงรูปภาพเพื่ออัปโหลด",
        );
      }
    })();
  }, []);

  /* -------------------- Vaccine Helpers -------------------- */

  const removeVaccine = (item) => {
    setVaccines((prev) => prev.filter((x) => x !== item));
  };

  const onSelectVaccine = (val) => {
    setSelectedVaccine(val);

    // เลือก placeholder
    if (!val) return;

    // เลือก "ไม่ทราบ" => เคลียร์ทั้งหมด
    if (val === "ไม่ทราบ") {
      setVaccines([]);
      setSelectedVaccine(""); // reset กลับไป placeholder
      return;
    }

    // เพิ่มทันทีแบบไม่ซ้ำ
    setVaccines((prev) => (prev.includes(val) ? prev : [...prev, val]));

    // reset dropdown กลับไป placeholder
    setSelectedVaccine("");
  };

  /* -------------------- Media Picker Logic -------------------- */

  // เลือกทีละรูป + ครอปได้
  const pickImages = async () => {
    if (images.length >= 5) {
      return Alert.alert("จำกัดรูป", "เลือกได้สูงสุด 5 รูป");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImages((prev) => [...prev, result.assets[0]]);
    }
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
    setBreed("ไม่ทราบ");
    setAge("");
    setWeight("");
    setSex("ผู้");

    setCareType("ระบบปิด");

    setProvince("ไม่ระบุ");
    setAbout("");
    setPersonality("");

    setVaccines([]);
    setSelectedVaccine("");

    setIsNeutered(""); // reset ให้บังคับเลือกใหม่
    setPostStatus("Available");

    setImages([]);
    setVideo(null);
  };

  /* -------------------- Submit Logic -------------------- */

  const submitPet = async () => {
    // บังคับ: ชื่อ, ประเภท, เพศ, ทำหมัน, รูปอย่างน้อย 1
    if (!petName || !category || !sex || !isNeutered || images.length === 0) {
      return Alert.alert(
        "ข้อมูลไม่ครบ",
        "กรุณาระบุชื่อ ประเภท เพศ สถานะทำหมัน และเพิ่มรูปอย่างน้อย 1 รูป",
      );
    }

    setUploading(true);
    try {
      const token = await getToken({ template: "supabase" });
      const supabaseClerk = createClerkSupabaseClient(token);

      const imageUrls = await Promise.all(
        images.map((img) => uploadFile(img.uri, user.id, false)),
      );

      const videoUrl = video
        ? await uploadFile(video.uri, user.id, true)
        : null;

      const vaccineHistoryValue =
        vaccines.length === 0 ? "ไม่ทราบ" : vaccines.join(", ");

      const { error } = await supabaseClerk.from("pets").insert([
        {
          name: petName,
          category,
          breed,

          age: age.trim() === "" ? null : parseInt(age, 10),
          weight: weight.trim() === "" ? null : parseFloat(weight),

          sex,

          // จังหวัด
          address: province,

          // รูปแบบการเลี้ยง: ต้องมีคอลัมน์ care_type ในตาราง pets
          care_type: careType,

          about,
          personality,

          vaccine_history: vaccineHistoryValue,

          // ทำหมัน: "ทำแล้ว" | "ไม่ทำ" | "ไม่ทราบ"
          is_neutered: isNeutered,
          post_status: postStatus,

          image_url: imageUrls[0],
          images: imageUrls,
          video_url: videoUrl,

          user_id: user.id,
          username: user.fullName || user.firstName || "Unknown User",
          email: user.primaryEmailAddress?.emailAddress || "",
          userImage: user.imageUrl || "",
        },
      ]);

      if (error) throw error;

      Alert.alert("สำเร็จ! 🎉", "เพิ่มข้อมูลน้องเรียบร้อยแล้ว", [
        { text: "ตกลง", onPress: resetForm },
      ]);
    } catch (err) {
      Alert.alert("เกิดข้อผิดพลาด", err?.message || "ไม่ทราบสาเหตุ");
    } finally {
      setUploading(false);
    }
  };

  /* -------------------- UI -------------------- */

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
            <View style={styles.labelRow}>
              <Text style={styles.label}>รูปภาพน้องๆ (สูงสุด 5 รูป) </Text>
              <Text style={styles.requiredStar}>*</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mediaRow}
            >
              <TouchableOpacity style={styles.addMediaBox} onPress={pickImages}>
                <Text style={styles.plusIcon}>+</Text>
                <Text style={styles.addText}>{images.length}/5</Text>
                <Text style={styles.cropHint}>ครอปได้</Text>
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

          {/* Base Info */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>ข้อมูลทั่วไป</Text>

            <View style={styles.labelRow}>
              <Text style={styles.label}>ประเภท </Text>
              <Text style={styles.requiredStar}>*</Text>
            </View>

            <View style={styles.choiceRow}>
              {["สุนัข", "แมว"].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.choiceBtn,
                    category === cat && styles.categoryActive,
                  ]}
                  onPress={() => {
                    setCategory(cat);
                    setBreed("ไม่ทราบ");

                    // reset vaccine when switch category
                    setVaccines([]);
                    setSelectedVaccine("");
                  }}
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

            <View style={styles.labelRow}>
              <Text style={styles.label}>ชื่อน้อง </Text>
              <Text style={styles.requiredStar}>*</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="ชื่อน้อง"
              value={petName}
              onChangeText={setPetName}
            />

            <Text style={styles.label}>สายพันธุ์</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={breed}
                onValueChange={(val) => setBreed(val)}
              >
                {breedOptions.map((b) => (
                  <Picker.Item key={b} label={b} value={b} />
                ))}
              </Picker>
            </View>

            {/* รูปแบบการเลี้ยง: ระบบปิด/ระบบเปิด */}
            <Text style={styles.label}>รูปแบบการเลี้ยง</Text>
            <View style={styles.choiceRow}>
              {["ระบบปิด", "ระบบเปิด"].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.choiceBtn, careType === t && styles.sexActive]}
                  onPress={() => setCareType(t)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      careType === t && styles.choiceTextActive,
                    ]}
                  >
                    {t === "ระบบปิด" ? "🏠 ระบบปิด" : "🌳 ระบบเปิด"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.label}>อายุ (ปี)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ไม่ทราบก็เว้นว่างได้"
                  keyboardType="numeric"
                  value={age}
                  onChangeText={setAge}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>น้ำหนัก (กก.)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ไม่ทราบก็เว้นว่างได้"
                  keyboardType="numeric"
                  value={weight}
                  onChangeText={setWeight}
                />
              </View>
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>เพศ </Text>
              <Text style={styles.requiredStar}>*</Text>
            </View>

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

          {/* Health & Location */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>สุขภาพและสถานที่</Text>

            <Text style={styles.label}>จังหวัด</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={province}
                onValueChange={(val) => setProvince(val)}
              >
                {THAI_PROVINCES.map((p) => (
                  <Picker.Item key={p} label={p} value={p} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>ประวัติการฉีดวัคซีน</Text>

            {/* Dropdown วัคซีน (เลือกแล้วเพิ่มอัตโนมัติ) */}
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={selectedVaccine}
                onValueChange={onSelectVaccine}
              >
                <Picker.Item label="-- เลือกวัคซีน --" value="" />
                {vaccineOptions.map((v) => (
                  <Picker.Item key={v} label={v} value={v} />
                ))}
              </Picker>
            </View>

            {/* รายการที่เลือกแล้ว */}
            {vaccines.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                {vaccines.map((v) => (
                  <View key={v} style={styles.vaccineRow}>
                    <Text style={styles.vaccineRowText}>✅ {v}</Text>
                    <TouchableOpacity onPress={() => removeVaccine(v)}>
                      <Text style={styles.removeVaccineText}>ลบ</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.vaccineHint}>
                ถ้าไม่รู้ เลือก “ไม่ทราบ” หรือไม่เลือกอะไรเลย ระบบจะบันทึกเป็น
                “ไม่ทราบ”
              </Text>
            )}

            {/* ทำหมัน: 3 ตัวเลือก + บังคับ */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>การทำหมัน </Text>
              <Text style={styles.requiredStar}>*</Text>
            </View>

            <View style={styles.choiceRow}>
              {["ทำแล้ว", "ไม่ทำ", "ไม่ทราบ"].map((item) => (
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

          {/* About */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>เกี่ยวกับน้อง</Text>

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="ลักษณะนิสัย (เช่น เข้ากับตัวอื่นได้ง่าย)"
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

          {/* Submit */}
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
  container: {
    flex: 1,
    backgroundColor: "#F8F9FB",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: { marginTop: 30, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "800", color: "#1F2937" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 4 },

  // Label + Required star
  labelRow: { flexDirection: "row", alignItems: "center" },
  requiredStar: { color: "#EF4444", fontWeight: "800" },

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
  pickerBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
    overflow: "hidden",
  },
  textArea: { height: 90, textAlignVertical: "top" },
  row: { flexDirection: "row" },

  mediaRow: { flexDirection: "row", marginBottom: 15 },
  addMediaBox: {
    width: 90,
    height: 90,
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
  cropHint: { fontSize: 10, color: "#6366F1", marginTop: 2 },

  previewWrapper: { marginLeft: 12, position: "relative" },
  previewImage: { width: 90, height: 90, borderRadius: 15 },
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
  categoryActive: { backgroundColor: "#F59E0B" },
  sexActive: { backgroundColor: "#6366F1" },

  vaccineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  vaccineRowText: {
    color: "#374151",
    fontWeight: "600",
    flex: 1,
    paddingRight: 10,
  },
  removeVaccineText: {
    color: "#EF4444",
    fontWeight: "800",
  },
  vaccineHint: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 12,
  },

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
