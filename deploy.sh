#!/bin/bash

# ==========================================
# 文件管理器一键部署脚本
# ==========================================

# 默认配置
DEFAULT_PORT=80
DEFAULT_DOMAIN="localhost"
DEFAULT_SUBPATH="/"

# 自动检测 Nginx 用户 (尝试检测常见位置，支持宝塔环境)
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

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== 文件管理器一键部署工具 (支持宝塔/标准环境) ===${NC}"

# 获取参数
read -p "请输入服务端口 (默认 $DEFAULT_PORT): " PORT
PORT=${PORT:-$DEFAULT_PORT}

read -p "请输入域名/IP (默认 $DEFAULT_DOMAIN): " DOMAIN
DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}

read -p "是否开启 HTTPS? (y/n, 默认 n): " ENABLE_SSL
ENABLE_SSL=${ENABLE_SSL:-n}

SSL_CERT_PATH=""
SSL_KEY_PATH=""
if [[ "$ENABLE_SSL" == "y" ]]; then
    read -p "请输入 SSL 证书路径 (CRT/PEM): " SSL_CERT_PATH
    read -p "请输入 SSL 私钥路径 (KEY): " SSL_KEY_PATH
    if [[ ! -f "$SSL_CERT_PATH" ]] || [[ ! -f "$SSL_KEY_PATH" ]]; then
        echo -e "${RED}警告: 证书或私钥文件路径无效，将转为仅 HTTP 部署。${NC}"
        ENABLE_SSL="n"
    fi
fi

read -p "请输入访问子路径 (如 / 或 /files, 默认 $DEFAULT_SUBPATH): " SUBPATH
SUBPATH=${SUBPATH:-$DEFAULT_SUBPATH}
[[ $SUBPATH != /* ]] && SUBPATH="/$SUBPATH"
# 取消强制添加末尾斜杠，让 Nginx 能够匹配不带斜杠的请求并处理重定向
[[ $SUBPATH == */ ]] && [[ $SUBPATH != / ]] && SUBPATH="${SUBPATH%/}"

read -p "请输入部署目标目录 (默认 $DEFAULT_WEB_ROOT): " WEB_ROOT
WEB_ROOT=${WEB_ROOT:-$DEFAULT_WEB_ROOT}

read -p "请输入 Nginx 运行用户 (默认 $DEFAULT_NGINX_USER): " NGINX_USER
NGINX_USER=${NGINX_USER:-$DEFAULT_NGINX_USER}

read -p "请输入 Nginx 配置存放目录 (默认 $DEFAULT_CONF_DIR): " CONF_DIR
CONF_DIR=${CONF_DIR:-$DEFAULT_CONF_DIR}

echo -e "\n${BLUE}正在执行部署...${NC}"

# 1. 检查并安装依赖 (适配针对 Debian 系统路径和宝塔路径)
NGINX_BIN_PATH=""
for path in "/usr/sbin/nginx" "/usr/local/nginx/sbin/nginx" "/www/server/nginx/sbin/nginx"; do
    if [ -x "$path" ]; then
        NGINX_BIN_PATH="$path"
        break
    fi
done

if [ -z "$NGINX_BIN_PATH" ] && ! command -v nginx >/dev/null 2>&1; then
    echo -e "未通过常规路径发现 Nginx，正在尝试安装 nginx-extras..."
    sudo apt update && sudo apt install -y nginx-extras
else
    [ -z "$NGINX_BIN_PATH" ] && NGINX_BIN_PATH=$(command -v nginx)
    echo -e "发现已存在的 Nginx (${BLUE}$NGINX_BIN_PATH${NC})，请确保其已编译 WebDAV 支持模块 (如 dav_ext)。"
fi

