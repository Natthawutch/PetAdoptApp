// app/AdoptionRequests/AdoptionRequests.jsx
// (ไฟล์นี้ไม่มี realtime อยู่แล้ว จึงคงเดิม)

import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AdoptionRequestCard from "../../components/AdoptionRequestCard";
import { createClerkSupabaseClient } from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

export default function AdoptionRequests() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRequests = async () => {
    try {
      setRefreshing(true);
      const token = await getToken({ template: "supabase" });
      const supabaseAuth = createClerkSupabaseClient(token);

      const { data, error } = await supabaseAuth
        .from("adoption_requests")
        .select(
          `
          id,
          status,
          created_at,
          requester_id,
          pets (
            id,
            name,
            image_url
          )
        `,
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRequests(data || []);
    } catch (err) {
      console.error(err);
      Alert.alert("โหลดคำขอไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateStatus = async (requestId, status) => {
    try {
      const token = await getToken({ template: "supabase" });
      const supabaseAuth = createClerkSupabaseClient(token);

      const { error } = await supabaseAuth
        .from("adoption_requests")
        .update({ status })
        .eq("id", requestId);

      if (error) throw error;

      Alert.alert(
        status === "approved" ? "รับเลี้ยงสำเร็จ 🐶" : "ปฏิเสธคำขอแล้ว",
      );
      fetchRequests();
    } catch (err) {
      console.error(err);
      Alert.alert("อัปเดตสถานะไม่สำเร็จ");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchRequests} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>ยังไม่มีคำขอรับเลี้ยง</Text>
        }
        renderItem={({ item }) => (
          <AdoptionRequestCard
            request={item}
            onApprove={() => updateStatus(item.id, "approved")}
            onReject={() => updateStatus(item.id, "rejected")}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  center: { flex: 1, justifyContent: "center" },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
    color: Colors.GRAY,
  },
});
