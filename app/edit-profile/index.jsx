import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

export default function EditProfile() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* ================= LOAD PROFILE ================= */
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const token = await getToken({ template: "supabase" });
        const supabase = createClerkSupabaseClient(token);

        const { data } = await supabase
          .from("users")
          .select("full_name, phone, bio, avatar_url")
          .eq("clerk_id", user.id)
          .single();

        setFullName(data?.full_name || "");
        setPhone(data?.phone || "");
        setBio(data?.bio || "");
        setAvatarUrl(data?.avatar_url || user.imageUrl);
      } catch (e) {
        console.log("LOAD PROFILE ERROR:", e);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  /* ================= PICK AVATAR ================= */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("ต้องอนุญาตเข้าถึงรูปภาพ");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled) return;

    try {
      setUploading(true);
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop();
      const path = `${user.id}.${ext}`;

      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const buffer = Uint8Array.from(atob(asset.base64), (c) =>
        c.charCodeAt(0)
      );

      await supabase.storage.from("avatars").upload(path, buffer, {
        upsert: true,
        contentType: asset.mimeType || "image/jpeg",
      });

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);

      await supabase
        .from("users")
        .update({ avatar_url: data.publicUrl })
        .eq("clerk_id", user.id);

      setAvatarUrl(data.publicUrl);
    } catch (e) {
      console.log("UPLOAD AVATAR ERROR:", e);
      Alert.alert("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  /* ================= SAVE PROFILE ================= */
  const handleSave = async () => {
    try {
      setLoading(true);
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { error } = await supabase
        .from("users")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl,
        })
        .eq("clerk_id", user.id);

      if (error) throw error;

      Alert.alert("สำเร็จ", "บันทึกข้อมูลเรียบร้อย", [
        {
          text: "ตกลง",
          onPress: () => router.replace("/(tabs)/profile"),
        },
      ]);
    } catch (e) {
      console.log("SAVE PROFILE ERROR:", e);
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={26} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>แก้ไขโปรไฟล์</Text>
          </View>

          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={pickImage}>
              <Image
                source={{
                  uri: avatarUrl || "https://www.gravatar.com/avatar/?d=mp",
                }}
                style={styles.avatar}
              />
              {uploading && (
                <View style={styles.overlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>ชื่อ</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={styles.label}>เบอร์โทร</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.label}>แนะนำตัว</Text>
            <TextInput
              style={[styles.input, { height: 90 }]}
              multiline
              value={bio}
              onChangeText={setBio}
            />
          </View>

          <TouchableOpacity
            style={styles.save}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>บันทึก</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", marginLeft: 10 },
  avatarWrap: { alignItems: "center", padding: 30, backgroundColor: "#fff" },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  form: { padding: 20, backgroundColor: "#fff" },
  label: { fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  save: {
    margin: 20,
    backgroundColor: "#6366f1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
