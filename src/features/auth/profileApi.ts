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

  if (!profile || !profile.display_name.trim()) {
    const metadata = user.user_metadata as Record<string, unknown>;
    const metadataName = [metadata.display_name, metadata.full_name, metadata.name]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)
      ?.trim();
    const displayName = metadataName || user.email?.split("@")[0] || "项目成员";
    if (!profile) {
      const { error } = await supabase.from("profiles").insert({ id: user.id, display_name: displayName });
      if (error && error.code !== "23505") throw error;
    } else {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", user.id);
      if (error) throw error;
    }
  }

  return user;
}

export async function getCurrentProfile() {
  const client = supabase;
  if (!client) throw new Error("请先配置 Supabase 环境变量并登录。");
  const user = await ensureCurrentProfile();
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { id: data.id, displayName: data.display_name };
}

export async function updateCurrentProfile(displayName: string) {
  const client = supabase;
  if (!client) throw new Error("请先配置 Supabase 环境变量并登录。");
  const user = await ensureCurrentProfile();
  const normalizedName = displayName.trim();
  if (!normalizedName) throw new Error("显示名称不能为空。");
  if (normalizedName.length > 100) throw new Error("显示名称最多 100 个字符。");

  const { error } = await client
    .from("profiles")
    .update({ display_name: normalizedName })
    .eq("id", user.id);
  if (error) throw error;
  return normalizedName;
}
