import { useState } from "react";
import { Alert, Button, Card, Form, Input, Segmented } from "antd";
import { supabase } from "../../lib/supabase";

type AuthValues = { email: string; password: string; displayName?: string };

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(values: AuthValues) {
    if (!supabase) return;
    setPending(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: values.email.trim().toLowerCase(), password: values.password,
          options: { data: { display_name: values.displayName?.trim() || "" } },
        });
        if (authError) throw authError;
        if (!data.session) setNotice("注册请求已提交。请检查邮箱并完成验证，然后返回登录。");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: values.email.trim().toLowerCase(), password: values.password,
        });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "认证失败，请稍后重试。");
    } finally { setPending(false); }
  }

  return <main className="auth-page">
    <div className="auth-brand"><span className="auth-brand__mark">K</span><span>一起推进项目</span></div>
    <Card className="auth-card" bordered={false}>
      <p className="eyebrow">PROJECT TASKS</p>
      <h1>{mode === "login" ? "欢迎回来" : "创建账号"}</h1>
      <p className="auth-description">登录后与你的伙伴一起管理项目任务。</p>
      <Segmented className="auth-mode" block value={mode} onChange={(value) => { setMode(value as "login" | "signup"); setError(""); setNotice(""); }} options={[{ label: "登录", value: "login" }, { label: "注册", value: "signup" }]} />
      {error && <Alert className="auth-alert" type="error" showIcon message={error} />}
      {notice && <Alert className="auth-alert" type="success" showIcon message={notice} />}
      <Form layout="vertical" requiredMark={false} onFinish={handleSubmit} key={mode}>
        {mode === "signup" && <Form.Item name="displayName" label="显示名称" rules={[{ required: true, whitespace: true, message: "请输入显示名称" }, { max: 40, message: "最多 40 个字符" }]}><Input autoComplete="name" placeholder="你的名字" /></Form.Item>}
        <Form.Item name="email" label="邮箱" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效邮箱地址" }]}><Input autoComplete="email" type="email" placeholder="name@example.com" /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 8, message: "密码至少 8 位" }]}><Input.Password autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="至少 8 位" /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={pending}>{mode === "login" ? "登录" : "创建账号"}</Button>
      </Form>
    </Card>
    <p className="auth-footnote">项目任务仅对已加入该项目的成员开放。</p>
  </main>;
}
