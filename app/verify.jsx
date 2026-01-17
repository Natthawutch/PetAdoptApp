import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../config/supabaseClient";

const SUPABASE_URL = Constants.expoConfig.extra.supabaseUrl;

export default function VerifyScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState(null);

  // Step 1: ข้อมูลส่วนตัว
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Step 2: เอกสารยืนยันตัวตน
  const [idCardImage, setIdCardImage] = useState(null);
  const [selfieWithIdImage, setSelfieWithIdImage] = useState(null);
  const [proofOfAddressImage, setProofOfAddressImage] = useState(null);

  // Step 3: ข้อมูลเพิ่มเติม
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");

  // Step 4: การยอมรับเงื่อนไข
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptDataUsage, setAcceptDataUsage] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkVerificationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkVerificationStatus = async () => {
    if (!user?.id) return;

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const { data: me, error: meErr } = await supabase
        .from("users")
        .select("id, verification_status, verified_at")
        .eq("clerk_id", user.id)
        .maybeSingle();

      if (meErr) throw meErr;
      if (!me) return;

      if (me.verification_status === "verified") {
        setVerificationStatus("verified");
        return;
      }

      const { data: req, error: reqErr } = await supabase
        .from("verification_requests")
        .select("id, status")
        .eq("user_row_id", me.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (reqErr) throw reqErr;

      setVerificationStatus(req ? "pending" : null);
    } catch (e) {
      console.error("checkVerificationStatus error:", e);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (type) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === "selfie" ? [3, 4] : [16, 10],
        quality: 0.8,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;

        if (type === "idCard") setIdCardImage(uri);
        else if (type === "selfie") setSelfieWithIdImage(uri);
        else if (type === "address") setProofOfAddressImage(uri);
      }
    } catch (e) {
      console.error("pickImage error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถเลือกรูปภาพได้");
    }
  };

  const uploadImage = async (uri) => {
    const token = await getToken({ template: "supabase", skipCache: true });
    const fileExt = uri.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `id-cards/${fileName}`;

    const blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        console.error("XMLHttpRequest error:", e);
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/verification-documents/${filePath}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `image/${fileExt}`,
        "x-upsert": "false",
      },
      body: blob,
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(
        uploadResult.error || uploadResult.message || "Upload failed"
      );
    }

    return `${SUPABASE_URL}/storage/v1/object/public/verification-documents/${filePath}`;
  };

  const validateStep1 = () => {
    if (!fullName.trim()) {
      Alert.alert("กรุณากรอกชื่อ-นามสกุล");
      return false;
    }
    if (!phoneNumber.trim() || phoneNumber.length < 10) {
      Alert.alert("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (10 หลัก)");
      return false;
    }
    if (!address.trim()) {
      Alert.alert("กรุณากรอกที่อยู่");
      return false;
    }
    if (!province.trim()) {
      Alert.alert("กรุณากรอกจังหวัด");
      return false;
    }
    if (!postalCode.trim() || postalCode.length !== 5) {
      Alert.alert("กรุณากรอกรหัสไปรษณีย์ให้ถูกต้อง (5 หลัก)");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!idCardImage) {
      Alert.alert("กรุณาอัปโหลดรูปบัตรประชาชน/Passport");
      return false;
    }
    if (!selfieWithIdImage) {
      Alert.alert("กรุณาอัปโหลดรูปถ่ายคู่บัตร");
      return false;
    }
    if (!proofOfAddressImage) {
      Alert.alert("กรุณาอัปโหลดหลักฐานที่อยู่");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!emergencyContact.trim()) {
      Alert.alert("กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน");
      return false;
    }
    if (!emergencyPhone.trim() || emergencyPhone.length < 10) {
      Alert.alert("กรุณากรอกเบอร์ติดต่อฉุกเฉินให้ถูกต้อง");
      return false;
    }
    if (!occupation.trim()) {
      Alert.alert("กรุณากรอกอาชีพ");
      return false;
    }
    if (!monthlyIncome.trim()) {
      Alert.alert("กรุณาเลือกรายได้ต่อเดือน");
      return false;
    }
    return true;
  };

  const validateStep4 = () => {
    if (!acceptTerms || !acceptDataUsage) {
      Alert.alert("กรุณายอมรับเงื่อนไขและการใช้ข้อมูล");
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const submitVerification = async () => {
    if (!validateStep4()) return;

    setSubmitting(true);
    setUploading(true);

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      // อัปโหลดรูปภาพทั้งหมด
      let idCardUrl = idCardImage;
      let selfieUrl = selfieWithIdImage;
      let addressUrl = proofOfAddressImage;

      if (idCardImage.startsWith("file://")) {
        idCardUrl = await uploadImage(idCardImage);
      }
      if (selfieWithIdImage.startsWith("file://")) {
        selfieUrl = await uploadImage(selfieWithIdImage);
      }
      if (proofOfAddressImage.startsWith("file://")) {
        addressUrl = await uploadImage(proofOfAddressImage);
      }

      setUploading(false);

      // ส่งข้อมูลไป RPC function (ต้องสร้างใหม่)
      const { data: rpcResult, error } = await supabase.rpc(
        "submit_enhanced_verification",
        {
          p_full_name: fullName,
          p_phone_number: phoneNumber,
          p_address: address,
          p_province: province,
          p_postal_code: postalCode,
          p_id_card_url: idCardUrl,
          p_selfie_with_id_url: selfieUrl,
          p_proof_of_address_url: addressUrl,
          p_emergency_contact: emergencyContact,
          p_emergency_phone: emergencyPhone,
          p_occupation: occupation,
          p_monthly_income: monthlyIncome,
        }
      );

      if (error) throw error;

      console.log("✅ submit_enhanced_verification:", rpcResult);

      Alert.alert(
        "ส่งคำขอสำเร็จ ✅",
        "ทีมงานจะตรวจสอบข้อมูลภายใน 2-3 วันทำการ คุณจะได้รับการแจ้งเตือนเมื่อผ่านการตรวจสอบ",
        [{ text: "ตกลง", onPress: () => router.back() }]
      );

      setVerificationStatus("pending");
    } catch (e) {
      console.error("submitVerification error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถส่งคำขอได้");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      </SafeAreaView>
    );
  }

  if (verificationStatus === "verified") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.statusContainer}>
          <Ionicons name="checkmark-circle" size={100} color="#10B981" />
          <Text style={styles.statusTitle}>ยืนยันตัวตนสำเร็จ ✅</Text>
          <Text style={styles.statusSubtitle}>
            บัญชีของคุณได้รับการยืนยันแล้ว{"\n"}
            สามารถส่งคำขอรับเลี้ยงสัตว์ได้ทันที
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>กลับหน้าหลัก</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (verificationStatus === "pending") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.statusContainer}>
          <Ionicons name="time-outline" size={100} color="#F59E0B" />
          <Text style={styles.statusTitle}>กำลังตรวจสอบข้อมูล ⏳</Text>
          <Text style={styles.statusSubtitle}>
            ทีมงานกำลังตรวจสอบเอกสารของคุณ{"\n"}
            จะแจ้งผลภายใน 2-3 วันทำการ
          </Text>
          <View style={styles.pendingInfoBox}>
            <Text style={styles.pendingInfoText}>
              💡 คุณจะได้รับการแจ้งเตือนทาง Email เมื่อการตรวจสอบเสร็จสิ้น
            </Text>
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>กลับหน้าหลัก</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={28} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ยืนยันตัวตน</Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4].map((step) => (
            <View key={step} style={styles.progressStepContainer}>
              <View
                style={[
                  styles.progressStep,
                  currentStep >= step && styles.progressStepActive,
                ]}
              >
                <Text
                  style={[
                    styles.progressStepText,
                    currentStep >= step && styles.progressStepTextActive,
                  ]}
                >
                  {step}
                </Text>
              </View>
              {step < 4 && (
                <View
                  style={[
                    styles.progressLine,
                    currentStep > step && styles.progressLineActive,
                  ]}
                />
              )}
            </View>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Step 1: ข้อมูลส่วนตัว */}
            {currentStep === 1 && (
              <>
                <Text style={styles.stepTitle}>
                  📝 ขั้นตอนที่ 1: ข้อมูลส่วนตัว
                </Text>

                <View style={styles.infoBox}>
                  <Ionicons
                    name="information-circle"
                    size={24}
                    color="#3B82F6"
                  />
                  <Text style={styles.infoText}>
                    กรุณากรอกข้อมูลให้ตรงกับบัตรประชาชนหรือเอกสารทางราชการ
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    ชื่อ-นามสกุล <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="เช่น สมชาย ใจดี"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    เบอร์โทรศัพท์ <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="08X-XXX-XXXX"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    maxLength={10}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    ที่อยู่ <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="เลขที่ ถนน ตำบล อำเภอ"
                    value={address}
                    onChangeText={setAddress}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.row}>
                  <View
                    style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}
                  >
                    <Text style={styles.label}>
                      จังหวัด <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="เช่น กรุงเทพมหานคร"
                      value={province}
                      onChangeText={setProvince}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>
                      รหัสไปรษณีย์ <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="10XXX"
                      keyboardType="number-pad"
                      value={postalCode}
                      onChangeText={setPostalCode}
                      maxLength={5}
                    />
                  </View>
                </View>
              </>
            )}

            {/* Step 2: เอกสารยืนยันตัวตน */}
            {currentStep === 2 && (
              <>
                <Text style={styles.stepTitle}>
                  📸 ขั้นตอนที่ 2: เอกสารยืนยันตัวตน
                </Text>

                <View style={styles.infoBox}>
                  <Ionicons name="shield-checkmark" size={24} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    อัปโหลดภาพถ่ายที่ชัดเจน ไม่มีแสงสะท้อน เห็นข้อมูลครบถ้วน
                  </Text>
                </View>

                {/* บัตรประชาชน/Passport */}
                <View style={styles.uploadSection}>
                  <Text style={styles.label}>
                    1. บัตรประชาชน/Passport{" "}
                    <Text style={styles.required}>*</Text>
                  </Text>
                  <Text style={styles.hint}>
                    ถ่ายภาพบัตรให้เห็นข้อมูลชัดเจน ไม่มีแสงสะท้อน
                  </Text>
                  {idCardImage ? (
                    <View style={styles.imagePreview}>
                      <Image
                        source={{ uri: idCardImage }}
                        style={styles.uploadedImage}
                      />
                      <TouchableOpacity
                        style={styles.changeImageButton}
                        onPress={() => pickImage("idCard")}
                      >
                        <Text style={styles.changeImageText}>เปลี่ยนรูป</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={() => pickImage("idCard")}
                    >
                      <Ionicons name="card-outline" size={40} color="#8B5CF6" />
                      <Text style={styles.uploadText}>อัปโหลดบัตรประชาชน</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* รูปถ่ายคู่บัตร */}
                <View style={styles.uploadSection}>
                  <Text style={styles.label}>
                    2. รูปถ่ายคู่บัตร (Selfie){" "}
                    <Text style={styles.required}>*</Text>
                  </Text>
                  <Text style={styles.hint}>
                    ถ่ายรูปตัวเองพร้อมถือบัตรประชาชนข้างใบหน้า เห็นหน้าชัดเจน
                  </Text>
                  {selfieWithIdImage ? (
                    <View style={styles.imagePreview}>
                      <Image
                        source={{ uri: selfieWithIdImage }}
                        style={styles.uploadedImage}
                      />
                      <TouchableOpacity
                        style={styles.changeImageButton}
                        onPress={() => pickImage("selfie")}
                      >
                        <Text style={styles.changeImageText}>เปลี่ยนรูป</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={() => pickImage("selfie")}
                    >
                      <Ionicons
                        name="person-outline"
                        size={40}
                        color="#8B5CF6"
                      />
                      <Text style={styles.uploadText}>ถ่ายรูปคู่บัตร</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* หลักฐานที่อยู่ */}
                <View style={styles.uploadSection}>
                  <Text style={styles.label}>
                    3. หลักฐานที่อยู่ <Text style={styles.required}>*</Text>
                  </Text>
                  <Text style={styles.hint}>
                    ทะเบียนบ้าน / ใบเสร็จค่าน้ำ-ไฟ / สัญญาเช่า (ไม่เกิน 3 เดือน)
                  </Text>
                  {proofOfAddressImage ? (
                    <View style={styles.imagePreview}>
                      <Image
                        source={{ uri: proofOfAddressImage }}
                        style={styles.uploadedImage}
                      />
                      <TouchableOpacity
                        style={styles.changeImageButton}
                        onPress={() => pickImage("address")}
                      >
                        <Text style={styles.changeImageText}>เปลี่ยนรูป</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={() => pickImage("address")}
                    >
                      <Ionicons name="home-outline" size={40} color="#8B5CF6" />
                      <Text style={styles.uploadText}>
                        อัปโหลดหลักฐานที่อยู่
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {/* Step 3: ข้อมูลเพิ่มเติม */}
            {currentStep === 3 && (
              <>
                <Text style={styles.stepTitle}>
                  ℹ️ ขั้นตอนที่ 3: ข้อมูลเพิ่มเติม
                </Text>

                <View style={styles.infoBox}>
                  <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                  <Text style={styles.infoText}>
                    ข้อมูลนี้จะช่วยให้เราสามารถติดต่อคุณได้หากเกิดเหตุฉุกเฉิน
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    ผู้ติดต่อฉุกเฉิน <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ชื่อผู้ติดต่อฉุกเฉิน (ญาติ/เพื่อน)"
                    value={emergencyContact}
                    onChangeText={setEmergencyContact}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    เบอร์ติดต่อฉุกเฉิน <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="08X-XXX-XXXX"
                    keyboardType="phone-pad"
                    value={emergencyPhone}
                    onChangeText={setEmergencyPhone}
                    maxLength={10}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    อาชีพ <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="เช่น พนักงานบริษัท, ข้าราชการ"
                    value={occupation}
                    onChangeText={setOccupation}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    รายได้ต่อเดือน <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={styles.radioGroup}>
                    {[
                      "ต่ำกว่า 15,000",
                      "15,000-30,000",
                      "30,000-50,000",
                      "มากกว่า 50,000",
                    ].map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.radioButton,
                          monthlyIncome === option && styles.radioButtonActive,
                        ]}
                        onPress={() => setMonthlyIncome(option)}
                      >
                        <Text
                          style={[
                            styles.radioButtonText,
                            monthlyIncome === option &&
                              styles.radioButtonTextActive,
                          ]}
                        >
                          {option} บาท
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* Step 4: ยอมรับเงื่อนไข */}
            {currentStep === 4 && (
              <>
                <Text style={styles.stepTitle}>
                  ✅ ขั้นตอนที่ 4: ยืนยันข้อมูล
                </Text>

                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>สรุปข้อมูลของคุณ</Text>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>ติดต่อฉุกเฉิน:</Text>
                    <Text style={styles.summaryValue}>
                      {emergencyContact} ({emergencyPhone})
                    </Text>
                  </View>
                </View>

                <View style={styles.termsBox}>
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => setAcceptTerms(!acceptTerms)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        acceptTerms && styles.checkboxActive,
                      ]}
                    >
                      {acceptTerms && (
                        <Ionicons name="checkmark" size={18} color="#FFF" />
                      )}
                    </View>
                    <Text style={styles.checkboxText}>
                      ฉันยืนยันว่าข้อมูลทั้งหมดเป็นความจริงและตรงกับเอกสารที่แนบมา
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => setAcceptDataUsage(!acceptDataUsage)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        acceptDataUsage && styles.checkboxActive,
                      ]}
                    >
                      {acceptDataUsage && (
                        <Ionicons name="checkmark" size={18} color="#FFF" />
                      )}
                    </View>
                    <Text style={styles.checkboxText}>
                      ฉันยินยอมให้ใช้ข้อมูลส่วนบุคคลเพื่อการตรวจสอบยืนยันตัวตนเท่านั้น
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.warningBox}>
                  <Ionicons name="warning-outline" size={24} color="#F59E0B" />
                  <Text style={styles.warningText}>
                    การให้ข้อมูลเท็จอาจส่งผลให้บัญชีถูกระงับการใช้งานอย่างถาวร
                  </Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.navigationContainer}>
          {currentStep > 1 && (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonSecondary]}
              onPress={handlePrevStep}
            >
              <Ionicons name="arrow-back" size={20} color="#8B5CF6" />
              <Text style={styles.navButtonSecondaryText}>ย้อนกลับ</Text>
            </TouchableOpacity>
          )}

          {currentStep < 4 ? (
            <TouchableOpacity
              style={[
                styles.navButton,
                styles.navButtonPrimary,
                currentStep === 1 && { flex: 1 },
              ]}
              onPress={handleNextStep}
            >
              <Text style={styles.navButtonPrimaryText}>ถัดไป</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.navButton,
                styles.navButtonPrimary,
                (submitting || uploading) && styles.navButtonDisabled,
              ]}
              onPress={submitVerification}
              disabled={submitting || uploading}
            >
              {submitting || uploading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.navButtonPrimaryText}>
                    ส่งคำขอยืนยันตัวตน
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  closeButton: { marginRight: 16 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    paddingTop: 50,
  },

  // Progress Bar
  progressContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#F9FAFB",
  },
  progressStepContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  progressStep: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  progressStepActive: {
    backgroundColor: "#8B5CF6",
  },
  progressStepText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  progressStepTextActive: {
    color: "#FFFFFF",
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: "#8B5CF6",
  },

  content: { padding: 20 },

  stepTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 16,
  },

  infoBox: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
  },
  infoText: { flex: 1, fontSize: 14, color: "#1E40AF", lineHeight: 20 },

  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  required: { color: "#EF4444" },
  hint: { fontSize: 13, color: "#6B7280", marginBottom: 8 },

  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },

  row: {
    flexDirection: "row",
  },

  // Upload Section
  uploadSection: {
    marginBottom: 24,
  },
  uploadButton: {
    backgroundColor: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#8B5CF6",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  uploadText: {
    fontSize: 15,
    color: "#8B5CF6",
    fontWeight: "600",
  },
  imagePreview: {
    alignItems: "center",
    gap: 12,
  },
  uploadedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  changeImageButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
  },
  changeImageText: {
    fontSize: 14,
    color: "#8B5CF6",
    fontWeight: "600",
  },

  // Radio Group
  radioGroup: {
    gap: 10,
  },
  radioButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  radioButtonActive: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F5F3FF",
  },
  radioButtonText: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
  radioButtonTextActive: {
    color: "#8B5CF6",
    fontWeight: "600",
  },

  // Summary Box
  summaryBox: {
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6B7280",
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },

  // Terms & Checkbox
  termsBox: {
    gap: 16,
    marginBottom: 20,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },

  warningBox: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    padding: 14,
    borderRadius: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
  },

  // Navigation
  navigationContainer: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  navButtonPrimary: {
    backgroundColor: "#8B5CF6",
  },
  navButtonSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#8B5CF6",
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  navButtonSecondaryText: {
    color: "#8B5CF6",
    fontSize: 16,
    fontWeight: "600",
  },

  // Status Screen
  statusContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  statusTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginTop: 24,
    marginBottom: 12,
    textAlign: "center",
  },
  statusSubtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  pendingInfoBox: {
    backgroundColor: "#FEF3C7",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  pendingInfoText: {
    fontSize: 14,
    color: "#92400E",
    textAlign: "center",
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
