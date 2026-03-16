# DEBUG 进度记录

## 已排查 / 已确认正常

### 1. Backend 响应正常
- 带 `Authorization: Bearer placeholder` + HMAC 头，streaming 返回正常
- `model: glm-5`，标准 OpenAI SSE 格式，`finish_reason: stop`，内容完整

### 2. Config 不再被自动改写
- 根因：旧 config 同时有 `llm` 字段和 `models.providers`，触发迁移逻辑 → 重写文件
- 修复：删掉 `llm` 块，只保留 `models.providers.openai`（含 accessKey/secretKey）
- 验证：restart 前后 config 完全一致 ✓

### 3. 代码改动已构建到 dist
```
137: function createCustomModel(provider, modelId, baseUrl, accessKey, secretKey)
151:   supportsUsageInStreaming: false
156:   if (accessKey && secretKey)
293:   const model = resolveModelInstance(provider, modelId, config.baseUrl, providerCfg?.accessKey, providerCfg?.secretKey)
```

### 4. HMAC 鉴权生效
- 服务路径：`models.providers.openai.accessKey/secretKey` → PHAAgent 构造函数读取 → `Object.defineProperty` getter → 每次请求动态生成 ts+sign
- pi-ai `createClient` 调用 `{ ...model.headers }` 时触发 getter ✓

### 5. LLM 请求命中正确 URL
```
url: http://10.32.214.120:8080/service/ds_diversion/llm/v1/chat/completions
provider: openai
status: 200
stream: true
```

### 6. Workbench 空输出 — 已解决
- **根因**：`src/gateway/workbench-init.ts` 的 `WORKBENCH_MODELS` 使用了 openrouter 风格的 ID（`z-ai/glm-5`、`moonshotai/kimi-k2.5`、`deepseek/deepseek-v3.2`）
- 这导致 `state.selectedModelId = 'z-ai/glm-5'` 传给 `createPHAAgent` → `resolveModelInstance`，创建的 `model.id = 'z-ai/glm-5'`，绕过了 `createCustomModel` 的 HMAC 逻辑
- **修复**：将 `WORKBENCH_MODELS` 改为 `[{ id: 'glm-5' }, { id: 'kimik25' }]`，默认选中从 `[2]` 改为 `[0]`
- 验证：LLM log 中 model 字段从 `z-ai/glm-5` 变为 `glm-5`，UI 正确显示输出 ✓

### 7. Workbench skill 列表只保留血糖
- **根因**：`SEED_SKILL_NAMES` 原本包含 12 个 skill，seed 逻辑仅在目录为空时执行，已有 skill 不会被清理
- **修复**：
  1. `SEED_SKILL_NAMES` 改为 `['blood-sugar']`
  2. seed 逻辑改为"同步"模式：每次启动删除不在列表里的 skill 目录，补充缺失的
- 重启后 `.pha/workbench/skills/` 自动只剩 `blood-sugar` ✓

---

## 关键文件对照

| 文件 | 关键改动 |
|------|---------|
| `src/agent/pha-agent.ts` | `createCustomModel` + HMAC getter + `compat` 字段 |
| `src/utils/config.ts` | `ModelProviderConfig` 增加 `accessKey`/`secretKey` 字段 |
| `src/gateway/workbench-init.ts` | `WORKBENCH_MODELS` 改为 glm-5/kimik25；`SEED_SKILL_NAMES` 改为 blood-sugar；seed 改为同步逻辑 |
| `.pha/config.json` | 去掉 `llm` 块，只保留 `models.providers.openai`（含 accessKey/secretKey）|
| `config.template.json` | 同上，作为新部署参考 |
