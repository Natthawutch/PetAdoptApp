import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

export default function AdminVolunteers() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);

  const load = async () => {
    setLoading(true);
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);

    const { data, error } = await supabase
      .from("users")
      .select("id, clerk_id, full_name, email, role, created_at") // ✅ เพิ่ม clerk_id
      .eq("role", "volunteer_pending");

    console.log("ADMIN VOLUNTEERS:", data, error);

    if (error) {
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
    }

    setList(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (clerkId) => {
    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      console.log("🔍 Approving clerk_id:", clerkId);

      const { data, error } = await supabase
        .from("users")
        .update({ role: "volunteer" })
        .eq("clerk_id", clerkId) // ✅ ใช้ clerk_id (text) ไม่ใช่ id (uuid)
        .select();

      console.log("✅ APPROVE RESULT:", data, error);

      if (error) {
        Alert.alert("เกิดข้อผิดพลาด", error.message);
        return;
      }

      Alert.alert("สำเร็จ", "อนุมัติอาสาสมัครเรียบร้อยแล้ว");
      load();
    } catch (e) {
      console.error("❌ Approve error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถอนุมัติได้");
    }
  };

  const reject = async (clerkId) => {
    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data, error } = await supabase
        .from("users")
        .update({ role: "user" })
        .eq("clerk_id", clerkId)
        .select();

      console.log("✅ REJECT RESULT:", data, error);

      if (error) {
        Alert.alert("เกิดข้อผิดพลาด", error.message);
        return;
      }

      Alert.alert("สำเร็จ", "ปฏิเสธคำขอเรียบร้อยแล้ว");
      load();
    } catch (e) {
      console.error("❌ Reject error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถปฏิเสธได้");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>คำขออาสาสมัคร</Text>

      {list.length === 0 ? (
        <Text style={styles.empty}>ไม่มีคำขออาสาสมัคร</Text>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.email}>{item.email}</Text>
                <Text style={styles.date}>
                  สมัครเมื่อ{" "}
                  {new Date(item.created_at).toLocaleDateString("th-TH")}
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.approveBtn]}
                  onPress={() => approve(item.clerk_id)}
                >
                  <Text style={styles.btnText}>อนุมัติ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.rejectBtn]}
                  onPress={() => reject(item.clerk_id)}
                >
                  <Text style={styles.btnText}>ปฏิเสธ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 15,
    marginTop: 20,
    color: "#333",
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#999",
    fontSize: 15,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  email: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  date: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
  },
  actions: {
    flexDirection: "column",
    gap: 8,
    justifyContent: "center",
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  approveBtn: {
    backgroundColor: "#22c55e",
  },
  rejectBtn: {
    backgroundColor: "#ef4444",
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
