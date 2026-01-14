// config/supabaseClient.js
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";

const supabaseUrl = Constants.expoConfig.extra.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig.extra.supabaseAnonKey;

// (Optional) plain client (no auth) — use only for public stuff if needed
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * ✅ Clerk → Supabase client
 * - Sets Authorization header for PostgREST queries
 * - Sets realtime auth token so websocket won't CLOSE
 */
export const createClerkSupabaseClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${clerkToken}`,
      },
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  // ✅ IMPORTANT: authorize realtime too
  client.realtime.setAuth(clerkToken);

  return client;
};

export default supabase;
