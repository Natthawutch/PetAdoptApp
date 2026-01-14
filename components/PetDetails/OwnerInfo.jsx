import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Colors from "../../constants/Colors";

export default function OwnerInfo({ pet, onMessagePress }) {
  const [imageError, setImageError] = useState(false);
  const userImage = pet?.userImage || "https://via.placeholder.com/50";
  const username = pet?.username || "Unknown";

  const handleImageError = () => {
    setImageError(true);
  };

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={styles.container}>
      <View style={styles.ownerInfo}>
        <View style={styles.avatarContainer}>
          {!imageError ? (
            <Image
              source={{ uri: userImage }}
              style={styles.avatar}
              onError={handleImageError}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{getInitials(username)}</Text>
            </View>
          )}
          <View style={styles.onlineIndicator} />
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.name} numberOfLines={1}>
            {username}
          </Text>
          <View style={styles.labelContainer}>
            <View style={styles.verifiedBadge}>
              <Ionicons
                name="checkmark-circle"
                size={12}
                color={Colors.GREEN || "#10B981"}
              />
            </View>
            <Text style={styles.label}>Pet Owner</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.messageButton}
        onPress={onMessagePress}
        activeOpacity={0.7}
        disabled={!onMessagePress}
      >
        <Ionicons name="chatbox-ellipses" size={20} color="white" />
        <Text style={styles.messageText}>Message</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 1,
    marginVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 16,
    backgroundColor: "white",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  ownerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: Colors.LIGHT_PURPLE || "#F3E8FF",
  },
  avatarFallback: {
    backgroundColor: Colors.PURPLE || "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "outfit-bold",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.GREEN || "#10B981",
    borderWidth: 2,
    borderColor: "white",
  },
  userDetails: {
    flex: 1,
    justifyContent: "center",
  },
  name: {
    fontFamily: "outfit-bold",
    fontSize: 18,
    color: "#1F2937",
    marginBottom: 4,
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  verifiedBadge: {
    marginRight: 6,
  },
  label: {
    fontFamily: "outfit-medium",
    fontSize: 14,
    color: Colors.GRAY || "#6B7280",
  },
  messageButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.PURPLE || "#8B5CF6",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: Colors.PURPLE || "#8B5CF6",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  messageText: {
    color: "white",
    fontFamily: "outfit-medium",
    fontSize: 14,
    marginLeft: 6,
  },
});
