// Global variables
let currentUser = null;
let authToken = null;
let creatorAccounts = [];
let currentTimeInterval = '7d';
let customDateRange = null;

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

    // Show create account form
    document.getElementById('showCreateAccount').addEventListener('click', function() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('createAccountForm').classList.remove('hidden');
    });

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
            if (interval !== 'custom') {
                setTimeInterval(interval);
            }
        });
    });

    // Daily report form
    const dailyReportForm = document.getElementById('dailyReportForm');
    if (dailyReportForm) {
        dailyReportForm.addEventListener('submit', handleDailyReportSubmit);
    }

    // Add PPV sale and tip buttons
    document.addEventListener('click', function(e) {
        if (e.target.id === 'addPPVSale') {
            addPPVSaleField();
        } else if (e.target.id === 'addTip') {
            addTipField();
        }
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(event) {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const customDatePicker = document.getElementById('customDatePicker');

        if (window.innerWidth < 1024 &&
            !sidebar.contains(event.target) &&
            !sidebarToggle.contains(event.target)) {
            sidebar.classList.add('sidebar-hidden');
        }

        // Close custom date picker when clicking outside
        if (customDatePicker && !customDatePicker.contains(event.target) && 
            !event.target.closest('[data-interval="custom"]')) {
            customDatePicker.classList.add('hidden');
        }
    });

    // Form submissions
    document.addEventListener('submit', function(e) {
        if (e.target.id === 'createUserForm') {
            e.preventDefault();
            handleCreateUser(e);
        } else if (e.target.id === 'addGuidelineForm') {
            e.preventDefault();
            handleAddGuideline(e);
        } else if (e.target.id === 'inflowwUploadForm') {
            e.preventDefault();
            handleInflowwUpload(e);
        } else if (e.target.id === 'messagesUploadForm') {
            e.preventDefault();
            handleMessagesUpload(e);
        }
    });

    // AI Analysis buttons
    document.addEventListener('click', function(e) {
        if (e.target.id === 'runAgencyAnalysis') {
            runAgencyAnalysis();
        } else if (e.target.id === 'runChatterAnalysis') {
            runChatterAnalysis();
        }
    });
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const reportDateEl = document.getElementById('reportDate');
    if (reportDateEl) {
        reportDateEl.value = today;
    }

    // Set default dates for custom picker
    const customStartDate = document.getElementById('customStartDate');
    const customEndDate = document.getElementById('customEndDate');
    if (customStartDate && customEndDate) {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        customStartDate.value = weekAgo.toISOString().split('T')[0];
        customEndDate.value = today;
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
            // Clear the form
            document.getElementById('createAccountForm').querySelector('form').reset();
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
    let targetSection = document.getElementById(sectionId);
    if (!targetSection) {
        // Create section dynamically if it doesn't exist
        targetSection = createSection(sectionId);
    }
    
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    const activeLink = document.querySelector(`[onclick="showSection('${sectionId}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.add('sidebar-hidden');
    }

    // Load section-specific data
    loadSectionData(sectionId);
}

function createSection(sectionId) {
    const main = document.querySelector('main');
    const section = document.createElement('div');
    section.id = sectionId;
    section.className = 'section hidden p-8';
    
    switch(sectionId) {
        case 'analytics':
            section.innerHTML = createAnalyticsSection();
            break;
        case 'ai-analysis':
            section.innerHTML = createAIAnalysisSection();
            break;
        case 'data-upload':
            section.innerHTML = createDataUploadSection();
            break;
        case 'guidelines':
            section.innerHTML = createGuidelinesSection();
            break;
        case 'team-management':
            section.innerHTML = createTeamManagementSection();
            break;
        case 'settings':
            section.innerHTML = createSettingsSection();
            break;
        case 'chatter-dashboard':
            section.innerHTML = createChatterDashboardSection();
            break;
        case 'daily-report':
            section.innerHTML = createDailyReportSection();
            break;
        case 'my-performance':
            section.innerHTML = createMyPerformanceSection();
            break;
        case 'team-comparison':
            section.innerHTML = createTeamComparisonSection();
            break;
        default:
            section.innerHTML = '<h2 class="text-2xl font-bold mb-4">Section Coming Soon</h2>';
    }
    
    main.appendChild(section);
    return section;
}

function loadSectionData(sectionId) {
    switch(sectionId) {
        case 'team-management':
            loadUsers();
            break;
        case 'guidelines':
            loadGuidelines();
            break;
        case 'ai-analysis':
            loadChattersForAnalysis();
            break;
        default:
            break;
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('sidebar-hidden');
}

// Time interval functions
function setTimeInterval(interval) {
    currentTimeInterval = interval;
    customDateRange = null;

    // Update button states
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });

    const activeBtn = document.querySelector(`[data-interval="${interval}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-700', 'text-gray-300');
        activeBtn.classList.add('bg-blue-600', 'text-white');
    }

    // Reload data with new time interval
    if (currentUser && currentUser.role === 'manager') {
        loadDashboardData();
        loadAIRecommendations();
    }
}

function toggleCustomDatePicker() {
    const picker = document.getElementById('customDatePicker');
    picker.classList.toggle('hidden');
}

function applyCustomDateRange() {
    const startDate = document.getElementById('customStartDate').value;
    const endDate = document.getElementById('customEndDate').value;
    
    if (startDate && endDate && startDate <= endDate) {
        customDateRange = { start: startDate, end: endDate };
        currentTimeInterval = 'custom';
        
        // Update custom button to show it's active
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-300');
        });
        
        const customBtn = document.querySelector('[data-interval="custom"]');
        customBtn.classList.remove('bg-gray-700', 'text-gray-300');
        customBtn.classList.add('bg-blue-600', 'text-white');
        
        closeCustomDatePicker();
        
        // Reload data
        if (currentUser && currentUser.role === 'manager') {
            loadDashboardData();
            loadAIRecommendations();
        }
        
        showNotification('Custom date range applied', 'success');
    } else {
        showError('Please select valid start and end dates');
    }
}

