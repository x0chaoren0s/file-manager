import { state } from './state.js';
import { escapeHtml, formatBytes, formatDate, isPreviewable } from './utils.js';

const el = {
    path: document.getElementById('current-path'),
    status: document.getElementById('status'),
    tbody: document.getElementById('file-tbody'),
    refreshBtn: document.getElementById('refresh-btn'),
    fileInput: document.getElementById('file-input'),
    dropzone: document.getElementById('upload-zone'),
};

export function setStatus(message, type = 'info') {
    if (!message) { el.status.textContent = ''; return; }
    const prefix = type === 'error' ? '错误：' : (type === 'success' ? '完成：' : '');
    el.status.textContent = prefix + message;
}

export function renderBreadcrumbs(navigateTo) {
    const parts = state.basePath.split('/').filter(Boolean);
    const crumbs = [];
    // root
    const rootA = document.createElement('a');
    rootA.href = '/';
    rootA.textContent = '/';
    rootA.onclick = (e) => { e.preventDefault(); navigateTo('/'); };
    crumbs.push(rootA.outerHTML);

    let accum = '';
    for (let i = 0; i < parts.length; i++) {
        accum += '/' + parts[i];
        const display = decodeURIComponent(parts[i]);
        const target = accum + '/';
        const span = document.createElement('span');
        span.className = 'muted';
        span.textContent = '/';
        const a = document.createElement('a');
        a.href = target;
        a.textContent = escapeHtml(display);
        const currentTarget = target;
        a.onclick = (e) => { e.preventDefault(); navigateTo(currentTarget); };
        crumbs.push(span.outerHTML + ' ' + a.outerHTML);
    }
    el.path.innerHTML = crumbs.join(' ');
}

export function renderTable(callbacks) {
    if (!state.items.length) {
        el.tbody.innerHTML = '<tr><td colspan="4" class="muted">空目录</td></tr>';
        return;
    }
    const rows = state.items.map(item => {
        const downloadHref = item.href;
        const nameHtml = item.isDir
            ? `<span class="tag">目录</span><a href="${downloadHref}" class="dir-link">${escapeHtml(item.name)}/</a>`
            : `<span class="tag">文件</span><a href="${downloadHref}" download>${escapeHtml(item.name)}</a>`;
        const sizeHtml = item.isDir ? '-' : (item.size != null ? formatBytes(item.size) : (item.sizeRaw || '-'));
        const timeHtml = item.mtime ? formatDate(item.mtime) : (item.mtimeRaw || '-');
        const baseActions = [];

        if (item.isDir) {
            baseActions.push(`<button class="btn action-enter" data-href="${downloadHref}">打开</button>`);
        } else {
            if (isPreviewable(item.name)) {
                baseActions.push(`<button class="btn action-view" data-href="${downloadHref}" data-name="${escapeHtml(item.name)}">查看</button>`);
            }
            baseActions.push(`<a class="btn" href="${downloadHref}" download>下载</a>`);
        }
        if (state.supportsMove) {
            baseActions.push(`<button class="btn action-rename" data-href="${downloadHref}">重命名</button>`);
        }
        if (state.supportsDelete) {
            baseActions.push(`<button class="btn danger action-delete" data-href="${downloadHref}">删除</button>`);
        }
        const actions = baseActions.join(' ');
        return `<tr>
      <td>
        <div class="name">${nameHtml}</div>
        <div class="mobile-only">
          <div><span>${sizeHtml}</span><span style="margin:0 6px;">•</span><span>${timeHtml}</span></div>
          <div class="mobile-actions">${actions}</div>
        </div>
      </td>
      <td class="nowrap desktop-only">${sizeHtml}</td>
      <td class="nowrap desktop-only">${timeHtml}</td>
      <td class="desktop-only"><div class="actions">${actions}</div></td>
    </tr>`;
    }).join('');
    el.tbody.innerHTML = rows;

    // 绑定事件
    el.tbody.querySelectorAll('.dir-link').forEach(a => {
        a.onclick = (e) => { e.preventDefault(); callbacks.onNavigate(a.getAttribute('href')); };
    });
    el.tbody.querySelectorAll('.action-enter').forEach(b => {
        b.onclick = () => callbacks.onNavigate(b.getAttribute('data-href'));
    });
    el.tbody.querySelectorAll('.action-view').forEach(b => {
        b.onclick = () => callbacks.onView(b.getAttribute('data-href'), b.getAttribute('data-name'));
    });
    el.tbody.querySelectorAll('.action-rename').forEach(b => {
        b.onclick = () => callbacks.onRename(b.getAttribute('data-href'));
    });
    el.tbody.querySelectorAll('.action-delete').forEach(b => {
        b.onclick = () => callbacks.onDelete(b.getAttribute('data-href'));
    });
}
