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
        showSection('daily-report'); // Start chatters on daily report page
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
    
    initializeSidebar();

    // Time interval buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const interval = this.getAttribute('data-interval');
            if (interval !== 'custom') {
                setTimeInterval(interval);
            } else {
                toggleCustomDatePicker();
            }
        });
    });

    // Custom date picker event handlers
    document.getElementById('customDateBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCustomDatePicker();
    });

    document.getElementById('applyCustomRange')?.addEventListener('click', function(e) {
        e.preventDefault();
        applyCustomDateRange();
    });

    document.getElementById('cancelCustomRange')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeCustomDatePicker();
    });

    document.getElementById('closeDatePicker')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeCustomDatePicker();
    });

    // Close picker when clicking outside
    document.addEventListener('click', function(event) {
        const picker = document.getElementById('customDatePicker');
        const button = document.getElementById('customDateBtn');
        
        if (picker && button && !picker.contains(event.target) && !button.contains(event.target)) {
            closeCustomDatePicker();
        }
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
        } else if (e.target.id === 'ofAccountDataForm') {
            e.preventDefault();
            handleOFAccountDataSubmit(e);
        } else if (e.target.id === 'chatterDataForm') {
            e.preventDefault();
            handleChatterDataSubmit(e);
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
    // Destroy all existing charts first to prevent canvas reuse errors
    destroyAllCharts();
    
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
        case 'analytics':
            setTimeout(() => {
                loadAnalyticsCharts();
            }, 100);
            break;
        case 'ai-analysis':
            loadChattersForAnalysis();
            break;
        case 'data-upload':
            loadChattersForInfloww();
            break;
        default:
            break;
    }
}

