import { useState } from "react";
import { Alert, Button, Drawer, Input, Spin } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addTaskComment, getTaskById, getTaskComments } from "../api/taskApi";
import { useTaskUiStore } from "../store/taskUiStore";

type AddCommentVariables = {
  taskId: string;
  content: string;
};

export function TaskDetailPanel({ projectId, userId }: { projectId: string; userId: string }) {
  const [commentContent, setCommentContent] = useState("");
  const selectedTaskId = useTaskUiStore((state) => state.selectedTaskId);
  const closeTask = useTaskUiStore((state) => state.closeTask);
  const queryClient = useQueryClient();

  const taskQuery = useQuery({
    queryKey: ["tasks", "detail", userId, projectId, selectedTaskId],
    queryFn: async () => {
      if (selectedTaskId === null) return null;

      const task = await getTaskById(projectId, selectedTaskId);
      if (!task) throw new Error("任务不存在");
      return task;
    },
    enabled: selectedTaskId !== null,
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });

  const commentsQuery = useQuery({
    queryKey: ["tasks", "comments", userId, projectId, selectedTaskId],
    queryFn: () =>
      selectedTaskId === null
        ? Promise.resolve([])
        : getTaskComments(selectedTaskId),
    enabled: selectedTaskId !== null,
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ taskId, content }: AddCommentVariables) =>
      addTaskComment(taskId, content),
    onSuccess: (_comment, variables) => {
      setCommentContent("");
      return queryClient.invalidateQueries({
        queryKey: ["tasks", "comments", userId, projectId, variables.taskId],
      });
    },
  });

  return (
    <Drawer
      title={taskQuery.data?.title ?? "任务详情"}
      size={480}
      open={selectedTaskId !== null}
      onClose={closeTask}
      destroyOnHidden
    >
      {selectedTaskId !== null && (
        <div className="task-detail-panel">
          {taskQuery.isPending && <Spin tip="正在加载任务详情……" />}
          {taskQuery.isError && (
            <Alert type="error" title="任务详情更新失败" description={taskQuery.error.message} showIcon action={<Button onClick={() => void taskQuery.refetch()}>重试</Button>} />
          )}
          {taskQuery.data && (
            <section className="task-detail-summary" aria-label="任务信息">
              <p>
                <span>状态</span>
                <strong>
                  {taskQuery.data.status === "todo"
                    ? "待处理"
                    : taskQuery.data.status === "doing"
                      ? "进行中"
                      : "已完成"}
                </strong>
              </p>
              <p>
                <span>负责人</span>
                <strong>{taskQuery.data.assignee}</strong>
              </p>
              <p>
                <span>优先级</span>
                <strong>
                  {taskQuery.data.priority === "high"
                    ? "高"
                    : taskQuery.data.priority === "medium"
                      ? "中"
                      : "低"}
                </strong>
              </p>
            </section>
          )}

          <section className="task-comments" aria-label="任务评论">
            <div className="task-comments__heading">
              <h3>评论</h3>
              <span>{commentsQuery.data?.length ?? 0}</span>
            </div>
            {commentsQuery.isPending && <p>正在加载评论……</p>}
            {commentsQuery.isError && (
              <Alert
                type="error"
                title="评论更新失败"
                description={commentsQuery.error.message}
                showIcon
                action={<Button onClick={() => void commentsQuery.refetch()}>重试</Button>}
              />
            )}
            {commentsQuery.data?.length === 0 && (
              <p className="task-comments__empty">还没有评论，写下第一条吧。</p>
            )}
            {commentsQuery.data?.map((comment) => (
              <article className="task-comment" key={comment.id}>
                <p>{comment.content}</p>
                <time dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleString()}
                </time>
              </article>
            ))}
          </section>

          <form
            className="task-comment-form"
            onSubmit={(event) => {
              event.preventDefault();
              const content = commentContent.trim();
              if (selectedTaskId === null || !content) return;

              addCommentMutation.mutate({ taskId: selectedTaskId, content });
            }}
          >
            <Input.TextArea
              value={commentContent}
              onChange={(event) => setCommentContent(event.target.value)}
              placeholder="写一条评论……"
              autoSize={{ minRows: 3, maxRows: 5 }}
              aria-label="评论内容"
            />
            {addCommentMutation.isError && (
              <Alert
                type="error"
                title={addCommentMutation.error.message}
                showIcon
              />
            )}
            <Button
              type="primary"
              htmlType="submit"
              loading={addCommentMutation.isPending}
              disabled={!commentContent.trim() || addCommentMutation.isPending}
            >
              添加评论
            </Button>
          </form>
        </div>
      )}
    </Drawer>
  );
}
