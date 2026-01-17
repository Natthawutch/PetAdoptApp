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

        // ✅ ดึงข้อมูลจาก Clerk (ครอบคลุมทุกกรณี)
        console.log("🔍 RAW Clerk User Object:", {
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          username: user.username,
          imageUrl: user.imageUrl,
          profileImageUrl: user.profileImageUrl,
          unsafeMetadata: user.unsafeMetadata,
          publicMetadata: user.publicMetadata,
        });

        const clerkFullName =
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.fullName ||
          user.username ||
          user.unsafeMetadata?.full_name ||
          user.publicMetadata?.full_name ||
          user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
          "ผู้ใช้งาน";

        const clerkAvatarUrl =
          user.imageUrl ||
          user.profileImageUrl ||
          user.unsafeMetadata?.avatar_url ||
          user.publicMetadata?.avatar_url ||
          "";

        const clerkEmail = user.primaryEmailAddress?.emailAddress || "";

        console.log("🔍 Processed Clerk Data:", {
          fullName: clerkFullName,
          avatar: clerkAvatarUrl,
          email: clerkEmail,
        });

        // 1️⃣ เช็คว่ามี user นี้ใน DB แล้วหรือยัง
        const { data: existingUser, error: existingError } = await supabase
          .from("users")
          .select("id, role, full_name, avatar_url, email")
          .eq("clerk_id", user.id)
          .maybeSingle();

        if (existingError) {
          console.log("❌ existingUser error:", existingError);
        }

        // 2️⃣ ถ้าไม่มี → สร้างใหม่ (LOGIN ครั้งแรก)
        if (!existingUser) {
          const payload = {
            clerk_id: user.id,
            email: clerkEmail,
            full_name: clerkFullName,
            avatar_url: clerkAvatarUrl,
            role: "user", // default role
            created_at: new Date().toISOString(),
          };

          console.log("✅ Creating new user:", payload);

          const { error: insertError } = await supabase
            .from("users")
            .insert(payload);

          if (insertError) {
            console.log("❌ insert users error:", insertError);
          } else {
            console.log("✅ User created successfully (first login)");
          }
        } else {
          // 3️⃣ LOGIN ครั้งที่ 2+ → อัพเดตเฉพาะ field ที่ว่าง (ไม่ทับข้อมูลที่ user แก้)
          const updates = {};

          if (!existingUser.email && clerkEmail) {
            updates.email = clerkEmail;
          }

          if (!existingUser.full_name && clerkFullName !== "ผู้ใช้งาน") {
            updates.full_name = clerkFullName;
          }

          if (!existingUser.avatar_url && clerkAvatarUrl) {
            updates.avatar_url = clerkAvatarUrl;
          }

          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();

            console.log("🔄 Updating empty fields:", updates);

            const { error: updateError } = await supabase
              .from("users")
              .update(updates)
              .eq("clerk_id", user.id);

            if (updateError) {
              console.log("❌ update users error:", updateError);
            } else {
              console.log("✅ User updated successfully");
            }
          }
        }

        // 4️⃣ ดึง role จาก DB
        const { data, error } = await supabase
          .from("users")
          .select("role")
          .eq("clerk_id", user.id)
          .single();

        if (error || !data?.role) {
          console.log("❌ Cannot get user role:", error);
          router.replace("/login");
          return;
        }

        const role = data.role;
        await saveUserRole(role);

        // 5️⃣ Redirect ตาม role
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
        console.error("❌ AuthWrapper error:", err);
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
