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
echo -e "请选择部署模式:"
echo -e " [1] 完整配置 (生成独立的 Nginx Site 配置，含 server 块)"
echo -e " [2] 片段配置 (生成 Location Snippet，仅包含 location 块)"
read -p "选择模式 [1-2] (默认 1): " DEPLOY_MODE
DEPLOY_MODE=${DEPLOY_MODE:-1}

read -p "请输入访问域名 (如 osaka.mangaharb.fun, 默认 localhost): " DOMAIN
DOMAIN=${DOMAIN:-localhost}

ENABLE_SSL="n"
if [[ "$DEPLOY_MODE" == "1" ]]; then
    read -p "是否开启 HTTPS? (y/n, 默认 n): " ENABLE_SSL
    ENABLE_SSL=${ENABLE_SSL:-n}
fi

SSL_CERT_PATH=""
SSL_KEY_PATH=""
if [[ "$ENABLE_SSL" == "y" ]]; then
    echo -e "\n正在扫描系统中的 SSL 证书..."
    # 定义常见证书目录
    CERT_DIRS=("/etc/nginx/ssl" "/etc/letsencrypt/live" "$HOME/.acme.sh")
    index=1
    declare -A cert_map
    
    # 查找 crt, cer, pem 文件
    while IFS= read -r file; do
        if [[ -f "$file" ]]; then
            echo -e " [$index] $file"
            cert_map[$index]=$file
            ((index++))
        fi
    done < <(sudo find "${CERT_DIRS[@]}" -maxdepth 3 \( -name "*.crt" -o -name "*.cer" -o -name "fullchain.pem" \) 2>/dev/null | grep -v "acme.sh/ca")

    if [ ${#cert_map[@]} -gt 0 ]; then
        read -p "请选择证书编号 (直接输入路径请按回车): " CHOICE
        if [[ -n "$CHOICE" ]] && [[ -n "${cert_map[$CHOICE]}" ]]; then
            SSL_CERT_PATH="${cert_map[$CHOICE]}"
            echo -e "已选择证书: ${GREEN}$SSL_CERT_PATH${NC}"
        fi
    fi

    if [ -z "$SSL_CERT_PATH" ]; then
        read -p "请输入 SSL 证书路径 (.crt/.cer): " SSL_CERT_PATH
    fi

    # 扫描私钥
    echo -e "\n正在扫描系统中的 SSL 私钥..."
    index=1
    declare -A key_map
    while IFS= read -r file; do
        if [[ -f "$file" ]]; then
            echo -e " [$index] $file"
            key_map[$index]=$file
            ((index++))
        fi
    done < <(sudo find "${CERT_DIRS[@]}" -maxdepth 3 \( -name "*.key" -o -name "privkey.pem" \) 2>/dev/null | grep -v "acme.sh/ca")

    if [ ${#key_map[@]} -gt 0 ]; then
        SUGGEST_INDEX=""
        CERT_BASE=$(basename "$SSL_CERT_PATH" | sed 's/\..*$//')
        for i in "${!key_map[@]}"; do
            if [[ "${key_map[$i]}" == *"$CERT_BASE"* ]]; then
                SUGGEST_INDEX=$i
                break
            fi
        done

        PROMPT="请选择私钥编号"
        [[ -n "$SUGGEST_INDEX" ]] && PROMPT="$PROMPT (建议 $SUGGEST_INDEX)"
        read -p "$PROMPT (直接输入路径请按回车): " K_CHOICE
        K_CHOICE=${K_CHOICE:-$SUGGEST_INDEX}
        
        if [[ -n "$K_CHOICE" ]] && [[ -n "${key_map[$K_CHOICE]}" ]]; then
            SSL_KEY_PATH="${key_map[$K_CHOICE]}"
            echo -e "已选择私钥: ${GREEN}$SSL_KEY_PATH${NC}"
        fi
    fi

    if [ -z "$SSL_KEY_PATH" ]; then
        read -p "请输入 SSL 私钥路径 (.key): " SSL_KEY_PATH
    fi

    if [[ ! -f "$SSL_CERT_PATH" ]] || [[ ! -f "$SSL_KEY_PATH" ]]; then
        echo -e "${RED}错误: 证书或私钥文件路径无效。${NC}"
        exit 1
    fi
fi

read -p "请输入访问子路径 (如 / 或 /files, 默认 /): " SUBPATH
SUBPATH=${SUBPATH:-/}
[[ $SUBPATH != /* ]] && SUBPATH="/$SUBPATH"
# 仅对非根路径移除末尾斜杠
if [[ "$SUBPATH" != "/" ]]; then
    SUBPATH="${SUBPATH%/}"
fi

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

# B. 生成配置内容
# 关键：根路径使用 root，子路径使用 alias
if [[ "$SUBPATH" == "/" ]]; then
    LOCATION_BODY="        root $WEB_ROOT;
        index index.html;
        autoindex on;
        autoindex_format html;"
else
    LOCATION_BODY="        alias $WEB_ROOT/;
        index index.html;
        autoindex on;
        autoindex_format html;"
fi

LOCATION_CONTENT="    location $SUBPATH {
$LOCATION_BODY

        dav_methods PUT DELETE MKCOL COPY MOVE;
        dav_ext_methods PROPFIND OPTIONS;
        create_full_put_path on;
        dav_access user:rw group:rw all:r;
        client_max_body_size 1024m;
    }"

if [[ "$DEPLOY_MODE" == "1" ]]; then
    # 模式 1: 完整 Site 配置
    CONF_PATH="$DEFAULT_CONF_DIR/file-manager.conf"
    echo -e "模式: 完整 Site 配置 -> $CONF_PATH"
    
    # 清理旧配置
    sudo rm -f "$DEFAULT_CONF_DIR/file-manager*.conf"
    if [[ "$DEFAULT_CONF_DIR" == *"/sites-available"* ]]; then
        sudo rm -f "${DEFAULT_CONF_DIR/sites-available/sites-enabled}/file-manager*.conf"
    fi

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

    echo "$NGINX_CONF" | sudo tee "$CONF_PATH" > /dev/null
    
    # 启用配置 (软链)
    if [[ "$DEFAULT_CONF_DIR" == *"/sites-available"* ]]; then
        LINK_PATH="${DEFAULT_CONF_DIR/sites-available/sites-enabled}/file-manager.conf"
        sudo ln -sf "$CONF_PATH" "$LINK_PATH"
    fi

else
    # 模式 2: Snippet 配置
    SNIPPET_DIR="/etc/nginx/snippets/${DOMAIN}.locations.d"
    CONF_PATH="$SNIPPET_DIR/proxy_files.conf"
    echo -e "模式: Snippet 片段配置 -> $CONF_PATH"
    
    sudo mkdir -p "$SNIPPET_DIR"
    echo "$LOCATION_CONTENT" | sudo tee "$CONF_PATH" > /dev/null
    echo -e "${BLUE}提示: 请在您的主 Nginx 配置中添加: include $CONF_PATH;${NC}"
fi

# C. 重启验证
echo -e "验证 Nginx 状态并重启..."
if sudo nginx -t; then
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl reload nginx
    else
        sudo nginx -s reload
    fi
    echo -e "${GREEN}部署成功!${NC}"
    if [[ "$DEPLOY_MODE" == "1" ]]; then
        PROT="http"; [[ "$ENABLE_SSL" == "y" ]] && PROT="https"
        echo -e "访问地址: ${BLUE}$PROT://$DOMAIN$SUBPATH${NC}"
    fi
else
    echo -e "${RED}Nginx 配置错误，请检查。${NC}"
fi
