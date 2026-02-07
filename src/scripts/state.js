export function computeBasePath(pathname) {
    if (!pathname || pathname === '/') return '/';
    // 确保以 / 结尾，以便后续 joinPath 逻辑一致
    return pathname.endsWith('/') ? pathname : pathname + '/';
}

export const state = {
    appRoot: computeBasePath(window.location.pathname), // 记录应用启动时的根路径
    currentPathname: window.location.pathname,
    basePath: computeBasePath(window.location.pathname),
    origin: window.location.origin,
    items: [],
    webdavCapable: true,
    isDav: false,
    supportsPut: false,
    supportsMove: false,
    supportsDelete: false,
    supportsMkcol: false,
    supportsCopy: false,
    selectedItems: new Set(), // 存储 href
    clipboard: { mode: null, items: new Set() }, // mode: 'move' | 'copy'
};