# 2. 准备 Web 目录
echo -e "准备目标目录: $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
if [ -d "dist" ]; then
    sudo cp -r dist/* "$WEB_ROOT/"
else
    echo -e "${RED}错误: 未找到 dist 目录。请在本地运行 npm run build 后再将项目整体同步到服务器。${NC}"
    exit 1
fi
sudo chown -R "$NGINX_USER:$NGINX_USER" "$WEB_ROOT"

# 3. 生成 Nginx 配置
# 智能处理端口逻辑
SSL_PORT=443
HTTP_PORT=80
REAL_PORT=$PORT

# 清理旧的同类配置避免冲突
echo -e "清理旧的 Nginx 冲突配置..."
sudo rm -f "$CONF_DIR/file-manager-*.conf"
if [[ "$CONF_DIR" == *"/sites-available"* ]]; then
    sudo rm -f "${CONF_DIR/sites-available/sites-enabled}/file-manager-*.conf"
fi

if [[ "$ENABLE_SSL" == "y" ]]; then
    if [ "$PORT" == "80" ]; then
        REAL_PORT=443
    fi
fi

CONF_FILE_NAME="file-manager-$REAL_PORT.conf"
CONF_PATH="$CONF_DIR/$CONF_FILE_NAME"

echo -e "生成 Nginx 配置: $CONF_PATH"

LOCATION_BLOCK=""
if [ "$SUBPATH" == "/" ] || [ "$SUBPATH" == "" ]; then
    LOCATION_BLOCK="location / {
        root $WEB_ROOT;
        index index.html;
        autoindex on;
        autoindex_format html;
        dav_methods PUT DELETE MKCOL COPY MOVE;
        dav_ext_methods PROPFIND OPTIONS;
        create_full_put_path on;
        dav_access user:rw group:rw all:r;
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
        dav_access user:rw group:rw all:r;
        client_max_body_size 1024m;
    }"
fi

# 生成完整的 Server 块
NGINX_CONF_CONTENT=""
if [[ "$ENABLE_SSL" == "y" ]]; then
    NGINX_CONF_CONTENT="server {
    listen $HTTP_PORT;
    server_name $DOMAIN;
    # 强制跳转 HTTPS
    return 301 https://\$host\$request_uri;
}

server {
    listen $REAL_PORT ssl;
    server_name $DOMAIN;

    ssl_certificate $SSL_CERT_PATH;
    ssl_certificate_key $SSL_KEY_PATH;

    # SSL 优化 (增加兼容性)
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    $LOCATION_BLOCK
    access_log /var/log/nginx/file-manager-ssl-access.log;
    error_log /var/log/nginx/file-manager-ssl-error.log;
}"
else
    NGINX_CONF_CONTENT="server {
    listen $PORT;
    server_name $DOMAIN;

    $LOCATION_BLOCK
    access_log /var/log/nginx/file-manager-access.log;
    error_log /var/log/nginx/file-manager-error.log;
}"
fi

echo "$NGINX_CONF_CONTENT" | sudo tee $CONF_PATH > /dev/null

# 4. 启用配置 (如果不是宝塔的 vhost 目录，通常需要软链接)
if [[ "$CONF_DIR" == *"/sites-available"* ]]; then
    LINK_PATH="${CONF_DIR/sites-available/sites-enabled}/$CONF_FILE_NAME"
    echo -e "创建软链接至 $LINK_PATH"
    sudo ln -sf "$CONF_PATH" "$LINK_PATH"
fi

# 5. 重启 Nginx
echo -e "验证并重新加载 Nginx..."
if sudo nginx -t; then
    # 尝试多种 reload 方式
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl reload nginx || sudo service nginx reload
    else
        sudo nginx -s reload
    fi
    echo -e "${GREEN}部署成功!${NC}"
    if [[ "$ENABLE_SSL" == "y" ]]; then
        echo -e "访问地址: ${BLUE}https://$DOMAIN$SUBPATH${NC}"
    else
        echo -e "访问地址: ${BLUE}http://$DOMAIN:$PORT$SUBPATH${NC}"
    fi
else
    echo -e "${RED}Nginx 配置验证失败，可能是当前环境 Nginx 不支持 WebDAV 扩展模块（dav_ext）。${NC}"
    echo -e "${RED}如果使用宝塔面板，请通过面板安装 Nginx 时选择“编译安装”并自定义添加 dav-ext 模块，或者注掉配置文件中的 dav_ext_methods 行。${NC}"
fi


