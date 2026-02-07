import { state } from './state.js';
import { escapeHtml, formatBytes, formatDate, isPreviewable, getFileTypeName } from './utils.js';

const el = {
    path: document.getElementById('current-path'),
    status: document.getElementById('status'),
    tbody: document.getElementById('file-tbody'),
    refreshBtn: document.getElementById('refresh-btn'),
    fileInput: document.getElementById('file-input'),
    dropzone: document.getElementById('upload-zone'),
    selectAll: document.getElementById('select-all'),
    selectionBar: document.getElementById('selection-bar'),
    selectedCount: document.getElementById('selected-count'),
    newDirBtn: document.getElementById('new-dir-btn'),
    batchCutBtn: document.getElementById('batch-cut-btn'),
    batchCopyBtn: document.getElementById('batch-copy-btn'),
    batchDeleteBtn: document.getElementById('batch-delete-btn'),
    pasteBtn: document.getElementById('paste-btn'),
};

export function setStatus(message, type = 'info') {
    if (!message) { el.status.textContent = ''; return; }
    const prefix = type === 'error' ? '错误：' : (type === 'success' ? '完成：' : '');
    el.status.textContent = prefix + message;
}

export function updateSelectionUI() {
    const count = state.selectedItems.size;
    const hasClipboard = state.clipboard.items.size > 0;

    if (count > 0 || hasClipboard) {
        el.selectionBar.classList.add('active');
        el.selectedCount.textContent = count > 0 ? `已选择 ${count} 项` : '';

        // 当没有选中但剪贴板有内容时，隐藏批量编辑按钮，显示粘贴按钮
        el.batchCutBtn.style.display = count > 0 ? 'inline-flex' : 'none';
        el.batchCopyBtn.style.display = count > 0 ? 'inline-flex' : 'none';
        el.batchDeleteBtn.style.display = count > 0 ? 'inline-flex' : 'none';
        el.pasteBtn.style.display = hasClipboard ? 'inline-flex' : 'none';
    } else {
        el.selectionBar.classList.remove('active');
    }
}

export function renderBreadcrumbs(navigateTo) {
    const parts = state.basePath.split('/').filter(Boolean);
    el.path.innerHTML = '';

    // root
    const rootA = document.createElement('a');
    rootA.href = state.appRoot;
    rootA.innerHTML = '<span title="根目录">🏠</span>';
    rootA.onclick = (e) => { e.preventDefault(); navigateTo(state.appRoot); };
    el.path.appendChild(rootA);

    let accum = '';
    for (let i = 0; i < parts.length; i++) {
        accum += '/' + parts[i];
        const display = decodeURIComponent(parts[i]);
        const target = accum + '/';

        const sep = document.createElement('span');
        sep.className = 'muted';
        sep.style.margin = '0 4px';
        sep.textContent = '/';
        el.path.appendChild(sep);

        const a = document.createElement('a');
        a.href = target;
        a.textContent = escapeHtml(display);
        const currentTarget = target;
        a.onclick = (e) => { e.preventDefault(); navigateTo(currentTarget); };
        el.path.appendChild(a);
    }
}

export function renderTable(callbacks) {
    if (!state.items.length) {
        el.tbody.innerHTML = '<tr><td colspan="5" class="muted">空目录</td></tr>';
        return;
    }
    const rows = state.items.map(item => {
        const downloadHref = item.href;
        const isSelected = state.selectedItems.has(downloadHref);
        const isCut = state.clipboard.mode === 'move' && state.clipboard.items.has(downloadHref);
        const typeLabel = item.isDir ? '目录' : getFileTypeName(item.name);

        // 渲染名称列，如果是目录则增加图标
        const nameHtml = item.isDir
            ? `<span class="tag">${typeLabel}</span><a href="${downloadHref}" class="dir-link">${escapeHtml(item.name)}/</a>`
            : `<span class="tag">${typeLabel}</span><a href="${downloadHref}" download>${escapeHtml(item.name)}</a>`;

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
        return `<tr class="${isSelected ? 'selected' : ''} ${isCut ? 'is-cut' : ''}">
      <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-href="${downloadHref}" ${isSelected ? 'checked' : ''}></td>
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
    el.tbody.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.onchange = () => {
            const href = cb.getAttribute('data-href');
            if (cb.checked) state.selectedItems.add(href);
            else state.selectedItems.delete(href);
            renderTable(callbacks);
            updateSelectionUI();
        };
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

export function bindGlobalEvents(callbacks) {
    el.selectAll.onchange = () => {
        if (el.selectAll.checked) {
            state.items.forEach(it => state.selectedItems.add(it.href));
        } else {
            state.selectedItems.clear();
        }
        renderTable(callbacks);
        updateSelectionUI();
    };

    el.newDirBtn.onclick = () => callbacks.onCreateDir();
    el.batchCutBtn.onclick = () => { callbacks.onBatchAction('move'); state.selectedItems.clear(); renderTable(callbacks); updateSelectionUI(); };
    el.batchCopyBtn.onclick = () => { callbacks.onBatchAction('copy'); state.selectedItems.clear(); renderTable(callbacks); updateSelectionUI(); };
    el.batchDeleteBtn.onclick = () => callbacks.onBatchDelete();
    el.pasteBtn.onclick = () => callbacks.onPaste();
}
