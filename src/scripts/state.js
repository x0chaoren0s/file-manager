export function computeBasePath(pathname) {
    // 若为文件路径（如 /index.html），使用父目录作为工作目录
    return pathname.endsWith('/') ? pathname : pathname.slice(0, pathname.lastIndexOf('/') + 1);
}

export const state = {
    currentPathname: window.location.pathname,
    basePath: computeBasePath(window.location.pathname),
    origin: window.location.origin,
    items: [],
    webdavCapable: true,
    supportsPut: false,
    supportsMove: false,
    supportsDelete: false,
};
