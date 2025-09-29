// Global variables
let currentUser = null;
let authToken = null;
let creatorAccounts = [];

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
        showLoginScreen();
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
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
    }
}

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
    
    // Daily report form
    document.getElementById('dailyReportForm').addEventListener('submit', handleDailyReportSubmit);
    
    // User creation form
    document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);
    
    // Add PPV sale
    document.getElementById('addPPVSale').addEventListener('click', addPPVSaleField);
    
    // Add tip
    document.getElementById('addTip').addEventListener('click', addTipField);
    
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
    document.getElementById('reportDate').value = today;
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
                showError('Database is connecting... Please wait a moment and try again.');
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

function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    showLoginScreen();
    showNotification('Logged out successfully', 'info');
}

// Navigation functions
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.remove('hidden');
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-purple-100', 'text-purple-700');
        link.classList.add('text-gray-700');
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

// Daily report functions
function addPPVSaleField() {
    const container = document.getElementById('ppvSalesContainer');
    const index = container.children.length;
    
    const saleDiv = document.createElement('div');
    saleDiv.className = 'flex gap-3 items-center';
    saleDiv.innerHTML = `
        <div class="flex-1">
            <input type="number" name="ppvAmount${index}" placeholder="PPV Amount ($)" min="0" step="0.01" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <div class="flex-1">
            <select name="ppvAccount${index}" required
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">Select Creator...</option>
                ${creatorAccounts.map(account => `<option value="${account._id}">${account.name}</option>`).join('')}
            </select>
        </div>
        <button type="button" onclick="removePPVSale(this)" class="text-red-500 hover:text-red-700">
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
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
        </div>
        <div class="flex-1">
            <select name="tipAccount${index}" required
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Select Creator...</option>
                ${creatorAccounts.map(account => `<option value="${account._id}">${account.name}</option>`).join('')}
            </select>
        </div>
        <button type="button" onclick="removeTip(this)" class="text-red-500 hover:text-red-700">
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
            icon.className = 'fas fa-check-circle text-green-500 text-xl';
            notification.querySelector('.border-l-4').className = 'bg-white rounded-lg shadow-lg border-l-4 border-green-500 p-4';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle text-red-500 text-xl';
            notification.querySelector('.border-l-4').className = 'bg-white rounded-lg shadow-lg border-l-4 border-red-500 p-4';
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle text-yellow-500 text-xl';
            notification.querySelector('.border-l-4').className = 'bg-white rounded-lg shadow-lg border-l-4 border-yellow-500 p-4';
            break;
        default:
            icon.className = 'fas fa-info-circle text-blue-500 text-xl';
            notification.querySelector('.border-l-4').className = 'bg-white rounded-lg shadow-lg border-l-4 border-blue-500 p-4';
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

// User management functions
async function handleCreateUser(event) {
    event.preventDefault();
    
    const userData = {
        username: document.getElementById('newUsername').value,
        email: document.getElementById('newEmail').value,
        password: document.getElementById('newPassword').value,
        role: 'chatter',
        chatterName: document.getElementById('newChatterName').value
    };
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(userData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('User created successfully!', 'success');
            document.getElementById('createUserForm').reset();
            loadUsers(); // Refresh user list
        } else {
            showError(result.error || 'Failed to create user');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
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
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.username}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.chatterName || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.email}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        user.role === 'manager' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                    }">
                        ${user.role}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }">
                        ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}
