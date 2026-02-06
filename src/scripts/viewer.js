import { isImageFile, escapeHtml } from './utils.js';

const overlay = document.getElementById('viewer-overlay');
const pre = document.getElementById('viewer-pre');
const htmlView = document.getElementById('viewer-html');
const imgWrap = document.getElementById('viewer-img-wrap');
const imgEl = document.getElementById('viewer-img');
const title = document.getElementById('viewer-title');
const hint = document.getElementById('viewer-hint');
const openRaw = document.getElementById('viewer-open-raw');
const toggleBtn = document.getElementById('viewer-toggle');
const closeBtn = document.getElementById('viewer-close');

const lineNumsBtn = document.getElementById('viewer-line-numbers');
const wordWrapBtn = document.getElementById('viewer-word-wrap');

closeBtn.onclick = () => overlay.classList.add('hidden');
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.classList.add('hidden'); });

// Viewer states
let showLineNumbers = false;
let enableWordWrap = false;
let currentRawText = '';

lineNumsBtn.onclick = () => {
    showLineNumbers = !showLineNumbers;
    lineNumsBtn.classList.toggle('active', showLineNumbers);
    renderRawContent();
};

wordWrapBtn.onclick = () => {
    enableWordWrap = !enableWordWrap;
    wordWrapBtn.classList.toggle('active', enableWordWrap);
    pre.classList.toggle('wrap', enableWordWrap);
};

function renderRawContent() {
    if (!showLineNumbers) {
        pre.textContent = currentRawText;
        return;
    }
    const lines = currentRawText.split('\n');
    let html = '';
    for (let i = 0; i < lines.length; i++) {
        const content = escapeHtml(lines[i]);
        html += `<div class="ln-row"><span class="ln-num">${i + 1}</span><span class="ln-content">${content || ' '}</span></div>`;
    }
    pre.innerHTML = html;
}

const PREVIEW_MAX_BYTES = 512 * 1024; // 512KB

export async function openViewer(href, name) {
    title.textContent = name;
    openRaw.setAttribute('href', href);
    pre.textContent = '加载中...';
    htmlView.style.display = 'none';
    imgWrap.style.display = 'none';
    pre.style.display = 'block';
    toggleBtn.classList.add('hidden');
    hint.textContent = '';
    overlay.classList.remove('hidden');

    try {
        let size = null;
        try {
            const head = await fetch(href, { method: 'HEAD', credentials: 'include' });
            if (head.ok) {
                const len = head.headers.get('Content-Length');
                if (len) size = Number(len);
            }
        } catch { }

        let response, truncated = false;
        if (size != null && size > PREVIEW_MAX_BYTES) {
            response = await fetch(href, { method: 'GET', headers: { 'Range': `bytes=0-${PREVIEW_MAX_BYTES - 1}` }, credentials: 'include' });
            truncated = true;
        } else {
            response = await fetch(href, { method: 'GET', credentials: 'include' });
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        if (isImageFile(name)) {
            imgEl.src = href;
            imgWrap.style.display = 'block';
            pre.style.display = 'none';
            return;
        }

        const text = await response.text();
        currentRawText = text;
        renderRawContent();

        if (name.toLowerCase().endsWith('.md')) {
            await ensureMarkdownLibsWithTimeout(2000);
            const canUseAdvanced = !!(window.marked && window.DOMPurify);
            try {
                const html = canUseAdvanced ? renderMarkdownAdvanced(text) : renderMarkdownToHtml(text);
                htmlView.innerHTML = html;
                rewriteRelativeLinks(htmlView, href);
            } catch {
                htmlView.innerHTML = renderMarkdownToHtml(text);
            }
            htmlView.style.display = 'block';
            pre.style.display = 'none';
            toggleBtn.textContent = '源码';
            toggleBtn.classList.remove('hidden');
            toggleBtn.onclick = () => {
                const showHtml = htmlView.style.display !== 'none';
                if (showHtml) {
                    htmlView.style.display = 'none';
                    pre.style.display = 'block';
                    toggleBtn.textContent = '渲染';
                    renderRawContent();
                } else {
                    htmlView.style.display = 'block';
                    pre.style.display = 'none';
                    toggleBtn.textContent = '源码';
                }
            };
            if (window.MathJax && window.MathJax.typesetPromise) {
                try { await window.MathJax.typesetPromise([htmlView]); } catch { }
            }
        }
        if (truncated) {
            hint.textContent = `仅预览前 ${Math.round(PREVIEW_MAX_BYTES / 1024)}KB，点击“下载”查看完整内容。`;
        }
    } catch (err) {
        pre.textContent = `加载失败：${err && err.message ? err.message : String(err)}`;
    }
}

let markdownLibsPromise = null;
function ensureMarkdownLibs() {
    if (markdownLibsPromise) return markdownLibsPromise;
    markdownLibsPromise = new Promise(async (resolve) => {
        try {
            const tasks = [];
            if (!window.marked) tasks.push(loadScript('https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js'));
            if (!window.DOMPurify) tasks.push(loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js'));
            if (!window.MathJax) {
                window.MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] }, svg: { fontCache: 'global' } };
                tasks.push(loadScript('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js'));
            }
            await Promise.all(tasks);
        } catch (e) { }
        resolve();
    });
    return markdownLibsPromise;
}

function ensureMarkdownLibsWithTimeout(ms) {
    return Promise.race([ensureMarkdownLibs(), new Promise(resolve => setTimeout(resolve, ms))]);
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('load failed: ' + src));
        document.head.appendChild(s);
    });
}

function renderMarkdownAdvanced(md) {
    try {
        const markedOpts = { gfm: true, breaks: true, mangle: false, headerIds: true };
        const rawHtml = window.marked.parse(md, markedOpts);
        return window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    } catch (e) {
        return renderMarkdownToHtml(md);
    }
}

function rewriteRelativeLinks(container, baseHref) {
    const base = new URL(baseHref, window.location.origin);
    container.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (/^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith('#') || href.startsWith('/')) return;
        try { a.href = new URL(href, base).href; } catch { }
    });
    container.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('/')) return;
        try { img.src = new URL(src, base).href; } catch { }
    });
}

function renderMarkdownToHtml(md) {
    let text = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(/```([\s\S]*?)```/g, (m, p1) => `<pre><code>${p1.replace(/\n$/, '')}</code></pre>`);
    text = text.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
        .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
        .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
        .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
        .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
        .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    text = text.replace(/^(\s*)([-*])\s+(.*)$/gm, '$1<li>$3</li>');
    text = text.replace(/(?:^(?:<li>.*<\/li>)(?:\n|$))+?/gm, (block) => `<ul>${block.replace(/\n/g, '')}</ul>`);
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = text.split(/\n\n+/).map(p => {
        if (/^<h\d|^<pre|^<ul|^<li|^<blockquote/.test(p)) return p;
        return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    });
    return lines.join('\n');
}
