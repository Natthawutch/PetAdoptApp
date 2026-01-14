import { useAuth } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Button,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

export default function RequestDetail() {
  const { id } = useLocalSearchParams();
  const { getToken } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);

  useEffect(() => {
    fetchRequest();
  }, [id]);

  const fetchRequest = async () => {
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);

    const { data, error } = await supabase
      .from("adoption_requests")
      .select("*, pets(id, name, adoption_status)")
      .eq("id", id)
      .single();

    if (!error) setRequest(data);
    setLoading(false);
  };

  const updateStatus = async (status) => {
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);

    try {
      // 🔥 ถ้าเป็นการอนุมัติ ต้องเช็คก่อนว่าสัตว์ถูกรับเลี้ยงไปแล้วหรือยัง
      if (status === "approved") {
        const { data: currentPet } = await supabase
          .from("pets")
          .select("adoption_status")
          .eq("id", request.pet_id)
          .single();

        if (currentPet?.adoption_status === "adopted") {
          Alert.alert("ไม่สามารถอนุมัติได้", "สัตว์ตัวนี้ถูกรับเลี้ยงไปแล้ว");
          router.back();
          return;
        }

        // ✅ อนุมัติคำขอ + อัปเดตสถานะสัตว์เป็น "adopted"
        const { error: updatePetError } = await supabase
          .from("pets")
          .update({ adoption_status: "adopted" })
          .eq("id", request.pet_id);

        if (updatePetError) throw updatePetError;

        // 🔥 ปฏิเสธคำขออื่นๆ ที่ pending ของสัตว์ตัวเดียวกัน
        await supabase
          .from("adoption_requests")
          .update({ status: "rejected" })
          .eq("pet_id", request.pet_id)
          .eq("status", "pending")
          .neq("id", id); // ยกเว้นคำขอที่กำลังอนุมัติ
      }

      // อัปเดตสถานะคำขอ
      const { error } = await supabase
        .from("adoption_requests")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      Alert.alert(
        "สำเร็จ",
        status === "approved"
          ? "คุณตอบรับคำขอแล้ว คำขออื่นๆ จะถูกปฏิเสธอัตโนมัติ"
          : "คุณปฏิเสธคำขอแล้ว"
      );

      router.back();
    } catch (err) {
      console.error("Update status error:", err);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถอัปเดตสถานะได้");
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.container}>
        <Text>ไม่พบข้อมูลคำขอ</Text>
      </View>
    );
  }

  const isAlreadyAdopted = request.pets?.adoption_status === "adopted";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>คำขอรับเลี้ยง</Text>
      <Text style={styles.sub}>Request ID: {id}</Text>
      <Text style={styles.sub}>สัตว์: {request.pets?.name}</Text>
      <Text style={styles.sub}>สถานะ: {request.status}</Text>

      {isAlreadyAdopted && (
        <View
          style={{
            backgroundColor: "#ffebee",
            padding: 12,
            borderRadius: 8,
            marginVertical: 12,
          }}
        >
          <Text style={{ color: "#c62828", fontWeight: "600" }}>
            ⚠️ สัตว์ตัวนี้ถูกรับเลี้ยงไปแล้ว
          </Text>
        </View>
      )}

      {request.status === "pending" && !isAlreadyAdopted && (
        <>
          <Button
            title="✅ ตอบรับคำขอ"
            onPress={() => updateStatus("approved")}
          />
          <View style={{ height: 12 }} />
          <Button
            title="❌ ปฏิเสธ"
            color="red"
            onPress={() => updateStatus("rejected")}
          />
        </>
      )}

      {request.status !== "pending" && (
        <Text style={{ marginTop: 20, color: "#666", textAlign: "center" }}>
          คำขอนี้ถูกดำเนินการแล้ว
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "800" },
  sub: { color: "#666", marginVertical: 4 },
});
