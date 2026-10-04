import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Popconfirm, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import {
  deleteProjectPermanently,
  removeProjectMember,
  setProjectArchived,
  transferProjectOwner,
} from "../api/projectApi";
import type { ProjectMember, ProjectSummary } from "../api/projectApi";

type Props = {
  project: ProjectSummary;
  members: ProjectMember[];
  membersPending: boolean;
  membersError?: string;
  onRetryMembers: () => void;
  isOwner: boolean;
  isAdmin: boolean;
  currentUserId: string;
};

export function ProjectManagement({
  project, members, membersPending, membersError, onRetryMembers,
  isOwner, isAdmin, currentUserId,
}: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const clearFeedback = () => { setNotice(""); setActionError(""); };
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project"] }),
      queryClient.invalidateQueries({ queryKey: ["projectMembers"] }),
      queryClient.invalidateQueries({ queryKey: ["projectRole"] }),
      queryClient.invalidateQueries({ queryKey: ["projectInvitePermission"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ]);
  };
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(project.id, userId),
    onMutate: clearFeedback,
    onSuccess: async () => { setNotice("成员已移除，名下任务改为未分配，任务和评论历史保留。"); await refresh(); },
    onError: (error) => setActionError(error.message),
  });
  const transferMutation = useMutation({
    mutationFn: (userId: string) => transferProjectOwner(project.id, userId),
    onMutate: clearFeedback,
    onSuccess: async () => { setNotice("组长已转让，管理权限已更新。"); await refresh(); },
    onError: (error) => setActionError(error.message),
  });
  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => setProjectArchived(project.id, archived),
    onMutate: clearFeedback,
    onSuccess: async (_data, archived) => { setNotice(archived ? "项目已归档。" : "项目已恢复。"); await refresh(); },
    onError: (error) => setActionError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteProjectPermanently(project.id),
    onMutate: clearFeedback,
    onSuccess: async () => {
      await refresh();
      navigate("/projects", { replace: true });
    },
    onError: (error) => setActionError(error.message),
  });
  const isBusy = removeMutation.isPending || transferMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;

  return (
    <section className="project-management" aria-labelledby="project-management-title">
      <div className="project-management__heading">
        <div>
          <h2 id="project-management-title">成员与项目状态</h2>
        </div>
        <Tag color={project.archivedAt ? "default" : "green"}>{project.archivedAt ? "已归档" : "进行中"}</Tag>
      </div>
      {notice && <Alert type="success" showIcon closable title={notice} onClose={() => setNotice("")} />}
      {actionError && <Alert type="error" showIcon title="操作未完成" description={actionError} />}
      {membersPending && <p>正在加载成员……</p>}
      {membersError && <Alert type="error" showIcon title="成员加载失败" description={membersError}
        action={<Button onClick={onRetryMembers}>重试</Button>} />}
      {!membersPending && !membersError && <ul className="project-management__members">
        {members.map((member) => <li key={member.userId}>
          <span>{member.name}{member.userId === currentUserId ? "（我）" : ""} <Tag>{member.role === "owner" ? "组长" : "成员"}</Tag></span>
          {isOwner && member.role === "member" && <span className="project-management__member-actions">
            <Popconfirm title={`转让项目给 ${member.name}？`} description="确认后，对方成为唯一组长，你将变为普通成员。"
              okText="确认转让" cancelText="取消" onConfirm={() => transferMutation.mutate(member.userId)}>
              <Button size="small" disabled={isBusy}>转让组长</Button>
            </Popconfirm>
            <Popconfirm title={`移除 ${member.name}？`} description="其任务指派将清空；任务和评论历史保留。"
              okText="移除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeMutation.mutate(member.userId)}>
              <Button size="small" danger disabled={isBusy}>移除</Button>
            </Popconfirm>
          </span>}
        </li>)}
      </ul>}
      {(isOwner || isAdmin) && <div className="project-management__lifecycle">
        <h3>项目状态</h3>
        <p>{project.archivedAt
          ? "归档期间可以查看任务与评论，不能修改任务、评论或邀请新成员。"
          : "归档后保留所有记录，恢复后可继续协作。"}</p>
        <Popconfirm title={project.archivedAt ? "恢复这个项目？" : "归档这个项目？"}
          okText={project.archivedAt ? "恢复" : "归档"} cancelText="取消"
          onConfirm={() => archiveMutation.mutate(!project.archivedAt)}>
          <Button loading={archiveMutation.isPending} disabled={isBusy && !archiveMutation.isPending}>
            {project.archivedAt ? "恢复项目" : "归档项目"}
          </Button>
        </Popconfirm>
        <div className="project-management__danger">
          <h3>危险操作</h3>
          <p>永久删除项目后，任务与评论会一并删除，无法恢复。</p>
          <Button danger disabled={isBusy} onClick={() => { setTypedName(""); setDeleteOpen(true); }}>永久删除项目</Button>
        </div>
      </div>}
      <Modal title="永久删除项目" open={deleteOpen} okText="永久删除" okButtonProps={{ danger: true, disabled: typedName !== project.name }}
        confirmLoading={deleteMutation.isPending} cancelText="取消"
        onCancel={() => setDeleteOpen(false)} onOk={() => deleteMutation.mutate()}>
        <p>项目“{project.name}”及其任务、评论会一并永久删除，无法恢复。</p>
        <label htmlFor="confirm-project-name">输入项目名称以确认</label>
        <Input id="confirm-project-name" value={typedName} onChange={(event) => setTypedName(event.target.value)} />
        {deleteMutation.isError && <Alert type="error" showIcon title="删除失败" description={deleteMutation.error.message} />}
      </Modal>
    </section>
  );
}
