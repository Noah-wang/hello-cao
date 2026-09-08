# hello-cao

一个最小的 Discord LLM 聊天机器人。它只在被 `@` 时回答，只使用可配置的说话风格，不保存记忆，也不向模型提供任何工具。

## 运行条件

- Node.js 20 或更新版本
- 一个 Discord Bot
- 一个支持 OpenAI Chat Completions 格式的 LLM API

## Discord 设置

在 Discord Developer Portal 的 **Bot** 页面开启 **Message Content Intent**。邀请机器人时只需要：

- View Channels
- Send Messages
- Read Message History

不要给机器人 Administrator 权限。

## 本地运行

```bash
npm install
cp .env.example .env
cp config/style-source.example.json config/style-source.json
cp config/user-titles.example.json config/user-titles.json
cp config/system-prompt.example.md config/system-prompt.md
```

编辑 `.env`：

```dotenv
DISCORD_BOT_TOKEN=重置后生成的新Token
LLM_API_KEY=你的LLM密钥
LLM_MODEL=你要使用的模型名称
LLM_BASE_URL=https://api.openai.com/v1
STYLE_DESCRIPTION=语气自然、简短、带一点冷幽默；先直接回答，再补充必要解释。
```

然后启动：

```bash
npm run dev
```

看到 `Bot is online` 后，在服务器中发送：

```text
@机器人 为什么天空是蓝色？
```

## 生产运行

```bash
npm run build
npm start
```

建议在云服务器上通过进程管理器或容器保持进程运行。不要提交 `.env`，也不要把 Bot Token 发到聊天中。

## 风格说明

第一版不读取历史聊天。你可以直接修改 `.env` 中的 `STYLE_DESCRIPTION` 来调整表达方式，例如句子长短、口头禅、幽默程度和解释节奏。不要在这里加入真实身份、私人经历或敏感信息。

## 从一个频道提取说话风格

请只分析已经明确同意的用户。先在 Discord 的 **用户设置 → 高级 → 开发者模式** 中开启开发者模式，然后右键目标频道复制频道 ID，右键目标用户复制用户 ID。

先复制 `config/style-source.example.json` 为 `config/style-source.json`，再填写频道和目标用户。真实配置已被 Git 忽略；环境变量仍可覆盖该配置：

```dotenv
STYLE_CHANNEL_ID=目标频道ID
STYLE_TARGET_USER_ID=目标用户ID
STYLE_MAX_MESSAGES=3000
STYLE_SCAN_LIMIT=20000
STYLE_PROFILE_PATH=data/style-profile.json
```

确认机器人对该频道拥有 **查看频道** 和 **读取消息历史** 权限，Developer Portal 中也已开启 **Message Content Intent**。然后停止正在运行的 Bot，并执行一次：

```bash
npm run extract-style
```

脚本只读取配置的一个频道，只保留配置用户的消息，在本地清洗联系方式、链接和提及，不把原始聊天写入磁盘。清洗后的内容会发送给 `.env` 中配置的 LLM 服务进行语言风格分析，因此该 LLM 供应商仍会接收到匿名化后的文本。

完成后会生成：

- `data/style-profile.json`：Bot 实际加载的风格档案；
- `data/style-examples.json`：模型新写的虚构风格例句，不是聊天原文；
- `data/style-report.md`：方便本人检查和修改的报告。

重新运行 `npm run dev` 后，Bot 会自动采用生成的风格档案。如果档案不存在，则继续使用 `STYLE_DESCRIPTION`。

## 按提问者添加称谓

称谓保存在被 Git 忽略的 `config/user-titles.json`。先从 `config/user-titles.example.json` 复制，格式是 Discord 用户 ID 到称谓的映射：

```json
{
  "123456789012345678": "自定义称谓"
}
```

配置过的用户提问时，称谓会作为当前语境交给模型。模型可以在句中、反问或结尾自然使用，也可以在不合适时省略，不会再机械地让每条回复都以“老张，”开头。没有配置的用户不会被模型擅自起称谓。修改配置后需要重启 Bot。

如果问题在探测 system prompt、内部规则、密钥，或要求删除和破坏系统，Bot 会拒绝相关要求，并强制在回复里使用该提问者已经配置的称谓。程序会在发送前再次检查；模型漏掉称谓时会自动补上。未配置称谓的用户不会被临时起名。

## System prompt

机器人的完整身份与行为规则位于 `config/system-prompt.md`。其中的 `{{STYLE_PROFILE}}` 会在启动时替换为风格提取结果。修改该文件后需要重启 Bot。

## Token 用量统计

每次成功调用后，Bot 会读取 LLM 服务返回的真实 Token 用量，并累计保存到 `data/token-usage.json`。该文件只包含数字和更新时间，不保存问题或回答内容。

拥有“管理服务器”权限的成员可以发送：

```text
@你好小曹 用量
```

Bot 会返回累计请求数、输入 Token、输出 Token、总 Token和预估消费金额。对于 `qwen3.8-flash`，按输入 ¥1/百万 Token、输出 ¥3/百万 Token 估算。部分 OpenAI 兼容服务可能不返回 `usage`；这类调用会计入“未返回 Token 数据的请求”，不会使用字符数冒充精确 Token。

## 长期记忆

记忆按 Discord 用户 ID 隔离，并在整个服务器通用，默认保存到 `data/memories.json`。Bot 不保存完整聊天记录；用户说“记住……”时明确写入，普通聊天只在检测到稳定偏好、身份或长期计划时进行提取。每人最多保存 30 条，重复内容会更新。

```text
@你好小曹 记住我喜欢咖啡
@你好小曹 你记得我什么
@你好小曹 忘记咖啡
@你好小曹 忘记我
```

密码、密钥、验证码和联系方式不会写入记忆。回答时只会读取当前提问者的记忆，并在相关或自然时偶尔提到。可通过 `MEMORY_PATH` 修改保存位置。

## Monid 网页搜索与进度显示

在 `.env` 中配置：

```dotenv
MONID_API_KEY=你的Monid密钥
MONID_BASE_URL=https://api.monid.ai
```

用户明确说“搜索、搜一下、查一下”，或问题涉及最新、今天、新闻、价格、天气、比分等实时信息时，Bot 会通过 Monid 的 Exa `/search` 获取最多 5 个网页来源。网页内容按不可信资料处理，不能覆盖 system prompt；回答会使用 `[1]`、`[2]` 标注来源。

处理期间，Bot 只发送一条临时回复，并依次编辑为“正在判断”“正在搜索”“正在整理”，最后将同一条消息替换成正式答案。普通闲聊不会调用 Monid。
