import { supabase } from "../config/supabaseClient";

// ดึง favorite pet IDs ของ user
const GetFavPetIds = async (user) => {
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from("favorites")
    .select("pet_id")
    .eq("user_id", user.id);

  if (error) {
    console.error("Error fetching favorite pet IDs:", error);
    return [];
  }

  return data.map((item) => item.pet_id);
};

// อัปเดต favorite pet IDs ของ user
const UpdateFavPetIds = async (user, favIds) => {
  if (!user?.id) return;

  // ลบ favorites เก่าของ user
  let { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    console.error("Error deleting old favorites:", error);
    return false;
  }

  // เพิ่ม favorites ใหม่
  const insertData = favIds.map((pet_id) => ({
    user_id: user.id,
    pet_id,
  }));

  const { error: insertError } = await supabase
    .from("favorites")
    .insert(insertData);

  if (insertError) {
    console.error("Error inserting favorites:", insertError);
    return false;
  }

  return true;
};

export default {
  GetFavPetIds,
  UpdateFavPetIds,
};
