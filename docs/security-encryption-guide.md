# PHA 密钥加密存储 — 安全算法与生产部署指南

## 1. 安全算法

### 1.1 整体架构

PHA 采用 **多因子 PBKDF2 工作密钥派生 + AES-256-GCM 对称加密** 方案，确保敏感数据（API Key、OAuth Token、ClientSecret）在磁盘上始终以密文形式存储，运行时透明解密。

```
┌──────────────────────────────────────────────────────────────┐
│                     密钥派生层 (Key Derivation)                │
│                                                              │
│  Factor 1: PHA_THIRD_KEY (环境变量，不落盘)                    │
│  Factor 2: .pha/keys/key-a.bin (32B 随机文件，权限 0600)       │
│  Factor 3: .pha/keys/key-b.bin (32B 随机文件，权限 0600)       │
│           │                                                  │
│           ▼                                                  │
│  keyMaterial = concat(Factor1, Factor2, Factor3)             │
│           │                                                  │
│           ▼                                                  │
│  PBKDF2-HMAC-SHA256(keyMaterial, salt, 600000, 256bit)       │
│           │                                                  │
│           ▼                                                  │
│  workKey (32 bytes) ── 仅存于内存，用后清零                     │
│           │             keyMaterial.fill(0)                   │
│           │             workKey.fill(0) after use             │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                     加密层 (Encryption)                        │
│                                                              │
│  AES-256-GCM(workKey, iv=12B随机, plaintext)                  │
│           │                                                  │
│           ▼                                                  │
│  密文格式: enc:v1:<base64(salt ‖ iv ‖ ciphertext ‖ authTag)>  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 算法参数

| 参数 | 值 | 标准依据 |
|------|-----|---------|
| 对称加密算法 | **AES-256-GCM** | NIST SP 800-38D，AEAD（加密+完整性一体化） |
| 密钥派生函数 | **PBKDF2-HMAC-SHA256** | NIST SP 800-132，RFC 8018 |
| PBKDF2 迭代次数 | **600,000** | OWASP 2025 推荐最低值 |
| 派生密钥长度 | **32 bytes (256-bit)** | 匹配 AES-256 |
| Salt 长度 | **16 bytes (128-bit)** | CSPRNG 生成，每次加密独立 |
| IV/Nonce 长度 | **12 bytes (96-bit)** | AES-GCM 标准 nonce 长度 |
| Auth Tag 长度 | **16 bytes (128-bit)** | NIST SP 800-38D 推荐值 |
| 密钥文件大小 | **32 bytes (256-bit)** | CSPRNG (`crypto.randomBytes`) 生成 |

### 1.3 三因子密钥源

三个密钥因子相互独立，任一缺失均无法还原工作密钥：

| 因子 | 来源 | 存储方式 | 泄露影响 |
|------|------|---------|---------|
| **thirdKey** | 环境变量 `PHA_THIRD_KEY` | 不落盘（进程环境注入） | 单独泄露无法解密（缺少 key-a/b） |
| **keyFileA** | `.pha/keys/key-a.bin` | 磁盘文件，权限 `0o600` | 单独泄露无法解密（缺少 thirdKey + keyFileB） |
| **keyFileB** | `.pha/keys/key-b.bin` | 磁盘文件，权限 `0o600` | 单独泄露无法解密（缺少 thirdKey + keyFileA） |

### 1.4 密文格式

```
enc:v1:<base64(salt ‖ iv ‖ ciphertext ‖ authTag)>
```

| 段 | 偏移 | 长度 | 说明 |
|----|------|------|------|
| 前缀 `enc:v1:` | — | 7 chars | 版本标识，用于识别密文与明文 |
| salt | 0 | 16 bytes | PBKDF2 盐值 |
| iv | 16 | 12 bytes | AES-GCM 随机 nonce |
| ciphertext | 28 | 变长 | AES-256-GCM 密文 |
| authTag | 末尾 | 16 bytes | GCM 认证标签（完整性校验） |

判定规则：以 `enc:v1:` 开头 → 密文；否则 → 明文（向后兼容存量配置）。

### 1.5 内存安全措施

| 措施 | 实现方式 |
|------|---------|
| keyMaterial 用后清零 | `keyMaterial.fill(0)` — `deriveWorkKey()` 的 `finally` 块 |
| workKey 用后清零 | `workKey.fill(0)` — `encrypt()` / `decrypt()` 的 `finally` 块 |
| workKey 不缓存 | 每次加/解密独立派生（salt 不同），函数返回后即释放 |
| 作用域最小化 | workKey 仅存在于 `encrypt` / `decrypt` 函数栈帧内 |

> **注意**: JavaScript 运行时无法保证 GC 后物理内存清零。如需更高等级保护，可通过 Bun FFI 调用 `sodium_memzero()` 或 `mlock()` 增强。

### 1.6 受保护字段清单

| 存储位置 | 字段路径 | 说明 |
|---------|---------|------|
| `.pha/config.json` | `llm.apiKey` | LLM 提供商 API 密钥 |
| `.pha/config.json` | `models.providers.*.apiKey` | 所有模型提供商 API 密钥 |
| `.pha/config.json` | `dataSources.huawei.clientSecret` | 华为健康 OAuth 客户端密钥 |
| `.pha/config.json` | `mcp.remoteServers.*.apiKey` | 远程 MCP 服务器 API 密钥 |
| `.pha/huawei-tokens.json` | `accessToken`, `refreshToken` | 华为 OAuth Token |
| `.pha/db/oauth.db` | `access_token`, `refresh_token` | 多用户 OAuth Token |

### 1.7 安全属性分析

| 威胁场景 | 防护结果 | 原理 |
|----------|---------|------|
| config.json 文件泄露（备份/误传/日志） | **已防护** | 磁盘上为密文，无密钥材料无法解密 |
| 磁盘整体拷贝到另一台机器 | **已防护** | 缺少 thirdKey（环境变量）；即使开发模式，machine-id 不同 |
| 仅密钥文件泄露（key-a + key-b） | **已防护** | 缺少 thirdKey 无法派生 workKey |
| 仅 thirdKey 泄露 | **已防护** | 缺少密钥文件无法派生 workKey |
| 同机器其他用户读取 | **已防护** | 文件权限 0o600 + 不同 username 导致指纹不同 |
| 彩虹表 / 预计算攻击 | **已防护** | 每次加密独立 salt，PBKDF2 60 万次迭代 |
| 密文篡改 | **已防护** | GCM authTag 完整性校验失败 → 抛出 ConfigDecryptionError |
| 内存 dump / core dump | **部分防护** | workKey 用后清零，但 GC 不保证物理清零 |

---

## 2. 生产环境配置

### 2.1 必要步骤

#### 步骤一：设置 PHA_THIRD_KEY

`PHA_THIRD_KEY` 是生产环境中唯一需要手动配置的密钥因子。**必须通过安全通道注入，禁止写入代码或配置文件。**

```bash
# 生成一个高熵密钥（推荐 >= 32 字符）
openssl rand -base64 32
# 将输出结果作为 PHA_THIRD_KEY 的值
```

注入方式（按推荐度排序）：

| 方式 | 命令/配置 | 适用场景 |
|------|----------|---------|
| **Kubernetes Secret** | `kubectl create secret generic pha-keys --from-literal=PHA_THIRD_KEY=<value>` | K8s 部署 |
| **HashiCorp Vault** | Vault Agent Inject / CSI Provider | 企业级密钥管理 |
| **Docker Secret** | `docker secret create pha_third_key <file>` | Docker Swarm |
| **Systemd 环境文件** | `EnvironmentFile=/etc/pha/env` (权限 0600) | 裸机 / VM |
| **CI/CD 变量** | GitHub Actions Secret / GitLab CI Variable | 自动化部署 |

#### Kubernetes 示例

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: pha-keys
type: Opaque
stringData:
  PHA_THIRD_KEY: "<YOUR-THIRD-KEY>"  # 替换为 openssl rand -base64 32 生成的值

---
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pha
spec:
  template:
    spec:
      containers:
        - name: pha
          envFrom:
            - secretRef:
                name: pha-keys
          volumeMounts:
            - name: pha-state
              mountPath: /app/.pha
      volumes:
        - name: pha-state
          persistentVolumeClaim:
            claimName: pha-state-pvc
```

