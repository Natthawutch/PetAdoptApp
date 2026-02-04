/* ============================
   PetDetails.jsx  (Full Code)
   ✅ กันส่งซ้ำ: ถ้ามี adoption_requests ของ user+pet เป็น pending/approved จะกดส่งไม่ได้
   ✅ ยกเลิกได้: ยกเลิกแบบ "ชัวร์" โดย update จาก myAdoptionRequest.id (ไม่พึ่ง status)
   ✅ มี debugLog: โชว์ rows ก่อน/หลังยกเลิก เพื่อหาว่าเป็น RLS หรือ status ไม่ตรง
   ⚠️ ถ้า LOG cancelled rows ยังเป็น 0 และ error ว่าง = RLS UPDATE policy บล็อก 99%
============================ */
import { useAuth, useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  SafeAreaView,
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
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  const [chatLoading, setChatLoading] = useState(false);
  const [buttonScale] = useState(new Animated.Value(1));

  // ✅ my adoption request
  const [myAdoptionRequest, setMyAdoptionRequest] = useState(null);
  const [reqLoading, setReqLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    fetchPetAndOwner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (user && pet) checkFavorite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pet]);

  useEffect(() => {
    if (user && pet) fetchMyAdoptionRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pet]);

  /* =======================
     Fetch owner (token เพื่อผ่าน RLS)
  ======================= */
  const fetchOwnerByClerkId = async (clerkId) => {
    if (!clerkId) return null;

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) return null;

      const supabaseAuth = createClerkSupabaseClient(token);

      const { data, error } = await supabaseAuth
        .from("users")
        .select("clerk_id, full_name, avatar_url, email, phone")
        .eq("clerk_id", clerkId)
        .maybeSingle();

      if (error) {
        console.log("❌ fetchOwnerByClerkId error:", error);
        return null;
      }

      return data || null;
    } catch (e) {
      console.log("❌ fetchOwnerByClerkId exception:", e);
      return null;
    }
  };

  /* =======================
     Fetch pet + owner
  ======================= */
  const fetchPetAndOwner = async () => {
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

    const ownerData = await fetchOwnerByClerkId(data?.user_id);
    setOwner(ownerData);

    setLoading(false);
  };

  /* =======================
     Favorite
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
     Adoption Request: fetch ของฉัน
     - หา active (pending/approved) ก่อนเสมอ
  ======================= */
  const fetchMyAdoptionRequest = async () => {
    if (!user || !pet) return;

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) return;

      const supabaseAuth = createClerkSupabaseClient(token);

      const { data: active, error: activeErr } = await supabaseAuth
        .from("adoption_requests")
        .select("id,status,created_at,pet_id,requester_id")
        .eq("pet_id", pet.id)
        .eq("requester_id", user.id)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeErr) throw activeErr;

      if (active) {
        setMyAdoptionRequest(active);
        return;
      }

      const { data: latest, error: latestErr } = await supabaseAuth
        .from("adoption_requests")
        .select("id,status,created_at,pet_id,requester_id")
        .eq("pet_id", pet.id)
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr) throw latestErr;

      setMyAdoptionRequest(latest || null);
    } catch (e) {
      console.log("❌ fetchMyAdoptionRequest error:", e);
      setMyAdoptionRequest(null);
    }
  };

  /* =======================
     Adoption Request: open + กันส่งซ้ำ
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

    setReqLoading(true);
    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) {
        Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถยืนยันตัวตนได้");
        return;
      }

      const supabaseAuth = createClerkSupabaseClient(token);

      const { data: active, error } = await supabaseAuth
        .from("adoption_requests")
        .select("id,status,created_at")
        .eq("pet_id", pet.id)
        .eq("requester_id", user.id)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (active) {
        setMyAdoptionRequest(active);
        Alert.alert(
          "ส่งคำขอแล้ว",
          active.status === "pending"
            ? "คุณส่งคำขอไปแล้ว และกำลังรอการตอบกลับ"
            : "คำขอของคุณได้รับการอนุมัติแล้ว",
        );
        return;
      }

      const verified = await ensureVerifiedBeforeRequest();
      if (!verified.ok) return;

      router.push({
        pathname: "/adoption-request/[petId]",
        params: { petId: pet.id },
      });
    } catch (e) {
      console.log("❌ openAdoptionRequest error:", e);
      Alert.alert("ผิดพลาด", e?.message || "ไม่สามารถตรวจสอบคำขอได้");
    } finally {
      setReqLoading(false);
    }
  };

  /* =======================
     Debug helper (optional)
     - จะ log ทุก request ของ user+pet เพื่อดู status จริง
  ======================= */
  const debugMyRequests = async () => {
    if (!user || !pet) return;

    try {
      const token = await getToken({ template: "supabase", skipCache: true });
      if (!token) return;

      const supabaseAuth = createClerkSupabaseClient(token);

      const { data, error } = await supabaseAuth
        .from("adoption_requests")
        .select("id,status,created_at,pet_id,requester_id")
        .eq("pet_id", pet.id)
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });

      console.log("🧾 my requests (all):", data, error);
    } catch (e) {
      console.log("❌ debugMyRequests error:", e);
    }
  };

  /* =======================
     Adoption Request: cancel
     - update จาก myAdoptionRequest.id (ชัวร์สุด)
     - แล้วตามด้วย update ทุก pending (กันข้อมูลซ้ำ)
     - ถ้ายังได้ 0 rows (และ error ว่าง) = RLS UPDATE policy บล็อกเกือบแน่นอน
  ======================= */
  const cancelMyAdoptionRequest = async () => {
    if (!user || !pet) return;

    if (!myAdoptionRequest?.id) {
      Alert.alert("ไม่พบคำขอของคุณ", "ลองเข้าใหม่อีกครั้ง");
      return;
    }

    Alert.alert("ยกเลิกคำขอ", "คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคำขอรับเลี้ยง?", [
      { text: "ไม่ยกเลิก", style: "cancel" },
      {
        text: "ยกเลิกคำขอ",
        style: "destructive",
        onPress: async () => {
          setReqLoading(true);
          try {
            const token = await getToken({
              template: "supabase",
              skipCache: true,
            });
            if (!token) {
              Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถยืนยันตัวตนได้");
              return;
            }

            const supabaseAuth = createClerkSupabaseClient(token);

            // (optional) log ก่อนยกเลิก
            await debugMyRequests();

            // ✅ 1) ยกเลิก record ที่ UI ถืออยู่ (id นี้)
            const { data: byIdData, error: byIdErr } = await supabaseAuth
              .from("adoption_requests")
              .update({ status: "cancelled" })
              .eq("id", myAdoptionRequest.id)
              .select("id,status,created_at");

            if (byIdErr) throw byIdErr;

            console.log("✅ cancel by id rows:", byIdData?.length, byIdData);

            // ✅ 2) กันเคสเคยส่งซ้ำ: ยกเลิกทุก pending ของ user+pet
            const { data: pendingData, error: pendingErr } = await supabaseAuth
              .from("adoption_requests")
              .update({ status: "cancelled" })
              .eq("pet_id", pet.id)
              .eq("requester_id", user.id)
              .in("status", ["pending", "approved"]) // ถ้าคุณอยากยกเลิกเฉพาะ pending ให้เปลี่ยนเป็น .eq("status","pending")
              .select("id,status,created_at");

            if (pendingErr) throw pendingErr;

            console.log(
              "✅ cancel active rows:",
              pendingData?.length,
              pendingData,
            );

            // ถ้าไม่โดนเลย -> RLS UPDATE policy บล็อกเกือบแน่นอน
            if (
              (byIdData?.length || 0) === 0 &&
              (pendingData?.length || 0) === 0
            ) {
              Alert.alert(
                "ยกเลิกไม่ได้",
                "ระบบไม่อนุญาตให้แก้ไขคำขอ (น่าจะติด RLS policy ของ adoption_requests)\n\nให้ไปเพิ่ม UPDATE policy: requester_id = auth.uid()",
              );
              return;
            }

            Alert.alert("สำเร็จ", "ยกเลิกคำขอแล้ว");
            await fetchMyAdoptionRequest();

            // (optional) log หลังยกเลิก
            await debugMyRequests();
          } catch (e) {
            console.log("❌ cancelMyAdoptionRequest error:", e);
            Alert.alert("ยกเลิกไม่สำเร็จ", e?.message || "เกิดข้อผิดพลาด");
          } finally {
            setReqLoading(false);
          }
        },
      },
    ]);
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

      const ids = [user.id, pet.user_id].sort();
      const u1 = ids[0];
      const u2 = ids[1];

      const chatId = `${pet.id}:${u1}:${u2}`;

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
        toValue: 0.96,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start();
  };

  if (loading || !pet) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
      </View>
    );
  }

  const isAdopted = pet.adoption_status === "adopted";
  const myReqStatus = myAdoptionRequest?.status || null;
  const hasActiveRequest = ["pending", "approved"].includes(myReqStatus);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <PetInfo
            pet={pet}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
          <PetSubInfo pet={pet} />
          <AboutPet pet={pet} />
          <OwnerInfo pet={pet} owner={owner} onMessagePress={InitiateChat} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[
                styles.adoptBtn,
                (isAdopted || hasActiveRequest || reqLoading) &&
                  styles.adoptedBtn,
              ]}
              onPress={() => {
                animateButton();
                openAdoptionRequest();
              }}
              disabled={isAdopted || hasActiveRequest || reqLoading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={
                  isAdopted || hasActiveRequest
                    ? ["#9CA3AF", "#6B7280"]
                    : [Colors.PURPLE, "#8B5FBF"]
                }
                style={styles.gradientButton}
              >
                <Text style={styles.adoptBtnText}>
                  {isAdopted
                    ? "ถูกรับเลี้ยงแล้ว 🐾"
                    : hasActiveRequest
                      ? myReqStatus === "pending"
                        ? "ส่งคำขอแล้ว (รออนุมัติ)"
                        : "คำขอได้รับอนุมัติแล้ว"
                      : reqLoading
                        ? "กำลังตรวจสอบ..."
                        : "ส่งคำขอรับเลี้ยง"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {myReqStatus === "pending" && (
              <TouchableOpacity
                style={[styles.cancelBtn, reqLoading && { opacity: 0.7 }]}
                onPress={cancelMyAdoptionRequest}
                disabled={reqLoading}
                activeOpacity={0.9}
              >
                <Text style={styles.cancelBtnText}>ยกเลิกคำขอ</Text>
              </TouchableOpacity>
            )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.PURPLE,
    paddingTop: 25,
  },
  page: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: 160,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 18 : 14,
    paddingTop: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  adoptBtn: { borderRadius: 30, overflow: "hidden" },
  adoptedBtn: { opacity: 0.75 },
  gradientButton: {
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 30,
  },
  adoptBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },

  cancelBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  cancelBtnText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "700",
  },
});
