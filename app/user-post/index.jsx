import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import PetListItem from "../../components/Home/petlistitem";
import Colors from "../../constants/Colors";

// สร้าง Supabase client (เปลี่ยนเป็น URL และ ANON KEY ของคุณ)
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function UserPost() {
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [userPosts, setUserPosts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    navigation.setOptions({ headerTitle: "User Post" });
    fetchCurrentUser();
  }, []);

  // ดึง user ปัจจุบันจาก Supabase Auth
  const fetchCurrentUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      setCurrentUser(data.user);
      if (data.user) {
        fetchUserPosts(data.user.id);
      }
    } catch (err) {
      console.error("Error fetching user:", err.message);
      Alert.alert("Error", "Unable to fetch user.");
    }
  };

  // ดึงโพสต์ของ user ตาม user.id
  const fetchUserPosts = async (userId) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("Pets")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUserPosts(data);
    } catch (err) {
      console.error("Error fetching posts:", err.message);
      Alert.alert("Error", "Unable to fetch posts.");
    } finally {
      setIsLoading(false);
    }
  };

  // ลบโพสต์
  const deletePost = async (postId) => {
    try {
      const { error } = await supabase.from("Pets").delete().eq("id", postId);

      if (error) throw error;

      Alert.alert("Deleted", "Post deleted successfully");
      if (currentUser) {
        fetchUserPosts(currentUser.id);
      }
    } catch (err) {
      console.error("Error deleting post:", err.message);
      Alert.alert("Error", "Unable to delete post.");
    }
  };

  // Confirm ก่อนลบ
  const confirmDeletePost = (postId) => {
    Alert.alert(
      "Confirm Delete",
      "Do you want to delete this post?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: () => deletePost(postId),
          style: "destructive",
        },
      ],
      { cancelable: false }
    );
  };

  // Refresh ดึงข้อมูลใหม่
  const onRefresh = useCallback(() => {
    if (currentUser) {
      fetchUserPosts(currentUser.id);
    }
  }, [currentUser]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Post</Text>

      {isLoading && userPosts.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={Colors.PURPLE}
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={userPosts}
          numColumns={2}
          refreshing={isLoading}
          onRefresh={onRefresh}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={() => (
            <Text style={styles.emptyText}>No Post Found</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.postItem}>
              <PetListItem pet={item} />
              <Pressable
                onPress={() => confirmDeletePost(item.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
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
    padding: 20,
  },
  title: {
    fontFamily: "outfit-medium",
    fontSize: 30,
  },
  emptyText: {
    fontFamily: "outfit",
    textAlign: "center",
    marginTop: 20,
  },
  postItem: {
    marginBottom: 15,
  },
  deleteButton: {
    backgroundColor: Colors.PURPLE,
    padding: 5,
    borderRadius: 7,
    marginTop: 5,
    marginRight: 10,
  },
  deleteText: {
    color: Colors.WHITE,
    fontFamily: "outfit",
    textAlign: "center",
  },
});
