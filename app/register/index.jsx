import { useSignUp } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [name, setName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    fadeIn.setValue(0);
    slideUp.setValue(40);
    logoScale.setValue(0.8);

    Animated.stagger(120, [
      Animated.spring(logoScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }),
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideUp, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
    ]).start();
  }, [pendingVerification]);

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    const cleanName = name.trim();

    if (!cleanName || !emailAddress || !password || !confirmPassword) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (password.length < 8) {
      Alert.alert("รหัสผ่านไม่ปลอดภัย", "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("รหัสผ่านไม่ตรงกัน", "กรุณากรอกรหัสผ่านให้ตรงกัน");
      return;
    }

    setLoading(true);
    try {
      // ✅ เก็บชื่อไว้ใน unsafeMetadata ตั้งแต่สมัคร
      await signUp.create({
        emailAddress,
        password,
        unsafeMetadata: { name: cleanName },
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      console.error("Sign up error:", err);
      Alert.alert(
        "สมัครไม่สำเร็จ",
        err?.errors?.[0]?.message || "กรุณาตรวจสอบข้อมูลอีกครั้ง",
      );
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;

    if (!code) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกรหัสยืนยัน");
      return;
    }

    setLoading(true);
    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        // ✅ ไม่ต้อง user.update ตรงนี้ (ชื่ออยู่ใน unsafeMetadata แล้ว)
        router.replace("/");
      } else {
        console.log("Verification not complete:", signUpAttempt);
      }
    } catch (err) {
      console.error("Verification error:", err);
      Alert.alert("รหัสไม่ถูกต้อง", "กรุณากรอกรหัสยืนยันใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />

          <Animated.View
            style={[
              styles.logoContainer,
              { transform: [{ scale: logoScale }] },
            ]}
          >
            <View style={styles.logoCircle}>
              <Ionicons name="mail" size={44} color="#fff" />
            </View>
          </Animated.View>

          <Animated.View style={[styles.titleContainer, { opacity: fadeIn }]}>
            <Text style={styles.title}>ยืนยันอีเมล</Text>
            <Text style={styles.subtitle}>
              เราส่งรหัสยืนยันไปที่{"\n"}
              <Text style={styles.subtitleHighlight}>{emailAddress}</Text>
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formContainer,
              { opacity: fadeIn, transform: [{ translateY: slideUp }] },
            ]}
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>รหัสยืนยัน 6 หลัก</Text>
              <View
                style={[
                  styles.inputWrapper,
                  codeFocused && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="keypad-outline"
                  size={20}
                  color={codeFocused ? "#E8734A" : "#A0A0A0"}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, styles.inputOTP]}
                  placeholder="● ● ● ● ● ●"
                  placeholderTextColor="#D0D0D0"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  autoFocus
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onVerifyPress}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.buttonText}>ยืนยันและเริ่มใช้งาน</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.helperCard}>
              <View style={styles.helperIconWrapper}>
                <Ionicons name="information-circle" size={20} color="#E8734A" />
              </View>
              <Text style={styles.helperText}>
                ไม่ได้รับอีเมล? ตรวจสอบในกล่อง Spam หรือ Junk Mail
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.footer, { opacity: fadeIn }]}>
            <TouchableOpacity onPress={() => setPendingVerification(false)}>
              <Text style={styles.footerLink}>← กลับไปยังการสมัครสมาชิก</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />

        <Animated.View
          style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}
        >
          <View style={styles.logoCircle}>
            <Ionicons name="paw" size={44} color="#fff" />
          </View>
        </Animated.View>

        <Animated.View style={[styles.titleContainer, { opacity: fadeIn }]}>
          <Text style={styles.title}>สมัครสมาชิก</Text>
          <Text style={styles.subtitle}>
            สร้างบัญชีและเริ่มช่วยเหลือน้องหมาแมวจรจัดวันนี้
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.formContainer,
            { opacity: fadeIn, transform: [{ translateY: slideUp }] },
          ]}
        >
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ชื่อผู้ใช้</Text>
            <View
              style={[
                styles.inputWrapper,
                nameFocused && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={nameFocused ? "#E8734A" : "#A0A0A0"}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="ชื่อของคุณ"
                placeholderTextColor="#C0C0C0"
                value={name}
                onChangeText={setName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>อีเมล</Text>
            <View
              style={[
                styles.inputWrapper,
                emailFocused && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={emailFocused ? "#E8734A" : "#A0A0A0"}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="กรอกอีเมลของคุณ"
                placeholderTextColor="#C0C0C0"
                keyboardType="email-address"
                autoCapitalize="none"
                value={emailAddress}
                onChangeText={setEmailAddress}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>รหัสผ่าน</Text>
            <View
              style={[
                styles.inputWrapper,
                passwordFocused && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={passwordFocused ? "#E8734A" : "#A0A0A0"}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                placeholderTextColor="#C0C0C0"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="#A0A0A0"
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.passwordHint}>
              รหัสต้องมีอย่างน้อย 8 ตัวอักษร
            </Text>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ยืนยันรหัสผ่าน</Text>
            <View
              style={[
                styles.inputWrapper,
                confirmPasswordFocused && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={confirmPasswordFocused ? "#E8734A" : "#A0A0A0"}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                placeholderTextColor="#C0C0C0"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setConfirmPasswordFocused(true)}
                onBlur={() => setConfirmPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="#A0A0A0"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onSignUpPress}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="person-add" size={20} color="#fff" />
                <Text style={styles.buttonText}>สมัครสมาชิก</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.footer, { opacity: fadeIn }]}>
          <Text style={styles.footerText}>คุณมีบัญชีอยู่แล้ว? </Text>
          <Link href="/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>เข้าสู่ระบบ</Text>
            </TouchableOpacity>
          </Link>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFAF7" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 28,
    position: "relative",
  },
  bgCircle1: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#FDE8DF",
    opacity: 0.6,
  },
  bgCircle2: {
    position: "absolute",
    bottom: -40,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#FEF0E8",
    opacity: 0.5,
  },
  logoContainer: { alignItems: "center", marginBottom: 8 },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: "#E8734A",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#E8734A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  titleContainer: { alignItems: "center", marginBottom: 36 },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#9A9A9A",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 22,
  },
  subtitleHighlight: { color: "#E8734A", fontWeight: "700" },
  formContainer: { width: "100%" },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4A4A4A",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#ECECEC",
    paddingHorizontal: 14,
    height: 54,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  inputWrapperFocused: {
    borderColor: "#E8734A",
    backgroundColor: "#FFFAF7",
  },
  inputIcon: { marginRight: 12, width: 20 },
  input: { flex: 1, fontSize: 15, color: "#1A1A1A", fontWeight: "500" },
  inputOTP: {
    letterSpacing: 6,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  eyeButton: { padding: 4, marginLeft: 8 },
  passwordHint: { fontSize: 13, color: "#A0A0A0", marginTop: 8, marginLeft: 2 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#E8734A",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#E8734A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
    letterSpacing: 0.3,
  },
  helperCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFF5F0",
    borderWidth: 1,
    borderColor: "#FDE8DF",
  },
  helperIconWrapper: { marginTop: 1 },
  helperText: {
    flex: 1,
    fontSize: 14,
    color: "#8A5A4A",
    lineHeight: 20,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 36,
  },
  footerText: { fontSize: 15, color: "#9A9A9A", fontWeight: "500" },
  footerLink: { fontSize: 15, color: "#E8734A", fontWeight: "700" },
});
