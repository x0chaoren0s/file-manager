import './styles/main.css';
import { state, computeBasePath } from './scripts/state.js';
import { setStatus, renderBreadcrumbs, renderTable } from './scripts/ui.js';
import { listByJson, listByWebDAV, listByHtmlIndex, probeCapabilities } from './scripts/api.js';
import { openViewer } from './scripts/viewer.js';
import { joinPath, encodePath, escapeHtml } from './scripts/utils.js';

const el = {
    refreshBtn: document.getElementById('refresh-btn'),
    fileInput: document.getElementById('file-input'),
    dropzone: document.getElementById('upload-zone'),
    tbody: document.getElementById('file-tbody'),
};

async function refresh() {
    setStatus('正在加载列表...');
    el.tbody.innerHTML = '<tr><td colspan="4" class="muted">加载中...</td></tr>';
    try {
        let items = [];
        try {
            items = await listByJson(state.basePath);
            state.webdavCapable = false;
        } catch (_jsonErr) {
            try {
                items = await listByWebDAV(state.basePath, state.origin);
                state.webdavCapable = true;
            } catch (_davErr) {
                state.webdavCapable = false;
                items = await listByHtmlIndex(state.basePath);
            }
        }
        state.items = items;
        const caps = await probeCapabilities(state.basePath);
        state.supportsPut = caps.supportsPut;
        state.supportsMove = caps.supportsMove;
        state.supportsDelete = caps.supportsDelete;

        if (!state.webdavCapable) {
            await enrichViaHEAD(state.items);
        }
        renderTable({
            onNavigate: navigateTo,
            onView: openViewer,
            onRename: promptRename,
            onDelete: confirmDelete
        });
        setStatus(`已加载 ${items.length} 项`);
    } catch (err) {
        console.error(err);
        setStatus(String(err && err.message || err), 'error');
        el.tbody.innerHTML = '<tr><td colspan="4" class="muted">加载失败</td></tr>';
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
        progSpeed.textContent = '0 KB/s';
        progSize.textContent = `0B / ${formatBytes(file.size)}`;
        setStatus(`正在上传：${file.name}`);

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const startTime = Date.now();

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progBar.style.width = percent + '%';
                    progSize.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;

                    const elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed > 0) {
                        const speed = e.loaded / elapsed;
                        progSpeed.textContent = formatBytes(speed) + '/s';
                    }
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    setStatus(`上传完成：${file.name}`, 'success');
                    resolve();
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('网络错误'));

            xhr.open('PUT', encodePath(targetPath), true);
            xhr.withCredentials = true;
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.setRequestHeader('Overwrite', 'T');
            xhr.send(file);
        }).catch(e => {
            console.error(e);
            setStatus(`上传失败：${file.name}（${e.message}）`, 'error');
        });
    }

    setTimeout(() => {
        progContainer.classList.add('hidden');
    }, 1500);

    await refresh();
}

function promptRename(originalHref) {
    const currentName = decodeURIComponent(originalHref.split('/').filter(Boolean).pop() || '');
    const row = Array.from(el.tbody.querySelectorAll('button[data-href]'))
        .find(b => b.getAttribute('data-href') === originalHref)?.closest('tr');
    if (!row) return;

    const cell = row.children[0];
    const isDir = originalHref.endsWith('/');
    const temp = document.createElement('div');
    temp.className = 'inline-form';
    temp.innerHTML = `
        <input type="text" value="${escapeHtml(currentName)}" aria-label="新名称" style="flex:1" />
        <button class="btn ok-btn">确定</button>
        <button class="btn cancel-btn">取消</button>
    `;
    const original = cell.innerHTML;
    cell.innerHTML = '';
    cell.appendChild(temp);

    const input = temp.querySelector('input');
    temp.querySelector('.cancel-btn').onclick = () => { cell.innerHTML = original; };
    temp.querySelector('.ok-btn').onclick = async () => {
        const newName = input.value.trim();
        if (!newName || newName === currentName) { cell.innerHTML = original; return; }
        try {
            await renameItem(originalHref, newName, isDir);
            setStatus('重命名成功', 'success');
            await refresh();
        } catch (e) {
            console.error(e);
            setStatus('重命名失败：' + e.message, 'error');
            cell.innerHTML = original;
        }
    };
    input.focus();
    input.select();
}

async function renameItem(originalHref, newName, isDir) {
    const destPath = joinPath(state.basePath, newName) + (isDir && !newName.endsWith('/') ? '/' : '');
    const res = await fetch(originalHref, {
        method: 'MOVE',
        headers: {
            'Destination': state.origin + encodePath(destPath),
            'Overwrite': 'T',
        },
        credentials: 'include',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function confirmDelete(targetHref) {
    const name = decodeURIComponent(targetHref.split('/').filter(Boolean).pop() || targetHref);
    if (!confirm(`确认删除：${name} ？`)) return;
    try {
        setStatus('删除中...');
        const res = await fetch(targetHref, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setStatus('删除成功', 'success');
        await refresh();
    } catch (err) {
        console.error(err);
        setStatus('删除失败：' + err.message, 'error');
    }
}

// 初始化
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

// 启动
renderBreadcrumbs(navigateTo);
refresh();
