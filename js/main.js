// ---------------------------------------------------------------------------
// Shared config & helpers
// ---------------------------------------------------------------------------
const API_BASE = '/api';

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data;
}

function setButtonLoading(button, loading, loadingText = 'Please wait...') {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>${loadingText}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}

// ---------------------------------------------------------------------------
// Theme + password visibility + sidebar (used across pages)
// ---------------------------------------------------------------------------
function applyStoredTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  // Mobile: slide over. Desktop: collapse.
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

// ---------------------------------------------------------------------------
// Tabs Initialization
// ---------------------------------------------------------------------------
function initTabs() {
  const tabLinks = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
  const tabContents = document.querySelectorAll('.tab-content');

  if (!tabLinks.length) return;

  tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-tab');
      
      // Update links
      tabLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Update contents
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${target}-tab`) {
          content.classList.add('active');
        }
      });
      
      // Close sidebar on mobile after clicking
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Guards: require a valid session, redirect if not logged in / wrong role
// ---------------------------------------------------------------------------
function requireAuth(requiredRole) {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    window.location.href = requiredRole === 'admin' ? 'admin-login.html' : 'index.html';
    return null;
  }
  if (requiredRole && user.role !== requiredRole) {
    window.location.href = requiredRole === 'admin' ? 'admin-login.html' : 'index.html';
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  const user = getUser();
  window.location.href = 'index.html';
}

function wireLogoutButtons(redirectTo = 'index.html') {
  ['logoutBtn', 'sidebarLogoutBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      clearSession();
      window.location.href = redirectTo;
    });
  });
}

// ---------------------------------------------------------------------------
// Page: index.html (User Login)
// ---------------------------------------------------------------------------
function initLoginPage() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const button = form.querySelector('button[type="submit"]');

    setButtonLoading(button, true, 'Signing in...');
    try {
      const data = await apiFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, data.user);
      showToast('Login successful. Redirecting...', 'success');
      setTimeout(() => (window.location.href = 'dashboard.html'), 500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Page: register.html
// ---------------------------------------------------------------------------
function initRegisterPage() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const button = form.querySelector('button[type="submit"]');

    setButtonLoading(button, true, 'Creating account...');
    try {
      await apiFetch('/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });
      showToast('Account created. Please sign in.', 'success');
      setTimeout(() => (window.location.href = 'index.html'), 800);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Page: admin-login.html
// ---------------------------------------------------------------------------
function initAdminLoginPage() {
  const form = document.getElementById('adminForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminId').value.trim();
    const password = document.getElementById('password').value;
    const button = form.querySelector('button[type="submit"]');

    // Note: the 2FA token field on this page isn't wired to a backend check
    // yet (see README) - login succeeds on valid admin credentials alone.
    setButtonLoading(button, true, 'Authenticating...');
    try {
      const data = await apiFetch('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, data.user);
      showToast('Admin login successful. Redirecting...', 'success');
      setTimeout(() => (window.location.href = 'admin-dashboard.html'), 500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Page: 2fa.html (UI only - no backend endpoint yet, see README)
// ---------------------------------------------------------------------------
function init2faPage() {
  const form = document.getElementById('twoFactorForm');
  if (!form) return;

  const inputs = Array.from(form.querySelectorAll('.token-input'));
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (input.value && inputs[idx + 1]) inputs[idx + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && inputs[idx - 1]) {
        inputs[idx - 1].focus();
      }
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('2FA verification isn\'t connected to a backend endpoint yet.', 'warning');
  });
}

// ---------------------------------------------------------------------------
// Page: dashboard.html (User)
// ---------------------------------------------------------------------------
async function initUserDashboard() {
  const marker = document.getElementById('activityChart');
  if (!marker) return;

  const user = requireAuth('user');
  if (!user) return;

  const nameEl = document.getElementById('displayUsername');
  const emailEl = document.getElementById('displayEmail');
  const avatarEl = document.getElementById('avatarInitial');
  if (nameEl) nameEl.textContent = user.username;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) avatarEl.textContent = (user.username || 'U').charAt(0).toUpperCase();

  wireLogoutButtons('index.html');

  try {
    const data = await apiFetch('/user/activity');
    document.getElementById('activityChart').classList.remove('skeleton');
    renderLineChart('activityChart', data, '#4f46e5');
  } catch (err) {
    showToast('Could not load activity data: ' + err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Page: admin-dashboard.html
// ---------------------------------------------------------------------------
async function initAdminDashboard() {
  const marker = document.getElementById('trafficChart');
  if (!marker) return;

  const user = requireAuth('admin');
  if (!user) return;

  const adminIdEl = document.getElementById('displayAdminId');
  if (adminIdEl) adminIdEl.textContent = user.email;

  wireLogoutButtons('admin-login.html');

  // Traffic chart
  try {
    const data = await apiFetch('/admin/traffic');
    document.getElementById('trafficChart').classList.remove('skeleton');
    renderLineChart('trafficChart', data, '#ef4444');
  } catch (err) {
    showToast('Could not load traffic data: ' + err.message, 'error');
  }

  // User count
  try {
    const { count } = await apiFetch('/users/count');
    const countEl = document.getElementById('userCount');
    if (countEl) {
      countEl.textContent = count;
      countEl.classList.remove('skeleton');
    }
  } catch (err) {
    showToast('Could not load user count: ' + err.message, 'error');
  }

  // Users table + search
  const tableBody = document.querySelector('.table-container tbody');
  const searchInput = document.querySelector('.top-nav .search-bar input');

  async function loadUsers(search = '') {
    if (!tableBody) return;
    try {
      const users = await apiFetch(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      renderUsersTable(tableBody, users);
    } catch (err) {
      showToast('Could not load users: ' + err.message, 'error');
    }
  }

  function renderUsersTable(tbody, users) {
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No users found</td></tr>`;
      return;
    }
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td>${escapeHtml(u.username)}<br><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(u.email)}</span></td>
        <td>Member</td>
        <td>
          <span class="status-badge ${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span>
        </td>
        <td>
          <button class="action-link" data-user-id="${u.id}" data-active="${u.isActive}">
            ${u.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.action-link').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-user-id');
        btn.disabled = true;
        try {
          await apiFetch(`/admin/users/${id}/status`, { method: 'PUT' });
          showToast('User status updated', 'success');
          loadUsers(searchInput ? searchInput.value.trim() : '');
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  function escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  loadUsers();

  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadUsers(searchInput.value.trim()), 300);
    });
  }
}

// ---------------------------------------------------------------------------
// Chart helper (Chart.js is loaded via CDN on dashboard pages)
// ---------------------------------------------------------------------------
function renderLineChart(canvasId, apiData, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9aa3b5' : '#6b7280';

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: apiData.labels,
      datasets: apiData.datasets.map((ds) => ({
        ...ds,
        borderColor: color,
        backgroundColor: `${color}22`,
        tension: 0.35,
        fill: true,
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  initTabs();
  initLoginPage();
  initRegisterPage();
  initAdminLoginPage();
  init2faPage();
  initUserDashboard();
  initAdminDashboard();
});
