#!/bin/bash

# ==========================================
# 文件管理器极简部署脚本 (基于成功样板)
# ==========================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. 自动环境检测
if [ -d "/www/server/panel/vhost/nginx" ] || sudo [ -d "/www/server/panel/vhost/nginx" ] 2>/dev/null; then
    # 宝塔环境
    DEFAULT_WEB_ROOT="/www/wwwroot/file-manager"
    DEFAULT_NGINX_USER="www"
    DEFAULT_CONF_DIR="/www/server/panel/vhost/nginx"
else
    # 标准环境
    DEFAULT_WEB_ROOT="/var/www/html/file-manager"
    DEFAULT_NGINX_USER="www-data"
    DEFAULT_CONF_DIR="/etc/nginx/sites-available"
fi

echo -e "${BLUE}=== 文件管理器极简部署工具 ===${NC}"

# 2. 交互获取核心参数
read -p "请输入访问域名 (如 files.osaka.mangaharb.fun): " DOMAIN
if [ -z "$DOMAIN" ]; then echo -e "${RED}错误: 必须输入域名${NC}"; exit 1; fi

read -p "是否开启 HTTPS? (y/n, 默认 n): " ENABLE_SSL
ENABLE_SSL=${ENABLE_SSL:-n}

SSL_CERT_PATH=""
SSL_KEY_PATH=""
if [[ "$ENABLE_SSL" == "y" ]]; then
    read -p "请输入 SSL 证书路径 (.crt/.cer): " SSL_CERT_PATH
    read -p "请输入 SSL 私钥路径 (.key): " SSL_KEY_PATH
    if [[ ! -f "$SSL_CERT_PATH" ]] || [[ ! -f "$SSL_KEY_PATH" ]]; then
        echo -e "${RED}错误: 证书或私钥文件路径无效。${NC}"
        exit 1
    fi
fi

read -p "请输入访问子路径 (如 / 或 /files, 默认 /): " SUBPATH
SUBPATH=${SUBPATH:-/}
[[ $SUBPATH != /* ]] && SUBPATH="/$SUBPATH"
# 确保以 / 结尾以便配置 alias
[[ $SUBPATH != */ ]] && SUBPATH="$SUBPATH/"

read -p "请输入部署目标目录 (默认 $DEFAULT_WEB_ROOT): " WEB_ROOT
WEB_ROOT=${WEB_ROOT:-$DEFAULT_WEB_ROOT}

# 3. 执行部署
echo -e "\n${BLUE}正在开始部署行程...${NC}"

# A. 准备目录
echo -e "准备目标目录: $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
if [ -d "dist" ]; then
    sudo cp -r dist/* "$WEB_ROOT/"
else
    echo -e "${RED}错误: 未找到 dist 目录。请在本地运行 npm run build。${NC}"
    exit 1
fi
sudo chown -R "$DEFAULT_NGINX_USER:$DEFAULT_NGINX_USER" "$WEB_ROOT"

# B. 清理旧配置 (预防冲突)
echo -e "自动清理旧的 file-manager.conf 配置..."
sudo rm -f "$DEFAULT_CONF_DIR/file-manager*.conf"
if [[ "$DEFAULT_CONF_DIR" == *"/sites-available"* ]]; then
    sudo rm -f "${DEFAULT_CONF_DIR/sites-available/sites-enabled}/file-manager*.conf"
fi

# C. 生成 Nginx 配置 (严格对齐成功样板)
CONF_PATH="$DEFAULT_CONF_DIR/file-manager.conf"
echo -e "生成 Nginx 样板配置: $CONF_PATH"

# 准备 location 块内容
# 注意：alias 必须以 / 结尾，样板已由 SUBPATH 保证
LOCATION_CONTENT="location $SUBPATH {
        # 注意：这里必须用 alias，且末尾要有斜杠
        alias $WEB_ROOT/;
        index index.html;
        autoindex on;
        autoindex_format html;

        # WebDAV 配置
        dav_methods PUT DELETE MKCOL COPY MOVE;
        dav_ext_methods PROPFIND OPTIONS;
        create_full_put_path on;
        dav_access user:rw group:rw all:r;
        client_max_body_size 1024m;
    }"

NGINX_CONF=""
if [[ "$ENABLE_SSL" == "y" ]]; then
    NGINX_CONF="server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate $SSL_CERT_PATH;
    ssl_certificate_key $SSL_KEY_PATH;

    # SSL 安全设置对齐样板
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    $LOCATION_CONTENT
}"
else
    NGINX_CONF="server {
    listen 80;
    server_name $DOMAIN;

    $LOCATION_CONTENT
}"
fi

echo "$NGINX_CONF" | sudo tee $CONF_PATH > /dev/null

# D. 启用配置
if [[ "$DEFAULT_CONF_DIR" == *"/sites-available"* ]]; then
    LINK_PATH="${DEFAULT_CONF_DIR/sites-available/sites-enabled}/file-manager.conf"
    sudo ln -sf "$CONF_PATH" "$LINK_PATH"
fi

# E. 重启验证
echo -e "验证 Nginx 状态并重启..."
if sudo nginx -t; then
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl reload nginx
    else
        sudo nginx -s reload
    fi
    echo -e "${GREEN}部署成功!${NC}"
    PROT="http"
    [[ "$ENABLE_SSL" == "y" ]] && PROT="https"
    echo -e "访问地址: ${BLUE}$PROT://$DOMAIN$SUBPATH${NC}"
else
    echo -e "${RED}Nginx 配置错误，请检查。${NC}"
fi
