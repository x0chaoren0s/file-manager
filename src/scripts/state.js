export function computeBasePath(pathname) {
    if (!pathname || pathname === '/') return '/';
    // 确保以 / 结尾，以便后续 joinPath 逻辑一致
    return pathname.endsWith('/') ? pathname : pathname + '/';
}

export const state = {
    currentPathname: window.location.pathname,
    basePath: computeBasePath(window.location.pathname),
    origin: window.location.origin,
    items: [],
    webdavCapable: true,
    supportsPut: true, // 初始乐观猜测，refresh 中会探测
    supportsMove: false,
    supportsDelete: false,
};
