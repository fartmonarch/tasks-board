import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { encodeProjectId } from "../projectIdCodec";
import { getCurrentProfile, updateCurrentProfile } from "../../auth/profileApi";
import {
  readInvitationToken,
  redeemProjectInvitation,
} from "../api/projectInvitationApi";

export function ProjectInvitationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const profileQuery = useQuery({
    queryKey: ["profile", session?.user.id],
    queryFn: getCurrentProfile,
    enabled: Boolean(session?.user.id),
  });
  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName);
      if (!profileQuery.data.displayName.trim()) setProfileOpen(true);
    }
  }, [profileQuery.data]);
  const profileMutation = useMutation({
    mutationFn: updateCurrentProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(["profile", session?.user.id], profile);
      setProfileOpen(false);
    },
  });
  const token = readInvitationToken(location.hash);
  const redemption = useMutation({
    mutationFn: () => redeemProjectInvitation(token!),
    onSuccess: async (projectId) => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "projects", session?.user.id],
      });
      navigate(`/projects/${encodeProjectId(projectId)}/board`, {
        replace: true,
      });
    },
  });
  return (
    <main className="simple-page">
      <h1>项目邀请</h1>
      <p>
        当前账号：{session?.user.email}
        。接受有效邀请后会成为项目成员；已加入该项目则直接进入，不消耗邀请。
      </p>
      {profileQuery.data && !profileQuery.data.displayName.trim() && (
        <Alert
          type="info"
          showIcon
          message="加入项目前，请先设置用户名，方便项目成员识别你。"
          action={<Button size="small" onClick={() => setProfileOpen(true)}>设置用户名</Button>}
        />
      )}
      {profileQuery.isError && <Alert type="error" showIcon message="个人信息加载失败" description={profileQuery.error.message} />}
      {!token ? (
        <Alert
          type="error"
          message="邀请链接无效，请联系项目组长获取完整链接。"
        />
      ) : (
        <Button
          type="primary"
          loading={redemption.isPending}
          disabled={redemption.isPending || profileQuery.isPending || !profileQuery.data?.displayName.trim()}
          onClick={() => redemption.mutate()}
        >
          接受邀请并进入项目
        </Button>
      )}
      {redemption.isError && (
        <Alert type="error" message={redemption.error.message} />
      )}
      <Modal
        title="设置用户名"
        open={profileOpen}
        okText="保存并继续"
        cancelText="稍后设置"
        confirmLoading={profileMutation.isPending}
        okButtonProps={{ disabled: !displayName.trim() }}
        onCancel={() => setProfileOpen(false)}
        onOk={() => profileMutation.mutate(displayName)}
      >
        <label className="profile-name-field">
          用户名
          <Input maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="项目成员看到的名称" />
        </label>
        {profileMutation.isError && <Alert type="error" showIcon message={profileMutation.error.message} />}
      </Modal>
      <p>
        <Link to="/projects" replace>
          返回我的项目
        </Link>
      </p>
    </main>
  );
}
