# TanStack Query 与 Zustand 在本项目中的使用详解

> 教学目标：结合本项目源码，弄懂两套库各自解决什么问题、代码语法在表达什么、数据如何流动，以及为什么不把所有状态都塞进一个全局 store。
>
> 源码行号按 **2026-10-06** 当前版本记录，依赖声明见 `package.json`。代码后续变化时，请按文中的函数名和 Query key 重新定位。

## 0. 先给结论：它们管的是两类状态

| 工具 | 在本项目里管理什么 | 例子 | 数据从哪里来 |
| --- | --- | --- | --- |
| TanStack Query | 服务器状态、请求状态和请求缓存 | 任务列表、单条任务、评论、项目成员 | Supabase 查询/RPC 的结果 |
| Zustand | 跨组件共享的界面状态 | 搜索词、状态筛选、当前打开的任务 ID | 用户在界面上的操作 |
| React `useState` | 局部、临时的组件状态 | 新任务输入框、编辑草稿、评论输入框、拖拽预览 | 当前组件交互 |
| 派生计算 | 能由现有状态算出来的数据 | `visibleTasks`、每列任务数组 | 不额外保存；渲染时计算 |

可以先记住一句话：**Supabase 是持久数据来源，TanStack Query 缓存服务器数据，Zustand 保存少量共享 UI 状态，组件状态保存局部临时值。** TanStack Query 不是后端或 Supabase 客户端，Zustand 也不是数据库缓存。

## 1. 依赖版本与入口：QueryClient 怎样进入 React 应用？

### 1.1 项目声明了什么

[`package.json`](../package.json) 中声明：

- `@tanstack/react-query`: `^5.103.1`
- `zustand`: `^5.0.15`

这是 package.json 中的版本范围，不代表锁文件一定解析到完全相同的补丁版本。本文介绍的 Query 写法采用当前源码中的 TanStack Query v5 对象参数形式。

### 1.2 应用入口代码