#### Systemd 示例

```ini
# /etc/systemd/system/pha.service
[Service]
EnvironmentFile=/etc/pha/env
ExecStart=/usr/local/bin/pha start -f
WorkingDirectory=/opt/pha

# /etc/pha/env (权限 0600, 属主 pha)
PHA_THIRD_KEY=<YOUR-THIRD-KEY>  # 替换为 openssl rand -base64 32 生成的值
```

```bash
chmod 600 /etc/pha/env
chown pha:pha /etc/pha/env
```

#### 步骤二：初始化并加密

```bash
# 首次部署：引导配置
pha onboard

# 手动触发全量加密（onboard 会自动加密，此步为确认）
pha encrypt-config

# 验证加密状态
pha doctor
```

`pha doctor` 输出示例（生产环境正常状态）：

```
✓ Encryption Key Files    .pha/keys/ (key-a.bin, key-b.bin present)
✓ Third-Party Key         PHA_THIRD_KEY (from environment)
✓ Sensitive Field Encryption  All sensitive fields encrypted
```

#### 步骤三：验证磁盘密文

```bash
# 直接查看 config.json，确认敏感字段为密文
cat .pha/config.json | jq '.models.providers[].apiKey'
# 预期输出: "enc:v1:XXXXXXXX..."（非明文）
```

