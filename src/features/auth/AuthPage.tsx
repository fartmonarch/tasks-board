import { useState } from "react";
import { Alert, Button, Card, Form, Input, Segmented } from "antd";
import { useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// 这是 Ant Design 表单提交后的数据结构。displayName 只在注册模式下出现。
type AuthValues = { email: string; password: string; displayName?: string };

export function AuthPage() {
  const location = useLocation();
  // 邀请链接会先把用户带到认证页。登录成功后，外层路由会继续处理原来的邀请。
  const continuingInvite = location.pathname === "/invite";
  const [mode, setMode] = useState<"login" | "signup">("login");
  // pending 用来防止请求期间重复提交，并让提交按钮显示加载状态。
  const [pending, setPending] = useState(false);
  // Supabase 返回的错误会显示在页面上；notice 用来显示注册后的邮箱验证提示。
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(values: AuthValues) {
    // supabase 可能因为环境变量未配置而为空。此时不发起任何认证请求。
    if (!supabase) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        // signUp 会在 Supabase Auth 中创建用户。options.data 是附加到用户
        // metadata 的自定义信息，后续 profileApi 会用它初始化显示名称。
        const { data, error: authError } = await supabase.auth.signUp({
          // 邮箱统一转小写，避免同一个邮箱因大小写不同被当成两个账号。
          email: values.email.trim().toLowerCase(),
          password: values.password,
          options: { data: { display_name: values.displayName?.trim() || "" } },
        });
        // Supabase 采用 { data, error } 返回结果，而不是默认抛出异常，
        // 所以这里需要主动把错误抛给下面的 catch 统一处理。
        if (authError) throw authError;
        // 开启邮箱验证时，注册成功后通常没有 session；用户需要先点邮箱链接，
        // 再回到登录模式获取 session。若未开启验证，注册可能会直接产生 session。
        if (!data.session)
          setNotice("注册请求已提交。请检查邮箱并完成验证，然后返回登录。");
      } else {
        // signInWithPassword 会校验邮箱和密码。成功后 Supabase 会保存登录 session，
        // AuthGate 监听到 session 后会允许用户进入项目页面。
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: values.email.trim().toLowerCase(),
          password: values.password,
        });
        // 登录失败的常见原因包括密码错误、邮箱未验证或账号不存在。
        if (authError) throw authError;
      }
    } catch (cause) {
      // 认证 SDK 的错误通常是 Error 实例，message 是 Supabase 提供的可读原因。
      setError(
        cause instanceof Error ? cause.message : "认证失败，请稍后重试。",
      );
    } finally {
      // 无论成功还是失败，都要解除按钮的 loading 状态。
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="auth-brand__mark">K</span>
        <span>一起推进项目</span>
      </div>
      <Card className="auth-card" bordered={false}>
        <p className="eyebrow">PROJECT TASKS</p>
        <h1>{mode === "login" ? "欢迎回来" : "创建账号"}</h1>
        <p className="auth-description">
          {continuingInvite
            ? "请先登录。登录后将继续当前邀请，确认账号后即可接受。"
            : "登录后与你的伙伴一起管理项目任务。"}
        </p>
        <Segmented
          className="auth-mode"
          block
          value={mode}
          onChange={(value) => {
            setMode(value as "login" | "signup");
            setError("");
            setNotice("");
          }}
          options={[
            { label: "登录", value: "login" },
            { label: "注册", value: "signup" },
          ]}
        />
        {error && (
          <Alert className="auth-alert" type="error" showIcon message={error} />
        )}
        {notice && (
          <Alert
            className="auth-alert"
            type="success"
            showIcon
            message={notice}
          />
        )}
        <Form
          layout="vertical"
          requiredMark={false}
          onFinish={handleSubmit}
          key={mode}
        >
          {mode === "signup" && (
            <Form.Item
              name="displayName"
              label="显示名称"
              rules={[
                { required: true, whitespace: true, message: "请输入显示名称" },
                { max: 40, message: "最多 40 个字符" },
              ]}
            >
              <Input autoComplete="name" placeholder="你的名字" />
            </Form.Item>
          )}
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "请输入有效邮箱地址" },
            ]}
          >
            <Input
              autoComplete="email"
              type="email"
              placeholder="name@example.com"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少 8 位" },
            ]}
          >
            <Input.Password
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder="至少 8 位"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={pending}>
            {mode === "login" ? "登录" : "创建账号"}
          </Button>
        </Form>
      </Card>
      <p className="auth-footnote">项目任务仅对已加入该项目的成员开放。</p>
    </main>
  );
}