位置：[`src/main.tsx:1-16`](../src/main.tsx#L1)

```tsx
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

**逐句看**

1. `new QueryClient()` 创建 Query 的中央客户端。它持有 Query 缓存、Mutation 缓存和全局默认配置。这里在模块级创建一次，避免 React 每次渲染入口时创建一份新的缓存。
2. `<QueryClientProvider client={queryClient}>` 把这个实例通过 React Context 放到组件树上。
3. `BoardPage`、`TaskDetailPanel` 等后代组件才能调用 `useQuery`、`useMutation` 和 `useQueryClient`。
4. Provider 放在 `AuthGate` 外面，因此认证界面切换时 QueryClient 仍由同一棵应用根树提供。具体的请求仍会通过已配置 session 的 Supabase client 执行。

**为什么需要 Provider？** TanStack Query 的缓存需要一个共享的 `QueryClient`。Provider 负责让 React hooks 找到这个实例。如果组件没有处于 Provider 子树里，`useQueryClient()` 无法拿到客户端。

本项目没有在 `new QueryClient()` 上配置统一的 `defaultOptions`。[`src/lib/queryConfig.ts:1`](../src/lib/queryConfig.ts#L1) 只定义了 `AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000`，业务 Query 在需要轮询的位置显式使用它，也就是 **10 分钟**。

## 2. TanStack Query：从读取任务开始

### 2.1 项目中的实际读取

看板代码：[`src/features/tasks/pages/BoardPage.tsx:53-105`](../src/features/tasks/pages/BoardPage.tsx#L53)

```tsx
const taskListKey = ["tasks", userId, projectId] as const;

const {
  data: tasks = [],
  isPending,
  isError,
  error,
} = useQuery({
  queryKey: taskListKey,
  queryFn: () => getTasks(projectId!),
  enabled: Boolean(supabase && userId && projectId),
  refetchInterval: AUTO_REFRESH_INTERVAL_MS,
  refetchOnWindowFocus: "always",
});
```

### 2.2 `useQuery` 对象参数的语法

v5 常用结构是：

```tsx
const result = useQuery({
  queryKey: ["resource", id],
  queryFn: () => fetchResource(id),
  enabled: Boolean(id),
});
```

- `useQuery({...})`：声明“我要读取并缓存一份数据”。参数是一个对象，所以各项配置有名称。
- `queryKey`：这份数据在 Query 缓存里的身份标识。
- `queryFn`：真正获取数据的函数，应返回数据或 Promise；这里 Query 调用 `getTasks`，Supabase 查询被留在 API 层。
- `enabled`：条件为 `false` 时暂不运行查询。项目在用户 session 或 `projectId` 尚未准备好时，不应发起这个请求。
- 解构出的 `data`、`isPending`、`isError`、`error`：是 Query 给组件的查询结果和状态。`data: tasks = []` 是 JavaScript 解构默认值，第一次还没有数据时让页面拿到空数组。

`projectId!` 是 TypeScript 的非空断言，意思是“编译时我确认它不为空”。它本身不会在运行时验证值；运行时是否允许查询由 `enabled` 条件负责。

### 2.3 Query key 为什么带用户和项目 ID？

本项目的任务列表 key 是 `['tasks', userId, projectId]`。这表示不同登录用户或不同项目的任务列表属于不同缓存项。详情和评论也把用户、项目、任务 ID 放入 key，见 [`TaskDetailPanel.tsx:21-44`](../src/features/tasks/components/TaskDetailPanel.tsx#L21)。

**实用规则**：凡是会改变请求返回结果的参数，通常都应放入 `queryKey`。比如“项目 A 的任务”和“项目 B 的任务”不能使用完全相同的 key，否则 Query 无法区分它们。

Query key 是数组，Query 可以按前缀匹配：

```tsx
queryClient.invalidateQueries({ queryKey: ["tasks"] });
```

这会匹配以 `['tasks']` 开头的一组查询，例如任务列表、任务详情和评论查询。要只处理完全匹配的 key，可再传 `exact: true`。项目对评论删除失败等情形使用 exact key，避免影响其他任务缓存。

### 2.4 API 文件做什么？

[`src/features/tasks/api/taskApi.ts:69-79`](../src/features/tasks/api/taskApi.ts#L69) 中的 `getTasks(projectId)`：

1. 从 `tasks` 表读取看板需要的字段；
2. 用 `.eq("project_id", projectId)` 限定项目；
3. 用 `sort_order` 和创建时间决定读取顺序；
4. 如果 Supabase 返回错误就 `throw`；否则把数据库字段映射成前端 `Task` 类型。

也就是说，Query 负责调度、缓存和状态；API 函数负责请求实现和数据转换。这种拆分让组件不用把 Supabase 查询细节和 JSX 混在一起。

## 3. Query 的状态怎样变成页面？

[`BoardPage.tsx:257-276`](../src/features/tasks/pages/BoardPage.tsx#L257) 展示了“服务器数据 → 派生显示数据”的流程：

```tsx
const orderedTasks = [...tasks].sort(bySortOrder);
const visibleTasks = filterTasks(orderedTasks, search, statusFilter);
```

`tasks` 是 Query 缓存提供的服务器数据；`orderedTasks` 和 `visibleTasks` 是每次渲染时由输入计算出来的值。它们没有被再写进 Query 或 Zustand。

[`filterTasks.ts:5-10`](../src/features/tasks/utils/filterTasks.ts#L5) 组合搜索标题和状态筛选。接着 `BoardPage` 从 `visibleTasks` 派生三列。这样任务被创建、更新或删除后，只要源任务列表变化，筛选结果自然重新计算，不会出现额外的 `filteredTasks` state 忘了同步的问题。

**别把所有结果都存起来**：如果 `visibleTasks` 是 `tasks + search + statusFilter` 的纯计算结果，再单独存一份，就要在每个源值变化时同步维护它。多份可写副本容易不一致。

## 4. TanStack Query：写入用 `useMutation`

### 4.1 基本书写结构

```tsx
const mutation = useMutation({
  mutationFn: (variables) => writeData(variables),
  onSuccess: (data, variables) => { /* 成功后的处理 */ },
  onError: (error, variables) => { /* 失败后的处理 */ },
});

mutation.mutate(variables);
```

- `useMutation` 声明一个会产生副作用的操作，例如新增、修改、删除。
- `mutationFn` 是实际写入函数。调用 `mutate(variables)` 时，`variables` 会交给它。
- `onSuccess` 与 `onError` 是生命周期回调，可用来更新缓存、显示反馈或恢复数据。
- mutation 也会暴露 `isPending`、`isError`、`error`、`variables` 等状态，供按钮禁用或错误显示使用。

Query 和 Mutation 的分工是“读取”和“写入”的常见心智模型。Mutation 不会自动猜出应该如何修改某个列表 Query；需要由业务代码明确更新缓存，或将受影响的 Query 标记为失效。

### 4.2 新增、修改、删除：服务端成功后直接修补缓存

看板中任务 mutation 在 [`BoardPage.tsx:144-199`](../src/features/tasks/pages/BoardPage.tsx#L144)。

- **新增**：先调用 `createTask`，成功后用 `setQueryData` 把返回的新任务加到当前列表（149-153 行）。这是“请求成功后立即更新缓存”，不是请求尚未成功时的乐观新增。
- **修改**：服务端返回完整的 `updatedTask` 后，在列表里替换同 ID 的任务，并同步写入该任务的详情 key（156-180 行）。
- **删除**：删除成功后从列表缓存中过滤掉指定 ID；如果刚好打开了该任务详情，就关闭详情面板（181-190 行）。
- **删除失败**：显示错误并使当前列表 key 失效，让活动查询重新读取数据库（191-198 行）。

`queryClient.setQueryData(key, updater)` 中的 updater 会收到当前缓存。列表应使用 `map` / `filter` 返回新数组，不要原地修改旧数组或旧任务对象。

### 4.3 `setQueryData` 还是 `invalidateQueries`？

**直接写缓存**适合手里已有可信的新数据，并且能明确算出缓存的新值：本项目新增、编辑、删除和评论成功后都采用这种方式。

**让 Query 失效并重新获取**适合写入影响了复杂数据、其他派生列表，或者客户端不确定服务端最终状态的情况。本项目创建项目成功后调用 `invalidateQueries({ queryKey: ["workspace"] })`，见 [`ProjectsPage.tsx:53-63`](../src/features/projects/pages/ProjectsPage.tsx#L53)，由 Query 再读取项目列表。

失效的含义不是立刻删除缓存，而是把匹配项标为需要刷新；默认会重新获取活动中的匹配 Query。官方文档也把 Mutation 成功后定向失效作为常见同步方式，详见 [TanStack Query：Invalidations from Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)。

## 5. 本项目的乐观更新：拖拽排序的完整例子

拖拽要即时反映位置，因此本项目采用“先改客户端缓存，失败再恢复”的乐观更新。

### 5.1 写入 mutation 的配置

[`BoardPage.tsx:200-217`](../src/features/tasks/pages/BoardPage.tsx#L200)：

```tsx
const reorderMutation = useMutation({
  mutationFn: ({ ordered }: { ordered: Task[]; previous?: Task[] }) =>
    persistTaskOrder(projectId!, ordered),
  onMutate: ({ previous }) => ({ previous }),
  onSuccess: () => { /* 显示保存成功 */ },
  onError: async (e, _ordered, context) => {
    if (context?.previous) queryClient.setQueryData(taskListKey, context.previous);
    await queryClient.invalidateQueries({ queryKey: taskListKey, exact: true });
  },
});
```

`onMutate` 的返回值会作为 `context` 传给后续回调；这里将调用方传来的旧列表 `previous` 保存在 context。出错后先恢复旧列表，再使确切的任务列表 key 失效，最终重新以服务端数据校准。

### 5.2 为什么缓存更新在 `mutate` 调用之前？

[`BoardPage.tsx:389-405`](../src/features/tasks/pages/BoardPage.tsx#L389) 在拖动结束后：

1. 对比新旧任务顺序，避免没有实际变化也写数据库；
2. 从 Query 缓存抓取 `previous` 快照；
3. 为每个状态列生成新的 `sortOrder`；
4. 取消这个列表正在进行的查询，避免旧请求结果覆盖刚写入的乐观缓存；
5. `setQueryData` 立即把列表换成新顺序；
6. 调用 `reorderMutation.mutate({ ordered, previous })`，真正发送数据库写入。

这一步不是 TanStack Query 自动替你改了任务列表，而是项目代码主动操作 Query 缓存。Mutation 负责跟踪异步写入及回调。

TanStack Query 官方把直接改缓存的方式列为乐观更新的一种实现，同时提醒写请求可能失败，因此需要回滚或最终重新校准：[Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)。

## 6. 详情和评论：为什么 Query key 要带当前任务 ID？

位置：[`TaskDetailPanel.tsx:15-61`](../src/features/tasks/components/TaskDetailPanel.tsx#L15)

- `selectedTaskId` 来自 Zustand；它描述“当前 UI 打开了哪条任务”。
- 详情 key 为 `['tasks', 'detail', userId, projectId, selectedTaskId]`。
- 评论 key 为 `['tasks', 'comments', userId, projectId, selectedTaskId]`。
- `enabled: selectedTaskId !== null` 表示没有选中任务时不需要发出详情/评论请求。
- 新增评论成功后，使用 `variables.taskId` 定位评论 Query key，把服务端返回的新评论添加到缓存（46-60 行）。

如果 key 不带 task ID，打开任务 A 和任务 B 时可能错误复用相同缓存身份。把请求输入放进 key，Query 才能正确区分两份详情和评论数据。

## 7. Zustand：项目实际 store 怎么读？

### 7.1 状态与动作的类型

[`src/features/tasks/store/taskUiStore.ts:1-30`](../src/features/tasks/store/taskUiStore.ts#L1)

```tsx
type TaskUiState = {
  search: string;
  statusFilter: TaskStatusFilter;
  selectedTaskId: string | null;
  setSearch: (value: string) => void;
  setStatusFilter: (value: TaskStatusFilter) => void;
  openTask: (taskId: string) => void;
  closeTask: () => void;
};

export const useTaskUiStore = create<TaskUiState>((set) => ({
  search: "",
  statusFilter: "all",
  selectedTaskId: null,
  setSearch: (value) => set((state) => ({ ...state, search: value })),
  setStatusFilter: (value) => set((state) => ({ ...state, statusFilter: value })),
  openTask: (taskId) => set({ selectedTaskId: taskId }),
  closeTask: () => set({ selectedTaskId: null }),
}));
```

**语法拆解**

- `create<TaskUiState>(...)`：创建一个绑定 React 的 store hook；尖括号是 TypeScript 泛型，让初始状态、动作和组件读取都受 `TaskUiState` 检查。
- `(set) => ({ ... })`：传给 store 的初始化函数。Zustand 提供 `set` 更新 store；返回对象包含初始状态和可调用动作。
- `set((state) => ...)`：函数形式可以根据旧状态计算新值，适合需要读取当前状态时使用。
- `set({ selectedTaskId: taskId })`：对象形式更新指定字段。
- `create` 创建的是可在 React 组件中调用的 hook，所以页面不需要再套一个 Zustand Provider。

项目当前在 `setSearch` 和 `setStatusFilter` 中展开了 `...state`。Zustand 的 `set` 默认会浅合并顶层对象，因此对这里的单字段更新而言，写成 `set({ search: value })` 也可以；当前写法显式保留其他字段，行为正确但有冗余。文档只解释现状，不要求为此改代码。

### 7.2 组件用 selector 订阅需要的字段

看板在 [`BoardPage.tsx:106-111`](../src/features/tasks/pages/BoardPage.tsx#L106)，工具栏在 [`TaskToolbar.tsx:9-13`](../src/features/tasks/components/TaskToolbar.tsx#L9)：

```tsx
const search = useTaskUiStore((state) => state.search);
const setSearch = useTaskUiStore((state) => state.setSearch);
```

括号里的 `(state) => state.search` 叫 selector（选择器）：从整个 store 中挑出组件需要订阅的那一个值。搜索输入变化会更新 `search`，订阅 `search` 的组件据此重渲染；没有必要让组件通过 `useTaskUiStore()` 读取整个对象。

工具栏的受控输入流程在 [`TaskToolbar.tsx:18-39`](../src/features/tasks/components/TaskToolbar.tsx#L18)：

1. `value={search}` 让输入框显示 store 中的当前值；
2. 用户键入触发 `onChange`；
3. `setSearch(e.target.value)` 调用 Zustand action；
4. 订阅这个字段的组件收到新值并显示。

状态筛选的 Select 同理。Zustand 文档推荐通过 selector 读取 state/action；详见 [Zustand Introduction](https://zustand.docs.pmnd.rs/learn/getting-started/introduction) 和 [Beginner TypeScript Guide](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript)。

### 7.3 store 里为什么只存任务 ID，不存整条任务？

`selectedTaskId` 是界面选择状态；任务详情本身来自 Query。Drawer 打开后用选中的 ID 查询详情和评论。若 Zustand 再复制一整条任务对象，就会出现两个事实来源：任务 mutation 更新 Query 后，还要记得同步更新 Zustand 对象。只存 ID 能把“当前选择哪条”与“这条任务最新数据是什么”分开。

同理，项目把搜索词和状态筛选存到 Zustand，却将 `visibleTasks` 留作派生值，见 [`filterTasks.ts:5-10`](../src/features/tasks/utils/filterTasks.ts#L5)。这就是“只存最小必要状态”的实践。

### 7.4 Zustand 不是浏览器持久化

当前 store 没有使用 `persist` middleware，也没有把搜索/筛选写到 localStorage。store 是模块内存状态：切换组件时同一个应用实例仍可共享；刷新整个页面后内存重建，状态会回到初始值。不要把“全局共享”误解成“自动跨刷新保存”。

## 8. 什么时候应该放到哪一层？

| 你要保存的内容 | 推荐位置 | 本项目例子 | 判断理由 |
| --- | --- | --- | --- |
| 从 Supabase 读回、需要跨组件展示的数据 | TanStack Query | `tasks`、项目、成员、评论 | 需要请求状态、缓存、刷新、写后同步 |
| 多个不相邻组件都要读取的界面选择 | Zustand | `search`、`statusFilter`、`selectedTaskId` | 属于 UI，不需要当作服务端数据重新请求 |
| 单个组件的输入或操作过程 | React `useState` | `newTaskTitle`、`commentContent`、编辑草稿 | 不需要全局共享，放本地更直观 |
| 已能由其他值计算出的列表 | 不额外保存 | `visibleTasks`、状态列数组 | 避免重复状态和同步 bug |

快速自问：**刷新后要以数据库为准吗？** 是的话通常属于服务器数据；**这只是用户当前选中了什么/输入了什么吗？** 是的话属于 UI；**它能否从现有值立即算出？** 是的话优先派生，不再新增一份 state。

## 9. 与其他方案相比：优势、成本和适用边界

### 9.1 TanStack Query 对比手写 `useEffect + useState`

若自己用 React state 写请求，通常要手动维护 `data/loading/error`，处理组件切换时旧请求晚到、重复请求、缓存键、请求去重、窗口重新聚焦、轮询、mutation 完成后的刷新和失败恢复。本项目通过 `useQuery` 统一缓存与查询状态，再通过 Mutation 回调显式同步缓存。

**优势**：服务器状态的生命周期有一套统一接口，缓存可复用，Query key 可按层级定位，Query/Mutation 状态可直接驱动页面。

**成本**：必须认真设计 Query key，搞清楚更新缓存和失效重取的时机；它不会自动替业务定义“这个写入要怎样修改这些页面的数据”。小页面只有一个简单请求时，引入 Query 也可能显得偏重。

### 9.2 TanStack Query 对比只把 Supabase 请求放在组件事件里

Supabase JS 负责发请求和拿响应；TanStack Query 管请求状态和缓存。二者互补，不是二选一。本项目的 `queryFn` 调用 `taskApi`，再由 API 使用 Supabase 查询。若组件直接请求 Supabase，就仍得自己处理加载、错误、缓存、重新获取和跨组件共享。

类似的服务器状态工具还有 SWR、RTK Query。项目选择 TanStack Query 后，读取以 `useQuery`、写入以 `useMutation`、缓存通过 QueryClient 管理；面试时讲清项目实际用法即可，不必声称它在所有团队规模和技术栈下都优于其他工具。

### 9.3 Zustand 对比 React `useState` 和 Context

- **`useState`**：最适合一个组件拥有的状态。若多个组件需要同一值，可以先提升到最近公共父组件；树变深后，props 传递会变多。本项目把只在看板内的输入框留在 `useState`，共享的筛选/选中任务放进 store。
- **React Context**：React 内置共享值机制，适合少量、稳定的跨层依赖；状态更新策略、动作组织、selector 粒度需要自己安排。本项目的 session 用 Context，频繁交互 UI 小状态用 Zustand。
- **Zustand**：创建 store 和 selector hook 较直接，没有 Redux reducer/action 模板，也不需要 Provider；适合本项目这种少量跨组件 UI 状态。应用很小、状态只在父子组件传递时，引入全局 store 未必值得。
- **Redux Toolkit**：提供更明确的 action/reducer/slice 组织、较强约定和成熟调试生态，适合团队需要统一状态变更模式、复杂业务状态较多的应用；相应地，概念与结构更多。本项目没有使用 Redux，也没有必要为了搜索词和当前任务 ID 引入完整 Redux 流程。

这些工具不是互斥关系。比如大应用可以用 TanStack Query 放服务器数据、Redux Toolkit 放复杂客户端业务状态、React state 放输入框。本项目用 Zustand 管少量 UI 状态，是一次依需求做的选择。

## 10. 读项目代码时可以按这条链路走

```text
src/main.tsx
  └─ 创建 QueryClient，并用 Provider 提供全局缓存
       └─ BoardPage.tsx
            ├─ useQuery 读取任务列表、项目和成员
            ├─ useTaskUiStore(selector) 读取搜索、筛选和当前详情 ID
            ├─ filterTasks 派生 visibleTasks 和看板列
            └─ useMutation 执行任务写入并同步 Query 缓存
                 └─ taskApi.ts 调用 Supabase Data API / RPC
       └─ TaskDetailPanel.tsx
            ├─ selectedTaskId 决定详情/评论 Query key 与 enabled
            └─ 新增评论成功后更新对应评论缓存
```

建议从 `main.tsx` → `BoardPage.tsx` 查询段 → `taskApi.ts` → `BoardPage.tsx` mutation 段 → `taskUiStore.ts` → `TaskToolbar.tsx` 依次读。每读一段都回答四件事：**谁拥有这份状态、输入是什么、成功后怎么让 UI 更新、失败时怎么处理？**

## 11. 常见误解检查

1. **“Zustand 管了所有任务数据。”** 不对。任务列表和详情是 Query 缓存；Zustand 只保存搜索、筛选和当前任务 ID。
2. **“Mutation 成功后 Query 会自动同步。”** 不对。项目显式使用 `setQueryData` 或 `invalidateQueries`。
3. **“`invalidateQueries` 删除了旧缓存。”** 不对。它把匹配 Query 标记为失效，并通常重新获取活动查询；缓存项仍存在。
4. **“乐观更新就代表数据库写入成功。”** 不对。它只先更新 UI/缓存；网络或权限失败时仍需要回滚并重新校准。
5. **“Zustand store 写在模块级，所以自动存进 localStorage。”** 不对。要持久化需额外配置 middleware；本项目当前没有。
6. **“Query key 只要名字一样就行。”** 不够。影响结果的用户、项目、任务 ID 等输入也应加入 key。
7. **“所有 state 都应该全局化。”** 不对。输入草稿留在组件本地，派生列表直接计算，服务器数据交给 Query。

## 12. 可复述版总结

> 我用 TanStack Query 管 Supabase 返回的服务器数据：`useQuery` 负责按 query key 读取和缓存，`useMutation` 负责写操作；写成功后根据场景直接用 `setQueryData` 修补缓存，或用 `invalidateQueries` 让服务端数据重新校准。拖拽排序需要立即反馈，所以先乐观更新列表，失败时恢复旧缓存并重新查询。Zustand 只存搜索、状态筛选和当前打开的任务 ID；输入草稿是组件本地 state，任务列表与筛选结果也没有复制到 store。这样服务器数据和 UI 状态各有清晰来源。

## 官方文档

- [TanStack Query React：Quick Start](https://tanstack.com/query/latest/docs/framework/react/quick-start)
- [TanStack Query：Invalidations from Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)
- [TanStack Query：Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [Zustand：Introduction](https://zustand.docs.pmnd.rs/learn/getting-started/introduction)
- [Zustand：Beginner TypeScript Guide](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript)
