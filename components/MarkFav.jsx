import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { supabase } from "../config/supabaseClient";

export default function MarkFav({ pet, color = "black" }) {
  const [user, setUser] = useState(null);
  const [favList, setFavList] = useState([]);

  // ดึง user จาก Supabase Auth
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // เมื่อมี user โหลดรายการ favorites
  useEffect(() => {
    if (user) {
      GetFav();
    }
  }, [user]);

  // ดึง favorites ของ user จาก Supabase
  const GetFav = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("favorites")
      .select("pet_id")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error fetching favorites:", error);
      return;
    }

    // map เป็น array ของ pet_id
    setFavList(data.map((fav) => fav.pet_id));
  };

  // เพิ่ม pet.id ใน favorites
  const AddToFav = async () => {
    if (!user) return;

    let newFavList = [...favList];
    if (!newFavList.includes(pet?.id)) {
      newFavList.push(pet.id);
    }

    const { error } = await supabase
      .from("favorites")
      .upsert(
        { user_id: user.id, pet_ids: newFavList },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Error updating favorites:", error);
      return;
    }

    setFavList(newFavList);
  };

  // ลบ pet.id ออกจาก favorites
  const removeFromFav = async () => {
    if (!user) return;

    const newFavList = favList.filter((id) => id !== pet?.id);

    const { error } = await supabase
      .from("favorites")
      .upsert(
        { user_id: user.id, pet_ids: newFavList },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Error updating favorites:", error);
      return;
    }

    setFavList(newFavList);
  };

  // ถ้ายังไม่โหลด user กลับ null หรือ spinner ได้ตามชอบ
  if (!user) return null;

  return (
    <View>
      {favList.includes(pet?.id) ? (
        <Pressable onPress={removeFromFav}>
          <Ionicons name="heart" size={30} color="red" />
        </Pressable>
      ) : (
        <Pressable onPress={AddToFav}>
          <Ionicons name="heart-outline" size={30} color={color} />
        </Pressable>
      )}
    </View>
  );
}