function closeCustomDatePicker() {
    document.getElementById('customDatePicker').classList.add('hidden');
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

async function loadDashboardData() {
    try {
        // Simulate loading analytics data
        const mockData = {
            totalRevenue: 12450,
            totalSubs: 1234,
            profileClicks: 8765,
            messagesSent: 2341,
            ppvsSent: 156,
            ppvsUnlocked: 89,
            avgResponseTime: 3.2
        };

        updateDashboardMetrics(mockData);
        
        // Load charts
        loadRevenueChart();
        loadPerformanceChart();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function updateDashboardMetrics(data) {
    document.getElementById('totalRevenue').textContent = `$${data.totalRevenue.toLocaleString()}`;
    document.getElementById('totalSubs').textContent = data.totalSubs.toLocaleString();
    document.getElementById('profileClicks').textContent = data.profileClicks.toLocaleString();
    document.getElementById('messagesSent').textContent = data.messagesSent.toLocaleString();
    document.getElementById('ppvsSent').textContent = data.ppvsSent.toLocaleString();
    document.getElementById('avgResponseTime').textContent = `${data.avgResponseTime}m`;

    // Calculate unlock rate
    const unlockRate = data.ppvsSent > 0 ? (data.ppvsUnlocked / data.ppvsSent * 100).toFixed(1) : '0';
    document.getElementById('unlockRate').textContent = `${unlockRate}% unlock rate`;

    // Update change indicators (mock data)
    document.getElementById('revenueChange').textContent = '+12.5%';
    document.getElementById('subsChange').textContent = '+8.3%';
    document.getElementById('clicksChange').textContent = '+15.2%';
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
        } else {
            // Fallback to mock recommendations
            const mockRecommendations = [
                {
                    description: 'Response time averaging 3.2 minutes is good, but could be improved. Target under 2 minutes for optimal engagement.',
                    expectedImpact: '10-15% increase in conversion rates'
                },
                {
                    description: 'PPV unlock rate at 57% is above average. Consider testing higher-value content to maximize revenue per unlock.',
                    expectedImpact: '$200-400 additional monthly revenue'
                }
            ];
            updateAIRecommendations(mockRecommendations);
        }
    } catch (error) {
        console.error('Error loading AI recommendations:', error);
        // Show fallback recommendations
        updateAIRecommendations([
            {
                description: 'Unable to load AI recommendations. Check your internet connection.',
                expectedImpact: 'System maintenance'
            }
        ]);
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

// Chart functions
function loadRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Revenue',
                data: [1200, 1900, 800, 1500, 2000, 1700, 1300],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e7eb'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                y: {
                    ticks: {
                        color: '#9ca3af'
                    }
                }
            }
        }
    });
}

