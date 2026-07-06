---
name: add-question-note-feature
overview: 为每道题目新增个人 Note (笔记) 功能,完全镜像现有 Favorite (收藏) 模式:按 sessionId 隔离、纯文本、内联编辑入口、错题/收藏页只读展示。
todos:
  - id: add-note-model-migration
    content: 在 prisma/schema.prisma 新增 Note 模型 + Question 反向关系;运行 prisma migrate dev 生成迁移;同时扩展 app/api/migrate/route.ts 在事务中迁移 Note(冲突处理同 Favorite 逻辑)
    status: pending
  - id: notes-api-route
    content: 新增 app/api/notes/route.ts 实现 GET 列表/单条、POST upsert(空内容自动删)、DELETE 三件套,完全对齐 favorites/route.ts 结构;同时修改 favorites/wrongbook/attempt 三个 GET 响应 include note 字段
    status: pending
    dependencies:
      - add-note-model-migration
  - id: note-button-and-section
    content: 新建 components/NoteButton.tsx(题号旁按钮 + 内联 textarea + 2000 字限制 + 乐观更新)和 components/NoteSection.tsx(只读展示块,支持 onEdit 回调);使用 lucide-react 新图标
    status: pending
    dependencies:
      - notes-api-route
  - id: wire-practice-and-result
    content: 在 app/practice/page.tsx 集成 NoteButton 到收藏按钮旁,新增 notes Map 状态与加载逻辑,在题目卡底部渲染 NoteSection;同步在 app/result/page.tsx 回顾区域增加 NoteSection(只读 + 编辑跳转)
    status: pending
    dependencies:
      - note-button-and-section
  - id: wire-list-pages-and-home
    content: 在 app/favorites/page.tsx 与 app/wrongbook/page.tsx 的卡片底部增加 NoteSection;新建 app/notes/page.tsx 全部笔记列表页;在 app/page.tsx 其他功能区追加笔记本入口
    status: pending
    dependencies:
      - wire-practice-and-result
---

## 产品概述

为 IIQE 刷题应用新增 **Note (笔记)** 功能,允许用户为每道题添加个人备注。完全镜像现有 **Favorite (收藏)** 模式,保持数据隔离、UI 风格、API 结构的一致性。

## 核心功能

- **题号旁📝按钮**:做题页(practice)题号旁出现笔记按钮,未笔记灰色、已笔记高亮
- **内联编辑**:点击按钮展开内联 `<textarea>` 编辑框,支持保存/取消
- **单设备同步**:与 Favorite 一样按 sessionId 隔离,默认依赖 localStorage 持久化(**不**依赖自訂 sessionId 跨设备)
- **跨页只读展示**:收藏页/错题页/结果回顾页中,该题若已有笔记,显示笔记内容(只读,带"编辑"按钮跳转到做题页)
- **笔记本入口**:首页"其他功能"区增加"📝 笔记本"链接,展示全部笔记
- **自动跟随 session 迁移**:在 `migrate/route.ts` 事务中加入 Note 的迁移(逻辑同 Favorite:同 questionId 冲突时目标 ID 优先)

## 技术栈

继承现有项目栈,无新增依赖:

- **前端**:Next.js 15+ App Router + React + TypeScript + Tailwind CSS + shadcn/ui
- **后端**:Next.js Route Handlers (Node.js Runtime)
- **数据库**:SQLite + Prisma 7 (client 位置 `lib/generated/prisma/`)
- **状态**:React useState / useEffect,无新状态管理
- **图标**:lucide-react(新增 `NotebookPen` / `StickyNote` / `Save` / `X`)

## 实现方案

### 1. 数据层

新增 `Note` 模型,1:1 镜像 `Favorite` 结构(增加 `content` 与 `updatedAt`):

```
model Note {
  id         String   @id @default(cuid())
  sessionId  String
  questionId String
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  content    String   // 纯文本,1000 字上限在 API 层校验
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([sessionId, questionId])
  @@index([sessionId])
}
```

`Question` 模型加反向关系 `notes Note[]`。

### 2. 后端 API

新增 `app/api/notes/route.ts`,完全对齐 `app/api/favorites/route.ts` 的三件套:

- `GET /api/notes?sessionId=...&questionId=...` — 列表或单条;include question+paper
- `POST /api/notes { sessionId, questionId, content }` — upsert(content 为空字符串时直接删除)
- `DELETE /api/notes?sessionId=...&questionId=...` — 删除

同时扩展三个现有 API,让 GET 响应里**带上**该题的 note(省一次请求,且避免 N+1):

- `app/api/favorites/route.ts` — `include: { question: { include: { notes: { where: { sessionId } } } } }`(**关键**:必须按 sessionId 过滤,否则会读到其他 session 的笔记)
- `app/api/wrongbook/route.ts` — 同上
- `app/api/attempt/route.ts` — `answers: { include: { question: { include: { notes: { where: { sessionId } } } } } }`

`/api/notes?sessionId=...&questionIds=a,b,c` 支持**批量**返回多条,供 practice 页一次性加载当前题目列表的笔记(避免 50 题发 50 次请求)。

修改 `app/api/migrate/route.ts`,在 transaction 里**同步迁移 Note**(与 Favorite 同逻辑,处理同 questionId 冲突时 to 优先)。

### 3. 前端组件

**`components/NoteButton.tsx`** (新)— 题目页编辑入口

