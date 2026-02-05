#!/bin/bash

# ==========================================
# 文件管理器一键部署脚本
# ==========================================

# 默认配置
DEFAULT_PORT=80
DEFAULT_DOMAIN="localhost"
DEFAULT_SUBPATH="/"
DEFAULT_WEB_ROOT="/var/www/html/file-manager"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== 文件管理器一键部署工具 ===${NC}"

# 获取参数
read -p "请输入服务端口 (默认 $DEFAULT_PORT): " PORT
PORT=${PORT:-$DEFAULT_PORT}

read -p "请输入域名/IP (默认 $DEFAULT_DOMAIN): " DOMAIN
DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}

read -p "请输入访问子路径 (如 / 或 /files, 默认 $DEFAULT_SUBPATH): " SUBPATH
SUBPATH=${SUBPATH:-$DEFAULT_SUBPATH}
# 确保以 / 开头和结尾
[[ $SUBPATH != /* ]] && SUBPATH="/$SUBPATH"
# 取消强制添加末尾斜杠，让 Nginx 能够匹配不带斜杠的请求并处理重定向
[[ $SUBPATH == */ ]] && [[ $SUBPATH != / ]] && SUBPATH="${SUBPATH%/}"

read -p "请输入部署目标目录 (默认 $DEFAULT_WEB_ROOT): " WEB_ROOT
WEB_ROOT=${WEB_ROOT:-$DEFAULT_WEB_ROOT}

echo -e "\n${BLUE}正在执行部署...${NC}"

# 1. 检查并安装依赖
if ! dpkg -s nginx-extras >/dev/null 2>&1; then
    echo -e "正在安装 nginx-extras..."
    sudo apt update && sudo apt install -y nginx-extras
fi

# 2. 准备 Web 目录
echo -e "准备目标目录: $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
if [ -d "dist" ]; then
    sudo cp -r dist/* "$WEB_ROOT/"
else
    echo -e "${RED}错误: 未找到 dist 目录。请先运行 npm run build${NC}"
    exit 1
fi
sudo chown -R www-data:www-data "$WEB_ROOT"

# 3. 生成 Nginx 配置
CONF_PATH="/etc/nginx/sites-available/file-manager-auto.conf"
LINK_PATH="/etc/nginx/sites-enabled/file-manager-auto.conf"

echo -e "生成 Nginx 配置: $CONF_PATH"

# 确定 location 逻辑
# 如果是根路径使用 root，如果是子路径建议使用 alias
LOCATION_BLOCK=""
if [ "$SUBPATH" == "/" ]; then
    LOCATION_BLOCK="location / {
        root $WEB_ROOT;
        index index.html;
        autoindex on;
        autoindex_format html;
        dav_methods PUT DELETE MKCOL COPY MOVE;
        dav_ext_methods PROPFIND OPTIONS;
        create_full_put_path on;
        dav_access group:rw all:r;
        client_max_body_size 1024m;
    }"
else
    LOCATION_BLOCK="location $SUBPATH {
        alias $WEB_ROOT/;
        index index.html;
        autoindex on;
        autoindex_format html;
        dav_methods PUT DELETE MKCOL COPY MOVE;
        dav_ext_methods PROPFIND OPTIONS;
        create_full_put_path on;
        dav_access group:rw all:r;
        client_max_body_size 1024m;
    }"
fi

cat <<EOF | sudo tee $CONF_PATH > /dev/null
server {
    listen $PORT;
    server_name $DOMAIN;

    $LOCATION_BLOCK
}
EOF

# 4. 启用配置
sudo ln -sf "$CONF_PATH" "$LINK_PATH"

# 5. 重启 Nginx
echo -e "验证并重启 Nginx..."
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo -e "${GREEN}部署成功!${NC}"
    echo -e "访问地址: ${BLUE}http://$DOMAIN:$PORT$SUBPATH${NC}"
else
    echo -e "${RED}Nginx 配置验证失败，请检查配置。${NC}"
fi
