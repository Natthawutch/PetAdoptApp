import { useAuth, useOAuth, useSignIn } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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

WebBrowser.maybeCompleteAuthSession();

// ✨ Google Icon SVG-style via text (since we can't import SVG directly)
const GoogleIcon = ({ size = 22 }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
    }}
  >
    <Text style={{ fontSize: size - 4 }}>G</Text>
  </View>
);

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { startOAuthFlow: startGoogleOAuth } = useOAuth({
    strategy: "oauth_google",
  });

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
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
  }, []);

  // 🚀 ถ้า already signed in → redirect
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(tabs)/home");
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
      }
    } catch (err) {
      console.error("Sign in error:", err);
      Alert.alert(
        "เข้าสู่ระบบไม่สำเร็จ",
        err.errors?.[0]?.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      );
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- GOOGLE LOGIN ---------------- */
  const handleGoogleLogin = async () => {
    if (isSignedIn) return;

    try {
      const redirectUrl = Linking.createURL("oauth-native-callback");

      const { createdSessionId, setActive } = await startGoogleOAuth({
        redirectUrl,
      });

      if (createdSessionId) {
        await setActive({ session: createdSessionId });
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
        showsVerticalScrollIndicator={false}
      >
        {/* Background Decoration */}
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />

        {/* Logo / Icon Area */}
        <Animated.View
          style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}
        >
          <View style={styles.logoCircle}>
            <Ionicons name="paw" size={44} color="#fff" />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View style={[styles.titleContainer, { opacity: fadeIn }]}>
          <Text style={styles.title}>ยินดีต้อนรับกลับ</Text>
          <Text style={styles.subtitle}>เข้าสู่ระบบเพื่อดูแลเพื่อนใหม่</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: fadeIn,
              transform: [{ translateY: slideUp }],
            },
          ]}
        >
          {/* Email Input */}
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
                placeholder="คุณ@อีเมล.com"
                value={emailAddress}
                onChangeText={setEmailAddress}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#C0C0C0"
              />
            </View>
          </View>

          {/* Password Input */}
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
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholderTextColor="#C0C0C0"
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
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onSignInPress}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>หรือ</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Button */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <View style={styles.googleIconWrapper}>
              <Ionicons name="logo-google" size={22} color="#EA4335" />
            </View>
            <Text style={styles.googleText}>เข้าสู่ระบบด้วย Google</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Register Link */}
        <Animated.View style={[styles.footer, { opacity: fadeIn }]}>
          <Text style={styles.footerText}>ยังไม่มีบัญชี? </Text>
          <Link href="/register" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>สมัครสมาชิกเลย</Text>
            </TouchableOpacity>
          </Link>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFAF7",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 28,
    position: "relative",
  },

  // Background Decorations
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

  // Logo
  logoContainer: {
    alignItems: "center",
    marginBottom: 8,
  },
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
      android: {
        elevation: 8,
      },
    }),
  },

  // Title
  titleContainer: {
    alignItems: "center",
    marginBottom: 36,
  },
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
  },

  // Form
  formContainer: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 18,
  },
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
    transition: "borderColor 0.2s",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  inputWrapperFocused: {
    borderColor: "#E8734A",
    backgroundColor: "#FFFAF7",
  },
  inputIcon: {
    marginRight: 12,
    width: 20,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#1A1A1A",
    fontWeight: "500",
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },

  // Sign In Button
  button: {
    backgroundColor: "#E8734A",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#E8734A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
    letterSpacing: 0.3,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ECECEC",
  },
  dividerText: {
    fontSize: 14,
    color: "#B0B0B0",
    paddingHorizontal: 14,
    fontWeight: "600",
  },

  // Google Button
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#ECECEC",
    paddingVertical: 15,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  googleIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#FEF0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  googleText: {
    fontWeight: "700",
    fontSize: 15,
    color: "#2A2A2A",
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 36,
  },
  footerText: {
    fontSize: 15,
    color: "#9A9A9A",
    fontWeight: "500",
  },
  footerLink: {
    fontSize: 15,
    color: "#E8734A",
    fontWeight: "700",
  },
});
