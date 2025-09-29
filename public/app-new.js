// Global variables
let currentUser = null;
let authToken = null;
let creatorAccounts = [];
let currentTimeInterval = '7d';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    setupEventListeners();
    setDefaultDate();
});

function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');

    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        showMainApp();
    } else {
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loadingScreen').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('loadingScreen').classList.add('hidden');

    // Update welcome message
    const welcomeMsg = currentUser.role === 'chatter'
        ? `Welcome back, ${currentUser.chatterName}!`
        : `Welcome back, ${currentUser.username}!`;
    document.getElementById('userWelcome').textContent = welcomeMsg;

    // Show appropriate navigation
    if (currentUser.role === 'manager') {
        document.getElementById('managerNav').classList.remove('hidden');
        document.getElementById('chatterNav').classList.add('hidden');
        showSection('dashboard');
    } else {
        document.getElementById('chatterNav').classList.remove('hidden');
        document.getElementById('managerNav').classList.add('hidden');
        showSection('chatter-dashboard');
    }

    // Load initial data
    loadCreatorAccounts();
    if (currentUser.role === 'manager') {
        loadUsers();
        loadDashboardData();
        loadAIRecommendations();
    }
}

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Create account form
    document.getElementById('createAccountForm').addEventListener('submit', handleCreateAccount);

    // Back to login button
    document.getElementById('backToLogin').addEventListener('click', showLoginForm);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

    // Time interval buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const interval = this.getAttribute('data-interval');
            setTimeInterval(interval);
        });
    });

    // Daily report form
    const dailyReportForm = document.getElementById('dailyReportForm');
    if (dailyReportForm) {
        dailyReportForm.addEventListener('submit', handleDailyReportSubmit);
    }

    // Add PPV sale
    const addPPVSaleBtn = document.getElementById('addPPVSale');
    if (addPPVSaleBtn) {
        addPPVSaleBtn.addEventListener('click', addPPVSaleField);
    }

    // Add tip
    const addTipBtn = document.getElementById('addTip');
    if (addTipBtn) {
        addTipBtn.addEventListener('click', addTipField);
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(event) {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');

        if (window.innerWidth < 1024 &&
            !sidebar.contains(event.target) &&
            !sidebarToggle.contains(event.target)) {
            sidebar.classList.add('sidebar-hidden');
        }
    });
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const reportDateEl = document.getElementById('reportDate');
    if (reportDateEl) {
        reportDateEl.value = today;
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('createAccountForm').classList.add('hidden');
}

// Authentication functions
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    showLoading(true);

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;

            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            showMainApp();
            showNotification('Login successful!', 'success');
        } else {
            if (response.status === 503) {
                showError('System is starting up. Please wait a moment and try again.');
            } else {
                showError(data.error || 'Login failed');
            }
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleCreateAccount(event) {
    event.preventDefault();

    const userData = {
        username: document.getElementById('newUsername').value,
        email: document.getElementById('newEmail').value,
        password: document.getElementById('newPassword').value,
        role: 'chatter',
        chatterName: document.getElementById('chatterName').value
    };

    showLoading(true);

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('Account created successfully! Please login.', 'success');
            showLoginForm();
        } else {
            showError(result.error || 'Failed to create account');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    showAuthScreen();
    showNotification('Logged out successfully', 'info');
}

// Navigation functions
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-blue-600', 'text-white');
        link.classList.add('text-gray-300');
    });

    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.add('sidebar-hidden');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('sidebar-hidden');
}

