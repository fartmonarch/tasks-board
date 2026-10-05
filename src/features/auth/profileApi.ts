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
    if (!profile) {
      const { error } = await supabase.from("profiles").insert({ id: user.id, display_name: metadataName || "" });
      if (error && error.code !== "23505") throw error;
    } else if (metadataName) {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: metadataName })
        .eq("id", user.id);
      if (error) throw error;
    }
  }

  return user;
}

export async function getCurrentProfile() {
  const user = await ensureCurrentProfile();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { displayName: data.display_name };
}

export async function updateCurrentProfile(displayName: string) {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  const user = await ensureCurrentProfile();
  const normalizedName = displayName.trim();
  if (!normalizedName) throw new Error("请输入用户名。");
  if (normalizedName.length > 40) throw new Error("用户名最多 40 个字符。");
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: normalizedName })
    .eq("id", user.id);
  if (error) throw error;
  return { displayName: normalizedName };
}