function loadPerformanceChart() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Messages', 'PPVs', 'Tips'],
            datasets: [{
                data: [60, 25, 15],
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e7eb'
                    }
                }
            }
        }
    });
}

// Section creation functions
function createAnalyticsSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Detailed Analytics</h2>
            <p class="text-gray-400">Comprehensive performance metrics and insights</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="chart-container">
                <h3 class="text-lg font-semibold mb-4">Revenue Breakdown</h3>
                <canvas id="revenueBreakdownChart" width="400" height="200"></canvas>
            </div>
            <div class="chart-container">
                <h3 class="text-lg font-semibold mb-4">Chatter Performance</h3>
                <canvas id="chatterComparisonChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

function createAIAnalysisSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">AI Analysis</h2>
            <p class="text-gray-400">Intelligent insights and recommendations</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-xl font-semibold mb-4">Agency Performance Analysis</h3>
                <button id="runAgencyAnalysis" class="premium-button text-white font-medium py-3 px-6 rounded-xl mb-4">
                    <i class="fas fa-brain mr-2"></i>Run Analysis
                </button>
                <div id="agencyAnalysisResults" class="space-y-4">
                    <p class="text-gray-400">Click "Run Analysis" to get AI-powered insights</p>
                </div>
            </div>
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-xl font-semibold mb-4">Individual Chatter Analysis</h3>
                <div class="space-y-4">
                    <select id="chatterSelect" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        <option value="">Select Chatter...</option>
                    </select>
                    <button id="runChatterAnalysis" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-user-check mr-2"></i>Analyze Performance
                    </button>
                </div>
                <div id="chatterAnalysisResults" class="mt-4 space-y-4">
                    <p class="text-gray-400">Select a chatter and run analysis</p>
                </div>
            </div>
        </div>
    `;
}

function createDataUploadSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Data Upload</h2>
            <p class="text-gray-400">Upload analytics data and message exports</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-xl font-semibold mb-4">Upload Infloww Data</h3>
                <form id="inflowwUploadForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Select CSV/Excel File</label>
                        <input type="file" id="inflowwFile" accept=".csv,.xlsx,.xls" 
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700">
                    </div>
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-upload mr-2"></i>Upload Data
                    </button>
                </form>
            </div>
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-xl font-semibold mb-4">Upload Message Export</h3>
                <form id="messagesUploadForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Weekly Message CSV</label>
                        <input type="file" id="messagesFile" accept=".csv"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-600 file:text-white hover:file:bg-green-700">
                    </div>
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-upload mr-2"></i>Upload Messages
                    </button>
                </form>
            </div>
        </div>
    `;
}

function createGuidelinesSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Guidelines Management</h2>
            <p class="text-gray-400">Define AI analysis guidelines and standards</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-xl font-semibold mb-4">Add New Guideline</h3>
                <form id="addGuidelineForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Category</label>
                        <select id="guidelineCategory" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                            <option value="messaging">Messaging</option>
                            <option value="sales">Sales Technique</option>
                            <option value="customer_service">Customer Service</option>
                            <option value="compliance">Compliance</option>
                            <option value="grammar">Grammar & Style</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Title</label>
                        <input type="text" id="guidelineTitle" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Description</label>
                        <textarea id="guidelineDescription" rows="3" required
                                  class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                  placeholder="Describe the guideline in detail..."></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Priority (1-10)</label>
                        <input type="number" id="guidelinePriority" min="1" max="10" value="5" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-plus-circle mr-2"></i>Add Guideline
                    </button>
                </form>
            </div>
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-xl font-semibold mb-4">Active Guidelines</h3>
                <div id="guidelinesList" class="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
                    <p class="text-gray-400">No guidelines added yet</p>
                </div>
            </div>
        </div>
    `;
}

function createTeamManagementSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Team Management</h2>
            <p class="text-gray-400">Manage chatter accounts and permissions</p>
        </div>
        <div class="glass-card rounded-xl p-6 mb-8">
            <h3 class="text-xl font-semibold mb-4">Create New Chatter Account</h3>
            <form id="createUserForm" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Chatter Name</label>
                        <input type="text" id="createChatterName" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Username</label>
                        <input type="text" id="createUsername" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Email</label>
                        <input type="email" id="createEmail" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Password</label>
                        <input type="password" id="createPassword" required minlength="6"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                </div>
                <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                    <i class="fas fa-user-plus mr-2"></i>Create Account
                </button>
            </form>
        </div>
        <div class="glass-card rounded-xl p-6">
            <h3 class="text-xl font-semibold mb-4">Team Members</h3>
            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Username</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Chatter Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody id="usersTableBody" class="divide-y divide-gray-700">
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function createSettingsSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Settings</h2>
            <p class="text-gray-400">System configuration and preferences</p>
        </div>
        <div class="glass-card rounded-xl p-6">
            <h3 class="text-xl font-semibold mb-4">System Settings</h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-medium">AI Analysis</h4>
                        <p class="text-sm text-gray-400">Enable AI-powered recommendations</p>
                    </div>
                    <input type="checkbox" id="aiEnabled" checked class="rounded">
                </div>
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-medium">Real-time Updates</h4>
                        <p class="text-sm text-gray-400">Automatic data refresh</p>
                    </div>
                    <input type="checkbox" id="realTimeUpdates" checked class="rounded">
                </div>
            </div>
        </div>
    `;
}

function createChatterDashboardSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">My Dashboard</h2>
            <p class="text-gray-400">Your personal performance overview</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="glass-card rounded-xl p-6 metric-card">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                        <i class="fas fa-comments text-xl text-white"></i>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold" id="chatterMessages">156</div>
                        <div class="text-xs text-gray-400">Messages Sent</div>
                    </div>
                </div>
            </div>
            <div class="glass-card rounded-xl p-6 metric-card">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl gradient-success flex items-center justify-center">
                        <i class="fas fa-dollar-sign text-xl text-white"></i>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold" id="chatterRevenue">$1,234</div>
                        <div class="text-xs text-gray-400">Revenue Generated</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createDailyReportSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Daily Report</h2>
            <p class="text-gray-400">Submit your daily performance data</p>
        </div>
        <div class="glass-card rounded-xl p-6">
            <form id="dailyReportForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium mb-2">Date</label>
                        <input type="date" id="reportDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Shift</label>
                        <select id="reportShift" required
                                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                            <option value="">Select shift...</option>
                            <option value="morning">Morning (6AM-2PM)</option>
                            <option value="afternoon">Afternoon (2PM-10PM)</option>
                            <option value="evening">Evening (10PM-2AM)</option>
                            <option value="night">Night (2AM-6AM)</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium mb-2">Fans Chatted With</label>
                        <input type="number" id="fansChatted" min="0"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Avg Response Time (minutes)</label>
                        <input type="number" id="avgResponseTimeInput" min="0" step="0.1"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                </div>
                <div class="border-t border-gray-700 pt-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">PPV Sales</h3>
                        <button type="button" id="addPPVSale" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm">
                            <i class="fas fa-plus mr-1"></i>Add Sale
                        </button>
                    </div>
                    <div id="ppvSalesContainer" class="space-y-3">
                    </div>
                </div>
                <div class="border-t border-gray-700 pt-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Tips</h3>
                        <button type="button" id="addTip" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                            <i class="fas fa-plus mr-1"></i>Add Tip
                        </button>
                    </div>
                    <div id="tipsContainer" class="space-y-3">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Notes (optional)</label>
                    <textarea id="reportNotes" rows="3"
                              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                              placeholder="Any additional notes about your shift..."></textarea>
                </div>
                <div class="flex justify-end">
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-save mr-2"></i>Save Report
                    </button>
                </div>
            </form>
        </div>
    `;
}

function createMyPerformanceSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">My Performance</h2>
            <p class="text-gray-400">Track your individual metrics and progress</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="chart-container">
                <h3 class="text-lg font-semibold mb-4">My Revenue Trend</h3>
                <canvas id="myRevenueChart" width="400" height="200"></canvas>
            </div>
            <div class="chart-container">
                <h3 class="text-lg font-semibold mb-4">Performance Score</h3>
                <canvas id="myScoreChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

function createTeamComparisonSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Team Comparison</h2>
            <p class="text-gray-400">See how you compare with other team members</p>
        </div>
        <div class="glass-card rounded-xl p-6">
            <h3 class="text-lg font-semibold mb-4">Team Leaderboard</h3>
            <div id="teamLeaderboard" class="space-y-3">
                <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm font-bold text-black">1</div>
                        <span>Top Performer</span>
                    </div>
                    <span class="text-green-400">$2,450</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-sm font-bold">2</div>
                        <span>You</span>
                    </div>
                    <span class="text-blue-400">$1,850</span>
                </div>
            </div>
        </div>
    `;
}

