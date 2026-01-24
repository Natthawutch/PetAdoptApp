// lib/dashboardApi.js
import { createClerkSupabaseClient } from "../config/supabaseClient";

async function countRows(supabase, table, applyFilter) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (applyFilter) q = applyFilter(q);
  const { count, error } = await q;
  if (error) {
    console.error(`countRows error for ${table}:`, error);
    throw error;
  }
  return count ?? 0;
}

export async function fetchDashboardStats(clerkToken) {
  try {
    // ใช้ Clerk token เพื่อเข้าถึงข้อมูล users
    const supabase = createClerkSupabaseClient(clerkToken);

    const ROLE_VOLUNTEER = "volunteer";
    const ROLE_ADMIN = "admin";
    const USER_UNVERIFIED = "unverified";
    const PET_AVAILABLE = "available";
    const PET_ADOPTED = "adopted";

    const [
      totalUsers,
      volunteers,
      pendingApprovals,
      animalsLookingForHome,
      adoptionsSuccess,
    ] = await Promise.all([
      // ✅ ไม่นับ admin
      countRows(supabase, "users", (q) => q.neq("role", ROLE_ADMIN)),

      countRows(supabase, "users", (q) => q.eq("role", ROLE_VOLUNTEER)),

      // ✅ แก้ตรงนี้: รอตรวจสอบตัวตน = unverified แต่ไม่นับ admin
      countRows(supabase, "users", (q) =>
        q.eq("verification_status", USER_UNVERIFIED).neq("role", ROLE_ADMIN),
      ),

      countRows(supabase, "pets", (q) =>
        q.eq("adoption_status", PET_AVAILABLE),
      ),

      countRows(supabase, "pets", (q) => q.eq("adoption_status", PET_ADOPTED)),
    ]);

    return {
      totalUsers,
      volunteers,
      animalsLookingForHome,
      adoptionsSuccess,
      pendingApprovals,
    };
  } catch (error) {
    console.error("fetchDashboardStats error:", error);
    throw error;
  }
}

export async function fetchRecentActivity(limit = 8) {
  try {
    // สำหรับ pets ใช้ public client ก็ได้ (ถ้า RLS อนุญาต)
    const { supabase } = require("../config/supabaseClient");

    const { data, error } = await supabase
      .from("pets")
      .select("id,name,category,created_at,adoption_status,post_status")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const now = Date.now();
    const timeAgo = (iso) => {
      const diffMin = Math.floor((now - new Date(iso).getTime()) / 60000);
      if (diffMin < 1) return "เมื่อสักครู่";
      if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
      return `${Math.floor(diffHr / 24)} วันที่แล้ว`;
    };

    return (data ?? []).map((p) => {
      const adoption = String(p.adoption_status || "").toLowerCase();

      let title = "เพิ่มสัตว์ใหม่";
      let icon = "paw";
      let color = "#f59e0b";

      if (adoption === "adopted") {
        title = "รับเลี้ยงสำเร็จ";
        icon = "heart";
        color = "#10b981";
      } else if (adoption === "available") {
        title = "สัตว์กำลังหาบ้าน";
        icon = "paw";
        color = "#f59e0b";
      }

      return {
        id: p.id,
        title,
        description: `${p.category || "สัตว์"}: ${p.name || "-"}`,
        time: timeAgo(p.created_at),
        icon,
        color,
      };
    });
  } catch (error) {
    console.error("fetchRecentActivity error:", error);
    throw error;
  }
}
