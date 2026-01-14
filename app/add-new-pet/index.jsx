import { useUser } from "@clerk/clerk-expo";
import { Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AuthWrapper from "../../components/AuthWrapper";
import { supabase } from "../../config/supabaseClient";

export default function AddNewPetForm() {
  const { user } = useUser();
  const [petName, setPetName] = useState("");
  const [category, setCategory] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [sex, setSex] = useState("");
  const [address, setAddress] = useState("");
  const [desc, setDesc] = useState("");
  const [personality, setPersonality] = useState("");
  const [vaccineHistory, setVaccineHistory] = useState("");
  const [isNeutered, setIsNeutered] = useState("");
  const [postStatus, setPostStatus] = useState("Available");
  const [images, setImages] = useState([]); // เก็บรูปภาพหลายรูป
  const [video, setVideo] = useState(null); // เก็บวิดีโอ 1 คลิป
  const [uploading, setUploading] = useState(false);

  const pickImages = async () => {
    if (images.length >= 5) {
      return Alert.alert("เต็มแล้ว", "เลือกได้สูงสุด 5 รูปเท่านั้น");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 5 - images.length,
    });

    if (!result.canceled) {
      setImages([...images, ...result.assets]);
    }
  };

  const pickVideo = async () => {
    if (video) {
      return Alert.alert("มีวิดีโอแล้ว", "เลือกได้เพียง 1 วิดีโอเท่านั้น");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setVideo(result.assets[0]);
    }
  };

  const removeImage = (index) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
  };

  const removeVideo = () => {
    setVideo(null);
  };

  const uploadFileToSupabase = async (uri, isVideo = false) => {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();

    const fileExtension = isVideo ? "mp4" : "jpg";
    const fileName = `${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}.${fileExtension}`;
    const bucketName = isVideo ? "pets-videos" : "pets-images";

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, arrayBuffer, {
        contentType: isVideo ? "video/mp4" : "image/jpeg",
      });

    if (error) throw error;

    const { data: publicUrl } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  };

  const submitPet = async () => {
    if (
      !petName ||
      !category ||
      !breed ||
      !age ||
      !sex ||
      !address ||
      !desc ||
      !personality ||
      images.length === 0
    ) {
      return Alert.alert(
        "ไม่สำเร็จ",
        "กรุณากรอกข้อมูลที่จำเป็นให้ครบ และเลือกรูปภาพอย่างน้อย 1 รูป 😊"
      );
    }

    setUploading(true);

    try {
      // Upload รูปภาพทั้งหมด
      const imageUrls = await Promise.all(
        images.map((img) => uploadFileToSupabase(img.uri, false))
      );

      // Upload วิดีโอ (ถ้ามี)
      let videoUrl = null;
      if (video) {
        videoUrl = await uploadFileToSupabase(video.uri, true);
      }

      // Insert pet into Supabase
      const { error } = await supabase.from("pets").insert([
        {
          name: petName,
          category: category,
          breed: breed,
          age: parseInt(age),
          weight: weight ? parseFloat(weight) : null,
          sex: sex,
          address: address,
          about: desc,
          personality: personality,
          vaccine_history: vaccineHistory || null,
          is_neutered: isNeutered || null,
          post_status: postStatus,
          image_url: imageUrls[0], // รูปแรกเป็นรูปหลัก
          images: JSON.stringify(imageUrls), // เก็บรูปทั้งหมดเป็น JSON
          video_url: videoUrl,
          username: user.fullName || user.firstName || "Unknown",
          email: user.primaryEmailAddress?.emailAddress || "",
          userImage: user.imageUrl || "",
          user_id: user.id,
        },
      ]);

      if (error) throw error;

      Alert.alert("สำเร็จ! 🎉", "เพิ่มข้อมูลสัตว์เลี้ยงเรียบร้อยแล้ว");

      // Reset form
      setPetName("");
      setCategory("");
      setBreed("");
      setAge("");
      setWeight("");
      setSex("");
      setAddress("");
      setDesc("");
      setPersonality("");
      setVaccineHistory("");
      setIsNeutered("");
      setPostStatus("Available");
      setImages([]);
      setVideo(null);
    } catch (error) {
      Alert.alert("เกิดข้อผิดพลาด", error.message);
    }

    setUploading(false);
  };

  const CategoryButton = ({ icon, label, value }) => (
    <TouchableOpacity
      style={[
        styles.categoryBtn,
        category === value && styles.categoryBtnActive,
      ]}
      onPress={() => setCategory(value)}
    >
      <Text style={styles.categoryIcon}>{icon}</Text>
      <Text
        style={[
          styles.categoryText,
          category === value && styles.categoryTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const SexButton = ({ label, value }) => (
    <TouchableOpacity
      style={[styles.sexBtn, sex === value && styles.sexBtnActive]}
      onPress={() => setSex(value)}
    >
      <Text style={[styles.sexText, sex === value && styles.sexTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const NeuteredButton = ({ label, value }) => (
    <TouchableOpacity
      style={[styles.sexBtn, isNeutered === value && styles.sexBtnActive]}
      onPress={() => setIsNeutered(value)}
    >
      <Text
        style={[styles.sexText, isNeutered === value && styles.sexTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const StatusButton = ({ label, value, color }) => (
    <TouchableOpacity
      style={[
        styles.statusBtn,
        postStatus === value && {
          ...styles.statusBtnActive,
          borderColor: color,
        },
      ]}
      onPress={() => setPostStatus(value)}
    >
      <Text
        style={[
          styles.statusText,
          postStatus === value && {
            ...styles.statusTextActive,
            color: color,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <AuthWrapper>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>เพิ่มสัตว์เลี้ยง</Text>
            <Text style={styles.subtitle}>กรอกข้อมูลน้องสัตว์ของคุณ</Text>
          </View>

          {/* Media Section */}
          <View style={styles.section}>
            <Text style={styles.label}>
              รูปภาพและวิดีโอ <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.helperText}>
              รูปภาพ: {images.length}/5 | วิดีโอ: {video ? "1/1" : "0/1"}
            </Text>

            {/* Image Grid */}
            {images.length > 0 && (
              <View style={styles.mediaGrid}>
                {images.map((img, index) => (
                  <View key={index} style={styles.mediaItem}>
                    <Image
                      source={{ uri: img.uri }}
                      style={styles.mediaThumbnail}
                    />
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeImage(index)}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Video Preview */}
            {video && (
              <View style={styles.videoContainer}>
                <Video
                  source={{ uri: video.uri }}
                  style={styles.videoPreview}
                  useNativeControls
                  resizeMode="contain"
                />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={removeVideo}
                >
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Media Buttons */}
            <View style={styles.mediaBtnContainer}>
              <TouchableOpacity
                style={[
                  styles.mediaBtn,
                  images.length >= 5 && styles.mediaBtnDisabled,
                ]}
                onPress={pickImages}
                disabled={images.length >= 5}
              >
                <Text style={styles.mediaBtnText}>
                  📸 เพิ่มรูป ({images.length}/5)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mediaBtn, video && styles.mediaBtnDisabled]}
                onPress={pickVideo}
                disabled={!!video}
              >
                <Text style={styles.mediaBtnText}>
                  🎥 เพิ่มวิดีโอ ({video ? "1" : "0"}/1)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pet Name */}
          <View style={styles.section}>
            <Text style={styles.label}>
              ชื่อ <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="ชื่อของน้องสัตว์"
              style={styles.input}
              value={petName}
              onChangeText={setPetName}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.label}>
              ประเภท <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.categoryContainer}>
              <CategoryButton icon="🐕" label="สุนัข" value="Dog" />
              <CategoryButton icon="🐈" label="แมว" value="Cat" />
            </View>
          </View>

          {/* Sex */}
          <View style={styles.section}>
            <Text style={styles.label}>
              เพศ <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.sexContainer}>
              <SexButton label="ผู้" value="Male" />
              <SexButton label="เมีย" value="Female" />
            </View>
          </View>

          {/* Breed */}
          <View style={styles.section}>
            <Text style={styles.label}>
              สายพันธุ์ <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="เช่น โกลเด้น รีทรีฟเวอร์, เปอร์เซีย, ผสม"
              style={styles.input}
              value={breed}
              onChangeText={setBreed}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Age and Weight */}
          <View style={styles.row}>
            <View style={[styles.section, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>
                อายุ (ปี) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                placeholder="0"
                style={styles.input}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={[styles.section, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>น้ำหนัก (kg)</Text>
              <TextInput
                placeholder="0.0"
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {/* Personality */}
          <View style={styles.section}>
            <Text style={styles.label}>
              ลักษณะนิสัย <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="เช่น ขี้เล่น ชอบคน เข้ากับเด็กได้ดี เป็นมิตร"
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
              value={personality}
              onChangeText={setPersonality}
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
            />
          </View>

          {/* Vaccine History */}
          <View style={styles.section}>
            <Text style={styles.label}>ประวัติวัคซีนที่ฉีด</Text>
            <TextInput
              placeholder="เช่น วัคซีนป้องกันโรคพิษสุนัขบ้า, 7 in 1, ครบตามเวลา"
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
              value={vaccineHistory}
              onChangeText={setVaccineHistory}
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
            />
          </View>

          {/* Neutered Status */}
          <View style={styles.section}>
            <Text style={styles.label}>ทำหมัน</Text>
            <View style={styles.sexContainer}>
              <NeuteredButton label="ทำหมันแล้ว" value="Yes" />
              <NeuteredButton label="ยังไม่ทำหมัน" value="No" />
            </View>
          </View>

          {/* Address */}
          <View style={styles.section}>
            <Text style={styles.label}>
              สถานที่ตั้ง <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="เช่น กรุงเทพมหานคร, เชียงใหม่"
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Post Status */}
          <View style={styles.section}>
            <Text style={styles.label}>สถานะการโพสต์</Text>
            <View style={styles.statusContainer}>
              <StatusButton
                label="🟢 พร้อมหาบ้าน"
                value="Available"
                color="#10B981"
              />
              <StatusButton
                label="🟡 รอพิจารณา"
                value="Pending"
                color="#F59E0B"
              />
              <StatusButton
                label="🔴 หาบ้านแล้ว"
                value="Adopted"
                color="#EF4444"
              />
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>
              รายละเอียดเพิ่มเติม <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="บอกเล่าเพิ่มเติมเกี่ยวกับน้องสัตว์ของคุณ เช่น สุขภาพ พฤติกรรม หรือข้อกำหนดพิเศษ..."
              style={[styles.input, styles.textAreaLarge]}
              multiline
              numberOfLines={4}
              value={desc}
              onChangeText={setDesc}
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, uploading && styles.submitBtnDisabled]}
            onPress={submitPet}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {uploading ? "กำลังอัพโหลด..." : "บันทึกข้อมูล"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>
    </AuthWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    paddingTop: 30,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  helperText: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 12,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  mediaItem: {
    width: "48%",
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  mediaThumbnail: {
    width: "100%",
    height: "100%",
  },
  videoContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    position: "relative",
  },
  videoPreview: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#EF4444",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  mediaBtnContainer: {
    flexDirection: "row",
    gap: 10,
  },
  mediaBtn: {
    flex: 1,
    backgroundColor: "#8B5CF6",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  mediaBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  mediaBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  textArea: {
    height: 80,
    paddingTop: 14,
  },
  textAreaLarge: {
    height: 120,
    paddingTop: 14,
  },
  categoryContainer: {
    flexDirection: "row",
    gap: 10,
  },
  categoryBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  categoryBtnActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#8B5CF6",
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  categoryTextActive: {
    color: "#8B5CF6",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
  },
  sexContainer: {
    flexDirection: "row",
    gap: 12,
  },
  sexBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  sexBtnActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#8B5CF6",
  },
  sexText: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
  sexTextActive: {
    color: "#8B5CF6",
    fontWeight: "600",
  },
  statusContainer: {
    gap: 10,
  },
  statusBtn: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  statusBtnActive: {
    backgroundColor: "#F9FAFB",
  },
  statusText: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
  statusTextActive: {
    fontWeight: "600",
  },
  submitBtn: {
    backgroundColor: "#8B5CF6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: "#D1D5DB",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
});