// Form handlers
async function handleCreateUser(event) {
    const userData = {
        username: document.getElementById('createUsername').value,
        email: document.getElementById('createEmail').value,
        password: document.getElementById('createPassword').value,
        role: 'chatter',
        chatterName: document.getElementById('createChatterName').value
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
            loadUsers();
        } else {
            showError(result.error || 'Failed to create user');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleAddGuideline(event) {
    const guidelineData = {
        category: document.getElementById('guidelineCategory').value,
        title: document.getElementById('guidelineTitle').value,
        description: document.getElementById('guidelineDescription').value,
        priority: parseInt(document.getElementById('guidelinePriority').value)
    };

    showLoading(true);

    try {
        const response = await fetch('/api/guidelines', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(guidelineData)
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('Guideline added successfully!', 'success');
            document.getElementById('addGuidelineForm').reset();
            document.getElementById('guidelinePriority').value = '5';
            loadGuidelines();
        } else {
            showError(result.error || 'Failed to add guideline');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function loadGuidelines() {
    try {
        const response = await fetch('/api/guidelines', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const guidelines = await response.json();
            updateGuidelinesList(guidelines);
        }
    } catch (error) {
        console.error('Error loading guidelines:', error);
    }
}

function updateGuidelinesList(guidelines) {
    const container = document.getElementById('guidelinesList');
    if (!container) return;

    if (!guidelines || guidelines.length === 0) {
        container.innerHTML = '<p class="text-gray-400">No guidelines added yet</p>';
        return;
    }

    container.innerHTML = guidelines.map(guideline => `
        <div class="p-4 bg-gray-800/50 rounded-lg">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/30 text-blue-400">
                            ${guideline.category}
                        </span>
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-purple-900/30 text-purple-400">
                            Priority: ${guideline.priority}
                        </span>
                    </div>
                    <h4 class="font-semibold text-white mb-1">${guideline.title}</h4>
                    <p class="text-sm text-gray-300">${guideline.description}</p>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadChattersForAnalysis() {
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const users = await response.json();
            const chatters = users.filter(user => user.role === 'chatter');
            
            const select = document.getElementById('chatterSelect');
            if (select) {
                select.innerHTML = '<option value="">Select Chatter...</option>' +
                    chatters.map(chatter => 
                        `<option value="${chatter._id}">${chatter.chatterName || chatter.username}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading chatters:', error);
    }
}

async function runAgencyAnalysis() {
    const resultsContainer = document.getElementById('agencyAnalysisResults');
    if (!resultsContainer) return;

    showLoading(true);
    resultsContainer.innerHTML = '<div class="animate-pulse"><div class="h-4 bg-gray-700 rounded w-3/4 mb-2"></div><div class="h-4 bg-gray-700 rounded w-1/2"></div></div>';

    try {
        // Simulate AI analysis
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const analysis = {
            overallScore: 78,
            insights: [
                'Revenue trending upward with 12.5% growth this period',
                'Response times are competitive at 3.2 minutes average',
                'PPV unlock rate of 57% is above industry average',
                'Opportunity to improve profile click-to-subscription conversion'
            ],
            recommendations: [
                'Focus on reducing response time to under 2 minutes',
                'Test higher-value PPV content to increase revenue per unlock',
                'Implement A/B testing for profile optimization'
            ]
        };

        resultsContainer.innerHTML = `
            <div class="space-y-4">
                <div class="flex items-center space-x-3">
                    <div class="text-3xl font-bold text-green-400">${analysis.overallScore}</div>
                    <div>
                        <div class="font-semibold">Overall Performance Score</div>
                        <div class="text-sm text-gray-400">Above average (75+)</div>
                    </div>
                </div>
                
                <div>
                    <h4 class="font-semibold mb-2 text-blue-400">Key Insights:</h4>
                    <ul class="space-y-1">
                        ${analysis.insights.map(insight => 
                            `<li class="text-sm text-gray-300 flex items-start">
                                <i class="fas fa-check text-green-400 mr-2 mt-0.5 text-xs"></i>
                                ${insight}
                            </li>`
                        ).join('')}
                    </ul>
                </div>
                
                <div>
                    <h4 class="font-semibold mb-2 text-yellow-400">Recommendations:</h4>
                    <ul class="space-y-1">
                        ${analysis.recommendations.map(rec => 
                            `<li class="text-sm text-gray-300 flex items-start">
                                <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-0.5 text-xs"></i>
                                ${rec}
                            </li>`
                        ).join('')}
                    </ul>
                </div>
            </div>
        `;
    } catch (error) {
        resultsContainer.innerHTML = '<p class="text-red-400">Error running analysis. Please try again.</p>';
    } finally {
        showLoading(false);
    }
}

async function runChatterAnalysis() {
    const chatterId = document.getElementById('chatterSelect').value;
    const resultsContainer = document.getElementById('chatterAnalysisResults');
    
    if (!chatterId) {
        showError('Please select a chatter first');
        return;
    }
    
    if (!resultsContainer) return;

    showLoading(true);
    resultsContainer.innerHTML = '<div class="animate-pulse"><div class="h-4 bg-gray-700 rounded w-3/4 mb-2"></div><div class="h-4 bg-gray-700 rounded w-1/2"></div></div>';

    try {
        // Simulate individual chatter analysis
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const analysis = {
            score: 82,
            strengths: [
                'Excellent response time (2.1 minutes)',
                'High message engagement rate',
                'Strong PPV conversion skills'
            ],
            improvements: [
                'Could increase variety in conversation starters',
                'Opportunity to upsell more premium content'
            ]
        };

        resultsContainer.innerHTML = `
            <div class="space-y-4">
                <div class="flex items-center space-x-3">
                    <div class="text-3xl font-bold text-green-400">${analysis.score}</div>
                    <div>
                        <div class="font-semibold">Performance Score</div>
                        <div class="text-sm text-gray-400">Excellent (80+)</div>
                    </div>
                </div>
                
                <div>
                    <h4 class="font-semibold mb-2 text-green-400">Strengths:</h4>
                    <ul class="space-y-1">
                        ${analysis.strengths.map(strength => 
                            `<li class="text-sm text-gray-300 flex items-start">
                                <i class="fas fa-plus text-green-400 mr-2 mt-0.5 text-xs"></i>
                                ${strength}
                            </li>`
                        ).join('')}
                    </ul>
                </div>
                
                <div>
                    <h4 class="font-semibold mb-2 text-orange-400">Areas for Improvement:</h4>
                    <ul class="space-y-1">
                        ${analysis.improvements.map(improvement => 
                            `<li class="text-sm text-gray-300 flex items-start">
                                <i class="fas fa-arrow-up text-orange-400 mr-2 mt-0.5 text-xs"></i>
                                ${improvement}
                            </li>`
                        ).join('')}
                    </ul>
                </div>
            </div>
        `;
    } catch (error) {
        resultsContainer.innerHTML = '<p class="text-red-400">Error running analysis. Please try again.</p>';
    } finally {
        showLoading(false);
    }
}

// File upload handlers
async function handleInflowwUpload(event) {
    const file = document.getElementById('inflowwFile').files[0];
    if (!file) {
        showError('Please select a file first');
        return;
    }

    const formData = new FormData();
    formData.append('inflowwData', file);

    showLoading(true);

    try {
        const response = await fetch('/api/upload/infloww', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('Infloww data uploaded successfully!', 'success');
            document.getElementById('inflowwUploadForm').reset();
        } else {
            showError(result.error || 'Failed to upload data');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleMessagesUpload(event) {
    const file = document.getElementById('messagesFile').files[0];
    if (!file) {
        showError('Please select a file first');
        return;
    }

    const formData = new FormData();
    formData.append('messages', file);

    showLoading(true);

    try {
        const response = await fetch('/api/upload/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('Message data uploaded successfully!', 'success');
            document.getElementById('messagesUploadForm').reset();
        } else {
            showError(result.error || 'Failed to upload messages');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Daily report functions
function addPPVSaleField() {
    const container = document.getElementById('ppvSalesContainer');
    if (!container) return;

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
    if (!container) return;

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

    const data = {
        date: document.getElementById('reportDate').value,
        shift: document.getElementById('reportShift').value,
        fansChatted: parseInt(document.getElementById('fansChatted').value) || 0,
        avgResponseTime: parseFloat(document.getElementById('avgResponseTimeInput').value) || 0,
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
    if (overlay) {
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const icon = document.getElementById('notificationIcon');
    const messageEl = document.getElementById('notificationMessage');

    if (!notification || !icon || !messageEl) return;

    messageEl.textContent = message;

    // Set icon and color based on type
    switch (type) {
        case 'success':
            icon.className = 'fas fa-check-circle text-green-400 text-xl';
            notification.className = 'fixed top-4 right-4 max-w-sm w-full z-50 glass-card rounded-xl border border-green-500/30 p-4';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle text-red-400 text-xl';
            notification.className = 'fixed top-4 right-4 max-w-sm w-full z-50 glass-card rounded-xl border border-red-500/30 p-4';
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle text-yellow-400 text-xl';
            notification.className = 'fixed top-4 right-4 max-w-sm w-full z-50 glass-card rounded-xl border border-yellow-500/30 p-4';
            break;
        default:
            icon.className = 'fas fa-info-circle text-blue-400 text-xl';
            notification.className = 'fixed top-4 right-4 max-w-sm w-full z-50 glass-card rounded-xl border border-blue-500/30 p-4';
    }

    notification.classList.remove('hidden');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

function hideNotification() {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.classList.add('hidden');
    }
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
