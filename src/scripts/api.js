import { joinPath, normalizeHrefToPathname, isSamePath } from './utils.js';

export async function listByJson(dirPath) {
    const url = dirPath + (dirPath.includes('?') ? '&' : '?') + '__list=1';
    const res = await fetch(url, { method: 'GET', credentials: 'include' });
    if (!res.ok) throw new Error('JSON 列表失败，HTTP ' + res.status);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(it => ({
        name: String(it.name || '').replace(/\/$/, ''),
        isDir: !!it.isDir,
        size: it.size == null ? null : Number(it.size),
        mtime: it.mtime ? new Date(it.mtime * 1000).toUTCString() : null,
        href: joinPath(dirPath, String(it.name || '')),
    }));
}

export async function listByWebDAV(basePath, origin) {
    const body = `<?xml version="1.0" encoding="utf-8"?>\n<d:propfind xmlns:d="DAV:">\n  <d:prop>\n    <d:displayname/>\n    <d:getcontentlength/>\n    <d:getlastmodified/>\n    <d:resourcetype/>\n  </d:prop>\n</d:propfind>`;
    const res = await fetch(basePath, {
        method: 'PROPFIND',
        headers: { 'Depth': '1', 'Content-Type': 'text/xml; charset=utf-8' },
        body,
        credentials: 'include',
    });
    if (!res.ok) throw new Error('PROPFIND 失败，HTTP ' + res.status);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    const responses = Array.from(xml.getElementsByTagNameNS('*', 'response'));
    const items = [];
    for (const r of responses) {
        const hrefNode = r.getElementsByTagNameNS('*', 'href')[0];
        if (!hrefNode) continue;
        const href = normalizeHrefToPathname(hrefNode.textContent || '', origin);
        if (!href) continue;
        if (isSamePath(href, basePath)) continue; // skip self

        const propstat = r.getElementsByTagNameNS('*', 'propstat')[0];
        const prop = propstat ? propstat.getElementsByTagNameNS('*', 'prop')[0] : null;
        const displayName = prop ? (prop.getElementsByTagNameNS('*', 'displayname')[0]?.textContent || '') : '';
        const lengthStr = prop ? (prop.getElementsByTagNameNS('*', 'getcontentlength')[0]?.textContent || '') : '';
        const lastMod = prop ? (prop.getElementsByTagNameNS('*', 'getlastmodified')[0]?.textContent || '') : '';
        const resType = prop ? prop.getElementsByTagNameNS('*', 'resourcetype')[0] : null;
        const isCollection = !!(resType && resType.getElementsByTagNameNS('*', 'collection')[0]);

        const name = decodeURIComponent(displayName || href.split('/').filter(Boolean).pop() || '');
        items.push({
            name,
            isDir: isCollection || href.endsWith('/'),
            size: isCollection ? null : (lengthStr ? Number(lengthStr) : null),
            mtime: lastMod || null,
            href,
        });
    }
    return items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1)));
}

export async function listByHtmlIndex(basePath) {
    const res = await fetch(basePath, { method: 'GET', credentials: 'include' });
    if (!res.ok) throw new Error('目录获取失败，HTTP ' + res.status);
    const contentType = res.headers.get('Content-Type') || '';
    if (!contentType.includes('text/html')) throw new Error('非 HTML 索引，无法解析');
    const html = await res.text();

    // 我们不需要在这里检查文件管理器标题，因为我们现在的开发环境中标题已经改变

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = [];
    const table = doc.querySelector('table');
    if (table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].children;
            if (cells.length < 2) continue;
            const a = cells[0].querySelector('a');
            if (!a) continue;
            const hrefAttr = a.getAttribute('href') || '';
            const text = (a.textContent || '').trim();
            if (!hrefAttr) continue;
            if (text === '..' || hrefAttr === '../') continue;
            const abs = normalizeHrefToPathname(hrefAttr.startsWith('http') ? hrefAttr : new URL(hrefAttr, basePath).href, window.location.origin);
            if (!abs.startsWith(basePath)) continue;
            const name = decodeURIComponent(abs.split('/').filter(Boolean).pop() || '');
            const mtimeRaw = cells[1]?.textContent?.trim() || null;
            const sizeRaw = cells[2]?.textContent?.trim() || null;
            const isDir = hrefAttr.endsWith('/') || text.endsWith('/');
            items.push({ name, isDir, size: null, sizeRaw: sizeRaw && sizeRaw !== '-' ? sizeRaw : null, mtime: null, mtimeRaw: mtimeRaw && mtimeRaw !== '-' ? mtimeRaw : null, href: abs });
        }
    } else {
        const anchors = Array.from(doc.querySelectorAll('a'));
        for (const a of anchors) {
            const text = (a.textContent || '').trim();
            const hrefAttr = a.getAttribute('href') || '';
            if (!hrefAttr) continue;
            if (text === '..' || hrefAttr === '../') continue;
            const abs = normalizeHrefToPathname(hrefAttr.startsWith('http') ? hrefAttr : new URL(hrefAttr, basePath).href, window.location.origin);
            if (!abs.startsWith(basePath)) continue;
            const name = decodeURIComponent(abs.split('/').filter(Boolean).pop() || '');
            items.push({ name, isDir: abs.endsWith('/'), size: null, sizeRaw: null, mtime: null, mtimeRaw: null, href: abs });
        }
    }
    const unique = new Map(items.map(it => [it.href, it]));
    return Array.from(unique.values()).sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1)));
}

export async function createFolder(dirPath) {
    const res = await fetch(dirPath, { method: 'MKCOL', credentials: 'include' });
    if (!res.ok) throw new Error('创建目录失败，HTTP ' + res.status);
    return true;
}

export async function deleteItem(path) {
    const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('删除失败，HTTP ' + res.status);
    return true;
}

export async function moveOrCopyItem(srcHref, destHref, isCopy = false) {
    // WebDAV MOVE/COPY 要求 Destination 是完整的绝对 URL 或绝对路径
    // 为了稳妥，我们直接使用完整的 URL
    const destination = new URL(destHref, window.location.origin).href;
    const res = await fetch(srcHref, {
        method: isCopy ? 'COPY' : 'MOVE',
        headers: { 'Destination': destination, 'Overwrite': 'F' }, // 不自动覆盖
        credentials: 'include'
    });
    if (!res.ok) {
        if (res.status === 412) throw new Error('目标已存在');
        throw new Error((isCopy ? '复制' : '移动') + '失败，HTTP ' + res.status);
    }
    return true;
}

export async function probeCapabilities(basePath) {
    try {
        const res = await fetch(basePath, { method: 'OPTIONS', credentials: 'include' });
        const allow = (res.headers.get('Allow') || '').toUpperCase();
        const dav = res.headers.get('DAV') || '';
        return {
            supportsPut: allow.includes('PUT'),
            supportsMove: allow.includes('MOVE'),
            supportsDelete: allow.includes('DELETE'),
            supportsMkcol: allow.includes('MKCOL'),
            supportsCopy: allow.includes('COPY'),
            isWebDAV: dav.includes('1') || dav.includes('2')
        };
    } catch {
        return { supportsPut: false, supportsMove: false, supportsDelete: false, supportsMkcol: false, supportsCopy: false, isWebDAV: false };
    }
}
