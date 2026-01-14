import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { createClerkSupabaseClient } from "../config/supabaseClient";
import { saveUserRole } from "../utils/roleStorage";

export default function AuthWrapper({ children }) {
  const { isSignedIn, getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const segments = useSegments();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncUserAndRedirect = async () => {
      if (!isLoaded) return;

      if (!isSignedIn) {
        setLoading(false);
        if (segments[0] !== "login") router.replace("/login");
        return;
      }

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const token = await getToken({ template: "supabase" });
        const supabase = createClerkSupabaseClient(token);

        // 1️⃣ ตรวจว่ามี user นี้ใน DB แล้วหรือยัง
        const { data: existingUser } = await supabase
          .from("users")
          .select("id, role")
          .eq("clerk_id", user.id)
          .maybeSingle();

        // 2️⃣ ถ้าไม่มี → สร้างใหม่ (ไม่ตั้ง role)
        if (!existingUser) {
          await supabase.from("users").insert({
            clerk_id: user.id,
            email: user.primaryEmailAddress?.emailAddress || "",
            full_name: user.fullName || user.username || "ผู้ใช้งาน",
            avatar_url: user.imageUrl || "",
            created_at: new Date().toISOString(),
          });
        }

        // 3️⃣ ดึง role จาก DB
        const { data, error } = await supabase
          .from("users")
          .select("role")
          .eq("clerk_id", user.id)
          .single();

        if (error || !data?.role) {
          router.replace("/login");
          return;
        }

        const role = data.role;
        await saveUserRole(role);

        // 4️⃣ Redirect ตาม role
        const currentGroup = segments[0];

        if (role === "admin" && currentGroup !== "admin") {
          router.replace("/admin/dashboard");
        } else if (role === "volunteer" && currentGroup !== "volunteer") {
          router.replace("/volunteer");
        } else if (
          (role === "user" || role === "volunteer_pending") &&
          currentGroup !== "(tabs)"
        ) {
          router.replace("/(tabs)/home");
        }
      } catch (err) {
        console.error("AuthWrapper error:", err);
      } finally {
        setLoading(false);
      }
    };

    syncUserAndRedirect();
  }, [isLoaded, isSignedIn, user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return children;
}