### 2.2 文件权限要求

部署后验证文件权限：

```bash
# 检查权限
ls -la .pha/
ls -la .pha/keys/

# 预期结果
drwxr-x---  .pha/              # 0750
-rw-r-----  .pha/config.json   # 0640
drwx------  .pha/keys/         # 0700
-rw-------  .pha/keys/key-a.bin # 0600
-rw-------  .pha/keys/key-b.bin # 0600
```

如果权限不正确，手动修复：

```bash
chmod 750 .pha/
chmod 640 .pha/config.json
chmod 700 .pha/keys/
chmod 600 .pha/keys/key-a.bin .pha/keys/key-b.bin
```

### 2.3 密钥文件持久化

`.pha/keys/key-a.bin` 和 `key-b.bin` **必须持久化存储**。容器重启后如果密钥文件丢失，已加密的数据将无法解密。

| 部署方式 | 持久化方案 |
|---------|-----------|
| Kubernetes | PersistentVolumeClaim 挂载 `.pha/` 目录 |
| Docker | Named Volume (`docker volume create pha-state`) |
| 裸机 / VM | 本地磁盘（确保备份策略覆盖） |

### 2.4 密钥轮换流程

定期轮换密钥文件（建议周期：每季度或按安全策略）：

```bash
# 1. 用当前密钥导出明文配置
pha decrypt-config --yes > /tmp/pha-config-plain.json

# 2. 备份旧密钥文件
cp .pha/keys/key-a.bin /tmp/key-a.bin.bak
cp .pha/keys/key-b.bin /tmp/key-b.bin.bak

# 3. 删除旧密钥（下次操作会自动生成新密钥）
rm .pha/keys/key-a.bin .pha/keys/key-b.bin

# 4. 用新密钥重新加密
pha encrypt-config

# 5. 验证
pha doctor

# 6. 安全删除临时文件和旧密钥
shred -u /tmp/pha-config-plain.json /tmp/key-a.bin.bak /tmp/key-b.bin.bak
```

轮换 `PHA_THIRD_KEY` 时：

```bash
# 1. 用旧 key 导出明文
PHA_THIRD_KEY=old-key pha decrypt-config --yes > /tmp/pha-config-plain.json

# 2. 更新环境变量为新 key
export PHA_THIRD_KEY=new-key

# 3. 重新加密
pha encrypt-config

# 4. 更新 K8s Secret / Vault / Systemd env 中的值

# 5. 安全删除临时文件
shred -u /tmp/pha-config-plain.json
```

### 2.5 灾难恢复

| 场景 | 恢复方式 |
|------|---------|
| 密钥文件丢失 + 有备份 | 恢复 `key-a.bin`, `key-b.bin` → `pha doctor` 验证 |
| 密钥文件丢失 + 无备份 | **数据不可恢复**，需重新配置所有 API Key 和 Token |
| PHA_THIRD_KEY 遗忘 | **数据不可恢复**，需重新配置 |
| config.json 损坏 | 从备份恢复，或删除后重新 `pha onboard` |

**备份建议**：将 `.pha/keys/` 目录纳入加密备份方案（如 LUKS 加密分区、加密 S3 Bucket）。

### 2.6 CI/CD 集成示例

#### GitHub Actions

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install & Build
        run: bun install && bun run build
      - name: Encrypt Config
        env:
          PHA_THIRD_KEY: ${{ secrets.PHA_THIRD_KEY }}
        run: pha encrypt-config
      - name: Verify
        env:
          PHA_THIRD_KEY: ${{ secrets.PHA_THIRD_KEY }}
        run: pha doctor --json | jq '.[] | select(.name == "Sensitive Field Encryption")'
```

### 2.7 安全检查清单

部署上线前逐项确认：

- [ ] `PHA_THIRD_KEY` 已通过安全通道注入（非代码/配置文件）
- [ ] `PHA_THIRD_KEY` 长度 >= 32 字符，由 CSPRNG 生成
- [ ] `.pha/keys/` 目录权限为 `0700`
- [ ] `key-a.bin`, `key-b.bin` 权限为 `0600`
- [ ] `.pha/` 已在 `.gitignore` 中排除
- [ ] `pha doctor` 显示 "Third-Party Key: PHA_THIRD_KEY (from environment)"
- [ ] `pha doctor` 显示 "All sensitive fields encrypted"
- [ ] `cat .pha/config.json` 中敏感字段均以 `enc:v1:` 开头
- [ ] 密钥文件已纳入加密备份方案
- [ ] 密钥轮换流程已记录并测试
