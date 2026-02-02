import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { createClerkSupabaseClient } from "../config/supabaseClient";
import { saveUserRole } from "../utils/roleStorage";

/**
 * ✅ ปรับให้ตรงกับโครงสร้าง route ของคุณ
 * - ถ้าใช้ folder: app/admin/dashboard -> "/admin/dashboard"
 * - ถ้าใช้ group:  app/(admin)/dashboard -> "/(admin)/dashboard"
 */
const ADMIN_PATH = "/admin/dashboard"; // <- ถ้าใช้ (admin) ให้เปลี่ยนเป็น "/(admin)/dashboard"
const VOLUNTEER_PATH = "/volunteer";
const USER_HOME_PATH = "/(tabs)/home";

export default function AuthWrapper({ children }) {
  const { isSignedIn, getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const segments = useSegments();
  const [loading, setLoading] = useState(true);

  // กันยิงซ้ำ
  const syncingRef = useRef(false);
  const lastSyncedUserIdRef = useRef(null);

  useEffect(() => {
    const syncUserAndRedirect = async () => {
      if (!isLoaded) return;

      // ✅ ถ้า logout ต้อง reset guard ไม่งั้น login รอบ 2 จะไม่ redirect
      if (!isSignedIn) {
        syncingRef.current = false;
        lastSyncedUserIdRef.current = null;

        setLoading(false);
        if (segments[0] !== "login") router.replace("/login");
        return;
      }

      if (!user?.id) {
        setLoading(false);
        return;
      }

      // ✅ guard กัน effect ยิงซ้ำ
      if (syncingRef.current) return;

      // ✅ ถ้าซิงค์ user เดิมไปแล้ว ไม่ต้องทำซ้ำ
      // (แต่จะไม่พังอีกแล้ว เพราะเรา reset ตอน logout ด้านบน)
      if (lastSyncedUserIdRef.current === user.id) {
        setLoading(false);
        return;
      }

      syncingRef.current = true;

      try {
        const token = await getToken({ template: "supabase" });
        const supabase = createClerkSupabaseClient(token);

        // ---- Clerk data ----
        const clerkEmail = user.primaryEmailAddress?.emailAddress || "";

        const clerkFullName =
          user.unsafeMetadata?.name ||
          user.publicMetadata?.name ||
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.fullName ||
          user.username ||
          (clerkEmail ? clerkEmail.split("@")[0] : "") ||
          "ผู้ใช้งาน";

        const clerkAvatarUrl =
          user.imageUrl ||
          user.profileImageUrl ||
          user.unsafeMetadata?.avatar_url ||
          user.publicMetadata?.avatar_url ||
          "";

        console.log("🧩 Clerk user:", {
          clerkUserId: user.id,
          email: clerkEmail,
          fullName: clerkFullName,
          segments,
        });

        // 1) อ่าน row ก่อน
        const { data: existing, error: readErr } = await supabase
          .from("users")
          .select("clerk_id, role")
          .eq("clerk_id", user.id)
          .maybeSingle();

        console.log("🧩 DB existing:", { existing, readErr });

        // 2) ถ้าไม่มีก็ insert (อย่าส่ง role)
        if (!existing) {
          const { error: insertErr } = await supabase.from("users").insert({
            clerk_id: user.id,
            email: clerkEmail,
            full_name: clerkFullName,
            avatar_url: clerkAvatarUrl,
          });

          if (insertErr) {
            console.log("❌ insert users error:", insertErr);
          } else {
            console.log("✅ inserted new user row");
          }
        } else {
          // 3) ถ้ามีก็ update เฉพาะโปรไฟล์ (อย่าแตะ role)
          const { error: updateErr } = await supabase
            .from("users")
            .update({
              email: clerkEmail,
              full_name: clerkFullName,
              avatar_url: clerkAvatarUrl,
            })
            .eq("clerk_id", user.id);

          if (updateErr) {
            console.log("❌ update users error:", updateErr);
          } else {
            console.log("✅ updated user profile fields");
          }
        }

        // 4) ดึง role เป็น source of truth
        const { data: roleRow, error: roleErr } = await supabase
          .from("users")
          .select("role")
          .eq("clerk_id", user.id)
          .maybeSingle();

        console.log("✅ role fetch:", {
          roleRow,
          roleErr,
          clerkUserId: user.id,
        });

        if (roleErr || !roleRow?.role) {
          console.log("❌ Cannot get role:", roleErr);
          router.replace("/login");
          return;
        }

        const role = roleRow.role;
        await saveUserRole(role);

        // 5) Redirect ตาม role
        const currentGroup = segments[0];
        console.log("🚦 redirect check:", { role, currentGroup });

        if (role === "admin") {
          router.replace(ADMIN_PATH);
        } else if (role === "volunteer") {
          if (currentGroup !== "volunteer") router.replace(VOLUNTEER_PATH);
        } else {
          if (currentGroup !== "(tabs)") router.replace(USER_HOME_PATH);
        }

        // ✅ mark synced
        lastSyncedUserIdRef.current = user.id;
      } catch (err) {
        console.error("❌ AuthWrapper error:", err);
      } finally {
        syncingRef.current = false;
        setLoading(false);
      }
    };

    syncUserAndRedirect();
  }, [isLoaded, isSignedIn, user?.id, segments?.[0]]); // ใส่ segments[0] ด้วยกัน edge case route state ค้าง

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return children;
}
