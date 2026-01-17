import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

const { width } = Dimensions.get("window");

export default function Profile() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken, signOut } = useAuth();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adoptedByMeCount, setAdoptedByMeCount] = useState(0);
  const [myVolunteerRequest, setMyVolunteerRequest] = useState(null);

  const clerkId = user?.id ?? null;

  const loadProfile = async () => {
    if (!user) return;
    try {
      setLoading(true);

      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data: userData, error } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_id", user.id)
        .single();

      if (error) throw error;

      const finalProfile = {
        ...userData,
        full_name:
          userData?.full_name ||
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.fullName ||
          user.username ||
          "ผู้ใช้งาน",
        avatar_url:
          userData?.avatar_url ||
          user.imageUrl ||
          user.profileImageUrl ||
          "https://www.gravatar.com/avatar/?d=mp",
        email: userData?.email || user.primaryEmailAddress?.emailAddress || "",
      };

      const { data: vr, error: vrErr } = await supabase
        .from("volunteer_requests")
        .select("id,status,created_at")
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vrErr) throw vrErr;
      setMyVolunteerRequest(vr);

      const { data: petPosts, error: petErr } = await supabase
        .from("pets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (petErr) throw petErr;

      const { data: adoptedRequests, error: adoptErr } = await supabase
        .from("adoption_requests")
        .select("id")
        .eq("requester_id", user.id)
        .eq("status", "approved");

      if (adoptErr) throw adoptErr;

      setProfile(finalProfile);
      setPosts(petPosts || []);
      setAdoptedByMeCount(adoptedRequests?.length || 0);
    } catch (e) {
      console.log("❌ loadProfile error:", e);
      Alert.alert("ข้อผิดพลาด", e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [user])
  );

  useEffect(() => {
    if (!user) return;

    let petsSubscription;
    let requestsSubscription;

    const setupRealtime = async () => {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

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
          () => loadProfile()
        )
        .subscribe();

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
          () => loadProfile()
        )
        .subscribe();
    };

    setupRealtime();

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

  const goEditPost = (petId) => {
    router.push({
      pathname: "/edit-pet",
      params: { id: petId },
    });
  };

  const deletePost = async (petId) => {
    Alert.alert("ลบโพสต์", "คุณต้องการลบโพสต์นี้ใช่ไหม?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            if (!user) return;

            const token = await getToken({ template: "supabase" });
            const supabase = createClerkSupabaseClient(token);

            const { error } = await supabase
              .from("pets")
              .delete()
              .eq("id", petId)
              .eq("user_id", user.id);

            if (error) {
              console.log("❌ deletePost error:", error);
              Alert.alert("ลบไม่สำเร็จ", error.message);
              return;
            }

            setPosts((prev) => prev.filter((p) => p.id !== petId));
            Alert.alert("สำเร็จ", "ลบโพสต์แล้ว");
          } catch (e) {
            console.log("❌ deletePost exception:", e);
            Alert.alert("ผิดพลาด", e?.message || "ไม่สามารถลบโพสต์ได้");
          }
        },
      },
    ]);
  };

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

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PURPLE} />
        <Text style={styles.loadingText}>กำลังโหลดโปรไฟล์...</Text>
      </View>
    );

  const isVolunteer = profile?.role === "volunteer";
  const isAdmin = profile?.role === "admin";
  const isPending = myVolunteerRequest?.status === "pending";

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.PURPLE}
          colors={[Colors.PURPLE]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header with Gradient */}
      <View style={styles.headerContainer}>
        <View style={styles.gradientOverlay} />

        <View style={styles.header}>
          {/* Avatar with glow effect */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow} />
            <Image
              source={{
                uri:
                  profile?.avatar_url ||
                  "https://www.gravatar.com/avatar/?d=mp",
              }}
              style={styles.avatar}
            />
            <TouchableOpacity
              style={styles.avatarEditBtn}
              onPress={() => router.push("/edit-profile")}
            >
              <Ionicons name="camera" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{profile?.full_name || "ผู้ใช้งาน"}</Text>
          <Text style={styles.email}>{profile?.email || ""}</Text>

          {/* Role Badge */}
          <View
            style={[
              styles.badge,
              isPending && styles.badgePending,
              isVolunteer && styles.badgeVolunteer,
              isAdmin && styles.badgeAdmin,
            ]}
          >
            <Ionicons
              name={
                isAdmin
                  ? "shield"
                  : isVolunteer
                  ? "shield-checkmark"
                  : isPending
                  ? "time"
                  : "person"
              }
              size={14}
              color="#fff"
            />
            <Text style={styles.badgeText}>
              {isAdmin && "ผู้ดูแลระบบ"}
              {!isAdmin && isVolunteer && "อาสาสมัคร"}
              {!isAdmin && !isVolunteer && isPending && "รออนุมัติอาสา"}
              {!isAdmin && !isVolunteer && !isPending && "ผู้ใช้งานทั่วไป"}
            </Text>
          </View>

          {profile?.bio && (
            <View style={styles.bioContainer}>
              <Text style={styles.bio}>{profile.bio}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => router.push("/edit-profile")}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.editText}>แก้ไขโปรไฟล์</Text>
            </TouchableOpacity>

            {profile?.role === "user" && !isPending && (
              <TouchableOpacity
                style={styles.volunteerBtn}
                onPress={() => router.push("/apply-volunteer")}
              >
                <Ionicons name="heart" size={18} color="#fff" />
                <Text style={styles.editText}>สมัครอาสา</Text>
              </TouchableOpacity>
            )}
          </View>

          {isPending && (
            <View style={styles.pendingContainer}>
              <Ionicons name="time-outline" size={16} color="#f59e0b" />
              <Text style={styles.pending}>กำลังรอการอนุมัติจากผู้ดูแล</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.stats}>
        <StatCard
          label="โพสต์สัตว์"
          value={posts.length}
          icon="paw"
          color="#8B5CF6"
          gradient={["#9333ea", "#7c3aed"]}
        />
        <StatCard
          label="รับเลี้ยงแล้ว"
          value={adoptedByMeCount}
          icon="heart"
          color="#ef4444"
          gradient={["#f43f5e", "#ef4444"]}
        />
        {isVolunteer && (
          <StatCard
            label="ดูแลอยู่"
            value="0"
            icon="medkit"
            color="#10b981"
            gradient={["#34d399", "#10b981"]}
          />
        )}
      </View>

      {/* Posts Section */}
      <View style={styles.postsSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="grid" size={20} color="#111827" />
            <Text style={styles.sectionTitle}>โพสต์ของฉัน</Text>
          </View>
          <View style={styles.postCountBadge}>
            <Text style={styles.postCountText}>{posts.length}</Text>
          </View>
        </View>

        {posts.length > 0 ? (
          <View style={styles.postsGrid}>
            {posts.map((item) => {
              const isOwner = item.user_id === clerkId;

              return (
                <View key={item.id} style={styles.petCard}>
                  <Pressable
                    style={styles.petPressArea}
                    onPress={() =>
                      router.push({
                        pathname: "/pet-details",
                        params: { id: item.id },
                      })
                    }
                  >
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.petImage}
                    />

                    <View style={styles.petOverlay}>
                      <View
                        style={[
                          styles.statusBadge,
                          item.adoption_status === "adopted"
                            ? styles.statusAdopted
                            : styles.statusAvailable,
                        ]}
                      >
                        <Ionicons
                          name={
                            item.adoption_status === "adopted"
                              ? "checkmark-circle"
                              : "heart"
                          }
                          size={12}
                          color="#fff"
                        />
                        <Text style={styles.statusText}>
                          {item.adoption_status === "adopted"
                            ? "รับเลี้ยงแล้ว"
                            : "พร้อมรับเลี้ยง"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.petInfo}>
                      <Text style={styles.petName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.petMeta}>
                        <Ionicons name="location" size={12} color="#9ca3af" />
                        <Text style={styles.petMetaText} numberOfLines={1}>
                          {item.location || "ไม่ระบุตำแหน่ง"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {isOwner && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.editActionBtn]}
                        onPress={() => goEditPost(item.id)}
                      >
                        <Ionicons
                          name="create-outline"
                          size={16}
                          color="#3b82f6"
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteActionBtn]}
                        onPress={() => deletePost(item.id)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#ef4444"
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="paw" size={40} color="#d1d5db" />
            </View>
            <Text style={styles.emptyTitle}>ยังไม่มีโพสต์สัตว์</Text>
            <Text style={styles.emptySubtitle}>
              เริ่มโพสต์สัตว์ที่ต้องการหาบ้านใหม่กันเลย
            </Text>
            <TouchableOpacity
              style={styles.addPostBtn}
              onPress={() => router.push("/add-post")}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addPostText}>โพสต์สัตว์</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const StatCard = ({ label, value, icon, color, gradient }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconCircle, { backgroundColor: color + "20" }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
  },

  // Header
  headerContainer: {
    position: "relative",
    backgroundColor: Colors.PURPLE,
    paddingBottom: 30,
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  header: {
    paddingTop: 60,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatarGlow: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.3)",
    top: -10,
    left: -10,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: "#fff",
  },
  avatarEditBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.PURPLE,
    borderWidth: 3,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  name: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 4,
  },
  email: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginBottom: 12,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#6b7280",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgePending: {
    backgroundColor: "#f59e0b",
  },
  badgeVolunteer: {
    backgroundColor: "#3b82f6",
  },
  badgeAdmin: {
    backgroundColor: "#111827",
  },
  badgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  bioContainer: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
  },
  bio: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  editBtn: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  volunteerBtn: {
    flexDirection: "row",
    backgroundColor: "#ef4444",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    gap: 8,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  editText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  pendingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pending: {
    color: "#fef3c7",
    fontWeight: "600",
    fontSize: 13,
  },

  // Stats
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: -30,
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    backgroundColor: "#fff",
    flex: 1,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  statIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    fontWeight: "600",
  },

  // Posts Section
  postsSection: {
    marginTop: 30,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  postCountBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  postCountText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
  },

  postsGrid: {
    gap: 16,
  },

  petCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  petPressArea: {
    flexDirection: "row",
  },
  petImage: {
    width: 120,
    height: 120,
  },
  petOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusAvailable: {
    backgroundColor: "rgba(59, 130, 246, 0.95)",
  },
  statusAdopted: {
    backgroundColor: "rgba(34, 197, 94, 0.95)",
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  petInfo: {
    padding: 16,
    justifyContent: "center",
    flex: 1,
  },
  petName: {
    fontWeight: "700",
    fontSize: 17,
    color: "#111827",
    marginBottom: 6,
  },
  petMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  petMetaText: {
    fontSize: 13,
    color: "#9ca3af",
    flex: 1,
  },

  actionRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    padding: 12,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  editActionBtn: {
    backgroundColor: "#eff6ff",
  },
  deleteActionBtn: {
    backgroundColor: "#fef2f2",
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  addPostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.PURPLE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  addPostText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  // Logout
  logout: {
    marginHorizontal: 16,
    marginTop: 30,
    backgroundColor: "#ef4444",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoutText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 17,
  },
});
