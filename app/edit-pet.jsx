import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  createClerkSupabaseClient,
  supabase as supabaseAnon,
} from "../config/supabaseClient";
import Colors from "../constants/Colors";

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

/* -------------------- helpers -------------------- */

const parseImagesField = (val) => {
  // รองรับ: array, json string, comma-separated, null
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);

  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return [];

    // JSON string
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}

    // comma-separated
    if (s.includes(",")) {
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }

    // single url
    if (s.startsWith("http")) return [s];
  }
  return [];
};

const parseVaccineHistory = (val) => {
  if (!val || typeof val !== "string") return [];
  const s = val.trim();
  if (!s || s === "ไม่ทราบ") return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
};

export default function EditPet() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ----- Form states (เหมือน AddNewPetForm) -----
  const [petName, setPetName] = useState("");
  const [category, setCategory] = useState("สุนัข");
  const [breed, setBreed] = useState("ไม่ทราบ");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [sex, setSex] = useState("ผู้");

  const [province, setProvince] = useState("ไม่ระบุ");
  const [about, setAbout] = useState("");
  const [personality, setPersonality] = useState("");

  const [vaccines, setVaccines] = useState([]);
  const [selectedVaccine, setSelectedVaccine] = useState("");

  const [isNeutered, setIsNeutered] = useState("ยังไม่ได้ทำ");

  // ----- Media states -----
  // เก็บเป็น object { uri, isRemote, url? }
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null); // { uri, isRemote, url? } | null

  const breedOptions = useMemo(
    () => (category === "สุนัข" ? DOG_BREEDS : CAT_BREEDS),
    [category],
  );

  const vaccineOptions = useMemo(
    () => (category === "สุนัข" ? DOG_VACCINES : CAT_VACCINES),
    [category],
  );

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

  useEffect(() => {
    loadPet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadPet = async () => {
    if (!user || !id) return;

    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      // ✅ ตรวจสอบว่าเป็นเจ้าของหรือไม่
      if (data.user_id !== user.id) {
        Alert.alert("ไม่มีสิทธิ์", "คุณไม่สามารถแก้ไขโพสต์นี้ได้");
        router.back();
        return;
      }

      setPetName(data.name || "");
      setCategory(data.category || "สุนัข");
      setBreed(data.breed || "ไม่ทราบ");
      setAge(
        data.age === null || data.age === undefined ? "" : String(data.age),
      );
      setWeight(
        data.weight === null || data.weight === undefined
          ? ""
          : String(data.weight),
      );
      setSex(data.sex || "ผู้");

      setProvince(data.address || "ไม่ระบุ");
      setAbout(data.about || "");
      setPersonality(data.personality || "");

      setIsNeutered(data.is_neutered || "ยังไม่ได้ทำ");

      // vaccines
      setVaccines(parseVaccineHistory(data.vaccine_history));
      setSelectedVaccine("");

      // images
      const urls = parseImagesField(data.images);
      const finalUrls =
        urls.length > 0 ? urls : data.image_url ? [data.image_url] : [];
      setImages(finalUrls.map((u) => ({ uri: u, isRemote: true, url: u })));

      // video
      if (data.video_url) {
        setVideo({ uri: data.video_url, isRemote: true, url: data.video_url });
      } else {
        setVideo(null);
      }
    } catch (e) {
      console.log("❌ loadPet error:", e);
      Alert.alert("ข้อผิดพลาด", e?.message || "โหลดข้อมูลไม่สำเร็จ");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- Vaccine Helpers -------------------- */

  const removeVaccine = (item) => {
    setVaccines((prev) => prev.filter((x) => x !== item));
  };

  const onSelectVaccine = (val) => {
    setSelectedVaccine(val);

    if (!val) return;

    if (val === "ไม่ทราบ") {
      setVaccines([]);
      setSelectedVaccine("");
      return;
    }

    setVaccines((prev) => (prev.includes(val) ? prev : [...prev, val]));
    setSelectedVaccine("");
  };

  /* -------------------- Media Picker -------------------- */

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

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImages((prev) => [
        ...prev,
        { uri: result.assets[0].uri, isRemote: false },
      ]);
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setVideo({ uri: result.assets[0].uri, isRemote: false });
    }
  };

  const removeImageAt = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  /* -------------------- Upload Helpers (ใช้ bucket เดียวกับ Add) -------------------- */

  const uploadFile = async (uri, userId, isVideo = false) => {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();

    const ext = isVideo ? "mp4" : "jpg";
    const bucket = isVideo ? "pets-videos" : "pets-images";
    const path = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${ext}`;

    const { error } = await supabaseAnon.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: isVideo ? "video/mp4" : "image/jpeg",
      });

    if (error) throw error;

    return supabaseAnon.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };

  /* -------------------- Save -------------------- */

  const handleSave = async () => {
    if (!petName.trim() || !category || !sex) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุชื่อ ประเภท และเพศ");
      return;
    }

    if (images.length === 0) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาเพิ่มรูปอย่างน้อย 1 รูป");
      return;
    }

    setSaving(true);

    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // อัปโหลดเฉพาะไฟล์ใหม่ (isRemote=false) และคง url เดิมไว้
      const finalImageUrls = [];
      for (const img of images) {
        if (img.isRemote && img.url) {
          finalImageUrls.push(img.url);
        } else {
          const url = await uploadFile(img.uri, user.id, false);
          finalImageUrls.push(url);
        }
      }

      let finalVideoUrl = null;
      if (video) {
        if (video.isRemote && video.url) {
          finalVideoUrl = video.url;
        } else {
          finalVideoUrl = await uploadFile(video.uri, user.id, true);
        }
      }

      const vaccineHistoryValue =
        vaccines.length === 0 ? "ไม่ทราบ" : vaccines.join(", ");

      const updates = {
        name: petName.trim(),
        category,
        breed,

        age: age.trim() === "" ? null : parseInt(age, 10),
        weight: weight.trim() === "" ? null : parseFloat(weight),

        sex,
        address: province,

        about: about.trim(),
        personality: personality.trim(),

        vaccine_history: vaccineHistoryValue,
        is_neutered: isNeutered,

        image_url: finalImageUrls[0], // cover
        images: JSON.stringify(finalImageUrls), // เก็บเป็น JSON string
        video_url: finalVideoUrl,

        // ❌ ไม่แตะ post_status ตามที่บอกว่า "ไม่มีสถานะโพสต์"
      };

      const { error } = await supabase
        .from("pets")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      Alert.alert("สำเร็จ", "บันทึกการแก้ไขแล้ว", [
        { text: "ตกลง", onPress: () => router.back() },
      ]);
    } catch (e) {
      console.log("❌ handleSave error:", e);
      Alert.alert("ผิดพลาด", e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>แก้ไขโพสต์</Text>
          <View style={{ width: 24 }} />
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
              <Text style={styles.cropHint}>ครอปได้</Text>
            </TouchableOpacity>

            {images.map((img, index) => (
              <View key={`${img.uri}-${index}`} style={styles.previewWrapper}>
                <Image source={{ uri: img.uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeBadge}
                  onPress={() => removeImageAt(index)}
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

          <Text style={styles.label}>ประเภท *</Text>
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

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>บันทึกการแก้ไข</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
  },
  title: { fontSize: 20, fontWeight: "700" },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 20,
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

  saveBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: Colors.PURPLE,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: "#6366F1",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
