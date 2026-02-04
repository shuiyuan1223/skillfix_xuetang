#!/bin/bash
# PHA - Personal Health Agent 安装脚本
# 一键安装: curl -fsSL https://raw.githubusercontent.com/ibytechaos/pha/main/install.sh | bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}🏥 PHA - Personal Health Agent 安装程序${NC}"
echo ""

# 检查 Bun
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}未检测到 Bun，正在安装...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

echo -e "${GREEN}✓${NC} Bun $(bun --version)"

# 安装目录
INSTALL_DIR="$HOME/.pha-cli"

# 克隆或更新
if [ -d "$INSTALL_DIR" ]; then
    echo "更新 PHA..."
    cd "$INSTALL_DIR"
    git pull --quiet
else
    echo "安装 PHA..."
    git clone --quiet https://github.com/ibytechaos/pha.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 安装依赖和构建
echo "安装依赖..."
bun install --silent

# 创建全局命令链接
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/pha" << 'EOF'
#!/bin/bash
bun "$HOME/.pha-cli/packages/cli/dist/main.js" "$@"
EOF
chmod +x "$BIN_DIR/pha"

# 检查 PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo -e "${YELLOW}请将以下内容添加到你的 shell 配置文件 (~/.bashrc 或 ~/.zshrc):${NC}"
    echo ""
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

echo ""
echo -e "${GREEN}✓ PHA 安装完成!${NC}"
echo ""
echo "快速开始:"
echo "  1. 设置 API Key:"
echo "     export ANTHROPIC_API_KEY=sk-ant-xxx"
echo ""
echo "  2. 初始化配置:"
echo "     pha setup"
echo ""
echo "  3. 启动使用:"
echo "     pha tui --local    # 终端聊天"
echo "     pha health         # 查看健康数据"
echo "     pha gateway start  # 启动服务器"
echo ""
