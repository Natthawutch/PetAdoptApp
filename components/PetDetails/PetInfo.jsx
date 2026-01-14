import Ionicons from "@expo/vector-icons/Ionicons";
import { Video } from "expo-av";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "../../constants/Colors";

export default function PetInfo({ pet, isFavorite, onToggleFavorite }) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const videoRef = useRef(null);

  /* =======================
     Media list
  ======================= */
  const mediaList = [];

  if (pet?.video_url) mediaList.push({ type: "video", uri: pet.video_url });

  let images = [];
  if (pet?.images) {
    try {
      images = JSON.parse(pet.images);
    } catch {
      images = pet.image_url ? [pet.image_url] : [];
    }
  } else if (pet?.image_url) {
    images = [pet.image_url];
  }

  images.forEach((img) => mediaList.push({ type: "image", uri: img }));

  /* =======================
     Video auto play / pause
  ======================= */
  useEffect(() => {
    if (!videoRef.current) return;
    if (mediaList[0]?.type !== "video") return;

    currentIndex === 0
      ? videoRef.current.playAsync()
      : videoRef.current.pauseAsync();
  }, [currentIndex]);

  return (
    <View style={styles.container}>
      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={router.back}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.petName} numberOfLines={1}>
          {pet?.name || "ไม่มีชื่อ"}
        </Text>

        <TouchableOpacity style={styles.iconBtn} onPress={onToggleFavorite}>
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={22}
            color={isFavorite ? "#EF4444" : "#fff"}
          />
        </TouchableOpacity>
      </View>

      {/* ================= MEDIA ================= */}
      <View
        style={styles.imageContainer}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        {containerWidth > 0 && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) =>
              setCurrentIndex(
                Math.round(e.nativeEvent.contentOffset.x / containerWidth)
              )
            }
          >
            {mediaList.map((item, index) => (
              <View key={index} style={{ width: containerWidth, height: 280 }}>
                {item.type === "video" ? (
                  <Video
                    ref={videoRef}
                    source={{ uri: item.uri }}
                    style={styles.media}
                    resizeMode="contain" 
                    useNativeControls
                    isLooping
                  />
                ) : (
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.media}
                    resizeMode="contain"
                  />
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {mediaList.length > 1 && (
          <View style={styles.indicators}>
            {mediaList.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.indicator,
                  currentIndex === i && styles.activeIndicator,
                ]}
              />
            ))}
          </View>
        )}
      </View>

      {/* ================= ADDRESS ================= */}
      <View style={styles.infoContainer}>
        <Text style={styles.address}>
          📍 {pet?.address || "ไม่ระบุสถานที่"}
        </Text>
      </View>
    </View>
  );
}

/* ======================= STYLES ======================= */
const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    marginHorizontal: 4,
    marginBottom: 8,
    overflow: "hidden",
    elevation: 6,
  },

  header: {
    paddingTop: 15,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.PURPLE,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  petName: {
    flex: 1,
    marginHorizontal: 12,
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    fontFamily: "outfit-bold",
  },

  imageContainer: {
    height: 280,
    backgroundColor: "#000",
  },
  media: {
    width: "100%",
    height: "100%",
  },

  indicators: {
    position: "absolute",
    bottom: 14,
    flexDirection: "row",
    alignSelf: "center",
    gap: 6,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  activeIndicator: {
    width: 24,
    backgroundColor: "#fff",
  },

  infoContainer: {
    padding: 16,
  },
  address: {
    fontSize: 16,
    color: Colors.GRAY,
    fontFamily: "outfit",
  },
});
