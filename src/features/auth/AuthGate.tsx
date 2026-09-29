import { useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import type { Session } from "@supabase/supabase-js";
import App from "../../app/App";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { AuthPage } from "./AuthPage";

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (!isSupabaseConfigured) {
    if (!import.meta.env.DEV) return <main className="page-state"><Alert type="error" showIcon message="未配置 Supabase，应用暂不可用" description="请在部署环境中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。" /></main>;
    return <><Alert className="demo-mode-alert" banner type="info" message="本地演示模式：添加 Supabase 配置后将启用账号登录。" /><App /></>;
  }
  if (loading) return <main className="auth-loading"><Spin size="large" tip="正在恢复登录状态…" /></main>;
  if (!session) return <AuthPage />;

  return <div className="authenticated-app">
    <header className="account-bar"><span>已登录 <strong>{session.user.email}</strong></span><Button size="small" onClick={() => void supabase?.auth.signOut()}>退出登录</Button></header>
    <App />
  </div>;
}
