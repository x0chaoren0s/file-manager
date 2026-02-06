export function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

export function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0; let num = Number(bytes);
    while (num >= 1024 && idx < units.length - 1) { num /= 1024; idx++; }
    return num.toFixed(num < 10 && idx > 0 ? 2 : 0) + ' ' + units[idx];
}

export function formatDate(str) {
    if (!str) return '-';
    const d = new Date(str);
    if (String(d) === 'Invalid Date') return '-';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function joinPath(basePath, name) {
    if (!basePath.endsWith('/')) basePath += '/';
    return basePath + name;
}

export function encodePath(pathname) {
    return pathname.split('/').map(seg => encodeURIComponent(seg)).join('/').replace(/%2F/gi, '/');
}

export function normalizeHrefToPathname(href, origin) {
    try { return new URL(href, origin).pathname; } catch { return href; }
}

export function isPreviewable(name) {
    const n = String(name || '').toLowerCase();
    return n.endsWith('.txt') || n.endsWith('.log') || n.endsWith('.sh') || n.endsWith('.py') || n.endsWith('.md') ||
        n.match(/\.(png|jpe?g|gif|svg|bmp|webp)$/);
}

export function isImageFile(name) {
    const n = String(name || '').toLowerCase();
    return /\.(png|jpe?g|gif|svg|bmp|webp)$/.test(n);
}

export function isSamePath(a, b) {
    const na = a.endsWith('/') ? a : a + '/';
    const nb = b.endsWith('/') ? b : b + '/';
    return na === nb;
}

export function getFileTypeName(name) {
    const n = String(name || '').toLowerCase();
    if (n.match(/\.(png|jpe?g|gif|svg|bmp|webp)$/)) return '图片';
    if (n.match(/\.(mp4|webm|ogg|mov|avi|mkv|flv)$/)) return '视频';
    if (n.match(/\.(mp3|wav|flac|aac|m4a|ogg)$/)) return '音频';
    if (n.match(/\.(html|htm|css|js|json|jsx|ts|tsx|py|sh|go|c|cpp|h|php|sql|yaml|yml|xml)$/)) return '代码';
    if (n.match(/\.(md|markdown|txt|log|pdf|doc|docx|xls|xlsx|ppt|pptx|rtf|epub)$/)) return '文档';
    if (n.match(/\.(zip|rar|7z|tar|gz|bz2|xz)$/)) return '压缩包';
    if (n.match(/\.(exe|msi|deb|rpm|dmg|apk)$/)) return '程序';
    return '文件';
}
