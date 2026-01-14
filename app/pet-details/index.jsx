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
  const [isLoading, setIsLoading] = useState(false);
  const [buttonScale] = useState(new Animated.Value(1));

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });

    fetchPet();
  }, [id]);

  useEffect(() => {
    if (user && pet) checkFavorite();
  }, [user, pet]);

  /* =======================
     Fetch pet
  ======================= */
  const fetchPet = async () => {
    const { data, error } = await supabase
      .from("pets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
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
    const token = await getToken({ template: "supabase" });
    const supabaseAuth = createClerkSupabaseClient(token);

    const { data } = await supabaseAuth
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("pet_id", pet.id)
      .maybeSingle();

    setIsFavorite(!!data);
  };

  const toggleFavorite = async () => {
    if (!user) {
      Alert.alert("กรุณาเข้าสู่ระบบ");
      return;
    }

    const token = await getToken({ template: "supabase" });
    const supabaseAuth = createClerkSupabaseClient(token);

    if (isFavorite) {
      await supabaseAuth
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("pet_id", pet.id);
      setIsFavorite(false);
    } else {
      await supabaseAuth.from("favorites").insert([
        {
          user_id: user.id,
          pet_id: pet.id,
        },
      ]);
      setIsFavorite(true);
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

    if (user.id === pet.user_id) {
      Alert.alert("คุณเป็นเจ้าของสัตว์ตัวนี้");
      return;
    }

    setIsLoading(true);

    try {
      const token = await getToken({ template: "supabase" });
      const supabaseAuth = createClerkSupabaseClient(token);

      // 🔥 เช็คว่าสัตว์ตัวนี้ถูกรับเลี้ยงไปแล้วหรือยัง
      const { data: currentPet } = await supabaseAuth
        .from("pets")
        .select("adoption_status")
        .eq("id", pet.id)
        .single();

      if (currentPet?.adoption_status === "adopted") {
        Alert.alert("ไม่สามารถส่งคำขอได้", "สัตว์ตัวนี้ถูกรับเลี้ยงไปแล้ว 😢");
        return;
      }

      // 1️⃣ เช็คว่ามีคำขออยู่แล้วหรือยัง
      const { data: existingRequest } = await supabaseAuth
        .from("adoption_requests")
        .select("id, status")
        .eq("pet_id", pet.id)
        .eq("requester_id", user.id)
        .maybeSingle();

      if (existingRequest) {
        Alert.alert(
          "คุณส่งคำขอไปแล้ว",
          existingRequest.status === "pending"
            ? "กรุณารอเจ้าของตอบกลับ"
            : "คำขอของคุณถูกปิดไปแล้ว"
        );
        return;
      }

      // 2️⃣ สร้างคำขอใหม่
      const { error } = await supabaseAuth.from("adoption_requests").insert({
        pet_id: pet.id,
        requester_id: user.id,
        owner_id: pet.user_id,
        status: "pending",
      });

      if (error) throw error;

      Alert.alert("ส่งคำขอรับเลี้ยงสำเร็จ 🐶", "รอเจ้าของสัตว์ตอบกลับ");
    } catch (err) {
      console.error("Adoption request error:", err);
      Alert.alert("ไม่สามารถส่งคำขอได้");
    } finally {
      setIsLoading(false);
    }
  };

  /* =======================
     Chat
  ======================= */
  const InitiateChat = async () => {
    if (!user) {
      Alert.alert("กรุณาเข้าสู่ระบบ");
      return;
    }

    if (user.id === pet.user_id) {
      Alert.alert("คุณเป็นเจ้าของสัตว์ตัวนี้");
      return;
    }

    setIsLoading(true);

    try {
      const token = await getToken({ template: "supabase" });
      const supabaseAuth = createClerkSupabaseClient(token);

      const chatId = [user.id, pet.user_id].sort().join("_");

      const { data: existingChat } = await supabaseAuth
        .from("chats")
        .select("id")
        .eq("id", chatId)
        .maybeSingle();

      if (!existingChat) {
        const { error } = await supabaseAuth.from("chats").insert({
          id: chatId,
          user1_id: user.id,
          user2_id: pet.user_id,
          last_message: "",
          last_message_at: new Date().toISOString(),
        });

        if (error) throw error;
      }

      router.push(`/chat/${chatId}`);
    } catch (err) {
      console.error("InitiateChat error:", err);
      Alert.alert("ไม่สามารถเริ่มแชทได้");
    } finally {
      setIsLoading(false);
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

  // 🔥 ตรวจสอบสถานะสัตว์ เพื่อแสดง UI ที่เหมาะสม
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

      {/* Bottom CTA */}
      <View style={styles.bottomContainer}>
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[styles.adoptBtn, isAdopted && styles.adoptedBtn]}
            onPress={openAdoptionRequest}
            disabled={isLoading || isAdopted}
          >
            <LinearGradient
              colors={isAdopted ? ["#999", "#666"] : [Colors.PURPLE, "#8B5FBF"]}
              style={styles.gradientButton}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.adoptBtnText}>
                  {isAdopted ? "ถูกรับเลี้ยงแล้ว 🐾" : "ส่งคำขอรับเลี้ยง"}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
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
