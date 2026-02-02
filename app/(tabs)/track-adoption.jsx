import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

export default function TrackAdoption() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isLoadingRef = useRef(false);

  const statusMeta = useMemo(() => {
    return {
      pending: { label: "รอดำเนินการ", icon: "time-outline", color: "#f59e0b" },
      approved: {
        label: "อนุมัติแล้ว",
        icon: "checkmark-circle-outline",
        color: "#22c55e",
      },
      rejected: {
        label: "ไม่อนุมัติ",
        icon: "close-circle-outline",
        color: "#ef4444",
      },
      canceled: { label: "ยกเลิก", icon: "ban-outline", color: "#6b7280" },
    };
  }, []);

  const getStatusUi = useCallback(
    (status) => {
      const key = (status || "").toString().trim().toLowerCase();
      return (
        statusMeta[key] || {
          label: status || "ไม่ทราบสถานะ",
          icon: "help-circle-outline",
          color: "#6b7280",
        }
      );
    },
    [statusMeta],
  );

  // ดึง token ใหม่ทุกครั้งที่เรียก
  const getAuthedSupabase = async () => {
    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("Missing Clerk token");
    return createClerkSupabaseClient(token);
  };

  // ใช้ useRef เก็บ function
  const loadRequestsRef = useRef(null);

  loadRequestsRef.current = async () => {
    if (!user?.id) return;

    if (isLoadingRef.current) {
      console.log("⏳ Already loading, skipping...");
      return;
    }

    isLoadingRef.current = true;

    try {
      // ✅ ดึง token ใหม่ทุกครั้ง
      const supabase = await getAuthedSupabase();

      const { data, error } = await supabase
        .from("adoption_requests")
        .select(
          `
          id,
          pet_id,
          requester_id,
          owner_id,
          status,
          created_at,
          requester_verification_status,
          requester_verified_at,
          application_answers,
          pets:pet_id (
            id,
            name,
            breed,
            category,
            image_url,
            address,
            user_id
          )
        `,
        )
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRequests(data || []);
    } catch (e) {
      console.log("❌ loadRequests error:", e);
      Alert.alert("ข้อผิดพลาด", e?.message || "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  };

  const loadRequests = useCallback(() => {
    loadRequestsRef.current?.();
  }, []);

  // โหลดครั้งแรกเมื่อ focus
  useFocusEffect(
    useCallback(() => {
      if (!isLoaded) return;
      if (!user?.id) {
        setLoading(false);
        setRequests([]);
        return;
      }

      setLoading(true);
      loadRequests();
    }, [isLoaded, user?.id, loadRequests]),
  );

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    let channel;

    const setupRealtime = async () => {
      try {
        console.log("🔌 Setting up realtime subscription");

        // ✅ ดึง token ใหม่สำหรับ realtime
        const supabase = await getAuthedSupabase();

        channel = supabase
          .channel(`track-adoption-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "adoption_requests",
              filter: `requester_id=eq.${user.id}`,
            },
            (payload) => {
              console.log("🔔 Realtime update:", payload.eventType);
              loadRequestsRef.current?.();
            },
          )
          .subscribe();
      } catch (e) {
        console.log("❌ realtime setup error:", e);
      }
    };

    setupRealtime();

    return () => {
      if (channel) {
        console.log("🔌 Unsubscribing realtime");
        channel.unsubscribe();
      }
    };
  }, [user?.id, getToken]); // เพิ่ม getToken เป็น dependency

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequestsRef.current?.();
  }, []);

  const openPet = useCallback(
    (req) => {
      const pet = req?.pets;
      if (!pet?.id) return;

      router.push({
        pathname: "/pet-details",
        params: { id: pet.id },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const pet = item?.pets;
      const st = getStatusUi(item?.status);

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => openPet(item)}
        >
          <Image
            source={{
              uri: pet?.image_url || "https://via.placeholder.com/300",
            }}
            style={styles.thumb}
          />

          <View style={{ flex: 1 }}>
            <View style={styles.rowTop}>
              <Text style={styles.petName} numberOfLines={1}>
                {pet?.name || "ไม่ระบุชื่อ"}
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: st.color + "15" },
                ]}
              >
                <Ionicons name={st.icon} size={14} color={st.color} />
                <Text style={[styles.statusText, { color: st.color }]}>
                  {st.label}
                </Text>
              </View>
            </View>

            <Text style={styles.subText} numberOfLines={1}>
              {pet?.breed || "ทั่วไป"} • {pet?.category || "-"}
            </Text>

            <View style={styles.metaRow}>
              <Ionicons name="location-sharp" size={14} color="#8B5CF6" />
              <Text style={styles.metaText} numberOfLines={1}>
                {pet?.address || "ไม่ระบุตำแหน่ง"}
              </Text>
            </View>

            <Text style={styles.timeText}>
              ส่งคำขอเมื่อ:{" "}
              {item?.created_at
                ? new Date(item.created_at).toLocaleString("th-TH")
                : "-"}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [getStatusUi, openPet],
  );

  if (!isLoaded || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
        <Text style={styles.loadingText}>กำลังโหลดสถานะคำขอ...</Text>
      </View>
    );
  }

  if (!user?.id) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color="#9ca3af" />
        <Text style={styles.emptyTitle}>กรุณาเข้าสู่ระบบ</Text>
        <Text style={styles.emptySub}>
          ต้องเข้าสู่ระบบเพื่อดูสถานะคำขอรับเลี้ยง
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ติดตามสถานะคำขอรับเลี้ยง</Text>
        <Text style={styles.headerSub}>ดูสถานะคำขอของคุณทั้งหมดได้ที่นี่</Text>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.PURPLE}
            colors={[Colors.PURPLE]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={60} color="#d1d5db" />
            <Text style={styles.emptyTitle}>ยังไม่มีคำขอรับเลี้ยง</Text>
            <Text style={styles.emptySub}>
              ลองไปเลือกสัตว์เลี้ยงที่สนใจ แล้วกดส่งคำขอได้เลย
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#111827" },
  headerSub: { marginTop: 4, color: "#6b7280", fontWeight: "600" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
  },

  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  petName: { flex: 1, fontSize: 16, fontWeight: "900", color: "#111827" },
  subText: { marginTop: 2, color: "#6b7280", fontWeight: "700" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: { fontWeight: "900", fontSize: 12 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  metaText: { flex: 1, color: "#374151", fontWeight: "600" },

  timeText: { marginTop: 8, color: "#9ca3af", fontWeight: "700", fontSize: 12 },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: { marginTop: 10, color: "#6b7280", fontWeight: "600" },

  emptyBox: { alignItems: "center", marginTop: 80, paddingHorizontal: 24 },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "900",
    color: "#374151",
  },
  emptySub: {
    marginTop: 6,
    color: "#9ca3af",
    fontWeight: "600",
    textAlign: "center",
  },
});
