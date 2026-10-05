import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { Link, Navigate } from "react-router-dom";
import {
  createProject,
  getAllProjects,
  getCurrentUserIsSystemAdmin,
  getWorkspace,
} from "../api/projectApi";
import { encodeProjectId } from "../projectIdCodec";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { supabase } from "../../../lib/supabase";
import { getCurrentProfile, updateCurrentProfile } from "../../auth/profileApi";
export function ProjectsPage({ showAll = false }: { showAll?: boolean }) {
  const session = useAuthSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: getCurrentProfile,
    enabled: Boolean(supabase && userId),
  });
  useEffect(() => {
    if (profileQuery.data) setDisplayName(profileQuery.data.displayName);
  }, [profileQuery.data]);
  const profileMutation = useMutation({
    mutationFn: updateCurrentProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(["profile", userId], profile);
      setProfileOpen(false);
    },
  });
  const adminQuery = useQuery({
    queryKey: ["currentUserIsSystemAdmin", userId],
    queryFn: getCurrentUserIsSystemAdmin,
    enabled: Boolean(supabase && userId),
  });
  const workspaceQuery = useQuery({
    queryKey: ["workspace", "projects", userId],
    queryFn: () => getWorkspace(userId!),
    enabled: Boolean(supabase && userId && !showAll),
  });
  const allProjectsQuery = useQuery({
    queryKey: ["workspace", "allProjects", userId],
    queryFn: getAllProjects,
    enabled: Boolean(supabase && userId && showAll && adminQuery.data === true),
  });
  const refreshWorkspace = () =>
    queryClient.invalidateQueries({
      queryKey: ["workspace"],
    });
  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      setProjectName("");
      await refreshWorkspace();
    },
  });

  if (!supabase)
    return (
      <main className="simple-page">
        <p className="eyebrow">PROJECT TASKS</p>
        <h1>项目</h1>
        <Alert
          type="info"
          showIcon
          message="配置 Supabase 后可创建真实项目"
          description="当前为本地演示模式。"
        />
        <Link to="/projects/p1/board">打开演示看板 →</Link>
      </main>
    );

  const operationError = createProjectMutation.error?.message;
  const projects = showAll
    ? allProjectsQuery.data
    : workspaceQuery.data?.projects;
  const listPending = showAll
    ? allProjectsQuery.isPending
    : workspaceQuery.isPending;
  const listError = showAll ? allProjectsQuery.error : workspaceQuery.error;
  const retryList = showAll ? allProjectsQuery.refetch : workspaceQuery.refetch;

  if (showAll && adminQuery.data === false)
    return <Navigate to="/projects" replace />;

  return (
    <main className="simple-page projects-page">
      <header className="projects-header">
        <div>
          <p className="eyebrow">
            PROJECT TASKS <span aria-hidden="true">/</span> WORKSPACE
          </p>
          <h1>{showAll ? "全部项目" : "我的项目"}</h1>
          <p className="projects-intro">
            让每个项目的进度与协作，都有一个清晰的位置。
          </p>
        </div>
        <Button icon={<UserOutlined />} onClick={() => setProfileOpen(true)}>
          个人信息
        </Button>
      </header>
      {profileQuery.data && !profileQuery.data.displayName.trim() && (
        <Alert
          className="project-alert"
          type="info"
          showIcon
          message="添加一个用户名，方便项目成员识别你。"
          action={<Button size="small" onClick={() => setProfileOpen(true)}>设置用户名</Button>}
        />
      )}
      {profileQuery.isError && (
        <Alert
          className="project-alert"
          type="error"
          showIcon
          message="个人信息加载失败"
          description={profileQuery.error.message}
          action={<Button size="small" onClick={() => void profileQuery.refetch()}>重试</Button>}
        />
      )}
      <nav className="project-nav" aria-label="项目列表范围">
        <Link className={!showAll ? "project-nav__active" : ""} to="/projects">
          我的项目
        </Link>
        {adminQuery.data === true && (
          <Link
            className={showAll ? "project-nav__active" : ""}
            to="/projects/all"
          >
            全部项目
          </Link>
        )}
      </nav>
      {adminQuery.isError && (
        <Alert
          type="error"
          showIcon
          title="管理员身份加载失败"
          description={adminQuery.error.message}
          action={
            <Button onClick={() => void adminQuery.refetch()}>重试</Button>
          }
        />
      )}
      {((showAll && adminQuery.isPending) ||
        (listPending && (!showAll || adminQuery.data === true))) && (
        <p>正在加载项目……</p>
      )}
      {listError && (
        <Alert
          type="error"
          showIcon
          message="项目加载失败"
          description={listError.message}
          action={<Button onClick={() => void retryList()}>重试</Button>}
        />
      )}
      {operationError && (
        <Alert
          className="project-alert"
          type="error"
          showIcon
          closable
          message="操作未完成"
          description={operationError}
        />
      )}
      {projects && (
        <div
          className={`projects-layout${showAll ? " projects-layout--all" : ""}`}
        >
          <section
            className="project-list"
            aria-labelledby="project-list-title"
          >
            <div className="project-list__heading">
              <h2 id="project-list-title">项目空间</h2>
              <span>{projects.length} 个项目</span>
            </div>
            {projects.length === 0 ? (
              <div className="projects-empty">
                <span className="projects-empty__mark" aria-hidden="true">
                  ＋
                </span>
                <h3>{showAll ? "目前没有项目" : "这里还没有项目"}</h3>
                <p>
                  {showAll
                    ? "目前没有可展示的项目。"
                    : "创建一个项目，或通过组长分享的邀请链接加入。"}
                </p>
              </div>
            ) : (
              <div className="project-list__items">
                {projects.map((project) => (
                  <Link
                    className="project-list__item"
                    key={project.id}
                    to={`/projects/${encodeProjectId(project.id)}/board`}
                  >
                    <span className="project-list__symbol" aria-hidden="true">
                      {project.name.slice(0, 1)}
                    </span>
                    <span className="project-list__copy">
                      <strong>{project.name}</strong>
                      <span>
                        {"role" in project && project.role
                          ? project.role === "owner"
                            ? "组长"
                            : "协作者"
                          : showAll
                            ? "管理员视图"
                            : "协作者"}
                        {project.archivedAt ? " · 已归档" : ""}
                      </span>
                    </span>
                    <span className="project-list__arrow" aria-hidden="true">
                      ↗
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
          {!showAll && (
            <aside className="project-create-panel">
              <p className="eyebrow">NEW SPACE</p>
              <h2>开启一个新项目</h2>
              <p className="project-create-panel__intro">
                从清晰的目标开始，和团队一起推进。
              </p>
              <form
                className="project-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (projectName.trim())
                    createProjectMutation.mutate(projectName.trim());
                }}
              >
                <label htmlFor="new-project-name">项目名称</label>
                <Input
                  id="new-project-name"
                  value={projectName}
                  maxLength={120}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="例如：产品迭代"
                />
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={createProjectMutation.isPending}
                  disabled={!projectName.trim()}
                >
                  创建项目
                </Button>
              </form>
            </aside>
          )}
        </div>
      )}
      <Modal
        title="个人信息"
        open={profileOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={profileMutation.isPending}
        okButtonProps={{ disabled: !displayName.trim() }}
        onCancel={() => setProfileOpen(false)}
        onOk={() => profileMutation.mutate(displayName)}
      >
        <label className="profile-name-field">
          用户名
          <Input
            autoFocus
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="项目成员看到的名称"
          />
        </label>
        {profileMutation.isError && <Alert type="error" showIcon message={profileMutation.error.message} />}
      </Modal>
    </main>
  );
}