// Time interval functions
function setTimeInterval(interval) {
    currentTimeInterval = interval;

    // Update button states
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('text-gray-400');
    });

    const activeBtn = document.querySelector(`[data-interval="${interval}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-400');
        activeBtn.classList.add('bg-blue-600', 'text-white');
    }

    // Reload data with new time interval
    if (currentUser && currentUser.role === 'manager') {
        loadDashboardData();
    }
}

// Data loading functions
async function loadCreatorAccounts() {
    try {
        const response = await fetch('/api/creator-accounts', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            creatorAccounts = await response.json();
        }
    } catch (error) {
        console.error('Error loading creator accounts:', error);
    }
}

async function loadUsers() {
    if (currentUser && currentUser.role === 'manager') {
        try {
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                const users = await response.json();
                updateUsersTable(users);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
}

function updateUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (tbody) {
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">${user.username}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${user.chatterName || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${user.email}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        user.role === 'manager' ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'
                    }">
                        ${user.role}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        user.isActive ? 'bg-green-900/30 text-green-400' : 'bg-gray-900/30 text-gray-500'
                    }">
                        ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}

// Daily report functions
function addPPVSaleField() {
    const container = document.getElementById('ppvSalesContainer');
    const index = container.children.length;

    const saleDiv = document.createElement('div');
    saleDiv.className = 'flex gap-3 items-center';
    saleDiv.innerHTML = `
        <div class="flex-1">
            <input type="number" name="ppvAmount${index}" placeholder="PPV Amount ($)" min="0" step="0.01" required
                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <div class="flex-1">
            <select name="ppvAccount${index}" required
                    class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">Select Creator...</option>
                ${creatorAccounts.map(account => `<option value="${account._id}">${account.name}</option>`).join('')}
            </select>
        </div>
        <button type="button" onclick="removePPVSale(this)" class="text-red-400 hover:text-red-300">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(saleDiv);
}

