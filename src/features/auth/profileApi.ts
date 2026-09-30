import { supabase } from "../../lib/supabase";

export async function ensureCurrentProfile() {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("登录状态已失效，请重新登录。");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (!profile?.display_name.trim()) {
    const metadata = user.user_metadata as Record<string, unknown>;
    const metadataName = [metadata.display_name, metadata.full_name, metadata.name]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)
      ?.trim();
    const displayName = metadataName || user.email?.split("@")[0] || "团队成员";
    const { error } = await supabase.from("profiles").upsert(
      { id: user.id, display_name: displayName },
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  return user;
}
