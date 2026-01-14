import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../config/supabaseClient"; // import supabase client ของคุณ

export default function Slider() {
  const [sliderList, setSliderList] = useState([]);
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSliders();
  }, []);

  useEffect(() => {
    if (sliderList.length === 0) return;

    const interval = setInterval(() => {
      const nextIndex = (currentIndex + 1) % sliderList.length;
      setCurrentIndex(nextIndex);

      flatListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [currentIndex, sliderList]);

  const fetchSliders = async () => {
    try {
      setLoading(true);
      // ดึงข้อมูลจาก Supabase
      const { data, error } = await supabase.from("sliders").select("imageurl");
      if (error) {
        console.error("Error fetching sliders: ", error);
      } else {
        setSliderList(data || []);
      }
    } catch (error) {
      console.error("Unexpected error: ", error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={{ width: Dimensions.get("window").width }}>
      <Image
        source={{ uri: item?.imageurl }} // ใช้ชื่อเหมือนฐานข้อมูลเลย
        style={styles.sliderImage}
        contentFit="cover"
        transition={1000}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { height: 170 }]}>
        <ActivityIndicator size="large" color="#555" />
      </View>
    );
  }

  if (sliderList.length === 0) {
    return (
      <View style={[styles.loadingContainer, { height: 170 }]}>
        <Text style={{ color: "#555" }}>ไม่มีรูปภาพสำหรับแสดง</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 15, paddingHorizontal: 10 }}>
      <FlatList
        ref={flatListRef}
        data={sliderList}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderItem}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sliderImage: {
    width: Dimensions.get("window").width,
    height: 120,
    borderRadius: 15,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  dotActive: {
    backgroundColor: "#333",
  },
  dotInactive: {
    backgroundColor: "#ccc",
  },
});