- Props: `questionId`, `initialNote?`, `onChange?`, `size?`
- **两态**:`无笔记`(灰图标)/ `有笔记`(高亮图标);点击切换"查看 ↔ 编辑"面板
- 内联 `<textarea>`,带字数计数 (X/1000),`whitespace-pre-wrap break-words` 保留换行
- 保存:`POST /api/notes`,乐观更新
- 取消:关闭面板(不保存,保留已存笔记)
- **删除**:独立 "🗑 删除笔记" 按钮,**仅在 `有笔记` 状态显示**,触发 `DELETE`

**`components/NoteSection.tsx`** (新)— 只读展示块

- Props: `content?`, `onEdit?` (回调,可跳转到做题页)
- 有内容:显示 `📝 笔记` 标签 + 文本块
- 无内容:不渲染(空状态不占位)

**`app/practice/page.tsx`** (改)— 集成

- 在 line 544 收藏按钮**前/后**插入 `<NoteButton>`,复用现有 useState Set 结构
- 新增 `notes: Map<questionId, string>` 状态,`loadNotes` 在 `loadFavorites` 同位置调用
- 题目内容卡片底部,在解释/答案块之后渲染 `<NoteSection>`(只读 + "去编辑" 按钮)

**`app/favorites/page.tsx`** (改)— 收藏卡增加 `<NoteSection>`

- `FavItem` 类型增加 `note?: string`
- 卡片底部"正确答案"块之后渲染 NoteSection

**`app/wrongbook/page.tsx`** (改)— 错题卡增加 `<NoteSection>`

- `WrongItem` 类型增加 `note?: string`,同上渲染

**`app/result/page.tsx`** (改)— 结果回顾增加 `<NoteSection>`

- `AnswerData.question` 类型增加 `note?: string`

**`app/page.tsx`** (改)— 首页"其他功能"区追加"📝 笔记本"按钮

**`app/notes/page.tsx`** (新)— 全部笔记列表

- 调用 `GET /api/notes?sessionId=...`
- 渲染使用独立 `components/NoteItemCard.tsx`(显示题号 + 题目摘要 + 笔记块 + "去编辑" 按钮,跳转到 practice 页对应题号)
- **不复用** `FavItemCard`(后者耦合了收藏页特有的 revealed/picked 状态机)

### 4. 关键实现细节

- **1000 字限制**:API 层 `if (content.length > 1000)` 返回 400,前端 textarea 同步禁用(刷题笔记场景下够用,中文按 char 计;utf-16 长度,emoji 会算 2)
- **空内容处理**:`POST` 时若 `content.trim() === ""` 直接 `DELETE`,保证数据库不留空笔记
- **状态管理**:practice 页用 `Map<questionId, string>` 存当前题目的 note;切题时 NoteButton 从 Map 取值,不再请求
- **CSS**:用 `whitespace-pre-wrap break-words` + 浅黄色 `bg-amber-50 border-amber-200` 区分于答案/解释块
- **优化**:useEffect 加载笔记列表用 `Map<id, content>` 减少 re-render;按钮点击用 `useCallback` 防抖
- **regression 防护**:不修改 Favorite 现有逻辑,只在 GET 时 include note;不在 Note 模型里复用 session 外的字段

## 架构

无新架构,沿用现有的"按 sessionId 隔离的轻量数据"模型:

```mermaid
graph LR
  UI[Practice / Favorites / Wrongbook / Notes / Result] -->|fetch| API[/api/notes + /api/favorites + /api/wrongbook + /api/attempt/]
  API --> Prisma[Prisma Client]
  Prisma --> DB[(SQLite)]
  Migrate[/api/migrate] -.->|session 切换时执行| DB
```

## 涉及文件

```
iiqe-app/
├── prisma/
│   ├── schema.prisma                                  [MODIFY] 加 Note 模型 + Question.notes 反向关系
│   └── migrations/
│       └── xxxxxx_add_note/migration.sql              [NEW] Prisma 自动生成
├── app/
│   ├── api/
│   │   ├── notes/route.ts                             [NEW] GET/POST/DELETE
│   │   ├── migrate/route.ts                           [MODIFY] 扩展 Note 迁移
│   │   ├── favorites/route.ts                         [MODIFY] include note
│   │   ├── wrongbook/route.ts                         [MODIFY] include note
│   │   └── attempt/route.ts                           [MODIFY] include note
│   ├── practice/page.tsx                              [MODIFY] 集成 NoteButton + 题目卡 NoteSection
│   ├── favorites/page.tsx                             [MODIFY] 卡片增加 NoteSection
│   ├── wrongbook/page.tsx                             [MODIFY] 卡片增加 NoteSection
│   ├── result/page.tsx                                [MODIFY] 回顾增加 NoteSection
│   ├── notes/page.tsx                                 [NEW] 全部笔记列表
│   └── page.tsx                                       [MODIFY] 首页"其他功能"加入口
└── components/
    ├── NoteButton.tsx                                 [NEW] 编辑按钮 + 内联 textarea
    ├── NoteSection.tsx                                [NEW] 只读展示
    └── NoteItemCard.tsx                               [NEW] 笔记本页卡片(独立组件,不复用 FavItemCard)
```

## Agent Extensions

本任务为纯本地代码修改,未发现 MCP/Skill/SubAgent 中有与"Prisma schema 迁移 + Next.js CRUD + 镜像现有 Favorite 模式"直接相关、可显著提升完成度的扩展。已确认可用的 `code-explorer` subagent 适合用于大规模代码库搜索,本次修改面已被精确锁定,无需调用。

不输出 `<extensions>` 标签。