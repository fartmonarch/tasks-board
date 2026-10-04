import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { encodeProjectId } from "../projectIdCodec";
import {
  readInvitationToken,
  redeemProjectInvitation,
} from "../api/projectInvitationApi";

export function ProjectInvitationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAuthSession();
  const queryClient = useQueryClient();
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
      {!token ? (
        <Alert
          type="error"
          message="邀请链接无效，请联系项目组长获取完整链接。"
        />
      ) : (
        <Button
          type="primary"
          loading={redemption.isPending}
          disabled={redemption.isPending}
          onClick={() => redemption.mutate()}
        >
          接受邀请并进入项目
        </Button>
      )}
      {redemption.isError && (
        <Alert type="error" message={redemption.error.message} />
      )}
      <p>
        <Link to="/projects" replace>
          返回我的项目
        </Link>
      </p>
    </main>
  );
}