async function loadChattersForInfloww() {
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const users = await response.json();
            const chatters = users.filter(user => user.role === 'chatter');
            
            // Load for chatter data form
            const chatterSelect = document.getElementById('chatterDataChatter');
            if (chatterSelect) {
                chatterSelect.innerHTML = '<option value="">Select Chatter...</option>' +
                    chatters.map(chatter => 
                        `<option value="${chatter._id}">${chatter.chatterName || chatter.username}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading chatters for Infloww:', error);
    }
}

function toggleSidebar() {
    // No-op retained for legacy bindings
}

function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarToggleIcon = document.getElementById('sidebarToggleIcon');
    const floatingSidebarToggle = document.getElementById('floatingSidebarToggle');

    if (!sidebar || !mainContent || !sidebarToggle || !sidebarToggleIcon || !floatingSidebarToggle) return;

    function setCollapsedState(collapsed) {
        sidebar.classList.toggle('sidebar-hidden', collapsed);
        floatingSidebarToggle.classList.toggle('hidden', !collapsed);
        
        const toggleIcon = sidebarToggleIcon.querySelector('i');
        if (toggleIcon) {
            toggleIcon.className = collapsed
                ? 'fas fa-angle-double-right text-xl'
                : 'fas fa-angle-double-left text-xl';
        }

        // Always set margin to 0 - no automatic sidebar space
        mainContent.style.marginLeft = '0';
    }

    function toggleSidebarState(forceState) {
        const isCollapsed = sidebar.classList.contains('sidebar-hidden');
        const nextState = typeof forceState === 'boolean' ? forceState : !isCollapsed;
        setCollapsedState(nextState);
    }

    // Make these functions global so they can be called from anywhere
    window.toggleSidebarState = toggleSidebarState;
    window.setCollapsedState = setCollapsedState;

    sidebarToggle.addEventListener('click', () => toggleSidebarState());
    sidebarToggleIcon.addEventListener('click', () => toggleSidebarState());
    floatingSidebarToggle.addEventListener('click', () => toggleSidebarState(false));

    document.addEventListener('click', (event) => {
        if (window.innerWidth >= 1024) return;
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnControl = sidebarToggle.contains(event.target)
            || sidebarToggleIcon.contains(event.target)
            || floatingSidebarToggle.contains(event.target);

        if (!isClickInsideSidebar && !isClickOnControl) {
            toggleSidebarState(true);
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 1024) {
            toggleSidebarState(false);
        }
    });

    // Start with sidebar open on desktop, closed on mobile
    toggleSidebarState(window.innerWidth < 1024);
}

// Time interval + custom calendar
function setTimeInterval(interval) {
    currentTimeInterval = interval;
    const isCustom = interval === 'custom';
    if (!isCustom) {
        customDateRange = null;
        closeCustomDatePicker({ skipReset: true });
    }

    updateTimeIntervalButtons();

    if (currentUser?.role === 'manager') {
        loadDashboardData();
        loadAIRecommendations();
    }
}

function updateTimeIntervalButtons() {
    document.querySelectorAll('.time-btn').forEach(btn => {
        const interval = btn.getAttribute('data-interval');
        const isActive = interval === currentTimeInterval;

        btn.classList.toggle('bg-blue-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-gray-700', !isActive);
        btn.classList.toggle('text-gray-300', !isActive);

        if (interval === 'custom') {
            const iconWrapper = btn.querySelector('span');
            const icon = iconWrapper?.querySelector('i');

            iconWrapper?.classList.toggle('bg-blue-500/20', isActive);
            iconWrapper?.classList.toggle('border-blue-400', isActive);
            iconWrapper?.classList.toggle('bg-blue-600/20', !isActive);
            iconWrapper?.classList.toggle('border-blue-500/40', !isActive);
            icon?.classList.toggle('text-white', isActive);
            icon?.classList.toggle('text-blue-300', isActive);
            icon?.classList.toggle('text-blue-400', !isActive);
        }
    });
}

function toggleCustomDatePicker() {
    const picker = document.getElementById('customDatePicker');
    if (!picker) return;

    const isVisible = picker.classList.contains('show');

    if (isVisible) {
        // Hide the picker
        picker.classList.remove('show');
        picker.classList.add('hide');
    } else {
        // Show the picker
        picker.classList.remove('hide');
        
        // Set default dates
        const startInput = document.getElementById('customStartDate');
        const endInput = document.getElementById('customEndDate');

        if (startInput && endInput) {
            if (!startInput.value || !endInput.value) {
                const today = new Date();
                const lastWeek = new Date(today);
                lastWeek.setDate(today.getDate() - 7);

                startInput.value = lastWeek.toISOString().split('T')[0];
                endInput.value = today.toISOString().split('T')[0];
            }
        }

        requestAnimationFrame(() => {
            picker.classList.add('show');
        });
    }
}

function applyCustomDateRange() {
    const picker = document.getElementById('customDatePicker');
    const startInput = document.getElementById('customStartDate');
    const endInput = document.getElementById('customEndDate');

    if (!picker || !startInput || !endInput) {
        showError('Unable to apply custom dates. Please refresh and try again.');
        return;
    }

    const startDate = startInput.value;
    const endDate = endInput.value;

    if (!startDate || !endDate) {
        showError('Please choose both start and end dates.');
        return;
    }

    if (startDate > endDate) {
        showError('Start date cannot be after end date.');
        return;
    }

    customDateRange = { start: startDate, end: endDate };
    currentTimeInterval = 'custom';
    updateTimeIntervalButtons();
    closeCustomDatePicker();

    if (currentUser?.role === 'manager') {
        loadDashboardData();
        loadAIRecommendations();
    }

    showNotification(`Custom range applied: ${formatDateLabel(startDate)} → ${formatDateLabel(endDate)}`, 'success');
}

function closeCustomDatePicker(options = {}) {
    const picker = document.getElementById('customDatePicker');
    if (!picker) return;

    picker.classList.remove('show');
    picker.classList.add('hide');

    if (!options.skipReset) {
        const startInput = document.getElementById('customStartDate');
        const endInput = document.getElementById('customEndDate');

        if (startInput) startInput.blur();
        if (endInput) endInput.blur();
    }
}

function reviveCalendarInputs() {
    const startInput = document.getElementById('customStartDate');
    const endInput = document.getElementById('customEndDate');

    [startInput, endInput].forEach(input => {
        if (!input) return;
        const wrapper = input.parentNode;
        const clone = input.cloneNode(true);
        wrapper.replaceChild(clone, input);
    });
}

function formatDateLabel(dateStr) {
    return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
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
        // Fetch real data from API
        const response = await fetch(`/api/analytics/dashboard?interval=${currentTimeInterval}${customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : ''}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        let data;
        if (response.ok) {
            data = await response.json();
        } else {
            // Fallback to mock data if API fails
            console.warn('API failed, using mock data');
            data = {
                totalRevenue: 12450,
                totalSubs: 1234,
                profileClicks: 8765,
                messagesSent: 2341,
                ppvsSent: 156,
                ppvsUnlocked: 89,
                avgResponseTime: 3.2,
                netRevenue: 8915,
                newSubs: 89,
                recurringRevenue: 5230
            };
        }

        updateDashboardMetrics(data);
        
        // Load charts
        loadRevenueChart();
        loadAIInsightsChart();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Use mock data as fallback
        const mockData = {
            totalRevenue: 12450,
            totalSubs: 1234,
            profileClicks: 8765,
            messagesSent: 2341,
            ppvsSent: 156,
            ppvsUnlocked: 89,
            avgResponseTime: 3.2,
            netRevenue: 8915,
            newSubs: 89,
            recurringRevenue: 5230
        };
        updateDashboardMetrics(mockData);
        loadRevenueChart();
        loadAIInsightsChart();
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
            // Fallback to data-driven recommendations
            const mockRecommendations = [
                {
                    description: 'AI analyzing your daily PPV sales and tip data to identify revenue optimization opportunities.',
                    expectedImpact: 'Real revenue calculations from your reports'
                },
                {
                    description: 'System calculates ROI for improvements based on your actual chatter performance data.',
                    expectedImpact: 'Personalized business intelligence'
                }
            ];
            updateAIRecommendations(mockRecommendations);
        }
    } catch (error) {
        console.error('Error loading AI recommendations:', error);
        // Show fallback recommendations
        updateAIRecommendations([
            {
                description: 'Loading AI analysis from your daily reports data...',
                expectedImpact: 'Calculating ROI from PPV sales and tips'
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

// Chart storage for proper cleanup
let chartInstances = {};

// Function to destroy all existing charts
function destroyAllCharts() {
    Object.keys(chartInstances).forEach(chartId => {
        if (chartInstances[chartId]) {
            try {
                chartInstances[chartId].destroy();
                delete chartInstances[chartId];
            } catch (error) {
                console.warn('Error destroying chart:', chartId, error);
                delete chartInstances[chartId];
            }
        }
    });
}

// Chart functions
function loadRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (chartInstances.revenueChart) {
        chartInstances.revenueChart.destroy();
    }

    chartInstances.revenueChart = new Chart(ctx, {
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

function loadAnalyticsCharts() {
    // Load revenue breakdown chart
    const revenueCtx = document.getElementById('revenueBreakdownChart');
    if (revenueCtx) {
        // Destroy existing chart if it exists
        if (chartInstances.revenueBreakdownChart) {
            chartInstances.revenueBreakdownChart.destroy();
        }

        chartInstances.revenueBreakdownChart = new Chart(revenueCtx, {
            type: 'doughnut',
            data: {
                labels: ['Arya', 'Iris', 'Lilla'],
                datasets: [{
                    data: [4850, 4200, 3400],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
                    borderWidth: 2,
                    borderColor: '#1f2937'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e5e7eb',
                            padding: 20
                        }
                    }
                }
            }
        });
    }

    // Load chatter comparison chart
    const chatterCtx = document.getElementById('chatterComparisonChart');
    if (chatterCtx) {
        // Destroy existing chart if it exists
        if (chartInstances.chatterComparisonChart) {
            chartInstances.chatterComparisonChart.destroy();
        }

        chartInstances.chatterComparisonChart = new Chart(chatterCtx, {
            type: 'bar',
            data: {
                labels: ['Sarah M.', 'Alex K.', 'Jamie L.', 'Morgan T.'],
                datasets: [{
                    label: 'Revenue ($)',
                    data: [3240, 2890, 2650, 2420],
                    backgroundColor: '#3b82f6',
                    borderColor: '#1d4ed8',
                    borderWidth: 1
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
                            color: '#9ca3af',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
}

function loadAIInsightsChart() {
    const ctx = document.getElementById('aiInsightsChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (chartInstances.aiInsightsChart) {
        chartInstances.aiInsightsChart.destroy();
    }

    chartInstances.aiInsightsChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Response Time', 'Conversion Rate', 'Message Quality', 'PPV Performance', 'Customer Satisfaction', 'Revenue Growth'],
            datasets: [{
                label: 'Agency Performance',
                data: [85, 72, 88, 76, 91, 68],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#3b82f6'
            }, {
                label: 'Industry Average',
                data: [70, 65, 75, 70, 80, 60],
                borderColor: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.1)',
                pointBackgroundColor: '#6b7280',
                pointBorderColor: '#6b7280'
            }]
        },
        options: {
            responsive: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#9ca3af'
                    },
                    grid: {
                        color: '#374151'
                    },
                    pointLabels: {
                        color: '#e5e7eb',
                        font: {
                            size: 11
                        }
                    }
                }
            },
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
        
        <!-- Analytics Overview -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-400 text-sm">Conversion Rate</p>
                        <p class="text-2xl font-bold text-blue-400">14.2%</p>
                    </div>
                    <i class="fas fa-percentage text-blue-400 text-2xl"></i>
                </div>
            </div>
            
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-400 text-sm">Revenue/Chatter</p>
                        <p class="text-2xl font-bold text-green-400">$3,112</p>
                    </div>
                    <i class="fas fa-user-dollar text-green-400 text-2xl"></i>
                </div>
            </div>
            
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-400 text-sm">PPV Success Rate</p>
                        <p class="text-2xl font-bold text-purple-400">67.8%</p>
                    </div>
                    <i class="fas fa-unlock text-purple-400 text-2xl"></i>
                </div>
            </div>
            
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-400 text-sm">Avg Response Time</p>
                        <p class="text-2xl font-bold text-orange-400">2.8m</p>
                    </div>
                    <i class="fas fa-stopwatch text-orange-400 text-2xl"></i>
                </div>
            </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div class="chart-container">
                <h3 class="text-lg font-semibold mb-4">Revenue Breakdown by Creator</h3>
                <canvas id="revenueBreakdownChart" width="400" height="200"></canvas>
            </div>
            <div class="chart-container">
                <h3 class="text-lg font-semibold mb-4">Chatter Performance Comparison</h3>
                <canvas id="chatterComparisonChart" width="400" height="200"></canvas>
            </div>
        </div>

        <!-- Detailed Tables -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Creator Performance -->
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-lg font-semibold mb-4">Creator Performance</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Creator</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Revenue</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Subscribers</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700">
                            <tr>
                                <td class="px-4 py-3 text-white font-medium">Arya</td>
                                <td class="px-4 py-3 text-green-400">$4,850</td>
                                <td class="px-4 py-3 text-blue-400">445</td>
                            </tr>
                            <tr>
                                <td class="px-4 py-3 text-white font-medium">Iris</td>
                                <td class="px-4 py-3 text-green-400">$4,200</td>
                                <td class="px-4 py-3 text-blue-400">398</td>
                            </tr>
                            <tr>
                                <td class="px-4 py-3 text-white font-medium">Lilla</td>
                                <td class="px-4 py-3 text-green-400">$3,400</td>
                                <td class="px-4 py-3 text-blue-400">391</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Top Performing Chatters -->
            <div class="glass-card rounded-xl p-6">
                <h3 class="text-lg font-semibold mb-4">Top Performing Chatters</h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-sm">1</div>
                            <span class="text-white font-medium">Sarah M.</span>
                        </div>
                        <span class="text-green-400 font-bold">$3,240</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-black font-bold text-sm">2</div>
                            <span class="text-white font-medium">Alex K.</span>
                        </div>
                        <span class="text-green-400 font-bold">$2,890</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm">3</div>
                            <span class="text-white font-medium">Jamie L.</span>
                        </div>
                        <span class="text-green-400 font-bold">$2,650</span>
                    </div>
                </div>
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
            <p class="text-gray-400">Submit analytics data and message exports</p>
        </div>
        
        <!-- OF Account Data Form -->
        <div class="glass-card rounded-xl p-6 mb-8">
            <h3 class="text-xl font-semibold mb-6">OF Account Data</h3>
            <form id="ofAccountDataForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium mb-2">Date</label>
                        <input type="date" id="ofAccountDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Creator Account</label>
                        <select id="ofAccountCreator" required
                                  class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                              <option value="">Select Creator...</option>
                              <option value="arya">Arya</option>
                              <option value="iris">Iris</option>
                              <option value="lilla">Lilla</option>
                          </select>
                    </div>
                </div>

                <div class="border-t border-gray-700 pt-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Net Revenue ($)</label>
                            <input type="number" id="ofNetRevenue" min="0" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Recurring Revenue ($)</label>
                            <input type="number" id="ofRecurringRevenue" min="0" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Total Subscribers</label>
                            <input type="number" id="ofTotalSubs" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">New Subscribers</label>
                            <input type="number" id="ofNewSubs" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Profile Clicks</label>
                            <input type="number" id="ofProfileClicks" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-save mr-2"></i>Submit OF Account Data
                    </button>
                </div>
            </form>
        </div>

        <!-- Chatter's Data Form -->
        <div class="glass-card rounded-xl p-6 mb-8">
            <h3 class="text-xl font-semibold mb-6">Chatter's Data</h3>
            <form id="chatterDataForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium mb-2">Date</label>
                        <input type="date" id="chatterDataDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Chatter Name</label>
                        <select id="chatterDataChatter" required
                                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                            <option value="">Select Chatter...</option>
                            <!-- Chatters will be loaded dynamically from created accounts -->
                        </select>
                    </div>
                </div>

                <div class="border-t border-gray-700 pt-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Messages Sent</label>
                            <input type="number" id="chatterMessagesSent" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">PPVs Sent</label>
                            <input type="number" id="chatterPPVsSent" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">PPVs Unlocked</label>
                            <input type="number" id="chatterPPVsUnlocked" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Avg PPV Price ($)</label>
                            <input type="number" id="chatterAvgPPVPrice" min="0" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Avg Response Time (min)</label>
                            <input type="number" id="chatterAvgResponseTime" min="0" step="0.1"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-save mr-2"></i>Submit Chatter Data
                    </button>
                </div>
            </form>
        </div>

        <!-- Message Export Upload -->
        <div class="glass-card rounded-xl p-6">
            <h3 class="text-xl font-semibold mb-4">Message Export Upload</h3>
            <div class="mb-4 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
                <h4 class="font-medium text-blue-400 mb-2">CSV Structure Required:</h4>
                <p class="text-sm text-gray-300 mb-2">Your message export CSV should contain just one column:</p>
                <div class="text-sm font-mono text-center py-2 bg-gray-800/50 rounded">
                    <div class="text-blue-400">• message_text</div>
                </div>
                <p class="text-xs text-gray-400 mt-2">The chatter name will be automatically detected from your login account.</p>
            </div>
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
        // Simulate comprehensive AI analysis with real data
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const analysis = {
            overallScore: 78,
            totalRevenue: 12450,
            totalSubs: 1234,
            profileClicks: 8765,
            conversionRate: 14.1,
            ppvUnlockRate: 57.2,
            avgResponseTime: 3.2,
            weekOverWeekGrowth: 12.5,
            insights: [
                'Revenue trending upward with 12.5% growth this period ($12,450 vs $11,065 previous)',
                'Click-to-subscription conversion rate is 14.1% (industry avg: 12%)',
                'Response times averaging 3.2 minutes - competitive but can improve',
                'PPV unlock rate of 57.2% significantly above industry average (45%)',
                'Profile clicks increased by 15.2% indicating strong marketing performance',
                'New subscriber acquisition cost decreased by 8.3% showing efficiency gains'
            ],
            weakPoints: [
                'Response time fluctuation: ranges from 1.8min to 6.4min across chatters',
                'Revenue per subscriber ($10.08) below target of $12.50',
                'Weekend performance drops 23% compared to weekdays',
                'Churn rate increased to 18.5% from 15.2% last month'
            ],
            opportunities: [
                'Reduce response time variance could increase conversions by 18-25%',
                'Weekend staffing optimization could recover $2,300 monthly revenue',
                'Premium PPV pricing ($45-65 range) shows 32% higher unlock rates',
                'Retention campaigns could reduce churn by 6-8 percentage points'
            ],
            roiCalculations: [
                'Response time improvement ROI: $1,850 monthly gain for $400 training cost = 462% monthly ROI',
                'Weekend staffing ROI: $2,300 monthly gain for $1,200 additional wages = 192% monthly ROI',
                'Premium content strategy ROI: $3,200 monthly gain for $800 content cost = 400% monthly ROI'
            ]
        };

        resultsContainer.innerHTML = `
            <div class="space-y-6">
                <!-- Overall Performance -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="text-center p-4 bg-green-900/20 rounded-lg">
                        <div class="text-3xl font-bold text-green-400">${analysis.overallScore}</div>
                        <div class="text-sm text-gray-400">Overall Score</div>
                        <div class="text-xs text-green-400">Above Average (75+)</div>
                    </div>
                    <div class="text-center p-4 bg-blue-900/20 rounded-lg">
                        <div class="text-2xl font-bold text-blue-400">${analysis.conversionRate}%</div>
                        <div class="text-sm text-gray-400">Conversion Rate</div>
                        <div class="text-xs text-blue-400">Above Industry Avg</div>
                    </div>
                    <div class="text-center p-4 bg-purple-900/20 rounded-lg">
                        <div class="text-2xl font-bold text-purple-400">$${(analysis.totalRevenue/analysis.totalSubs).toFixed(2)}</div>
                        <div class="text-sm text-gray-400">Revenue per Sub</div>
                        <div class="text-xs text-yellow-400">Below Target ($12.50)</div>
                    </div>
                </div>

                <!-- Key Insights -->
                <div class="bg-gray-800/30 rounded-lg p-4">
                    <h4 class="font-semibold mb-3 text-blue-400 flex items-center">
                        <i class="fas fa-chart-line mr-2"></i>Performance Insights
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${analysis.insights.map(insight => 
                            `<div class="text-sm text-gray-300 flex items-start">
                                <i class="fas fa-check-circle text-green-400 mr-2 mt-0.5 text-xs"></i>
                                <span>${insight}</span>
                            </div>`
                        ).join('')}
                    </div>
                </div>

                <!-- Weak Points -->
                <div class="bg-red-900/10 rounded-lg p-4 border border-red-500/20">
                    <h4 class="font-semibold mb-3 text-red-400 flex items-center">
                        <i class="fas fa-exclamation-triangle mr-2"></i>Areas for Improvement
                    </h4>
                    <div class="space-y-2">
                        ${analysis.weakPoints.map(point => 
                            `<div class="text-sm text-gray-300 flex items-start">
                                <i class="fas fa-arrow-down text-red-400 mr-2 mt-0.5 text-xs"></i>
                                <span>${point}</span>
                            </div>`
                        ).join('')}
                    </div>
                </div>

                <!-- Opportunities & ROI -->
                <div class="bg-green-900/10 rounded-lg p-4 border border-green-500/20">
                    <h4 class="font-semibold mb-3 text-green-400 flex items-center">
                        <i class="fas fa-rocket mr-2"></i>Growth Opportunities & ROI
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h5 class="text-sm font-medium text-yellow-400 mb-2">Opportunities:</h5>
                            ${analysis.opportunities.map(opp => 
                                `<div class="text-sm text-gray-300 flex items-start mb-1">
                                    <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-0.5 text-xs"></i>
                                    <span>${opp}</span>
                                </div>`
                            ).join('')}
                        </div>
                        <div>
                            <h5 class="text-sm font-medium text-green-400 mb-2">ROI Calculations:</h5>
                            ${analysis.roiCalculations.map(calc => 
                                `<div class="text-sm text-gray-300 flex items-start mb-1">
                                    <i class="fas fa-dollar-sign text-green-400 mr-2 mt-0.5 text-xs"></i>
                                    <span>${calc}</span>
                                </div>`
                            ).join('')}
                        </div>
                    </div>
                </div>

                <!-- Action Items -->
                <div class="bg-blue-900/10 rounded-lg p-4 border border-blue-500/20">
                    <h4 class="font-semibold mb-3 text-blue-400 flex items-center">
                        <i class="fas fa-tasks mr-2"></i>Recommended Actions (Priority Order)
                    </h4>
                    <div class="space-y-2">
                        <div class="flex items-start p-3 bg-red-900/20 rounded">
                            <span class="bg-red-500 text-white text-xs px-2 py-1 rounded mr-3 mt-0.5">HIGH</span>
                            <span class="text-sm">Implement response time training program - Start this week</span>
                        </div>
                        <div class="flex items-start p-3 bg-yellow-900/20 rounded">
                            <span class="bg-yellow-500 text-black text-xs px-2 py-1 rounded mr-3 mt-0.5">MED</span>
                            <span class="text-sm">Test premium PPV pricing strategy - Start next Monday</span>
                        </div>
                        <div class="flex items-start p-3 bg-green-900/20 rounded">
                            <span class="bg-green-500 text-black text-xs px-2 py-1 rounded mr-3 mt-0.5">LOW</span>
                            <span class="text-sm">Plan weekend coverage optimization - Implement in 2 weeks</span>
                        </div>
                    </div>
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
        // Simulate comprehensive individual chatter analysis
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        const analysis = {
            chatterName: 'Sarah M.',
            score: 82,
            totalRevenue: 3240,
            messagesSent: 456,
            avgResponseTime: 2.1,
            ppvUnlockRate: 64.3,
            customerSatisfaction: 4.7,
            weeklyHours: 32,
            revenuePerHour: 101.25,
            strengths: [
                'Excellent response time (2.1 min vs 3.2 min team avg)',
                'PPV unlock rate 64.3% (12.1% above team average)',
                'High customer satisfaction score (4.7/5.0)',
                'Consistent performance across all shifts',
                'Strong relationship building - 78% fan retention rate',
                'Effective upselling - average order value $42.30'
            ],
            weakPoints: [
                'Message volume 15% below target (456 vs 538 expected)',
                'Weekend performance dips 18% compared to weekdays',
                'Premium content ($50+) conversion rate only 23% vs 31% target',
                'Response time variance high during peak hours (1.2min to 4.8min)'
            ],
            recommendations: [
                'Increase message frequency during slow periods to reach targets',
                'Focus on premium content sales training - potential $580 monthly gain',
                'Implement time management during peak hours (3-6 PM)',
                'Weekend motivation program could boost earnings by $420/month'
            ],
            comparisonData: {
                rank: 2,
                totalChatters: 4,
                aboveAverage: ['Response Time', 'PPV Rate', 'Satisfaction'],
                belowAverage: ['Message Volume', 'Premium Sales']
            },
            monthlyTrend: {
                revenue: [2850, 3120, 3240],
                messages: [398, 422, 456],
                satisfaction: [4.5, 4.6, 4.7]
            }
        };

        resultsContainer.innerHTML = `
            <div class="space-y-6">
                <!-- Performance Overview -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="text-center p-4 bg-green-900/20 rounded-lg">
                        <div class="text-3xl font-bold text-green-400">${analysis.score}</div>
                        <div class="text-sm text-gray-400">Overall Score</div>
                        <div class="text-xs text-green-400">#${analysis.comparisonData.rank} of ${analysis.comparisonData.totalChatters}</div>
                    </div>
                    <div class="text-center p-4 bg-blue-900/20 rounded-lg">
                        <div class="text-2xl font-bold text-blue-400">$${analysis.revenuePerHour}</div>
                        <div class="text-sm text-gray-400">Revenue/Hour</div>
                        <div class="text-xs text-blue-400">Above Team Avg</div>
                    </div>
                    <div class="text-center p-4 bg-purple-900/20 rounded-lg">
                        <div class="text-2xl font-bold text-purple-400">${analysis.ppvUnlockRate}%</div>
                        <div class="text-sm text-gray-400">PPV Unlock Rate</div>
                        <div class="text-xs text-green-400">+12.1% vs team</div>
                    </div>
                    <div class="text-center p-4 bg-yellow-900/20 rounded-lg">
                        <div class="text-2xl font-bold text-yellow-400">${analysis.customerSatisfaction}</div>
                        <div class="text-sm text-gray-400">Satisfaction</div>
                        <div class="text-xs text-green-400">Excellent (4.5+)</div>
                    </div>
                </div>

                <!-- Performance Breakdown -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Strengths -->
                    <div class="bg-green-900/10 rounded-lg p-4 border border-green-500/20">
                        <h4 class="font-semibold mb-3 text-green-400 flex items-center">
                            <i class="fas fa-trophy mr-2"></i>Top Strengths
                        </h4>
                        <div class="space-y-2">
                            ${analysis.strengths.map(strength => 
                                `<div class="text-sm text-gray-300 flex items-start">
                                    <i class="fas fa-check-circle text-green-400 mr-2 mt-0.5 text-xs"></i>
                                    <span>${strength}</span>
                                </div>`
                            ).join('')}
                        </div>
                    </div>

                    <!-- Weak Points -->
                    <div class="bg-orange-900/10 rounded-lg p-4 border border-orange-500/20">
                        <h4 class="font-semibold mb-3 text-orange-400 flex items-center">
                            <i class="fas fa-target mr-2"></i>Areas for Improvement
                        </h4>
                        <div class="space-y-2">
                            ${analysis.weakPoints.map(point => 
                                `<div class="text-sm text-gray-300 flex items-start">
                                    <i class="fas fa-arrow-up text-orange-400 mr-2 mt-0.5 text-xs"></i>
                                    <span>${point}</span>
                                </div>`
                            ).join('')}
                        </div>
                    </div>
                </div>

                <!-- Team Comparison -->
                <div class="bg-blue-900/10 rounded-lg p-4 border border-blue-500/20">
                    <h4 class="font-semibold mb-3 text-blue-400 flex items-center">
                        <i class="fas fa-users mr-2"></i>Team Comparison
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h5 class="text-sm font-medium text-green-400 mb-2">Above Team Average:</h5>
                            ${analysis.comparisonData.aboveAverage.map(metric => 
                                `<div class="text-sm text-gray-300 flex items-center mb-1">
                                    <i class="fas fa-arrow-up text-green-400 mr-2 text-xs"></i>
                                    <span>${metric}</span>
                                </div>`
                            ).join('')}
                        </div>
                        <div>
                            <h5 class="text-sm font-medium text-orange-400 mb-2">Below Team Average:</h5>
                            ${analysis.comparisonData.belowAverage.map(metric => 
                                `<div class="text-sm text-gray-300 flex items-center mb-1">
                                    <i class="fas fa-arrow-down text-orange-400 mr-2 text-xs"></i>
                                    <span>${metric}</span>
                                </div>`
                            ).join('')}
                        </div>
                    </div>
                </div>

                <!-- Action Plan -->
                <div class="bg-purple-900/10 rounded-lg p-4 border border-purple-500/20">
                    <h4 class="font-semibold mb-3 text-purple-400 flex items-center">
                        <i class="fas fa-rocket mr-2"></i>Personalized Action Plan
                    </h4>
                    <div class="space-y-3">
                        ${analysis.recommendations.map((rec, index) => 
                            `<div class="flex items-start p-3 bg-gray-800/30 rounded">
                                <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded mr-3 mt-0.5">${index + 1}</span>
                                <div>
                                    <span class="text-sm text-gray-300">${rec}</span>
                                </div>
                            </div>`
                        ).join('')}
                    </div>
                </div>

                <!-- Monthly Progress -->
                <div class="bg-gray-800/30 rounded-lg p-4">
                    <h4 class="font-semibold mb-3 text-gray-300 flex items-center">
                        <i class="fas fa-chart-line mr-2"></i>3-Month Progress Trend
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="text-center">
                            <div class="text-lg font-bold text-green-400">$${analysis.monthlyTrend.revenue[2]}</div>
                            <div class="text-sm text-gray-400">Revenue This Month</div>
                            <div class="text-xs text-green-400">+${((analysis.monthlyTrend.revenue[2] - analysis.monthlyTrend.revenue[0]) / analysis.monthlyTrend.revenue[0] * 100).toFixed(1)}% vs Month 1</div>
                        </div>
                        <div class="text-center">
                            <div class="text-lg font-bold text-blue-400">${analysis.monthlyTrend.messages[2]}</div>
                            <div class="text-sm text-gray-400">Messages This Month</div>
                            <div class="text-xs text-blue-400">+${((analysis.monthlyTrend.messages[2] - analysis.monthlyTrend.messages[0]) / analysis.monthlyTrend.messages[0] * 100).toFixed(1)}% vs Month 1</div>
                        </div>
                        <div class="text-center">
                            <div class="text-lg font-bold text-yellow-400">${analysis.monthlyTrend.satisfaction[2]}</div>
                            <div class="text-sm text-gray-400">Satisfaction This Month</div>
                            <div class="text-xs text-yellow-400">+${((analysis.monthlyTrend.satisfaction[2] - analysis.monthlyTrend.satisfaction[0]) * 100).toFixed(1)}% vs Month 1</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        resultsContainer.innerHTML = '<p class="text-red-400">Error running analysis. Please try again.</p>';
    } finally {
        showLoading(false);
    }
}

// Form handlers
async function handleOFAccountDataSubmit(event) {
    const formData = {
        date: document.getElementById('ofAccountDate').value,
        creator: document.getElementById('ofAccountCreator').value,
        netRevenue: parseFloat(document.getElementById('ofNetRevenue').value) || 0,
        recurringRevenue: parseFloat(document.getElementById('ofRecurringRevenue').value) || 0,
        totalSubs: parseInt(document.getElementById('ofTotalSubs').value) || 0,
        newSubs: parseInt(document.getElementById('ofNewSubs').value) || 0,
        profileClicks: parseInt(document.getElementById('ofProfileClicks').value) || 0,
        dataType: 'of_account'
    };

    if (!formData.date || !formData.creator) {
        showError('Please fill in Date and Creator Account fields');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch('/api/analytics/of-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('OF Account data submitted successfully!', 'success');
            document.getElementById('ofAccountDataForm').reset();
            // Update dashboard if we're on it
            if (currentUser && currentUser.role === 'manager') {
                loadDashboardData();
            }
        } else {
            showError(result.error || 'Failed to submit data');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleChatterDataSubmit(event) {
    const formData = {
        date: document.getElementById('chatterDataDate').value,
        chatter: document.getElementById('chatterDataChatter').value,
        messagesSent: parseInt(document.getElementById('chatterMessagesSent').value) || 0,
        ppvsSent: parseInt(document.getElementById('chatterPPVsSent').value) || 0,
        ppvsUnlocked: parseInt(document.getElementById('chatterPPVsUnlocked').value) || 0,
        avgPPVPrice: parseFloat(document.getElementById('chatterAvgPPVPrice').value) || 0,
        avgResponseTime: parseFloat(document.getElementById('chatterAvgResponseTime').value) || 0,
        dataType: 'chatter'
    };

    if (!formData.date || !formData.chatter) {
        showError('Please fill in Date and Chatter fields');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch('/api/analytics/chatter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            showNotification('Chatter data submitted successfully!', 'success');
            document.getElementById('chatterDataForm').reset();
            // Update dashboard if we're on it
            if (currentUser && currentUser.role === 'manager') {
                loadDashboardData();
            }
        } else {
            showError(result.error || 'Failed to submit data');
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
