// app/volunteer/report-detail.jsx
// ✅ UPDATED: "ช่วยเหลือไม่สำเร็จ" (แบบให้คนอื่นช่วยต่อได้) = คืนเคสกลับคิว
// - status -> "pending"
// - assigned_volunteer_id -> null
// - completed_at -> null
// - เก็บเหตุผลไว้ใน completion_note (และแนบหลักฐานได้ถ้ามี)

import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

import { decode } from "base64-arraybuffer";
import * as Crypto from "expo-crypto";

/* ----------------------------- Utils ----------------------------- */
const MAX_EVIDENCE = 3;

const uniqByUri = (arr) =>
  arr.filter((v, i, a) => a.findIndex((x) => x.uri === v.uri) === i);

const formatThaiDateTime = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ReportDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [report, setReport] = useState(null);
  const [reporter, setReporter] = useState(null);
  const [volunteer, setVolunteer] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [loading, setLoading] = useState(true);

  // ✅ หลักฐาน [{ uri }]
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [accepting, setAccepting] = useState(false);

  // ✅ คืนเคส/ปิดเคสไม่สำเร็จ
  const [failing, setFailing] = useState(false);

  // ✅ เริ่มแชทกับผู้แจ้ง
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // current user uuid (table users.id)
      if (user?.id) {
        const { data: me, error: meErr } = await supabase
          .from("users")
          .select("id")
          .eq("clerk_id", user.id)
          .single();

        if (!meErr) setCurrentUserId(me?.id || null);
      }

      // report
      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("*")
        .eq("id", id)
        .single();

      if (reportError) throw reportError;
      setReport(reportData);

      // reporter (รายงานของคุณเก็บ user_id เป็น clerk_id)
      if (reportData.user_id) {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("clerk_id", reportData.user_id)
          .single();
        setReporter(userData || null);
      } else {
        setReporter(null);
      }

      // assigned volunteer (รายงานของคุณเก็บ assigned_volunteer_id เป็น users.id)
      if (reportData.assigned_volunteer_id) {
        const { data: volunteerData } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", reportData.assigned_volunteer_id)
          .single();
        setVolunteer(volunteerData || null);
      } else {
        setVolunteer(null);
      }
    } catch (e) {
      console.error("❌ Load report error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  const canAccept = useMemo(() => {
    return report?.status === "pending" && !report?.assigned_volunteer_id;
  }, [report]);

  const canComplete = useMemo(() => {
    return (
      report?.status === "in_progress" &&
      !!currentUserId &&
      report?.assigned_volunteer_id === currentUserId
    );
  }, [report, currentUserId]);

  const handleAccept = async () => {
    if (!report?.id) return;
    if (!user?.id) {
      Alert.alert("เกิดข้อผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    if (accepting) return;

    Alert.alert("รับเคสนี้", "คุณต้องการรับผิดชอบเคสนี้หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ยืนยัน",
        onPress: async () => {
          try {
            setAccepting(true);

            const token = await getToken({
              template: "supabase",
              skipCache: true,
            });
            const supabase = createClerkSupabaseClient(token);

            const { data: currentUser, error: userErr } = await supabase
              .from("users")
              .select("id")
              .eq("clerk_id", user.id)
              .single();

            if (userErr || !currentUser?.id) {
              Alert.alert("เกิดข้อผิดพลาด", "ไม่พบข้อมูลผู้ใช้");
              return;
            }

            const { data: updatedRows, error: updErr } = await supabase
              .from("reports")
              .update({
                status: "in_progress",
                assigned_volunteer_id: currentUser.id,
              })
              .eq("id", report.id)
              .eq("status", "pending")
              .is("assigned_volunteer_id", null)
              .select("id, status, assigned_volunteer_id");

            if (updErr) throw updErr;

            if (!updatedRows || updatedRows.length === 0) {
              Alert.alert(
                "รับเคสไม่สำเร็จ",
                "เคสนี้ถูกอาสาคนอื่นรับไปแล้ว หรือสถานะเปลี่ยนแปลง",
              );
              await loadReport();
              return;
            }

            Alert.alert("สำเร็จ", "คุณรับเคสนี้แล้ว");
            setEvidence([]);
            await loadReport();
          } catch (e) {
            console.error("❌ Accept error:", e);
            Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถรับเคสได้");
          } finally {
            setAccepting(false);
          }
        },
      },
    ]);
  };

  const openMap = () => {
    if (report?.latitude && report?.longitude) {
      Linking.openURL(
        `https://www.google.com/maps?q=${report.latitude},${report.longitude}`,
      );
    } else {
      Alert.alert("ไม่มีพิกัด", "รายงานนี้ไม่มีข้อมูลพิกัด GPS");
    }
  };

  /* ================== ✅ Evidence picker ================== */
  const pickEvidence = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("ต้องอนุญาต", "กรุณาอนุญาตเข้าถึงรูปภาพก่อน");
      return;
    }

    const remain = MAX_EVIDENCE - evidence.length;
    if (remain <= 0) {
      Alert.alert("ครบแล้ว", `แนบได้สูงสุด ${MAX_EVIDENCE} รูป`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.5,
    });

    if (!result.canceled) {
      const assets = result.assets || [];
      const incoming = assets
        .map((a) => ({ uri: a.uri }))
        .filter((x) => !!x.uri);

      setEvidence((prev) =>
        uniqByUri([...prev, ...incoming]).slice(0, MAX_EVIDENCE),
      );
    }
  };

  const takeEvidencePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("ต้องอนุญาต", "กรุณาอนุญาตเข้าถึงกล้องก่อน");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
    });

    if (!result.canceled) {
      const asset = result.assets?.[0];
      if (asset?.uri) {
        setEvidence((prev) =>
          uniqByUri([...prev, { uri: asset.uri }]).slice(0, MAX_EVIDENCE),
        );
      }
    }
  };

  const removeEvidenceAt = (index) => {
    setEvidence((prev) => prev.filter((_, i) => i !== index));
  };

  /* ================== ✅ Upload helper ================== */
  const getExt = (uri) => {
    const clean = uri.split("?")[0].toLowerCase();
    const match = clean.match(/\.(png|jpg|jpeg|webp)$/);
    return match ? match[1].replace("jpeg", "jpg") : "jpg";
  };

  const guessContentType = (ext) => {
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  };

  const uploadEvidenceImages = async (supabase, reportId, evidenceArr) => {
    const bucket = "report-evidence";
    const uploadedUrls = [];

    const items = evidenceArr.slice(0, MAX_EVIDENCE);

    for (let i = 0; i < items.length; i++) {
      const uri = items[i].uri;

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) throw new Error(`File not found: ${uri}`);

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const ext = getExt(uri);
      const contentType = guessContentType(ext);

      const arrayBuffer = decode(base64);

      const rand = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${Date.now()}-${Math.random()}-${i}`,
      );
      const path = `reports/${reportId}/${rand.slice(0, 16)}_${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, arrayBuffer, {
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      if (!publicData?.publicUrl) throw new Error("Cannot get public URL");

      uploadedUrls.push(publicData.publicUrl);
    }

    return uploadedUrls;
  };

  /* ================== ✅ Chat with reporter ================== */
  // chats schema: id(text NOT NULL), user1_id(text), user2_id(text), last_message(text), last_message_at(timestamptz)
  const startChatWithReporter = async () => {
    try {
      if (!user?.id) {
        Alert.alert("เกิดข้อผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      if (!report?.user_id) {
        Alert.alert("ไม่พบผู้แจ้ง", "รายงานนี้ไม่มีข้อมูลผู้แจ้ง");
        return;
      }
      if (startingChat) return;

      setStartingChat(true);

      const token = await getToken({ template: "supabase", skipCache: true });
      const supabase = createClerkSupabaseClient(token);

      const myClerkId = user.id;
      const reporterClerkId = report.user_id;

      if (myClerkId === reporterClerkId) {
        Alert.alert("แจ้งเตือน", "คุณคือผู้แจ้งรายงานนี้");
        return;
      }

      // 1) หา chat เดิม (สลับ user1/user2)
      const { data: existing, error: findErr } = await supabase
        .from("chats")
        .select("id")
        .or(
          `and(user1_id.eq.${myClerkId},user2_id.eq.${reporterClerkId}),and(user1_id.eq.${reporterClerkId},user2_id.eq.${myClerkId})`,
        )
        .maybeSingle();

      if (findErr) throw findErr;

      let chatId = existing?.id;

      // 2) ถ้าไม่มี -> สร้างใหม่ (ต้องใส่ id เอง)
      if (!chatId) {
        chatId = Crypto.randomUUID();

        const { error: createErr } = await supabase.from("chats").insert({
          id: chatId,
          user1_id: myClerkId,
          user2_id: reporterClerkId,
          last_message: "",
          last_message_at: new Date().toISOString(),
        });

        if (createErr) throw createErr;
      }

      // 3) ไปหน้าแชทตาม route จริง: app/chat/[id].jsx
      router.push(`/chat/${chatId}`);
    } catch (e) {
      console.error("startChatWithReporter error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถเริ่มแชทได้");
    } finally {
      setStartingChat(false);
    }
  };

  const handleCompleteWithEvidence = async () => {
    if (!canComplete) {
      Alert.alert("ทำไม่ได้", "คุณไม่ใช่อาสาที่รับผิดชอบเคสนี้");
      return;
    }
    if (!evidence.length) {
      Alert.alert("ต้องแนบหลักฐาน", "กรุณาแนบรูปหลักฐานก่อนปิดเคส");
      return;
    }

    Alert.alert("ปิดเคส", "ยืนยันว่าช่วยเหลือสำเร็จและแนบหลักฐานแล้วใช่ไหม?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ยืนยัน",
        onPress: async () => {
          try {
            setSubmitting(true);
            const token = await getToken({
              template: "supabase",
              skipCache: true,
            });
            const supabase = createClerkSupabaseClient(token);

            const urls = await uploadEvidenceImages(
              supabase,
              report.id,
              evidence,
            );

            const { error } = await supabase
              .from("reports")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                evidence_urls: urls,
                completion_note: "ช่วยเหลือสำเร็จ",
              })
              .eq("id", report.id);

            if (error) throw error;

            Alert.alert("สำเร็จ", "ปิดเคสเรียบร้อยแล้ว");
            setEvidence([]);
            loadReport();
          } catch (e) {
            console.error("❌ complete with evidence error:", e);
            Alert.alert("เกิดข้อผิดพลาด", "อัปโหลดหลักฐานหรือปิดเคสไม่สำเร็จ");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  // ✅ คืนเคสกลับคิว (ให้อาสาคนอื่นรับช่วงต่อได้)
  const returnToQueue = async (note) => {
    if (!canComplete) {
      Alert.alert("ทำไม่ได้", "คุณไม่ใช่อาสาที่รับผิดชอบเคสนี้");
      return;
    }
    if (!report?.id) return;
    if (failing) return;

    Alert.alert(
      "คืนเคสเข้าคิว",
      `ยืนยันการคืนเคสกลับเข้าคิวเพื่อให้อาสาคนอื่นรับช่วงต่อ?\nเหตุผล: ${note}`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ยืนยัน",
          style: "destructive",
          onPress: async () => {
            try {
              setFailing(true);

              const token = await getToken({
                template: "supabase",
                skipCache: true,
              });
              const supabase = createClerkSupabaseClient(token);

              // (optional) แนบหลักฐานเพิ่มได้
              let urls = Array.isArray(report?.evidence_urls)
                ? report.evidence_urls
                : [];

              if (evidence.length > 0) {
                const newUrls = await uploadEvidenceImages(
                  supabase,
                  report.id,
                  evidence,
                );
                urls = [...urls, ...newUrls].slice(0, MAX_EVIDENCE);
              }

              // ✅ สำคัญ: status -> pending, assigned -> null, completed_at -> null
              const { data: updatedRows, error: updErr } = await supabase
                .from("reports")
                .update({
                  status: "pending",
                  assigned_volunteer_id: null,
                  completed_at: null,
                  completion_note: note, // เก็บเหตุผลไว้ให้ผู้แจ้งเห็นได้
                  evidence_urls: urls.length ? urls : null,
                  // ถ้ามีคอลัมน์ returned_at ใน DB ค่อยเปิดใช้:
                  // returned_at: new Date().toISOString(),
                })
                .eq("id", report.id)
                .eq("status", "in_progress")
                .eq("assigned_volunteer_id", currentUserId)
                .select("id, status");

              if (updErr) throw updErr;

              if (!updatedRows || updatedRows.length === 0) {
                Alert.alert(
                  "คืนเคสไม่สำเร็จ",
                  "สถานะเคสเปลี่ยนไปแล้ว หรือคุณไม่ใช่ผู้รับผิดชอบ",
                );
                await loadReport();
                return;
              }

              Alert.alert("สำเร็จ", "คืนเคสกลับเข้าคิวแล้ว");
              setEvidence([]);
              await loadReport();

              // กลับหน้า list เพื่อให้เห็นว่าเคสกลับเข้าคิวแล้ว
              router.back();
            } catch (e) {
              console.error("❌ returnToQueue error:", e);
              Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถคืนเคสได้");
            } finally {
              setFailing(false);
            }
          },
        },
      ],
    );
  };

  // (ทางเลือก) ปิดเคส “failed” แบบปิดถาวรจริง ๆ
  const closeFailedPermanent = async (note) => {
    if (!canComplete) {
      Alert.alert("ทำไม่ได้", "คุณไม่ใช่อาสาที่รับผิดชอบเคสนี้");
      return;
    }
    if (!report?.id) return;
    if (failing) return;

    Alert.alert(
      "ปิดเคส (ปิดถาวร)",
      `ยืนยันการปิดเคสเป็น "ช่วยเหลือไม่สำเร็จ" และจบเคส?\nเหตุผล: ${note}`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ยืนยัน",
          style: "destructive",
          onPress: async () => {
            try {
              setFailing(true);

              const token = await getToken({
                template: "supabase",
                skipCache: true,
              });
              const supabase = createClerkSupabaseClient(token);

              let urls = Array.isArray(report?.evidence_urls)
                ? report.evidence_urls
                : [];

              if (evidence.length > 0) {
                const newUrls = await uploadEvidenceImages(
                  supabase,
                  report.id,
                  evidence,
                );
                urls = [...urls, ...newUrls].slice(0, MAX_EVIDENCE);
              }

              const { data: updatedRows, error: updErr } = await supabase
                .from("reports")
                .update({
                  status: "failed",
                  completed_at: new Date().toISOString(),
                  evidence_urls: urls.length ? urls : null,
                  completion_note: note,
                })
                .eq("id", report.id)
                .eq("status", "in_progress")
                .eq("assigned_volunteer_id", currentUserId)
                .select("id, status");

              if (updErr) throw updErr;

              if (!updatedRows || updatedRows.length === 0) {
                Alert.alert(
                  "ปิดเคสไม่สำเร็จ",
                  "สถานะเคสเปลี่ยนไปแล้ว หรือคุณไม่ใช่ผู้รับผิดชอบ",
                );
                await loadReport();
                return;
              }

              Alert.alert("สำเร็จ", "ปิดเคสเป็นช่วยเหลือไม่สำเร็จแล้ว");
              setEvidence([]);
              await loadReport();
              router.back();
            } catch (e) {
              console.error("❌ close failed error:", e);
              Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถปิดเคสได้");
            } finally {
              setFailing(false);
            }
          },
        },
      ],
    );
  };

  const handleFailCase = () => {
    if (!canComplete) {
      Alert.alert("ทำไม่ได้", "คุณไม่ใช่อาสาที่รับผิดชอบเคสนี้");
      return;
    }

    // ✅ เลือก: คืนเคสเข้าคิว (ให้คนอื่นช่วยต่อ) หรือปิดถาวร
    Alert.alert("ช่วยต่อไม่ได้", "เลือกการดำเนินการ", [
      {
        text: "คืนเคสเข้าคิว (ให้คนอื่นช่วยต่อ)",
        onPress: () => {
          Alert.alert("เลือกเหตุผล", "", [
            {
              text: "ไปแล้วไม่พบสัตว์",
              onPress: () => returnToQueue("ไปแล้วไม่พบสัตว์"),
            },
            {
              text: "ข้อมูล/พิกัดไม่ถูกต้อง",
              onPress: () => returnToQueue("ข้อมูล/พิกัดไม่ถูกต้อง"),
            },
            {
              text: "เข้าถึงไม่ได้/สัตว์หนี/ช่วยไม่ได้",
              onPress: () => returnToQueue("เข้าถึงไม่ได้/สัตว์หนี/ช่วยไม่ได้"),
            },
            { text: "ยกเลิก", style: "cancel" },
          ]);
        },
      },
      {
        text: "ปิดเคสถาวร (ช่วยไม่สำเร็จ)",
        style: "destructive",
        onPress: () => {
          Alert.alert("เลือกเหตุผล", "", [
            {
              text: "สัตว์เสียชีวิต/เกินเยียวยา",
              onPress: () => closeFailedPermanent("สัตว์เสียชีวิต/เกินเยียวยา"),
            },
            {
              text: "เคสซ้ำ/ไม่เข้าเงื่อนไข",
              onPress: () => closeFailedPermanent("เคสซ้ำ/ไม่เข้าเงื่อนไข"),
            },
            {
              text: "อื่น ๆ (ช่วยต่อไม่ได้)",
              onPress: () => closeFailedPermanent("ช่วยต่อไม่ได้"),
            },
            { text: "ยกเลิก", style: "cancel" },
          ]);
        },
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "pending":
        return {
          bg: "#fee2e2",
          text: "#dc2626",
          icon: "alert-circle",
          label: "รอดำเนินการ",
        };
      case "in_progress":
        return {
          bg: "#dcfce7",
          text: "#16a34a",
          icon: "sync",
          label: "กำลังดำเนินการ",
        };
      case "completed":
        return {
          bg: "#dbeafe",
          text: "#2563eb",
          icon: "checkmark-circle",
          label: "เสร็จสิ้น",
        };
      case "failed":
        return {
          bg: "#fef3c7",
          text: "#d97706",
          icon: "close-circle",
          label: "ช่วยเหลือไม่สำเร็จ",
        };
      default:
        return {
          bg: "#f1f5f9",
          text: "#64748b",
          icon: "help-circle",
          label: "ไม่ทราบสถานะ",
        };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>กำลังโหลดรายละเอียด...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>ไม่พบรายงาน</Text>
        <Text style={styles.errorText}>รายงานนี้ถูกลบหรือไม่มีอยู่จริง</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>กลับ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = getStatusStyle(report.status);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {report.image_url ? (
        <Image source={{ uri: report.image_url }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={64} color="#cbd5e1" />
          <Text style={styles.imagePlaceholderText}>ไม่มีรูปภาพ</Text>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View
            style={[
              styles.animalBadge,
              {
                backgroundColor:
                  report.animal_type === "สุนัข"
                    ? "#dbeafe"
                    : report.animal_type === "แมว"
                      ? "#fce7f3"
                      : "#f3f4f6",
              },
            ]}
          >
            <Ionicons
              name={
                report.animal_type === "สุนัข"
                  ? "paw"
                  : report.animal_type === "แมว"
                    ? "fish"
                    : "help-circle"
              }
              size={20}
              color={
                report.animal_type === "สุนัข"
                  ? "#2563eb"
                  : report.animal_type === "แมว"
                    ? "#ec4899"
                    : "#6b7280"
              }
            />
            <Text style={styles.animalText}>{report.animal_type}</Text>
          </View>

          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Ionicons
              name={statusStyle.icon}
              size={14}
              color={statusStyle.text}
            />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>รายละเอียดรายงาน</Text>
        <Text style={styles.detail}>{report.detail || "ไม่มีรายละเอียด"}</Text>

        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color="#94a3b8" />
          <Text style={styles.timeText}>
            แจ้งเมื่อ {formatThaiDateTime(report.created_at)}
          </Text>
        </View>

        {!!report.completed_at && (
          <View style={[styles.timeRow, { marginTop: 6 }]}>
            <Ionicons
              name="checkmark-circle-outline"
              size={16}
              color="#94a3b8"
            />
            <Text style={styles.timeText}>
              ปิดเคสเมื่อ {formatThaiDateTime(report.completed_at)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ข้อมูลเพิ่มเติม</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="location" size={24} color="#ef4444" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>สถานที่</Text>
            <Text style={styles.infoValue}>
              {report.location || "ไม่ระบุตำแหน่ง"}
            </Text>
            {report.latitude && report.longitude && (
              <TouchableOpacity style={styles.mapButton} onPress={openMap}>
                <Ionicons name="map" size={14} color="#2563eb" />
                <Text style={styles.mapButtonText}>เปิดแผนที่</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {report.latitude && report.longitude && (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="navigate" size={24} color="#3b82f6" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>พิกัด GPS</Text>
              <Text style={styles.coordText}>
                Lat: {report.latitude.toFixed(6)}
              </Text>
              <Text style={styles.coordText}>
                Lng: {report.longitude.toFixed(6)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="person" size={24} color="#8b5cf6" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>ผู้แจ้ง</Text>
            {reporter ? (
              <>
                <Text style={styles.infoValue}>
                  {reporter.full_name || "ไม่ระบุชื่อ"}
                </Text>
                <Text style={styles.coordText}>{reporter.email}</Text>

                <TouchableOpacity
                  style={[styles.chatButton, startingChat && { opacity: 0.75 }]}
                  onPress={startChatWithReporter}
                  disabled={startingChat}
                  activeOpacity={0.85}
                >
                  {startingChat ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.chatButtonText}>แชทกับผู้แจ้ง</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ActivityIndicator size="small" color="#8b5cf6" />
              </View>
            )}
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>อาสาสมัครที่รับผิดชอบ</Text>
            {report.assigned_volunteer_id ? (
              volunteer ? (
                <>
                  <Text style={styles.infoValue}>
                    {volunteer.full_name || "ไม่ระบุชื่อ"}
                  </Text>
                  <Text style={styles.coordText}>{volunteer.email}</Text>
                </>
              ) : (
                <View style={{ paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color="#22c55e" />
                </View>
              )
            ) : (
              <Text style={styles.infoValue}>ยังไม่มีผู้รับผิดชอบ</Text>
            )}
          </View>
        </View>
      </View>

      {(report.status === "completed" || report.status === "failed") &&
        Array.isArray(report.evidence_urls) &&
        report.evidence_urls.length > 0 && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: "#1e293b",
                marginBottom: 10,
              }}
            >
              หลักฐาน
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {report.evidence_urls.map((url, idx) => (
                <Image
                  key={idx}
                  source={{ uri: url }}
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: 14,
                    marginRight: 10,
                    backgroundColor: "#e5e7eb",
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}

      {(report.status === "completed" || report.status === "failed") &&
        !!report.completion_note && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
            <View style={[styles.infoBox, { backgroundColor: "#f1f5f9" }]}>
              <Ionicons name="document-text" size={20} color="#334155" />
              <Text style={[styles.infoBoxText, { color: "#334155" }]}>
                หมายเหตุ: {report.completion_note}
              </Text>
            </View>
          </View>
        )}

      {canAccept && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.acceptButton, accepting && { opacity: 0.75 }]}
            onPress={handleAccept}
            disabled={accepting}
            activeOpacity={0.85}
          >
            {accepting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.acceptButtonText}>รับเคสนี้</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {report.status === "in_progress" && (
        <View style={styles.actionSection}>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#2563eb" />
            <Text style={styles.infoBoxText}>
              {canComplete
                ? `คุณรับผิดชอบเคสนี้อยู่ — แนบหลักฐาน (สูงสุด ${MAX_EVIDENCE} รูป) แล้วกดปิดเคส`
                : "เคสนี้กำลังดำเนินการโดยอาสาสมัคร"}
            </Text>
          </View>

          {canComplete && (
            <>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={pickEvidence}
                  disabled={submitting || failing}
                  activeOpacity={0.85}
                >
                  <Ionicons name="image-outline" size={18} color="#111827" />
                  <Text style={styles.secondaryBtnText}>
                    แนบรูป ({evidence.length}/{MAX_EVIDENCE})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={takeEvidencePhoto}
                  disabled={submitting || failing}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={18} color="#111827" />
                  <Text style={styles.secondaryBtnText}>ถ่ายรูป</Text>
                </TouchableOpacity>
              </View>

              {evidence.length > 0 && (
                <ScrollView
                  horizontal
                  style={{ marginTop: 12 }}
                  showsHorizontalScrollIndicator={false}
                >
                  {evidence.map((img, idx) => (
                    <View key={idx} style={{ marginRight: 10 }}>
                      <Image
                        source={{ uri: img.uri }}
                        style={styles.evidenceThumb}
                      />
                      <TouchableOpacity
                        onPress={() => removeEvidenceAt(idx)}
                        style={styles.removeEvidenceBtn}
                        activeOpacity={0.85}
                        disabled={submitting || failing}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.completeButton, submitting && { opacity: 0.75 }]}
                onPress={handleCompleteWithEvidence}
                disabled={submitting || failing}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#fff" />
                    <Text style={styles.completeButtonText}>
                      ปิดเคส (แนบหลักฐาน)
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.failButton, failing && { opacity: 0.75 }]}
                onPress={handleFailCase}
                disabled={failing || submitting}
                activeOpacity={0.85}
              >
                {failing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                    <Text style={styles.failButtonText}>
                      ช่วยต่อไม่ได้ / คืนเคส
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {report.status === "completed" && (
        <View style={styles.actionSection}>
          <View style={[styles.infoBox, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text style={[styles.infoBoxText, { color: "#16a34a" }]}>
              เคสนี้ดำเนินการเสร็จสิ้นแล้ว
            </Text>
          </View>
        </View>
      )}

      {report.status === "failed" && (
        <View style={styles.actionSection}>
          <View style={[styles.infoBox, { backgroundColor: "#fef3c7" }]}>
            <Ionicons name="close-circle" size={20} color="#d97706" />
            <Text style={[styles.infoBoxText, { color: "#d97706" }]}>
              เคสนี้ปิดแล้ว (ช่วยเหลือไม่สำเร็จ)
            </Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  loadingText: { marginTop: 12, fontSize: 14, color: "#64748b" },

  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  image: { width: "100%", height: 300, backgroundColor: "#e5e7eb" },
  imagePlaceholder: {
    width: "100%",
    height: 300,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: { marginTop: 12, fontSize: 14, color: "#94a3b8" },

  header: {
    backgroundColor: "#fff",
    padding: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  animalBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  animalText: { fontSize: 14, fontWeight: "700", color: "#1e293b" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  statusText: { fontSize: 12, fontWeight: "700" },

  title: { fontSize: 24, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  detail: { fontSize: 16, color: "#475569", lineHeight: 24, marginBottom: 12 },

  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeText: { fontSize: 13, color: "#94a3b8" },

  section: { padding: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 12,
  },

  infoCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 4,
  },
  infoValue: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  coordText: { fontSize: 13, color: "#475569", marginTop: 2 },

  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  mapButtonText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },

  actionSection: { padding: 20 },

  acceptButton: {
    backgroundColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoBoxText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#2563eb" },

  secondaryBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700", color: "#111827" },

  evidenceThumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  removeEvidenceBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  completeButton: {
    marginTop: 12,
    backgroundColor: "#16a34a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  completeButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  failButton: {
    marginTop: 10,
    backgroundColor: "#f59e0b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  failButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  chatButton: {
    marginTop: 10,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  chatButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
