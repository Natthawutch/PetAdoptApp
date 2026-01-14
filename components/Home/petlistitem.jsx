import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../config/supabaseClient";
import Colors from "../../constants/Colors";

const { width } = Dimensions.get("window");

export default function PetListItem({ pet }) {
  const router = useRouter();
  const [image_url, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    if (pet?.image_url) {
      if (pet.image_url.startsWith("http")) {
        setImageUrl(pet.image_url);
      } else {
        const { data } = supabase.storage
          .from("pets")
          .getPublicUrl(pet.image_url);
        setImageUrl(data.publicUrl);
      }
    }
  }, [pet?.image_url]);

  return (
    <View style={styles.feedItem}>
      {/* Header with seller info */}
      <View style={styles.header}>
        <View style={styles.sellerInfo}>
          <Image
            source={{
              uri:
                pet?.userImage ||
                pet?.seller?.avatar ||
                "https://via.placeholder.com/40",
            }}
            style={styles.sellerAvatar}
          />
          <View style={styles.sellerDetails}>
            <Text style={styles.sellerName}>
              {pet?.username || pet?.seller?.name || "Anonymous Seller"}
            </Text>
            <Text style={styles.postTime}>
              {pet?.created_at
                ? new Date(pet.created_at).toLocaleDateString()
                : "Recently"}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.moreButton}>
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={Colors.DARK_GRAY}
          />
        </TouchableOpacity>
      </View>

      {/* Main image */}
      <TouchableOpacity
        onPress={() => router.push({ pathname: "/pet-details", params: pet })}
        activeOpacity={0.95}
        style={styles.imageContainer}
      >
        {imageLoading && (
          <ActivityIndicator
            size="large"
            color={Colors.PURPLE}
            style={styles.imageLoader}
          />
        )}
        <Image
          source={{ uri: image_url || "https://via.placeholder.com/400" }}
          style={styles.mainImage}
          onLoadEnd={() => setImageLoading(false)}
        />
      </TouchableOpacity>

      {/* Pet info and description */}
      <View style={styles.petInfo}>
        <Text style={styles.petName} numberOfLines={1}>
          <Text style={styles.boldText}>{pet?.name || "Unnamed Pet"}</Text>
        </Text>

        {pet?.description && (
          <Text style={styles.description} numberOfLines={2}>
            {pet.description}
          </Text>
        )}

        <View style={styles.petDetails}>
          {pet?.breed && (
            <Text style={styles.detailText}>
              Breed: <Text style={styles.boldText}>{pet.breed}</Text>
            </Text>
          )}
          {pet?.age && (
            <Text style={styles.detailText}>
              Age: <Text style={styles.boldText}>{pet.age}</Text>
            </Text>
          )}
          {pet?.location && (
            <Text style={styles.locationText}>
              <Ionicons
                name="location-outline"
                size={12}
                color={Colors.DARK_GRAY}
              />{" "}
              {pet.location}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedItem: {
    backgroundColor: "#fff",
    marginBottom: 12,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#e0e0e0",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sellerInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  sellerDetails: {
    flex: 1,
  },
  sellerName: {
    fontFamily: "outfit-medium",
    fontSize: 16,
    color: Colors.BLACK,
  },
  postTime: {
    fontFamily: "outfit",
    fontSize: 12,
    color: Colors.DARK_GRAY,
    marginTop: 2,
  },
  moreButton: {
    padding: 8,
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
  },
  mainImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
    borderRadius: 12,
  },
  imageLoader: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -15,
    marginTop: -15,
    zIndex: 2,
  },
  petInfo: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  petName: {
    fontFamily: "outfit",
    fontSize: 16,
    color: Colors.BLACK,
    marginBottom: 4,
  },
  boldText: {
    fontFamily: "outfit-bold",
  },
  description: {
    fontFamily: "outfit",
    fontSize: 14,
    color: Colors.BLACK,
    lineHeight: 20,
    marginBottom: 8,
  },
  petDetails: {
    marginBottom: 8,
  },
  detailText: {
    fontFamily: "outfit",
    fontSize: 14,
    color: Colors.DARK_GRAY,
    marginBottom: 2,
  },
  locationText: {
    fontFamily: "outfit",
    fontSize: 12,
    color: Colors.DARK_GRAY,
    marginTop: 4,
  },
});
