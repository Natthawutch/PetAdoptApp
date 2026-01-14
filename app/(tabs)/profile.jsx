import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

export default function Profile() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken, signOut } = useAuth();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adoptedByMeCount, setAdoptedByMeCount] = useState(0); // 🔥 เปลี่ยนชื่อ

  /* ---------------- LOAD PROFILE ---------------- */

  const loadProfile = async () => {
    if (!user) return;
    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // 🔹 users - ดึงข้อมูลจาก Supabase users table
      const { data: userData, error } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_id", user.id)
        .single();

      if (error) throw error;

      // 🔹 pets - ดึงสัตว์ที่โพสต์โดย user คนนี้
      const { data: petPosts } = await supabase
        .from("pets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // 🔥 นับจำนวนสัตว์ที่ USER คนนี้รับเลี้ยงไป (เป็นผู้รับเลี้ยง)
      const { data: adoptedRequests, error: adoptedError } = await supabase
        .from("adoption_requests")
        .select("id")
        .eq("requester_id", user.id) // 🔥 user คนนี้เป็นผู้ขอรับเลี้ยง
        .eq("status", "approved"); // 🔥 และคำขอถูกอนุมัติ

      const adoptedCount = adoptedRequests?.length || 0;

      setProfile(userData);
      setPosts(petPosts || []);
      setAdoptedByMeCount(adoptedCount);
    } catch (e) {
      console.log(e);
      Alert.alert("ข้อผิดพลาด", "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [user])
  );

  /* ---------------- REALTIME SUBSCRIPTION ---------------- */

  useEffect(() => {
    if (!user) return;

    let petsSubscription;
    let requestsSubscription;

    const setupRealtime = async () => {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // 🔥 Subscribe 1: ฟังการเปลี่ยนแปลงของสัตว์ที่โพสต์
      petsSubscription = supabase
        .channel("profile-pets-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pets",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log("🔔 Pet change:", payload);
            loadProfile();
          }
        )
        .subscribe();

      // 🔥 Subscribe 2: ฟังการเปลี่ยนแปลงของคำขอที่ user นี้ส่ง
      requestsSubscription = supabase
        .channel("profile-requests-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "adoption_requests",
            filter: `requester_id=eq.${user.id}`,
          },
          (payload) => {
            console.log("🔔 Request change:", payload);
            loadProfile();
          }
        )
        .subscribe();
    };

    setupRealtime();

    // Cleanup
    return () => {
      if (petsSubscription) petsSubscription.unsubscribe();
      if (requestsSubscription) requestsSubscription.unsubscribe();
    };
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  /* ---------------- LOGOUT ---------------- */

  const logout = () => {
    Alert.alert("ออกจากระบบ", "คุณแน่ใจหรือไม่?", [
      { text: "ยกเลิก" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  /* ---------------- VOLUNTEER ---------------- */

  const applyVolunteer = async () => {
    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      await supabase
        .from("users")
        .update({ role: "volunteer_pending" })
        .eq("clerk_id", user.id);

      Alert.alert("สำเร็จ", "ส่งคำขอสมัครอาสาแล้ว");
      loadProfile();
    } catch {
      Alert.alert("ผิดพลาด", "ไม่สามารถสมัครได้");
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
      </View>
    );

  const isVolunteer = profile?.role === "volunteer";
  const isPending = profile?.role === "volunteer_pending";

  /* ---------------- UI ---------------- */

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={{
            uri: profile?.avatar_url || "https://www.gravatar.com/avatar/?d=mp",
          }}
          style={styles.avatar}
        />

        <Text style={styles.name}>{profile?.full_name || "ผู้ใช้งาน"}</Text>

        {/* ROLE BADGE */}
        <View
          style={[
            styles.badge,
            isPending && { backgroundColor: "#f59e0b" },
            isVolunteer && { backgroundColor: "#3b82f6" },
          ]}
        >
          <Ionicons
            name={isVolunteer ? "shield-checkmark" : "paw"}
            size={14}
            color="#fff"
          />
          <Text style={styles.badgeText}>
            {profile?.role === "user" && "ผู้ใช้งานทั่วไป"}
            {profile?.role === "volunteer_pending" && "รออนุมัติอาสา"}
            {profile?.role === "volunteer" && "อาสาสมัคร"}
            {profile?.role === "admin" && "ผู้ดูแลระบบ"}
          </Text>
        </View>

        {/* BIO */}
        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {/* ACTIONS */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push("/edit-profile")}
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.editText}>แก้ไขโปรไฟล์</Text>
          </TouchableOpacity>

          {profile?.role === "user" && (
            <TouchableOpacity
              style={styles.volunteerBtn}
              onPress={applyVolunteer}
            >
              <Ionicons name="heart" size={16} color="#fff" />
              <Text style={styles.editText}>สมัครอาสา</Text>
            </TouchableOpacity>
          )}
        </View>

        {isPending && <Text style={styles.pending}>⏳ กำลังรอการอนุมัติ</Text>}
      </View>

      {/* STATS */}
      <View style={styles.stats}>
        <Stat label="โพสต์สัตว์" value={posts.length} icon="paw" />
        <Stat label="รับเลี้ยงแล้ว" value={adoptedByMeCount} icon="heart" />
        {isVolunteer && <Stat label="ดูแลอยู่" value="0" icon="medkit" />}
      </View>

      {/* POSTS */}
      <View style={{ paddingBottom: 30 }}>
        <Text style={styles.section}>โพสต์ของฉัน</Text>

        {posts.length > 0 ? (
          posts.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.petCard}
              onPress={() =>
                router.push({
                  pathname: "/pet-details",
                  params: { id: item.id },
                })
              }
            >
              <Image source={{ uri: item.image_url }} style={styles.petImage} />
              <View style={styles.petInfo}>
                <Text style={styles.petName}>{item.name}</Text>

                {/* 🔥 แสดงสถานะการรับเลี้ยง */}
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      item.adoption_status === "adopted" && {
                        backgroundColor: "#22c55e",
                      },
                      item.adoption_status === "available" && {
                        backgroundColor: "#3b82f6",
                      },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {item.adoption_status === "adopted"
                        ? "✓ ถูกรับเลี้ยงแล้ว"
                        : "• พร้อมรับเลี้ยง"}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.empty}>ยังไม่มีโพสต์สัตว์</Text>
        )}
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ---------------- COMPONENTS ---------------- */

const Stat = ({ label, value, icon }) => (
  <View style={styles.statCard}>
    <Ionicons name={icon} size={20} color={Colors.PURPLE} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: Colors.PURPLE,
    paddingTop: 60,
    paddingBottom: 30,
    alignItems: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: "#fff",
  },
  name: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 12,
  },
  bio: {
    color: "#e5e7eb",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 30,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#22c55e",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  editBtn: {
    flexDirection: "row",
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: "center",
    gap: 6,
  },
  volunteerBtn: {
    flexDirection: "row",
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: "center",
    gap: 6,
  },
  editText: { color: "#fff", fontWeight: "700" },

  pending: { color: "#fde68a", marginTop: 8, fontWeight: "600" },

  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: -20,
    paddingHorizontal: 16,
  },
  statCard: {
    backgroundColor: "#fff",
    width: "28%",
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
    elevation: 4,
  },
  statValue: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  statLabel: { fontSize: 12, color: "#888" },

  section: {
    marginTop: 30,
    marginLeft: 20,
    fontSize: 18,
    fontWeight: "700",
  },
  petCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
  },
  petImage: { width: 90, height: 90 },
  petInfo: { padding: 12, justifyContent: "center", flex: 1 },
  petName: { fontWeight: "700", fontSize: 16 },

  statusRow: { marginTop: 6 },
  statusBadge: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  empty: { textAlign: "center", marginTop: 30, color: "#aaa" },

  logout: {
    margin: 20,
    backgroundColor: "#ef4444",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 40,
  },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
