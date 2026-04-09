/**
 * Admin Common - Shared functionality for all admin pages
 * Injects Super-Admin nav link for super_admin role
 */
(function () {
    /**
     * Call after auth check to inject Super-Admin nav item if applicable.
     * @param {object} user - User data from /api/auth/me
     */
    window.injectSuperAdminNav = function (user) {
        if (!user || user.rolle !== 'super_admin') return;
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;
        if (nav.querySelector('a[href="/admin/super-admin.html"]')) return;
        const li = document.createElement('li');
        li.innerHTML = '<a href="/admin/super-admin.html">⚙ Super-Admin</a>';
        nav.appendChild(li);
    };
})();
