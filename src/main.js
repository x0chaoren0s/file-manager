import './styles/main.css';
import { state, computeBasePath } from './scripts/state.js';
import { setStatus, renderBreadcrumbs, renderTable, updateSelectionUI, bindGlobalEvents } from './scripts/ui.js';
import {
    listByJson, listByWebDAV, listByHtmlIndex, probeCapabilities,
    createFolder, deleteItem, moveOrCopyItem
} from './scripts/api.js';
import { openViewer } from './scripts/viewer.js';
import { joinPath, encodePath, escapeHtml, formatBytes } from './scripts/utils.js';

const el = {
    tbody: document.getElementById('file-tbody'),
    refreshBtn: document.getElementById('refresh-btn'),
    fileInput: document.getElementById('file-input'),
    dropzone: document.getElementById('upload-zone'),
};

// --- 统一回调管理 (确保在所有逻辑中使用同一引用) ---
const uiCallbacks = {
    onNavigate: navigateTo,
    onView: openViewer,
    onRename: promptRename,
    onDelete: confirmDelete,
    onCreateDir: handleCreateDir,
    onBatchAction: handleBatchAction,
    onBatchDelete: handleBatchDelete,
    onPaste: handlePaste,
};

async function refresh() {
    setStatus('正在加载列表...');
    state.selectedItems.clear(); // 刷新时重置选择
    updateSelectionUI();

    try {
        let items = [];
        try {
            items = await listByJson(state.basePath);
            state.isDav = false;
        } catch (_jsonErr) {
            try {
                items = await listByWebDAV(state.basePath, state.origin);
                state.isDav = true;
            } catch (_davErr) {
                state.isDav = false;
                items = await listByHtmlIndex(state.basePath);
            }
        }
        state.items = items;
        const caps = await probeCapabilities(state.basePath);
        Object.assign(state, caps);

        if (!state.isDav) {
            await enrichViaHEAD(state.items);
        }
        renderTable(uiCallbacks);
        setStatus(`已加载 ${items.length} 项`);
    } catch (err) {
        console.error(err);
        setStatus(String(err && err.message || err), 'error');
        el.tbody.innerHTML = '<tr><td colspan="5" class="muted">加载失败</td></tr>';
    }
}

async function enrichViaHEAD(items) {
    const files = items.filter(it => !it.isDir);
    await Promise.all(files.map(async (it) => {
        try {
            const res = await fetch(it.href, { method: 'HEAD', credentials: 'include' });
            if (!res.ok) return;
            const len = res.headers.get('Content-Length');
            const lm = res.headers.get('Last-Modified');
            if (len) it.size = Number(len);
            if (lm) it.mtime = lm;
        } catch { }
    }));
}

function navigateTo(dirHref) {
    const url = new URL(dirHref, state.origin);
    const pathname = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
    state.currentPathname = pathname;
    state.basePath = pathname;
    history.pushState({ path: pathname }, '', pathname);
    renderBreadcrumbs(navigateTo);
    refresh();
}

async function uploadFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (!state.supportsPut) { setStatus('服务端不支持上传（PUT）', 'error'); return; }

    const progContainer = document.getElementById('upload-progress-container');
    const progBar = document.getElementById('upload-progress-bar');
    const progFilename = document.getElementById('upload-filename');
    const progSpeed = document.getElementById('upload-speed');
    const progSize = document.getElementById('upload-size');

    progContainer.classList.remove('hidden');

    for (const file of fileList) {
        const targetPath = joinPath(state.basePath, file.name);
        progFilename.textContent = file.name;
        progBar.style.width = '0%';

        const totalSizeStr = formatBytes(file.size);
        progSize.textContent = `0B / ${totalSizeStr}`;
        setStatus(`正在上传：${file.name}`);

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const startTime = Date.now();
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && e.total > 0) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progBar.style.width = percent + '%';
                    progSize.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
                    const elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed > 0) progSpeed.textContent = formatBytes(e.loaded / elapsed) + '/s';
                }
            };
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
            xhr.onerror = () => reject(new Error('网络错误'));
            xhr.open('PUT', encodePath(targetPath), true);
            xhr.withCredentials = true;
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.setRequestHeader('Overwrite', 'T');
            xhr.send(file);
        }).catch(e => setStatus(`上传失败：${file.name}（${e.message}）`, 'error'));
    }
    setTimeout(() => progContainer.classList.add('hidden'), 1000);
    await refresh();
}

// --- 文件夹管理交互 ---
async function handleCreateDir() {
    const name = prompt('请输入新文件夹名称:');
    if (!name) return;
    try {
        const path = joinPath(state.basePath, name) + '/';
        await createFolder(encodePath(path));
        setStatus('文件夹创建成功', 'success');
        await refresh();
    } catch (e) {
        setStatus('创建失败：' + e.message, 'error');
    }
}

