/* ============================
   components/PetDetails/PetSubInfoCard.jsx
============================ */
import { Image, StyleSheet, Text, View } from "react-native";
import Colors from "../../constants/Colors";

export default function PetSubInfoCard({ icon, emojiIcon, title, value }) {
  return (
    <View style={styles.card}>
      {icon ? (
        <Image source={icon} style={styles.icon} />
      ) : (
        <Text style={styles.emojiIcon}>{emojiIcon || "🐾"}</Text>
      )}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 12,
    flex: 1,
  },
  icon: {
    width: 40,
    height: 40,
    resizeMode: "cover",
  },

  // ✅ new
  emojiIcon: {
    fontSize: 28,
    width: 40,
    textAlign: "center",
  },

  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: "outfit",
    fontSize: 16,
    color: Colors.GRAY,
  },
  value: {
    fontFamily: "outfit-medium",
    fontSize: 16,
    color: "#333",
  },
});
