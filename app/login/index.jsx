import { useAuth, useOAuth, useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from "react-native";

import Colors from "../../constants/Colors";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { startOAuthFlow: startGoogleOAuth } = useOAuth({
    strategy: "oauth_google",
  });

  // 🚀 ถ้า already signed in → redirect
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(tabs)/home"); // หรือ route ตาม role
    }
  }, [isLoaded, isSignedIn]);

  /* ---------------- EMAIL LOGIN ---------------- */
  const onSignInPress = async () => {
    if (!isLoaded || isSignedIn) return;

    if (!emailAddress || !password) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }

    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // ✅ AuthWrapper จะ redirect ให้เอง
      }
    } catch (err) {
      console.error("Sign in error:", err);
      Alert.alert(
        "เข้าสู่ระบบไม่สำเร็จ",
        err.errors?.[0]?.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- GOOGLE LOGIN ---------------- */
  const handleGoogleLogin = async () => {
    if (isSignedIn) return;

    try {
      const { createdSessionId, setActive } = await startGoogleOAuth();

      if (createdSessionId) {
        await setActive({ session: createdSessionId });
        // ✅ AuthWrapper จะ redirect ให้เอง
      }
    } catch (err) {
      console.error("Google OAuth error:", err);
      Alert.alert("เข้าสู่ระบบไม่สำเร็จ", "กรุณาลองใหม่อีกครั้ง");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>ยินดีต้อนรับกลับ</Text>

        <TextInput
          style={styles.input}
          placeholder="อีเมล"
          value={emailAddress}
          onChangeText={setEmailAddress}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="รหัสผ่าน"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={onSignInPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          <Text style={styles.googleText}>เข้าสู่ระบบด้วย Google</Text>
        </TouchableOpacity>

        <Link href="/register" asChild>
          <TouchableOpacity>
            <Text style={styles.link}>สมัครสมาชิก</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 24,
    color: Colors.PURPLE || "#8B5CF6",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.PURPLE || "#8B5CF6",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  googleButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  googleText: { fontWeight: "600", fontSize: 16 },
  link: {
    marginTop: 24,
    textAlign: "center",
    color: Colors.PURPLE || "#8B5CF6",
    fontWeight: "600",
    fontSize: 16,
  },
});
