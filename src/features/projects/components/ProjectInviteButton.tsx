import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Radio } from "antd";
import { useAuthSession } from "../../auth/AuthSessionContext";
import {
  canInviteToProject,
  createProjectInvitation,
} from "../api/projectInvitationApi";
import type { InvitationMode } from "../api/projectInvitationApi";

export function ProjectInviteButton({ projectId }: { projectId: string }) {
  const session = useAuthSession();
  const [open, setOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [mode, setMode] = useState<InvitationMode>("single");
  const permission = useQuery({
    queryKey: ["projectInvitePermission", session?.user.id, projectId],
    queryFn: () => canInviteToProject(projectId),
    enabled: Boolean(session),
  });
  const invitation = useMutation({
    mutationFn: () => createProjectInvitation(projectId, mode),
  });
  if (permission.isError)
    return (
      <Alert
        type="error"
        message="邀请权限加载失败"
        description={permission.error.message}
        action={<Button onClick={() => void permission.refetch()}>重试</Button>}
      />
    );
  if (!permission.data) return null;

  async function copyLink() {
    if (!invitation.data) return;
    try {
      await navigator.clipboard.writeText(invitation.data.link);
      setCopyNotice("邀请链接已复制。");
    } catch {
      setCopyNotice("自动复制失败，请选择下方链接手动复制。");
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          invitation.reset();
          setCopyNotice("");
          setMode("single");
          setOpen(true);
        }}
      >
        邀请成员
      </Button>
      <Modal
        title="邀请加入项目"
        open={open}
        footer={null}
        onCancel={() => {
          setOpen(false);
          invitation.reset();
          setCopyNotice("");
        }}
      >
        <Radio.Group
          aria-label="邀请方式"
          value={mode}
          disabled={invitation.isPending || Boolean(invitation.data)}
          onChange={(event) => setMode(event.target.value as InvitationMode)}
          options={[
            { label: "24 小时 · 单人邀请", value: "single" },
            { label: "1 小时 · 多人邀请", value: "group" },
          ]}
        />
        <p>
          {mode === "single"
            ? "24 小时内仅允许一位新成员加入，使用后失效。"
            : "1 小时内可供多位新成员加入，不限制人数，到期后失效。"}
        </p>
        <p>请仅分享给希望加入的伙伴。</p>
        <Button
          type="primary"
          loading={invitation.isPending}
          disabled={Boolean(invitation.data)}
          onClick={() => invitation.mutate()}
        >
          生成邀请链接
        </Button>
        {invitation.isError && (
          <Alert type="error" message={invitation.error.message} />
        )}
        {invitation.data && (
          <>
            <p>
              有效期至：{new Date(invitation.data.expiresAt).toLocaleString()}
            </p>
            <Input
              aria-label="邀请链接"
              readOnly
              value={invitation.data.link}
              onFocus={(event) => event.target.select()}
            />
            <Button onClick={() => void copyLink()}>复制链接</Button>
          </>
        )}
        {copyNotice && <p role="status">{copyNotice}</p>}
      </Modal>
    </>
  );
}
