import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";

const supabaseUrl = Constants.expoConfig.extra.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig.extra.supabaseAnonKey;

// public client (anon) – ใช้กับข้อมูล public ได้
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// เก็บ token ล่าสุดไว้ใน module
let latestClerkToken = null;

// ✅ ไม่ใช้ singleton - สร้างใหม่ทุกครั้งเพื่อให้ได้ token ใหม่
/**
 * Client สำหรับ query ที่ต้อง auth
 * - สร้าง client ใหม่ทุกครั้งเพื่อให้ใช้ token ล่าสุด
 */
export const createClerkSupabaseClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");
  latestClerkToken = clerkToken;

  // ✅ สร้างใหม่ทุกครั้ง - ไม่ cache
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    global: {
      fetch: async (url, options = {}) => {
        if (!latestClerkToken) {
          throw new Error("Missing Clerk token");
        }
        const headers = new Headers(options.headers || {});
        headers.set("Authorization", `Bearer ${latestClerkToken}`);
        return fetch(url, { ...options, headers });
      },
    },
  });

  return client;
};

/**
 * Client สำหรับ realtime (WebSocket)
 * - สร้างใหม่ทุกครั้งและ setAuth ด้วย token ใหม่
 */
export const getRealtimeClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");
  latestClerkToken = clerkToken;

  // ✅ สร้างใหม่ทุกครั้ง - ไม่ cache
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  // ✅ setAuth ด้วย token ใหม่เสมอ
  client.realtime.setAuth(clerkToken);
  return client;
};

// ไม่ต้องใช้ reset function แล้ว เพราะไม่มี singleton
export const resetRealtimeClient = () => {
  // deprecated - ไม่ต้องทำอะไร
};

export default supabase;
