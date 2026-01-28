import { useAuth, useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AboutPet from "../../components/PetDetails/AboutPet";
import OwnerInfo from "../../components/PetDetails/OwnerInfo";
import PetInfo from "../../components/PetDetails/PetInfo";
import PetSubInfo from "../../components/PetDetails/PetSubInfo";
import {
  createClerkSupabaseClient,
  supabase,
} from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

export default function PetDetails() {
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();
  const router = useRouter();

  const { user } = useUser();
  const { getToken } = useAuth();

  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  // แยก loading ของปุ่มแชท
  const [chatLoading, setChatLoading] = useState(false);

  const [buttonScale] = useState(new Animated.Value(1));

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    fetchPet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (user && pet) checkFavorite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pet]);

  /* =======================
     Fetch pet
  ======================= */
  const fetchPet = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("pets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      setLoading(false);
      Alert.alert("ไม่พบข้อมูลสัตว์เลี้ยง");
      return;
    }

    setPet(data);
    setLoading(false);
  };

  /* =======================
     Favorite logic
  ======================= */
  const checkFavorite = async () => {
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) return;

      const supabaseAuth = createClerkSupabaseClient(token);

      const { data, error } = await supabaseAuth
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("pet_id", pet.id)
        .maybeSingle();

      if (error) console.error("checkFavorite error:", error);
      setIsFavorite(!!data);
    } catch (e) {
      console.error("checkFavorite exception:", e);
    }
  };

  const toggleFavorite = async () => {
    if (!user) {
      Alert.alert("กรุณาเข้าสู่ระบบ");
      return;
    }

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) {
        Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถยืนยันตัวตนได้");
        return;
      }

      const supabaseAuth = createClerkSupabaseClient(token);

      if (isFavorite) {
        const { error } = await supabaseAuth
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("pet_id", pet.id);

        if (error) throw error;
        setIsFavorite(false);
      } else {
        const { error } = await supabaseAuth
          .from("favorites")
          .insert([{ user_id: user.id, pet_id: pet.id }]);

        if (error) throw error;
        setIsFavorite(true);
      }
    } catch (e) {
      console.error("toggleFavorite error:", e);
      Alert.alert("ทำรายการไม่สำเร็จ");
    }
  };

  /* =======================
     Verify / Trust check
  ======================= */
  const ensureVerifiedBeforeRequest = async () => {
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) {
        Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถยืนยันตัวตนได้");
        return { ok: false };
      }

      const supabaseAuth = createClerkSupabaseClient(token);

      const { data: me, error } = await supabaseAuth
        .from("users")
        .select("id, clerk_id, verification_status, verified_at")
        .eq("clerk_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!me) {
        Alert.alert("ไม่พบโปรไฟล์ผู้ใช้", "กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
        return { ok: false };
      }

      if (me.verification_status !== "verified") {
        const msg =
          me.verification_status === "pending"
            ? "ตอนนี้อยู่ระหว่างตรวจสอบ กรุณารอสักครู่"
            : "เพื่อความปลอดภัย กรุณายืนยันตัวตนก่อนส่งคำขอรับเลี้ยง";

        Alert.alert("ต้องยืนยันตัวตนก่อน", msg);
        router.push("/verify");
        return { ok: false, me };
      }

      return { ok: true, me };
    } catch (e) {
      console.error("ensureVerifiedBeforeRequest error:", e);
      Alert.alert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถตรวจสอบสถานะได้");
      return { ok: false };
    }
  };

  /* =======================
     Adoption Request
  ======================= */
  const openAdoptionRequest = async () => {
    if (!user) {
      Alert.alert("กรุณาเข้าสู่ระบบ");
      return;
    }

    if (!pet) return;

    if (user.id === pet.user_id) {
      Alert.alert("คุณเป็นเจ้าของสัตว์ตัวนี้");
      return;
    }

    const verified = await ensureVerifiedBeforeRequest();
    if (!verified.ok) return;

    router.push({
      pathname: "/adoption-request/[petId]",
      params: { petId: pet.id },
    });
  };

  /* =======================
     Chat
  ======================= */
  const InitiateChat = async () => {
    if (!user) {
      Alert.alert("กรุณาเข้าสู่ระบบ");
      return;
    }

    if (!pet) return;

    if (user.id === pet.user_id) {
      Alert.alert("คุณเป็นเจ้าของสัตว์ตัวนี้");
      return;
    }

    setChatLoading(true);

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) {
        Alert.alert(
          "ไม่สามารถยืนยันตัวตนได้",
          "กรุณาลองออกจากระบบแล้วเข้าสู่ระบบใหม่",
        );
        return;
      }

      const supabaseAuth = createClerkSupabaseClient(token);

      // ✅ สำคัญ: ห้ามใช้ '_' มาสร้าง/แยก user id เพราะ Clerk id มี '_' อยู่แล้ว
      const ids = [user.id, pet.user_id].sort();
      const u1 = ids[0];
      const u2 = ids[1];

      // ✅ ใช้ delimiter ที่ไม่ชน เช่น ':'
      const chatId = `${pet.id}:${u1}:${u2}`;

      // เช็คว่ามีห้องแล้วไหม
      const { data: existingChat, error: chatErr } = await supabaseAuth
        .from("chats")
        .select("id")
        .eq("id", chatId)
        .maybeSingle();

      if (chatErr) throw chatErr;

      if (existingChat) {
        router.push(`/chat/${chatId}`);
        return;
      }

      // สร้างห้องใหม่
      const { error: insertErr } = await supabaseAuth.from("chats").insert({
        id: chatId,
        pet_id: pet.id,
        user1_id: u1,
        user2_id: u2,
        last_message: "",
        last_message_at: new Date().toISOString(),
      });

      if (insertErr) throw insertErr;

      router.push(`/chat/${chatId}`);
    } catch (err) {
      console.error("InitiateChat error:", err);
      Alert.alert("ไม่สามารถเริ่มแชทได้", err?.message || "เกิดข้อผิดพลาด");
    } finally {
      setChatLoading(false);
    }
  };

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  if (loading || !pet) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
      </View>
    );
  }

  const isAdopted = pet.adoption_status === "adopted";

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <PetInfo
          pet={pet}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
        <PetSubInfo pet={pet} />
        <AboutPet pet={pet} />
        <OwnerInfo pet={pet} onMessagePress={InitiateChat} />
        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[styles.adoptBtn, isAdopted && styles.adoptedBtn]}
            onPress={() => {
              animateButton();
              openAdoptionRequest();
            }}
            disabled={isAdopted}
          >
            <LinearGradient
              colors={isAdopted ? ["#999", "#666"] : [Colors.PURPLE, "#8B5FBF"]}
              style={styles.gradientButton}
            >
              <Text style={styles.adoptBtnText}>
                {isAdopted ? "ถูกรับเลี้ยงแล้ว 🐾" : "ส่งคำขอรับเลี้ยง"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {chatLoading ? (
            <View style={{ marginTop: 10, alignItems: "center" }}>
              <ActivityIndicator color={Colors.PURPLE} />
              <Text style={{ marginTop: 6, color: "#666" }}>
                กำลังเริ่มแชท...
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 25 },
  bottomContainer: {
    position: "absolute",
    bottom: 20,
    width: "100%",
    paddingHorizontal: 20,
  },
  adoptBtn: { borderRadius: 30, overflow: "hidden" },
  adoptedBtn: { opacity: 0.6 },
  gradientButton: {
    paddingVertical: 16,
    alignItems: "center",
  },
  adoptBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
