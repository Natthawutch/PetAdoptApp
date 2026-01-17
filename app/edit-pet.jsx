import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { createClerkSupabaseClient } from "../config/supabaseClient";
import Colors from "../constants/Colors";

export default function EditPet() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Pet data
  const [pet, setPet] = useState(null);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [sex, setSex] = useState("");
  const [about, setAbout] = useState("");
  const [address, setAddress] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [newImage, setNewImage] = useState(null);

  useEffect(() => {
    loadPet();
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

      setPet(data);
      setName(data.name || "");
      setBreed(data.breed || "");
      setAge(String(data.age || ""));
      setWeight(String(data.weight || ""));
      setSex(data.sex || "");
      setAbout(data.about || "");
      setAddress(data.address || "");
      setImageUrl(data.image_url || "");
    } catch (e) {
      console.log("❌ loadPet error:", e);
      Alert.alert("ข้อผิดพลาด", e?.message || "โหลดข้อมูลไม่สำเร็จ");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("ต้องการสิทธิ์", "กรุณาอนุญาตการเข้าถึงรูปภาพ");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setNewImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);

    const fileExt = uri.split(".").pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `pets/${fileName}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(filePath, blob, { contentType: `image/${fileExt}` });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("images").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("กรุณากรอก", "ชื่อสัตว์เลี้ยง");
      return;
    }

    setSaving(true);

    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      let finalImageUrl = imageUrl;

      // ✅ ถ้ามีรูปใหม่ -> อัปโหลด
      if (newImage) {
        finalImageUrl = await uploadImage(newImage);
      }

      const updates = {
        name: name.trim(),
        breed: breed.trim(),
        age: parseInt(age) || 0,
        weight: parseFloat(weight) || 0,
        sex: sex.trim(),
        about: about.trim(),
        address: address.trim(),
        image_url: finalImageUrl,
      };

      const { error } = await supabase
        .from("pets")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id); // ✅ ป้องกันแก้ไขของคนอื่น

      if (error) throw error;

      Alert.alert("สำเร็จ", "แก้ไขโพสต์แล้ว", [
        {
          text: "ตกลง",
          onPress: () => router.back(),
        },
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

        {/* Image */}
        <TouchableOpacity style={styles.imageBox} onPress={pickImage}>
          {newImage || imageUrl ? (
            <Image
              source={{ uri: newImage || imageUrl }}
              style={styles.image}
            />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="camera" size={40} color="#aaa" />
              <Text style={styles.placeholderText}>แตะเพื่อเลือกรูป</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Form */}
        <View style={styles.form}>
          <Input label="ชื่อสัตว์ *" value={name} onChangeText={setName} />
          <Input label="สายพันธุ์" value={breed} onChangeText={setBreed} />
          <Input
            label="อายุ (ปี)"
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
          />
          <Input
            label="น้ำหนัก (กก.)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
          />
          <Input label="เพศ" value={sex} onChangeText={setSex} />
          <Input
            label="รายละเอียด"
            value={about}
            onChangeText={setAbout}
            multiline
            numberOfLines={4}
          />
          <Input label="ที่อยู่" value={address} onChangeText={setAddress} />
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

const Input = ({ label, ...props }) => (
  <View style={styles.inputGroup}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={[styles.input, props.multiline && styles.textArea]}
      placeholderTextColor="#aaa"
      {...props}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  title: { fontSize: 20, fontWeight: "700" },

  imageBox: {
    marginHorizontal: 20,
    height: 250,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { color: "#aaa", marginTop: 10 },

  form: { marginTop: 20, paddingHorizontal: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6, color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  textArea: { height: 100, textAlignVertical: "top" },

  saveBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.PURPLE,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});