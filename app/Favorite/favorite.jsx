import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import PetListItem from "../../components/Home/petlistitem";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

const { width } = Dimensions.get("window");

export default function Favorite() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigation = useNavigation();

  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (user) fetchFavorites();
  }, [user]);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);

      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      const { data: favs, error } = await supabase
        .from("favorites")
        .select("pet_id")
        .eq("user_id", user.id);

      if (error) throw error;

      if (!favs?.length) {
        setPets([]);
        return;
      }

      const petIds = favs.map((f) => f.pet_id);

      const { data: petsData } = await supabase
        .from("pets")
        .select("*")
        .in("id", petIds);

      setPets(petsData || []);
    } catch (err) {
      console.log("Favorite error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔄 Loading State
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#FF6B9D" />
            <Text style={styles.loadingText}>กำลังโหลดรายการโปรด...</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* 🎨 Modern Header with Gradient Effect */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>รายการโปรด</Text>
        </View>

        <View style={styles.headerRight}>
          {pets.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pets.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 🐾 Empty State - Enhanced */}
      {!pets.length ? (
        <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="heart-outline" size={60} color="#FF6B9D" />
              </View>
              <View style={styles.pulseCircle} />
            </View>

            <Text style={styles.emptyTitle}>ยังไม่มีรายการโปรด</Text>
            <Text style={styles.emptySub}>
              เริ่มต้นสร้างรายการโปรดของคุณ{"\n"}
              กดหัวใจที่สัตว์เลี้ยงที่คุณชื่นชอบ 💕
            </Text>

            <TouchableOpacity
              style={styles.exploreButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="search" size={20} color="#fff" />
              <Text style={styles.exploreButtonText}>สำรวจสัตว์เลี้ยง</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.listContainer, { opacity: fadeAnim }]}>
          <FlatList
            data={pets}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View
                style={[
                  styles.cardWrapper,
                  {
                    opacity: fadeAnim,
                    transform: [
                      {
                        translateY: fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [50, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.card}>
                  <PetListItem pet={item} />
                </View>
              </Animated.View>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },

  // Header Styles
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: 0.3,
  },
  headerRight: {
    width: 40,
    alignItems: "flex-end",
  },
  badge: {
    backgroundColor: "#FF6B9D",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 28,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Loading Styles
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },

  // Empty State Styles
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    width: width - 40,
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  emptyIconContainer: {
    position: "relative",
    marginBottom: 24,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFF0F5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFE0EB",
  },
  pulseCircle: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFE0EB",
    opacity: 0.3,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  emptySub: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  exploreButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B9D",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
    shadowColor: "#FF6B9D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  exploreButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // List Styles
  listContainer: {
    flex: 1,
  },

  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#fff",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
});
