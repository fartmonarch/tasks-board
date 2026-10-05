import { supabase } from "../../lib/supabase";

const profileInitializations = new Map<string, Promise<void>>();
const currentProfileNames = new Map<string, string>();

export async function ensureCurrentProfile() {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  const client = supabase;
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  const user = session?.user;
  const userError = sessionError;
  if (userError) throw userError;
  if (!user) throw new Error("登录状态已失效，请重新登录。");

  const existingInitialization = profileInitializations.get(user.id);
  if (existingInitialization) {
    await existingInitialization;
    return user;
  }

  const initialization = (async () => {
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const metadata = user.user_metadata as Record<string, unknown>;
    const metadataName = [metadata.display_name, metadata.full_name, metadata.name]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)
      ?.trim();
    let displayName = profile?.display_name ?? "";

    if (!profile) {
      displayName = metadataName || "";
      const { error } = await client.from("profiles").insert({ id: user.id, display_name: displayName });
      if (error && error.code !== "23505") throw error;
    } else if (!displayName.trim() && metadataName) {
      displayName = metadataName;
      const { error } = await client
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", user.id);
      if (error) throw error;
    }

    currentProfileNames.set(user.id, displayName);
  })();

  profileInitializations.set(user.id, initialization);
  try {
    await initialization;
  } catch (error) {
    profileInitializations.delete(user.id);
    throw error;
  }

  return user;
}

export function getCachedCurrentProfileName(userId: string) {
  return currentProfileNames.get(userId);
}

export async function getCurrentProfile() {
  const user = await ensureCurrentProfile();
  return { displayName: currentProfileNames.get(user.id) ?? "" };
}

export async function updateCurrentProfile(displayName: string) {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  const client = supabase;
  const user = await ensureCurrentProfile();
  const normalizedName = displayName.trim();
  if (!normalizedName) throw new Error("请输入用户名。");
  if (normalizedName.length > 40) throw new Error("用户名最多 40 个字符。");
  const { error } = await client
    .from("profiles")
    .update({ display_name: normalizedName })
    .eq("id", user.id);
  if (error) throw error;
  currentProfileNames.set(user.id, normalizedName);
  return { displayName: normalizedName };
}
