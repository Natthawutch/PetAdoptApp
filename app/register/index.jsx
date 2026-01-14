import { useSignUp } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "../../constants/Colors";

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      console.error("Sign up error:", err);
      Alert.alert(
        "สมัครไม่สำเร็จ",
        err.errors?.[0]?.message || "กรุณาตรวจสอบข้อมูลอีกครั้ง"
      );
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });
      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
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
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Text style={styles.emailIcon}>📧</Text>
            </View>
            <Text style={styles.title}>ยืนยันอีเมล</Text>
            <Text style={styles.subtitle}>
              เราได้ส่งรหัสยืนยันไปที่อีเมลของคุณแล้ว
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.inputWrapper}>
              <View style={styles.inputIcon}>
                <Text style={styles.iconEmoji}>🔢</Text>
              </View>
              <View style={styles.inputContent}>
                <Text style={styles.label}>รหัสยืนยัน</Text>
                <TextInput
                  style={styles.input}
                  placeholder="000000"
                  placeholderTextColor="#B0B0B0"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onVerifyPress}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.buttonText}>ยืนยันและเริ่มใช้งาน</Text>
                  <Text style={styles.buttonEmoji}>✨</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.helperBox}>
            <Text style={styles.helperEmoji}>💡</Text>
            <Text style={styles.helperText}>
              ไม่ได้รับอีเมล? ตรวจสอบในกล่องจดหมายขยะ หรือลองส่งรหัสใหม่
            </Text>
          </View>
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
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Text style={styles.pawIcon}>❤️</Text>
          </View>
          <Text style={styles.title}>เข้าร่วมกับเรา</Text>
          <Text style={styles.subtitle}>
            สร้างบัญชีและเริ่มช่วยเหลือน้องหมาแมวจรจัดวันนี้
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputWrapper}>
            <View style={styles.inputIcon}>
              <Text style={styles.iconEmoji}>✉️</Text>
            </View>
            <View style={styles.inputContent}>
              <Text style={styles.label}>อีเมล</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === "email" && styles.inputFocused,
                ]}
                placeholder="your@email.com"
                placeholderTextColor="#B0B0B0"
                keyboardType="email-address"
                autoCapitalize="none"
                value={emailAddress}
                onChangeText={setEmailAddress}
                onFocus={() => setFocusedInput("email")}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <View style={styles.inputIcon}>
              <Text style={styles.iconEmoji}>🔒</Text>
            </View>
            <View style={styles.inputContent}>
              <Text style={styles.label}>รหัสผ่าน</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === "password" && styles.inputFocused,
                ]}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                placeholderTextColor="#B0B0B0"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput("password")}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onSignUpPress}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.buttonText}>สมัครสมาชิกฟรี</Text>
                <Text style={styles.buttonEmoji}>🐾</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <View style={styles.petIcons}></View>
          <Text style={styles.footerText}>มีบัญชีอยู่แล้ว? </Text>
          <Link href="/login" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>เข้าสู่ระบบ</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: Colors.PURPLE || "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  pawIcon: {
    fontSize: 48,
  },
  emailIcon: {
    fontSize: 44,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.PURPLE || "#8B5CF6",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#F8F8F8",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "#F0F0F0",
  },
  inputIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconEmoji: {
    fontSize: 20,
  },
  inputContent: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    color: "#1A1A1A",
    padding: 0,
    fontWeight: "500",
  },
  inputFocused: {
    color: Colors.PURPLE || "#8B5CF6",
  },
  securityBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  securityIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: "#0369A1",
    fontWeight: "500",
  },
  button: {
    backgroundColor: Colors.PURPLE || "#8B5CF6",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 8,
    shadowColor: Colors.PURPLE || "#8B5CF6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "700",
    marginRight: 8,
  },
  buttonEmoji: {
    fontSize: 18,
  },
  footer: {
    alignItems: "center",
    marginTop: 32,
  },
  petIcons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  petIcon: {
    fontSize: 28,
  },
  footerText: {
    fontSize: 15,
    color: "#666",
    marginBottom: 4,
  },
  linkText: {
    fontSize: 16,
    color: Colors.PURPLE || "#8B5CF6",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  helperBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF3C7",
    padding: 16,
    borderRadius: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  helperEmoji: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 2,
  },
  helperText: {
    flex: 1,
    fontSize: 14,
    color: "#92400E",
    lineHeight: 20,
    fontWeight: "500",
  },
});