function addTipField() {
    const container = document.getElementById('tipsContainer');
    const index = container.children.length;

    const tipDiv = document.createElement('div');
    tipDiv.className = 'flex gap-3 items-center';
    tipDiv.innerHTML = `
        <div class="flex-1">
            <input type="number" name="tipAmount${index}" placeholder="Tip Amount ($)" min="0" step="0.01" required
                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500">
        </div>
        <div class="flex-1">
            <select name="tipAccount${index}" required
                    class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Select Creator...</option>
                ${creatorAccounts.map(account => `<option value="${account._id}">${account.name}</option>`).join('')}
            </select>
        </div>
        <button type="button" onclick="removeTip(this)" class="text-red-400 hover:text-red-300">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(tipDiv);
}

function removePPVSale(button) {
    button.parentElement.remove();
}

function removeTip(button) {
    button.parentElement.remove();
}

async function handleDailyReportSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const data = {
        date: document.getElementById('reportDate').value,
        shift: document.getElementById('reportShift').value,
        fansChatted: parseInt(document.getElementById('fansChatted').value) || 0,
        avgResponseTime: parseFloat(document.getElementById('avgResponseTime').value) || 0,
        notes: document.getElementById('reportNotes').value,
        ppvSales: [],
        tips: []
    };

    // Collect PPV sales
    const ppvContainer = document.getElementById('ppvSalesContainer');
    for (let i = 0; i < ppvContainer.children.length; i++) {
        const amountInput = document.querySelector(`input[name="ppvAmount${i}"]`);
        const accountSelect = document.querySelector(`select[name="ppvAccount${i}"]`);

        if (amountInput && accountSelect && amountInput.value && accountSelect.value) {
            data.ppvSales.push({
                amount: parseFloat(amountInput.value),
                creatorAccount: accountSelect.value
            });
        }
    }

    // Collect tips
    const tipsContainer = document.getElementById('tipsContainer');
    for (let i = 0; i < tipsContainer.children.length; i++) {
        const amountInput = document.querySelector(`input[name="tipAmount${i}"]`);
        const accountSelect = document.querySelector(`select[name="tipAccount${i}"]`);

        if (amountInput && accountSelect && amountInput.value && accountSelect.value) {
            data.tips.push({
                amount: parseFloat(amountInput.value),
                creatorAccount: accountSelect.value
            });
        }
    }

    showLoading(true);

    try {
        const response = await fetch('/api/daily-reports', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('Daily report saved successfully!', 'success');
            document.getElementById('dailyReportForm').reset();
            document.getElementById('ppvSalesContainer').innerHTML = '';
            document.getElementById('tipsContainer').innerHTML = '';
            setDefaultDate();
        } else {
            showError(result.error || 'Failed to save report');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function loadDashboardData() {
    try {
        // Load team analytics
        const response = await fetch(`/api/analytics/team/sales?interval=${currentTimeInterval}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const analytics = await response.json();
            updateDashboardMetrics(analytics);
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function updateDashboardMetrics(analytics) {
    if (analytics.length === 0) return;

    const totalRevenue = analytics.reduce((sum, a) => sum + a.revenue, 0);
    const totalSubs = analytics.reduce((sum, a) => sum + a.totalSubs, 0);
    const profileClicks = analytics.reduce((sum, a) => sum + a.profileClicks, 0);
    const messagesSent = analytics.reduce((sum, a) => sum + a.messagesSent, 0);
    const ppvsSent = analytics.reduce((sum, a) => sum + a.ppvsSent, 0);
    const ppvsUnlocked = analytics.reduce((sum, a) => sum + a.ppvsUnlocked, 0);
    const avgResponseTime = analytics.reduce((sum, a) => sum + a.responseTime, 0) / analytics.length;

    // Update display values
    document.getElementById('totalRevenue').textContent = `$${totalRevenue.toLocaleString()}`;
    document.getElementById('totalSubs').textContent = totalSubs.toLocaleString();
    document.getElementById('profileClicks').textContent = profileClicks.toLocaleString();
    document.getElementById('messagesSent').textContent = messagesSent.toLocaleString();
    document.getElementById('ppvsSent').textContent = ppvsSent.toLocaleString();
    document.getElementById('ppvsUnlocked').textContent = ppvsUnlocked.toLocaleString();
    document.getElementById('avgResponseTime').textContent = `${avgResponseTime.toFixed(1)}m`;

    // Calculate unlock rate
    const unlockRate = ppvsSent > 0 ? (ppvsUnlocked / ppvsSent * 100).toFixed(1) : '0';
    document.getElementById('unlockRate').textContent = `${unlockRate}%`;
}

async function loadAIRecommendations() {
    try {
        const response = await fetch(`/api/ai/recommendations?interval=${currentTimeInterval}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const recommendations = await response.json();
            updateAIRecommendations(recommendations);
        }
    } catch (error) {
        console.error('Error loading AI recommendations:', error);
    }
}

function updateAIRecommendations(recommendations) {
    const container = document.getElementById('aiRecommendationsList');
    if (!container) return;

    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No recommendations available</p>';
        return;
    }

    container.innerHTML = recommendations.map(rec => `
        <div class="flex items-start space-x-3 p-3 bg-gray-800/50 rounded-lg">
            <div class="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
            <div class="flex-1">
                <p class="text-sm text-gray-300">${rec.description}</p>
                ${rec.expectedImpact ? `<p class="text-xs text-green-400 mt-1">Potential: ${rec.expectedImpact}</p>` : ''}
            </div>
        </div>
    `).join('');
}

// Utility functions
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const icon = document.getElementById('notificationIcon');
    const messageEl = document.getElementById('notificationMessage');

    messageEl.textContent = message;

    // Set icon and color based on type
    switch (type) {
        case 'success':
            icon.className = 'fas fa-check-circle text-green-400 text-xl';
            notification.classList.remove('border-red-500', 'border-yellow-500', 'border-blue-500');
            notification.classList.add('border-green-500');
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle text-red-400 text-xl';
            notification.classList.remove('border-green-500', 'border-yellow-500', 'border-blue-500');
            notification.classList.add('border-red-500');
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle text-yellow-400 text-xl';
            notification.classList.remove('border-green-500', 'border-red-500', 'border-blue-500');
            notification.classList.add('border-yellow-500');
            break;
        default:
            icon.className = 'fas fa-info-circle text-blue-400 text-xl';
            notification.classList.remove('border-green-500', 'border-yellow-500', 'border-red-500');
            notification.classList.add('border-blue-500');
    }

    notification.classList.remove('hidden');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

function hideNotification() {
    document.getElementById('notification').classList.add('hidden');
}

function showError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');

        setTimeout(() => {
            errorEl.classList.add('hidden');
        }, 5000);
    } else {
        showNotification(message, 'error');
    }
}

// API helper function
async function apiCall(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };

    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(endpoint, finalOptions);

        if (response.status === 401) {
            // Token expired, redirect to login
            handleLogout();
            return null;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}