function promptRename(originalHref) {
    const currentName = decodeURIComponent(originalHref.split('/').filter(Boolean).pop() || '');
    const row = Array.from(el.tbody.querySelectorAll('.row-checkbox'))
        .find(cb => cb.getAttribute('data-href') === originalHref)?.closest('tr');
    if (!row) return;

    const cell = row.children[1];
    const isDir = originalHref.endsWith('/');
    const temp = document.createElement('div');
    temp.className = 'inline-form';
    temp.innerHTML = `
        <input type="text" value="${escapeHtml(currentName)}" style="flex:1" />
        <button class="btn ok-btn">确定</button>
        <button class="btn cancel-btn">取消</button>
    `;
    const originalContent = cell.innerHTML;
    cell.innerHTML = '';
    cell.appendChild(temp);

    const input = temp.querySelector('input');
    temp.querySelector('.cancel-btn').onclick = () => { cell.innerHTML = originalContent; };
    temp.querySelector('.ok-btn').onclick = async () => {
        const newName = input.value.trim();
        if (!newName || newName === currentName) { cell.innerHTML = originalContent; return; }
        try {
            const destPath = joinPath(state.basePath, newName) + (isDir ? '/' : '');
            await moveOrCopyItem(originalHref, encodePath(destPath), false);
            setStatus('重命名成功', 'success');
            await refresh();
        } catch (e) {
            setStatus('重命名失败：' + e.message, 'error');
            cell.innerHTML = originalContent;
        }
    };
    input.focus(); input.select();
}

async function confirmDelete(targetHref) {
    const name = decodeURIComponent(targetHref.split('/').filter(Boolean).pop() || '');
    if (!confirm(`确认删除：${name} ？`)) return;
    try {
        await deleteItem(targetHref);
        setStatus('删除成功', 'success');
        await refresh();
    } catch (e) {
        setStatus('删除失败：' + e.message, 'error');
    }
}

// --- 批量操作 ---
function handleBatchAction(mode) {
    state.clipboard.mode = mode;
    state.clipboard.items = new Set(state.selectedItems);
    setStatus(`已${mode === 'move' ? '剪切' : '复制'} ${state.clipboard.items.size} 项，请到目标目录粘贴`, 'success');
}

async function handleBatchDelete() {
    const count = state.selectedItems.size;
    if (!count || !confirm(`确认批量删除已选的 ${count} 项吗？`)) return;
    setStatus(`正在删除 ${count} 项...`);
    let failCount = 0;
    for (const href of state.selectedItems) {
        try { await deleteItem(href); }
        catch (e) { failCount++; console.error(e); }
    }
    setStatus(failCount ? `删除完成，但有 ${failCount} 项失败` : '批量删除成功', failCount ? 'error' : 'success');
    state.selectedItems.clear();
    await refresh();
}

async function handlePaste() {
    const { mode, items } = state.clipboard;
    if (!items.size) return;
    setStatus(`正在${mode === 'move' ? '移动' : '复制'} ${items.size} 项...`);
    let failCount = 0;
    const isCopy = mode === 'copy';

    for (const srcHref of items) {
        try {
            const name = decodeURIComponent(srcHref.split('/').filter(Boolean).pop() || '');
            const destPath = joinPath(state.basePath, name) + (srcHref.endsWith('/') ? '/' : '');
            await moveOrCopyItem(srcHref, encodePath(destPath), isCopy);
        } catch (e) {
            failCount++;
            console.error(e);
        }
    }

    if (mode === 'move' && !failCount) state.clipboard.items.clear();
    setStatus(failCount ? `粘贴完成，但有 ${failCount} 项失败` : '操作全部成功', failCount ? 'error' : 'success');
    await refresh();
}

// --- 初始化与监听 ---
bindGlobalEvents(uiCallbacks);

el.refreshBtn.onclick = refresh;
el.fileInput.onchange = (e) => uploadFiles(e.target.files);
el.dropzone.ondragover = (e) => { e.preventDefault(); el.dropzone.classList.add('dragover'); };
el.dropzone.ondragleave = () => el.dropzone.classList.remove('dragover');
el.dropzone.ondrop = (e) => {
    e.preventDefault(); el.dropzone.classList.remove('dragover');
    uploadFiles(e.dataTransfer?.files);
};

window.onpopstate = () => {
    const pathname = computeBasePath(location.pathname);
    state.currentPathname = pathname;
    state.basePath = pathname;
    renderBreadcrumbs(navigateTo);
    refresh();
};

renderBreadcrumbs(navigateTo);
refresh();
