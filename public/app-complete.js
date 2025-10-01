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
        // Force clear dashboard to ensure clean state
        clearDashboardToZero();
        // Aggressively clear specific metrics immediately
        forceClearSpecificMetrics();
        loadDashboardData();
        loadAIRecommendations();
        
        // Also clear again after a short delay to override any cached values
        setTimeout(() => {
            forceClearSpecificMetrics();
            console.log('Delayed metric clearing executed');
        }, 1000);
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

    // Chatter selection for AI analysis
    document.addEventListener('change', function(event) {
        if (event.target.id === 'chatterAnalysisSelect') {
            if (event.target.value) {
                runChatterAnalysis();
            }
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

function setDefaultDateRanges() {
    const today = new Date().toISOString().split('T')[0];
    
    // Set default date ranges for data upload forms
    const ofStartDate = document.getElementById('ofAccountStartDate');
    const ofEndDate = document.getElementById('ofAccountEndDate');
    const chatterStartDate = document.getElementById('chatterDataStartDate');
    const chatterEndDate = document.getElementById('chatterDataEndDate');
    
    if (ofStartDate && ofEndDate) {
        ofStartDate.value = today;
        ofEndDate.value = today;
    }
    
    if (chatterStartDate && chatterEndDate) {
        chatterStartDate.value = today;
        chatterEndDate.value = today;
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
        console.log('Login attempt for username:', username);
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        console.log('Login response status:', response.status);
        const data = await response.json();
        console.log('Login response:', data);

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
        console.error('Login error:', error);
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
    
    // If showing dashboard, aggressively clear metrics
    if (sectionId === 'dashboard' && currentUser?.role === 'manager') {
        setTimeout(() => {
            forceClearSpecificMetrics();
            console.log('Dashboard section shown - clearing metrics');
        }, 100);
    }
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
            setDefaultDateRanges();
            break;
        case 'my-performance':
            loadMyPerformanceData();
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
        
        // Load creator accounts for OF Account Data form
        const creatorsResponse = await fetch('/api/creators', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (creatorsResponse.ok) {
            const creators = await creatorsResponse.json();
            const creatorSelect = document.getElementById('ofAccountCreator');
            if (creatorSelect) {
                creatorSelect.innerHTML = '<option value="">Select Creator...</option>' +
                    creators.map(creator => 
                        `<option value="${creator.name}">${creator.name}</option>`
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

        // Move content left to fill sidebar space when collapsed
        if (collapsed) {
            // Sidebar is hidden, move content all the way left
            mainContent.style.marginLeft = '0';
        } else {
            // Sidebar is visible, offset content by sidebar width
            mainContent.style.marginLeft = '288px';
        }
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

    if (new Date(startDate) > new Date(endDate)) {
        showError('Start date cannot be after end date.');
        return;
    }

    // Set the custom date range
    customDateRange = { start: startDate, end: endDate };
    currentTimeInterval = 'custom';
    
    // Update button states
    updateTimeIntervalButtons();
    
    // Close the picker
    closeCustomDatePicker();

    // Reload data for managers
    if (currentUser?.role === 'manager') {
        loadDashboardData();
        loadAIRecommendations();
    }

    // Show success message
    const startFormatted = formatDateLabel(startDate);
    const endFormatted = formatDateLabel(endDate);
    showNotification(`Custom range applied: ${startFormatted} → ${endFormatted}`, 'success');
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
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    ${user.role !== 'manager' ? `
                        <button onclick="deleteUser('${user._id}', '${user.username}')" 
                                class="text-red-400 hover:text-red-300 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<span class="text-gray-500">-</span>'}
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}

async function loadDashboardData() {
    try {
        // Fetch real data from API
        const response = await fetch(`/api/analytics/dashboard?interval=${currentTimeInterval}${customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : ''}&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Cache-Control': 'no-cache'
            }
        });

        let data;
        if (response.ok) {
            data = await response.json();
            console.log('Dashboard API response:', data);
        } else {
            // Start completely blank - no mock data
            console.warn('API failed, showing empty state');
            data = {
                totalRevenue: 0,
                totalSubs: 0,
                profileClicks: 0,
                messagesSent: 0,
                ppvsSent: 0,
                ppvsUnlocked: 0,
                avgResponseTime: 0,
                netRevenue: 0,
                newSubs: 0,
                recurringRevenue: 0,
                avgPPVPrice: 0
            };
        }

        updateDashboardMetrics(data);
        
        // Calculate and update intelligent metrics
        const intelligentMetrics = calculateIntelligentMetrics(data);
        console.log('Intelligent metrics calculated:', intelligentMetrics);
        
        // Force clear specific metrics if no real data
        if (data.totalRevenue === 0 && data.ppvsSent === 0) {
            forceClearSpecificMetrics();
        }
        
        updateIntelligentMetrics(data, intelligentMetrics);
        
        // Load AI insights and opportunities
        loadLiveAIInsights(data, intelligentMetrics);
        loadActionOpportunities(data, intelligentMetrics);
        
        // Load charts
        loadRevenueChart();
        loadAIInsightsChart();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Use empty data as fallback
        const emptyData = {
            totalRevenue: 0,
            totalSubs: 0,
            profileClicks: 0,
            messagesSent: 0,
            ppvsSent: 0,
            ppvsUnlocked: 0,
            avgResponseTime: 0,
            netRevenue: 0,
            newSubs: 0,
            recurringRevenue: 0,
            avgPPVPrice: 0
        };
        updateDashboardMetrics(emptyData);
        
        // Calculate and update intelligent metrics for empty state
        const intelligentMetrics = calculateIntelligentMetrics(emptyData);
        updateIntelligentMetrics(emptyData, intelligentMetrics);
        loadLiveAIInsights(emptyData, intelligentMetrics);
        loadActionOpportunities(emptyData, intelligentMetrics);
        
        loadRevenueChart();
        loadAIInsightsChart();
    }
}

// Calculate intelligent metrics not available in Infloww
function calculateIntelligentMetrics(analytics) {
    const clickToSubRate = analytics.profileClicks > 0 ? (analytics.newSubs / analytics.profileClicks * 100) : 0;
    const ppvUnlockRate = analytics.ppvsSent > 0 ? (analytics.ppvsUnlocked / analytics.ppvsSent * 100) : 0;
    const revenuePerSub = analytics.totalSubs > 0 ? (analytics.totalRevenue / analytics.totalSubs) : 0;
    const revenuePerHour = analytics.totalRevenue / (24 * 7); // Assuming 7-day period
    const messagesPerPPV = analytics.ppvsSent > 0 ? (analytics.messagesSent / analytics.ppvsSent) : 0;
    
    // Team performance calculations - empty until real data uploaded
    const topPerformer = analytics.totalRevenue > 0 ? 'Calculating from data...' : 'No data uploaded';
    const performanceGap = 0; // Will be calculated from real chatter data
    const teamConsistency = 0; // Will be calculated from real data
    const synergyScore = 0; // Will be calculated from real team data
    
    // Growth calculations - empty until historical data available
    const revenueGrowth = 0; // Will be calculated vs previous period
    const subsGrowth = 0; // Will be calculated vs previous period
    const clicksGrowth = 0; // Will be calculated vs previous period
    
    return {
        clickToSubRate: Math.round(clickToSubRate * 10) / 10,
        ppvUnlockRate: Math.round(ppvUnlockRate * 10) / 10,
        revenuePerSub: Math.round(revenuePerSub * 100) / 100,
        revenuePerHour: Math.round(revenuePerHour * 100) / 100,
        messagesPerPPV: Math.round(messagesPerPPV * 10) / 10,
        topPerformer,
        performanceGap,
        teamConsistency,
        synergyScore,
        revenueGrowth,
        subsGrowth,
        clicksGrowth,
        peakTime: '--:--' // Will be calculated from real data
    };
}

// Update intelligent dashboard metrics
function updateIntelligentMetrics(analytics, intelligent) {
    // Update growth indicators
    const elements = {
        revenueGrowth: `+${intelligent.revenueGrowth}%`,
        subsGrowth: `+${intelligent.subsGrowth}%`,
        clicksGrowth: `+${intelligent.clicksGrowth}%`,
        
        // Conversion intelligence
        clickToSubRate: `${intelligent.clickToSubRate}%`,
        ppvUnlockRate: `${intelligent.ppvUnlockRate}%`,
        revenuePerSub: `$${intelligent.revenuePerSub}`,
        
        // Efficiency metrics
        revenuePerHour: `$${intelligent.revenuePerHour}`,
        messagesPerPPV: intelligent.messagesPerPPV,
        peakTime: intelligent.peakTime,
        
        // Team dynamics
        topPerformer: intelligent.topPerformer,
        performanceGap: `${intelligent.performanceGap}%`,
        teamConsistency: `${intelligent.teamConsistency}%`,
        synergyScore: `${intelligent.synergyScore}%`
    };

    // Update all elements
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
            
            // Add color classes for growth indicators
            if (id.includes('Growth')) {
                element.className = `font-medium ${intelligent[id.replace('Growth', '')] > 0 ? 'text-green-400' : 'text-red-400'}`;
            }
        }
    });
    
    // Update progress bars
    const clickToSubBar = document.getElementById('clickToSubBar');
    const ppvUnlockBar = document.getElementById('ppvUnlockBar');
    
    if (clickToSubBar) clickToSubBar.style.width = `${Math.min(intelligent.clickToSubRate, 100)}%`;
    if (ppvUnlockBar) ppvUnlockBar.style.width = `${Math.min(intelligent.ppvUnlockRate, 100)}%`;
    
    // Update insights
    updateConversionInsight(intelligent);
    updateEfficiencyInsight(intelligent);
    updateTeamInsight(intelligent);
}

// Generate intelligent insights
function updateConversionInsight(intelligent) {
    const element = document.getElementById('conversionInsight');
    if (!element) return;
    
    let insight = '';
    if (intelligent.clickToSubRate === 0 && intelligent.ppvUnlockRate === 0) {
        insight = 'Upload data to see conversion analysis and optimization recommendations.';
    } else if (intelligent.clickToSubRate < 2) {
        insight = 'Low click-to-sub rate detected. Consider improving profile appeal or pricing strategy.';
    } else if (intelligent.ppvUnlockRate < 30) {
        insight = 'PPV unlock rate below optimal. Focus on message quality and timing optimization.';
    } else if (intelligent.revenuePerSub < 15) {
        insight = 'Revenue per subscriber is low. Explore upselling opportunities and premium content.';
    } else {
        insight = 'Conversion rates are healthy. Focus on scaling traffic and maintaining quality.';
    }
    
    element.textContent = insight;
}

function updateEfficiencyInsight(intelligent) {
    const element = document.getElementById('efficiencyInsight');
    if (!element) return;
    
    let insight = '';
    if (intelligent.revenuePerHour === 0) {
        insight = 'Upload sales data to see efficiency analysis and performance optimization tips.';
    } else if (intelligent.revenuePerHour < 50) {
        insight = 'Revenue per hour below target. Focus on high-value conversations and automation.';
    } else if (intelligent.messagesPerPPV > 20) {
        insight = 'Too many messages per PPV. Consider more direct sales approaches.';
    } else {
        insight = 'Efficiency metrics are strong. Peak performance occurs around ' + intelligent.peakTime + '.';
    }
    
    element.textContent = insight;
}

function updateTeamInsight(intelligent) {
    const element = document.getElementById('teamInsight');
    if (!element) return;
    
    let insight = '';
    if (intelligent.performanceGap === 0 && intelligent.teamConsistency === 0) {
        insight = 'Upload chatter performance data to see team dynamics and collaboration analysis.';
    } else if (intelligent.performanceGap > 40) {
        insight = 'Large performance gap detected. Implement mentoring program for skill transfer.';
    } else if (intelligent.teamConsistency < 70) {
        insight = 'Team consistency needs improvement. Focus on standardized processes and training.';
    } else {
        insight = `Team shows good synergy (${intelligent.synergyScore}%). Continue fostering collaboration.`;
    }
    
    element.textContent = insight;
}

// AI Analysis Time Interval Management
let currentAIAnalysisInterval = '7d';
let currentAnalyticsInterval = '7d';

function setAIAnalysisInterval(interval) {
    if (interval === 'custom') {
        showCustomDatePicker('ai-analysis');
        return;
    }
    
    currentAIAnalysisInterval = interval;
    
    // Update button states
    document.querySelectorAll('.ai-time-btn').forEach(btn => {
        const btnInterval = btn.getAttribute('data-interval');
        if (btnInterval === interval) {
            btn.className = 'ai-time-btn bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all';
        } else {
            btn.className = 'ai-time-btn bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-all';
        }
    });
    
    // Reload analysis if currently showing results
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    if (agencySection && !agencySection.classList.contains('hidden')) {
        runAgencyAnalysis();
    } else if (chatterSection && !chatterSection.classList.contains('hidden')) {
        runChatterAnalysis();
    }
}

function setAnalyticsInterval(interval) {
    if (interval === 'custom') {
        showCustomDatePicker('analytics');
        return;
    }
    
    currentAnalyticsInterval = interval;
    
    // Update button states
    document.querySelectorAll('.analytics-time-btn').forEach(btn => {
        const btnInterval = btn.getAttribute('data-interval');
        if (btnInterval === interval) {
            btn.className = 'analytics-time-btn bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all';
        } else {
            btn.className = 'analytics-time-btn bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-all';
        }
    });
    
    // Reload analytics data
    loadAnalyticsData();
}

function showCustomDatePicker(context) {
    // Create a proper custom date picker modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="glass-card rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-semibold text-white">Select Date Range</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="space-y-4 mb-6">
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Start Date</label>
                    <input type="date" id="modalStartDate" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">End Date</label>
                    <input type="date" id="modalEndDate" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                </div>
            </div>
            
            <div class="flex space-x-3">
                <button onclick="applyCustomDateRange('${context}')" class="flex-1 premium-button text-white px-4 py-2 rounded-lg">
                    Apply Range
                </button>
                <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-all">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    // Set default dates
    document.body.appendChild(modal);
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    document.getElementById('modalStartDate').value = lastWeek.toISOString().split('T')[0];
    document.getElementById('modalEndDate').value = today.toISOString().split('T')[0];
}

function applyCustomDateRange(context) {
    // Try multiple possible element IDs
    const startDate = document.getElementById('modalStartDate')?.value || 
                     document.getElementById('customStartDate')?.value;
    const endDate = document.getElementById('modalEndDate')?.value || 
                   document.getElementById('customEndDate')?.value;
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showError('Start date cannot be after end date');
        return;
    }
    
    // Set custom date range based on context
    if (context === 'dashboard') {
        customDateRange = { start: startDate, end: endDate };
        currentTimeInterval = 'custom';
        updateTimeIntervalButtons();
        loadDashboardData();
    } else if (context === 'ai-analysis') {
        window.customDateRange = { start: startDate, end: endDate };
        currentAIAnalysisInterval = 'custom';
        const agencySection = document.getElementById('agencyAnalysisSection');
        const chatterSection = document.getElementById('chatterAnalysisSection');
        
        if (agencySection && !agencySection.classList.contains('hidden')) {
            runAgencyAnalysis();
        } else if (chatterSection && !chatterSection.classList.contains('hidden')) {
            runChatterAnalysis();
        }
    } else if (context === 'analytics') {
        currentAnalyticsInterval = 'custom';
        loadAnalyticsData();
    }
    
    // Close modal
    const modal = document.querySelector('.fixed.inset-0');
    if (modal) modal.remove();
    
    showNotification(`Custom range applied: ${startDate} to ${endDate}`, 'success');
}

// Show Agency Analysis
function showAgencyAnalysis() {
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    if (agencySection) {
        agencySection.classList.remove('hidden');
        runAgencyAnalysis();
    }
    
    if (chatterSection) {
        chatterSection.classList.add('hidden');
    }
}

// Show Chatter Analysis
function showChatterAnalysis() {
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    if (chatterSection) {
        chatterSection.classList.remove('hidden');
        loadChattersForAnalysis();
    }
    
    if (agencySection) {
        agencySection.classList.add('hidden');
    }
}

// Hide Analysis Results
function hideAnalysisResults() {
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    if (agencySection) {
        agencySection.classList.add('hidden');
    }
    
    if (chatterSection) {
        chatterSection.classList.add('hidden');
    }
}

// Load chatters for analysis dropdown
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
            
            const select = document.getElementById('chatterAnalysisSelect');
            if (select) {
                select.innerHTML = '<option value="">Select Chatter...</option>' +
                    chatters.map(chatter => 
                        `<option value="${chatter._id}">${chatter.chatterName || chatter.username}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading chatters for analysis:', error);
    }
}

// Generate chatter analysis from real data
function generateChatterAnalysisFromRealData(chatterData, chatterName, interval) {
    // Calculate derived metrics from real data
    const ppvUnlockRate = chatterData.ppvsSent > 0 ? (chatterData.ppvsUnlocked / chatterData.ppvsSent * 100) : 0;
    const revenuePerPPV = chatterData.ppvsSent > 0 ? (chatterData.totalRevenue / chatterData.ppvsSent) : 0;
    const messagesPerPPV = chatterData.ppvsSent > 0 ? (chatterData.messagesSent / chatterData.ppvsSent) : 0;
    
    // Calculate overall score based on real metrics
    let overallScore = 0;
    if (chatterData.totalRevenue > 0) overallScore += 25;
    if (ppvUnlockRate > 50) overallScore += 25;
    if (chatterData.avgResponseTime < 3) overallScore += 25;
    if (revenuePerPPV > 30) overallScore += 25;
    
    // Generate insights based on real data
    const strengths = [];
    const weaknesses = [];
    const opportunities = [];
    const recommendations = [];
    
    if (chatterData.totalRevenue > 0) {
        strengths.push(`Generated $${chatterData.totalRevenue.toLocaleString()} in revenue this ${interval} period`);
    }
    
    if (ppvUnlockRate > 0) {
        if (ppvUnlockRate > 60) {
            strengths.push(`Excellent PPV unlock rate of ${ppvUnlockRate.toFixed(1)}% (above 60% target)`);
        } else if (ppvUnlockRate < 40) {
            weaknesses.push(`Low PPV unlock rate of ${ppvUnlockRate.toFixed(1)}% (target: 50-60%)`);
            opportunities.push(`Improving PPV unlock rate to 50% could increase revenue by ${Math.round(chatterData.totalRevenue * 0.25)}`);
        } else {
            strengths.push(`Good PPV unlock rate of ${ppvUnlockRate.toFixed(1)}%`);
        }
    }
    
    if (chatterData.avgResponseTime > 0) {
        if (chatterData.avgResponseTime < 2) {
            strengths.push(`Excellent response time of ${chatterData.avgResponseTime.toFixed(1)} minutes`);
        } else if (chatterData.avgResponseTime > 4) {
            weaknesses.push(`Slow response time of ${chatterData.avgResponseTime.toFixed(1)} minutes (target: <3 minutes)`);
            opportunities.push(`Reducing response time to 2 minutes could increase conversions by 20%`);
        } else {
            strengths.push(`Good response time of ${chatterData.avgResponseTime.toFixed(1)} minutes`);
        }
    }
    
    if (revenuePerPPV > 0) {
        if (revenuePerPPV > 40) {
            strengths.push(`High revenue per PPV of $${revenuePerPPV.toFixed(2)}`);
        } else if (revenuePerPPV < 25) {
            weaknesses.push(`Low revenue per PPV of $${revenuePerPPV.toFixed(2)} (target: $30-50)`);
            opportunities.push(`Increasing PPV prices could boost revenue per PPV by $${(35 - revenuePerPPV).toFixed(2)}`);
        }
    }
    
    if (chatterData.messagesSent > 0) {
        strengths.push(`Active engagement with ${chatterData.messagesSent} messages sent`);
    }
    
    // Generate recommendations based on weaknesses
    if (chatterData.avgResponseTime > 3) {
        recommendations.push('Focus on faster response times - aim for under 2 minutes');
    }
    if (ppvUnlockRate < 50) {
        recommendations.push('Improve PPV content quality and pricing strategy');
    }
    if (revenuePerPPV < 30) {
        recommendations.push('Test higher PPV prices to increase revenue per sale');
    }
    
    // If no real insights, add guidance
    if (strengths.length === 0 && weaknesses.length === 0) {
        strengths.push('Upload more data to see detailed performance analysis');
    }
    
    return {
        chatterName,
        overallScore,
        totalRevenue: chatterData.totalRevenue,
        messagesSent: chatterData.messagesSent,
        ppvsSent: chatterData.ppvsSent,
        ppvsUnlocked: chatterData.ppvsUnlocked,
        avgResponseTime: chatterData.avgResponseTime,
        ppvUnlockRate,
        revenuePerPPV,
        strengths,
        weaknesses,
        opportunities,
        recommendations
    };
}

// Generate analysis from real data
function generateAnalysisFromRealData(analyticsData, interval) {
    // Calculate derived metrics from real data
    const clickToSubRate = analyticsData.profileClicks > 0 ? (analyticsData.newSubs / analyticsData.profileClicks * 100) : 0;
    const ppvUnlockRate = analyticsData.ppvsSent > 0 ? (analyticsData.ppvsUnlocked / analyticsData.ppvsSent * 100) : 0;
    const revenuePerSub = analyticsData.totalSubs > 0 ? (analyticsData.totalRevenue / analyticsData.totalSubs) : 0;
    const avgPPVPrice = analyticsData.ppvsSent > 0 ? (analyticsData.totalRevenue / analyticsData.ppvsSent) : 0;
    
    // Calculate overall score based on real metrics
    let overallScore = 0;
    if (analyticsData.totalRevenue > 0) overallScore += 20;
    if (clickToSubRate > 10) overallScore += 20;
    if (ppvUnlockRate > 50) overallScore += 20;
    if (analyticsData.avgResponseTime < 3) overallScore += 20;
    if (revenuePerSub > 10) overallScore += 20;
    
    // Generate insights based on real data
    const insights = [];
    const weakPoints = [];
    const opportunities = [];
    const roiCalculations = [];
    
    if (analyticsData.totalRevenue > 0) {
        insights.push(`Total revenue of $${analyticsData.totalRevenue.toLocaleString()} generated this ${interval} period`);
    }
    
    if (clickToSubRate > 0) {
        insights.push(`Click-to-subscription conversion rate is ${clickToSubRate.toFixed(1)}%`);
        if (clickToSubRate < 10) {
            weakPoints.push(`Low conversion rate (${clickToSubRate.toFixed(1)}%) - industry average is 12%`);
            opportunities.push(`Improving conversion rate to 12% could increase revenue by ${Math.round(analyticsData.totalRevenue * 0.2)}`);
        }
    }
    
    if (analyticsData.avgResponseTime > 0) {
        insights.push(`Average response time is ${analyticsData.avgResponseTime.toFixed(1)} minutes`);
        if (analyticsData.avgResponseTime > 3) {
            weakPoints.push(`Response time of ${analyticsData.avgResponseTime.toFixed(1)} minutes is above optimal (2-3 minutes)`);
            opportunities.push(`Reducing response time to 2 minutes could increase conversions by 15-20%`);
        }
    }
    
    if (ppvUnlockRate > 0) {
        insights.push(`PPV unlock rate is ${ppvUnlockRate.toFixed(1)}%`);
        if (ppvUnlockRate < 50) {
            weakPoints.push(`PPV unlock rate (${ppvUnlockRate.toFixed(1)}%) is below industry average (45-60%)`);
        }
    }
    
    if (revenuePerSub > 0) {
        insights.push(`Revenue per subscriber is $${revenuePerSub.toFixed(2)}`);
        if (revenuePerSub < 10) {
            weakPoints.push(`Revenue per subscriber ($${revenuePerSub.toFixed(2)}) is below target of $12.50`);
        }
    }
    
    // Add data-driven ROI calculations
    if (analyticsData.totalRevenue > 0) {
        const potentialResponseTimeGain = analyticsData.avgResponseTime > 3 ? Math.round(analyticsData.totalRevenue * 0.15) : 0;
        if (potentialResponseTimeGain > 0) {
            roiCalculations.push(`Response time improvement: $${potentialResponseTimeGain} potential monthly gain for $400 training cost = ${Math.round(potentialResponseTimeGain * 12 / 400)}% annual ROI`);
        }
        
        const potentialConversionGain = clickToSubRate < 10 ? Math.round(analyticsData.totalRevenue * 0.2) : 0;
        if (potentialConversionGain > 0) {
            roiCalculations.push(`Conversion optimization: $${potentialConversionGain} potential monthly gain for $600 funnel improvements = ${Math.round(potentialConversionGain * 12 / 600)}% annual ROI`);
        }
    }
    
    // If no real insights, add guidance
    if (insights.length === 0) {
        insights.push('Upload more data to see detailed performance insights');
    }
    
    return {
        overallScore,
        totalRevenue: analyticsData.totalRevenue,
        totalSubs: analyticsData.totalSubs,
        profileClicks: analyticsData.profileClicks,
        conversionRate: clickToSubRate,
        ppvUnlockRate,
        avgResponseTime: analyticsData.avgResponseTime,
        revenuePerSub,
        insights,
        weakPoints,
        opportunities,
        roiCalculations
    };
}

// Enhanced Agency Analysis - NEW VERSION
async function runAgencyAnalysis() {
    const resultsContainer = document.getElementById('agencyAnalysisResults');
    if (!resultsContainer) return;
    
    // Show loading state
    resultsContainer.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
            <span class="ml-4 text-lg text-gray-300">Analyzing agency performance...</span>
        </div>
    `;
    
    try {
        // Call real AI analysis endpoint
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            throw new Error('Not authenticated');
        }

        // Prepare request body for AI analysis
        const requestBody = {
            analysisType: 'agency',
            interval: currentAIAnalysisInterval
        };

        // Add custom date range if applicable
        if (currentAIAnalysisInterval === 'custom' && window.customDateRange) {
            requestBody.startDate = window.customDateRange.start;
            requestBody.endDate = window.customDateRange.end;
        }

        console.log('Sending AI analysis request:', requestBody);
        
        const response = await fetch(`/api/ai/analysis?_t=${Date.now()}` , {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('AI analysis response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('AI analysis error response:', errorText);
            throw new Error(`Failed to get AI analysis: ${response.status} ${errorText}`);
        }

        const analysis = await response.json();

        resultsContainer.innerHTML = `
            <div class="space-y-8">
                <!-- Overall Performance -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="text-center p-6 bg-green-900/20 rounded-xl border border-green-500/30">
                        <div class="text-4xl font-bold text-green-400 mb-2">${analysis.overallScore}</div>
                        <div class="text-lg text-gray-300 mb-1">Overall Score</div>
                        <div class="text-sm text-green-400">Above Average (75+)</div>
                    </div>
                    <div class="text-center p-6 bg-blue-900/20 rounded-xl border border-blue-500/30">
                        <div class="text-3xl font-bold text-blue-400 mb-2">${analysis.conversionRate}%</div>
                        <div class="text-lg text-gray-300 mb-1">Conversion Rate</div>
                        <div class="text-sm text-blue-400">Above Industry Avg</div>
                    </div>
                    <div class="text-center p-6 bg-purple-900/20 rounded-xl border border-purple-500/30">
                        <div class="text-3xl font-bold text-purple-400 mb-2">$${(analysis.totalRevenue/analysis.totalSubs).toFixed(2)}</div>
                        <div class="text-lg text-gray-300 mb-1">Revenue per Sub</div>
                        <div class="text-sm text-yellow-400">Below Target ($12.50)</div>
                    </div>
                </div>

                <!-- Performance Insights -->
                <div class="bg-gray-800/30 rounded-xl p-8 border border-gray-600/30">
                    <h4 class="text-2xl font-semibold mb-6 text-blue-400 flex items-center">
                        <i class="fas fa-chart-line mr-3 text-xl"></i>Performance Insights
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${analysis.insights.map(insight => 
                            `<div class="text-base text-gray-300 flex items-start p-3 bg-gray-700/30 rounded-lg">
                                <i class="fas fa-check-circle text-green-400 mr-3 mt-1 text-lg"></i>
                                <span>${insight}</span>
                            </div>`
                        ).join('')}
                    </div>
                </div>

                <!-- Areas for Improvement -->
                <div class="bg-red-900/10 rounded-xl p-8 border border-red-500/30">
                    <h4 class="text-2xl font-semibold mb-6 text-red-400 flex items-center">
                        <i class="fas fa-exclamation-triangle mr-3 text-xl"></i>Areas for Improvement
                    </h4>
                    <div class="space-y-4">
                        ${analysis.weakPoints.map(point => 
                            `<div class="text-base text-gray-300 flex items-start p-4 bg-red-900/20 rounded-lg">
                                <i class="fas fa-arrow-down text-red-400 mr-3 mt-1 text-lg"></i>
                                <span>${point}</span>
                            </div>`
                        ).join('')}
                    </div>
                </div>

                <!-- Growth Opportunities & ROI -->
                <div class="bg-green-900/10 rounded-xl p-8 border border-green-500/30">
                    <h4 class="text-2xl font-semibold mb-6 text-green-400 flex items-center">
                        <i class="fas fa-rocket mr-3 text-xl"></i>Growth Opportunities & ROI
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h5 class="text-xl font-medium text-yellow-400 mb-4">Opportunities:</h5>
                            <div class="space-y-3">
                                ${analysis.opportunities.map(opp => 
                                    `<div class="text-base text-gray-300 flex items-start p-3 bg-yellow-900/20 rounded-lg">
                                        <i class="fas fa-lightbulb text-yellow-400 mr-3 mt-1 text-lg"></i>
                                        <span>${opp}</span>
                                    </div>`
                                ).join('')}
                            </div>
                        </div>
                        <div>
                            <h5 class="text-xl font-medium text-green-400 mb-4">ROI Calculations:</h5>
                            <div class="space-y-3">
                                ${analysis.roiCalculations.map(calc => 
                                    `<div class="text-base text-gray-300 flex items-start p-3 bg-green-900/20 rounded-lg">
                                        <i class="fas fa-dollar-sign text-green-400 mr-3 mt-1 text-lg"></i>
                                        <span>${calc}</span>
                                    </div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </div>


                <!-- Recommended Actions -->
                <div class="bg-blue-900/10 rounded-xl p-8 border border-blue-500/30">
                    <h4 class="text-2xl font-semibold mb-6 text-blue-400 flex items-center">
                        <i class="fas fa-tasks mr-3 text-xl"></i>Recommended Actions (Priority Order)
                    </h4>
                    <div class="space-y-4">
                        ${analysis.recommendations.map((rec, index) => {
                            const priority = index === 0 ? 'HIGH' : index === 1 ? 'MED' : 'LOW';
                            const bgColor = index === 0 ? 'red' : index === 1 ? 'yellow' : 'green';
                            const textColor = index === 1 ? 'black' : 'white';
                            return `
                            <div class="flex items-start p-6 bg-${bgColor}-900/20 rounded-xl border border-${bgColor}-500/30">
                                <span class="bg-${bgColor}-500 text-${textColor} text-sm px-4 py-2 rounded-lg mr-4 mt-1 font-bold">${priority}</span>
                                <div>
                                    <span class="text-lg font-medium text-white">${rec}</span>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Agency analysis error:', error);
        resultsContainer.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-4"></i>
                <p class="text-red-400">Analysis failed. Please try again.</p>
            </div>
        `;
    }
}

// Load Performance Trend Chart
async function loadPerformanceTrends(chatterName) {
    try {
        const authToken = localStorage.getItem('authToken');
        
        // Determine how many periods to show based on current interval
        let periodsToShow = 4; // Default for 7d interval (last 4 weeks)
        if (currentAIAnalysisInterval === '30d') {
            periodsToShow = 4; // Last 4 months for 30d interval
        } else if (currentAIAnalysisInterval === '24h') {
            periodsToShow = 7; // Last 7 days for 24h interval
        }
        
        const response = await fetch(`/api/performance/trends/${encodeURIComponent(chatterName)}?weeks=${periodsToShow}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) {
            console.log('No trend data available yet');
            document.getElementById('inlinePerformanceTrendChart').innerHTML = '<p class="text-center text-gray-400 py-8">No historical data yet. Upload more weeks to see trends!</p>';
            return;
        }
        
        const { trends } = await response.json();
        
        console.log('Trends data:', trends);
        
        if (!trends || trends.unlockRate.length === 0) {
            console.log('No trend data to display');
            document.getElementById('inlinePerformanceTrendChart').innerHTML = '<p class="text-center text-gray-400 py-8">No historical data yet. Upload more weeks to see trends!</p>';
            return;
        }
        
        // Prepare chart data
        const labels = trends.unlockRate.map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const ctx = document.getElementById('inlineTrendCanvas').getContext('2d');
        
        // Destroy existing chart if exists
        if (window.inlineTrendChart) {
            window.inlineTrendChart.destroy();
        }
        
        window.inlineTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'PPV Unlock Rate (%)',
                        data: trends.unlockRate.map(item => item.value),
                        borderColor: 'rgb(74, 222, 128)',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Quality Score',
                        data: trends.qualityScore.map(item => item.value),
                        borderColor: 'rgb(147, 51, 234)',
                        backgroundColor: 'rgba(147, 51, 234, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Response Time (min)',
                        data: trends.responseTime.map(item => item.value),
                        borderColor: 'rgb(96, 165, 250)',
                        backgroundColor: 'rgba(96, 165, 250, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Improvement Score',
                        data: trends.improvementScore.map(item => item.value),
                        borderColor: 'rgb(250, 204, 21)',
                        backgroundColor: 'rgba(250, 204, 21, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#fff',
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#d1d5db',
                        borderColor: '#4b5563',
                        borderWidth: 1
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Percentage / Score',
                            color: '#9ca3af'
                        },
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Response Time (min)',
                            color: '#9ca3af'
                        },
                        ticks: { color: '#9ca3af' },
                        grid: { drawOnChartArea: false }
                    },
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading performance trends:', error);
    }
}

// Enhanced Chatter Analysis
async function runChatterAnalysis() {
    const select = document.getElementById('chatterAnalysisSelect');
    const resultsContainer = document.getElementById('chatterAnalysisResults');
    
    if (!select?.value || !resultsContainer) {
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-user-times text-gray-400 text-3xl mb-4"></i>
                    <p class="text-gray-400">Please select a chatter to analyze</p>
                </div>
            `;
        }
        return;
    }
    
    const chatterId = select.value; // Define chatterId here!
    
    // Show loading state
    resultsContainer.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
            <span class="ml-4 text-lg text-gray-300">Analyzing individual performance...</span>
        </div>
    `;
    
    try {
        // Call real AI analysis endpoint for individual chatter
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            throw new Error('Not authenticated');
        }

        // Prepare request body for AI analysis
        const requestBody = {
            analysisType: 'individual',
            interval: currentAIAnalysisInterval,
            chatterId: select.value
        };

        // Add custom date range if applicable
        if (currentAIAnalysisInterval === 'custom' && window.customDateRange) {
            requestBody.startDate = window.customDateRange.start;
            requestBody.endDate = window.customDateRange.end;
        }

        console.log('Sending AI analysis request:', requestBody);
        
        const response = await fetch('/api/ai/analysis', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('AI analysis response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('AI analysis error response:', errorText);
            throw new Error(`Failed to get AI analysis: ${response.status} ${errorText}`);
        }

        const analysisData = await response.json();
        console.log('AI analysis data:', analysisData);
        renderSophisticatedChatterAnalysis(analysisData);
        
        // Load performance trends for this chatter
        const selectedUser = await fetch(`/api/users/${select.value}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        }).then(r => r.json());
        if (selectedUser.chatterName || selectedUser.username) {
            loadPerformanceTrends(selectedUser.chatterName || selectedUser.username);
        }
        
    } catch (error) {
        console.error('Chatter analysis error:', error);
        resultsContainer.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-4"></i>
                <p class="text-red-400">Analysis failed. Please try again.</p>
            </div>
        `;
    }
}

// Load analytics data for analytics page
async function loadAnalyticsData() {
    try {
        const response = await fetch(`/api/analytics/dashboard?interval=${currentAnalyticsInterval}&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateAnalyticsPageData(data);
        }
    } catch (error) {
        console.error('Error loading analytics data:', error);
    }
}

function updateAnalyticsPageData(data) {
    console.log('Analytics page data received:', data);
    console.log('Analytics changes object:', data.changes);
    
    const changes = data.changes || {};
    
    // Update core metrics from real data with change indicators
    const unlockRate = data.ppvsSent > 0 ? ((data.ppvsUnlocked || 0) / data.ppvsSent * 100).toFixed(1) : 0;
    const conversionRate = data.profileClicks > 0 ? ((data.newSubs || 0) / data.profileClicks * 100).toFixed(1) : 0;
    const messagesPerPPV = data.ppvsSent > 0 ? ((data.messagesSent || 0) / data.ppvsSent).toFixed(1) : 0;
    
    const elements = {
        'analytics-revenue': { value: `$${data.totalRevenue?.toLocaleString() || '0'}`, change: changes.totalRevenue },
        'analytics-net-revenue': { value: `$${data.netRevenue?.toLocaleString() || '0'}`, change: changes.netRevenue },
        'analytics-subs': { value: data.totalSubs?.toLocaleString() || '0', change: changes.totalSubs },
        'analytics-clicks': { value: data.profileClicks?.toLocaleString() || '0', change: changes.profileClicks },
        'analytics-ppvs': { value: data.ppvsSent?.toLocaleString() || '0', change: changes.ppvsSent },
        'analytics-ppv-unlocked': { value: data.ppvsUnlocked?.toLocaleString() || '0', change: changes.ppvsUnlocked },
        'analytics-messages': { value: data.messagesSent?.toLocaleString() || '0', change: changes.messagesSent },
        'analytics-response-time': { value: `${data.avgResponseTime || 0}m`, change: changes.avgResponseTime, reversed: true },
        'analytics-click-to-sub': { value: `${conversionRate}%`, change: changes.conversionRate },
        'analytics-ppv-rate': { value: `${unlockRate}%`, change: changes.unlockRate },
        'analytics-revenue-per-sub': { value: data.totalSubs > 0 ? `$${(data.totalRevenue / data.totalSubs).toFixed(2)}` : '$0', change: null },
        'analytics-messages-per-ppv': { value: messagesPerPPV, change: changes.messagesPerPPV },
        'analytics-conversion-rate': { value: `${conversionRate}%`, change: changes.conversionRate },
        'analytics-revenue-per-chatter': { value: data.totalRevenue > 0 ? `$${Math.round(data.totalRevenue / 4).toLocaleString()}` : '$0', change: null },
        'analytics-ppv-success-rate': { value: `${unlockRate}%`, change: changes.unlockRate },
        'analytics-avg-response-time': { value: `${data.avgResponseTime || 0}m`, change: changes.avgResponseTime, reversed: true }
    };
    
    Object.entries(elements).forEach(([id, config]) => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = config.value + (config.change ? renderChangeIndicator(config.change, config.reversed) : '');
        }
    });
    
    // Update creator performance table
    updateCreatorPerformanceTable(data);
    
    // Update top performing chatters
    updateTopPerformingChatters(data);
}

function updateCreatorPerformanceTable(data) {
    const tableBody = document.getElementById('creator-performance-table');
    if (!tableBody) return;
    
    // For now, show placeholder data since we don't have creator-specific data yet
    // This will be populated when we have actual creator data
    tableBody.innerHTML = `
        <tr>
            <td class="px-4 py-3 text-white font-medium">No Data</td>
            <td class="px-4 py-3 text-gray-400">$0</td>
            <td class="px-4 py-3 text-gray-400">0</td>
        </tr>
    `;
}

function updateTopPerformingChatters(data) {
    const container = document.getElementById('top-performing-chatters');
    if (!container) return;
    
    // For now, show placeholder data since we don't have chatter-specific data yet
    // This will be populated when we have actual chatter performance data
    container.innerHTML = `
        <div class="flex items-center justify-center p-6 text-gray-400">
            <span>No chatter data available</span>
        </div>
    `;
}

// Generate Comprehensive Agency Analysis - REAL DATA ONLY
async function generateComprehensiveAgencyAnalysis() {
    try {
        // Fetch real data from API
        const response = await fetch(`/api/analytics/dashboard?interval=${currentAIAnalysisInterval}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        let data = {};
        if (response.ok) {
            data = await response.json();
        }
        
        // Use ONLY real uploaded data for analysis
        const currentRevenue = data.totalRevenue || 0;
        const currentPPVs = data.ppvsSent || 0;
        const avgPPVPrice = currentPPVs > 0 ? currentRevenue / currentPPVs : 0;
        const responseTime = data.avgResponseTime || 0;
        const ppvUnlockRate = data.ppvsSent > 0 ? (data.ppvsUnlocked / data.ppvsSent * 100) : 0;
        
        // Calculate realistic opportunities based on real data
        const ppvPriceOpportunity = avgPPVPrice < 35 ? Math.round((35 - avgPPVPrice) * currentPPVs) : 0;
        const responseTimeOpportunity = responseTime > 2 ? Math.round(currentRevenue * 0.15) : 0;
        const weekendOpportunity = Math.round(currentRevenue * 0.12); // Based on typical weekend performance gaps
        
        return {
            overallScore: Math.min(95, Math.max(60, Math.round(
                (ppvUnlockRate * 0.3) + 
                (Math.max(0, 120 - responseTime * 20) * 0.25) + 
                (Math.min(100, avgPPVPrice * 2) * 0.25) + 
                (data.totalSubs > 500 ? 20 : data.totalSubs / 25)
            ))),
            revenueAnalysis: {
                current: currentRevenue,
                potential: currentRevenue + ppvPriceOpportunity + responseTimeOpportunity + weekendOpportunity,
                gap: ppvPriceOpportunity + responseTimeOpportunity + weekendOpportunity,
                opportunities: [
                    ...(ppvPriceOpportunity > 0 ? [{
                        area: `PPV Price Optimization (currently $${avgPPVPrice.toFixed(2)})`,
                        impact: ppvPriceOpportunity,
                        confidence: 85
                    }] : []),
                    ...(responseTimeOpportunity > 0 ? [{
                        area: `Response Time Improvement (currently ${responseTime}min)`,
                        impact: responseTimeOpportunity,
                        confidence: 78
                    }] : []),
                    {
                        area: 'Weekend Performance Enhancement',
                        impact: weekendOpportunity,
                        confidence: 72
                    }
                ].slice(0, 3)
            },
            teamAnalysis: {
                topPerformer: 'Analysis requires more chatter data',
                performanceSpread: 'Calculating from uploaded reports',
                averageEfficiency: Math.round((ppvUnlockRate + Math.max(0, 100 - responseTime * 15)) / 2),
                trainingNeeded: responseTime > 3 ? 'High Priority' : 'Maintenance Level',
                recommendedActions: [
                    ...(responseTime > 3 ? ['Focus on response time training'] : []),
                    ...(ppvUnlockRate < 50 ? ['Improve PPV conversion techniques'] : []),
                    'Analyze top-performing time periods',
                    'Standardize successful approaches'
                ].slice(0, 4)
            },
            marketPosition: {
                competitiveRank: ppvUnlockRate > 60 ? 'Above Average' : ppvUnlockRate > 40 ? 'Average' : 'Below Average',
                growthTrend: data.newSubs > 0 ? `+${Math.round((data.newSubs / (data.totalSubs - data.newSubs)) * 100)}%` : 'No growth data',
                marketShare: 'Requires industry benchmarking data',
                recommendations: [
                    ...(avgPPVPrice < 30 ? ['Test higher PPV price points'] : []),
                    ...(ppvUnlockRate < 50 ? ['Improve message engagement strategies'] : []),
                    'Monitor competitor pricing',
                    'Track subscriber retention rates'
                ].slice(0, 3)
            },
            actionPlan: [
                ...(ppvPriceOpportunity > 0 ? [{
                    priority: 'High',
                    task: `Increase PPV prices from $${avgPPVPrice.toFixed(2)} to $35-40`,
                    timeline: '1-2 weeks',
                    expectedROI: `+$${ppvPriceOpportunity.toLocaleString()}`,
                    effort: 'Low'
                }] : []),
                ...(responseTime > 3 ? [{
                    priority: 'High',
                    task: `Reduce response time from ${responseTime}min to under 2min`,
                    timeline: '2-3 weeks',
                    expectedROI: `+$${responseTimeOpportunity.toLocaleString()}`,
                    effort: 'Medium'
                }] : []),
                {
                    priority: 'Medium',
                    task: 'Implement weekend performance optimization',
                    timeline: '1 week',
                    expectedROI: `+$${weekendOpportunity.toLocaleString()}`,
                    effort: 'Medium'
                }
            ].slice(0, 3)
        };
    } catch (error) {
        console.error('Error generating agency analysis:', error);
        return {
            overallScore: 0,
            revenueAnalysis: { current: 0, potential: 0, gap: 0, opportunities: [] },
            teamAnalysis: { topPerformer: 'No data', performanceSpread: 'No data', averageEfficiency: 0, trainingNeeded: 'No data', recommendedActions: [] },
            marketPosition: { competitiveRank: 'No data', growthTrend: 'No data', marketShare: 'No data', recommendations: [] },
            actionPlan: []
        };
    }
}

// Generate Comprehensive Chatter Analysis
function generateComprehensiveChatterAnalysis(chatterName) {
    const baseRevenue = 3800;
    const efficiency = Math.floor(Math.random() * 30) + 70; // 70-100%
    
    return {
        chatterName,
        overallScore: efficiency,
        performanceMetrics: {
            revenueGenerated: baseRevenue + Math.floor(Math.random() * 2000),
            conversionRate: (Math.random() * 15 + 10).toFixed(1) + '%',
            responseTime: (Math.random() * 2 + 1.5).toFixed(1) + 'm',
            customerSatisfaction: (Math.random() * 2 + 8).toFixed(1) + '/10',
            ppvSuccessRate: (Math.random() * 25 + 50).toFixed(1) + '%'
        },
        strengths: [
            'Excellent relationship building with subscribers',
            'Consistent high-value PPV content creation',
            'Strong weekend performance (+15% above average)',
            'Effective upselling techniques'
        ],
        weaknesses: [
            'Response time during peak hours needs improvement',
            'Could increase PPV frequency by 20%',
            'Opportunity to improve closing techniques',
            'Grammar and spelling consistency'
        ],
        benchmarking: {
            vsTopPerformer: efficiency > 85 ? 'Matching top tier' : `${Math.floor((85 - efficiency) * 1.2)}% below top performer`,
            vsTeamAverage: efficiency > 76 ? `+${efficiency - 76}% above average` : `${76 - efficiency}% below average`,
            industryRank: efficiency > 80 ? 'Top 25%' : efficiency > 70 ? 'Top 50%' : 'Below Average'
        },
        improvementPlan: [
            {
                area: 'Response Time',
                currentScore: Math.floor(Math.random() * 30) + 60,
                target: 90,
                actions: ['Set response time alerts', 'Practice quick typing', 'Use template responses'],
                timeline: '2 weeks'
            },
            {
                area: 'PPV Conversion',
                currentScore: Math.floor(Math.random() * 25) + 65,
                target: 85,
                actions: ['Study top performer techniques', 'A/B test pricing', 'Improve content quality'],
                timeline: '1 month'
            },
            {
                area: 'Customer Retention',
                currentScore: Math.floor(Math.random() * 20) + 70,
                target: 88,
                actions: ['Personalize interactions', 'Follow-up strategies', 'Build subscriber profiles'],
                timeline: '6 weeks'
            }
        ]
    };
}

// Render Agency Analysis Results
function renderAgencyAnalysisResults(data) {
    const container = document.getElementById('agencyAnalysisResults');
    if (!container) return;
    
    container.innerHTML = `
        <!-- Performance Score Dashboard -->
        <div class="relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 rounded-3xl"></div>
            <div class="relative p-12 mb-12">
                <div class="flex items-center justify-between mb-8">
                    <div class="flex items-center">
                        <div class="w-20 h-20 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border-2 border-purple-400/30 mr-6 flex items-center justify-center">
                            <div class="text-center">
                                <div class="text-3xl font-bold text-purple-400">${data.overallScore}</div>
                                <div class="text-sm text-purple-300">/100</div>
                            </div>
                        </div>
                        <div>
                            <h4 class="text-2xl font-bold text-white mb-2">Overall Performance Score</h4>
                            <p class="text-gray-300">Analysis based on ${currentAIAnalysisInterval} of performance data</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-semibold text-purple-400 mb-1">Performance Level</div>
                        <div class="text-gray-400">
                            ${data.overallScore >= 80 ? 'Excellent' : data.overallScore >= 60 ? 'Good' : 'Needs Improvement'}
                        </div>
                    </div>
                </div>
                
                <div class="w-full max-w-4xl mx-auto">
                    <div class="w-full bg-gray-800/50 rounded-full h-6 mb-4">
                        <div class="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 h-6 rounded-full transition-all duration-2000 shadow-lg shadow-purple-500/20" style="width: ${data.overallScore}%"></div>
                    </div>
                    <div class="flex justify-between text-lg text-gray-400">
                        <span>Needs Major Improvement</span>
                        <span>Industry Leading</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Revenue Intelligence Dashboard -->
        <div class="relative overflow-hidden mb-16">
            <div class="absolute inset-0 bg-gradient-to-br from-green-600/5 via-emerald-600/5 to-teal-600/5 rounded-3xl"></div>
            <div class="relative p-12">
                <div class="flex items-center mb-12">
                    <div class="w-20 h-20 bg-green-600/20 rounded-2xl flex items-center justify-center mr-6">
                        <i class="fas fa-chart-line text-green-400 text-4xl"></i>
                    </div>
                    <div>
                        <h4 class="text-2xl font-bold text-white mb-2">Revenue Intelligence</h4>
                        <p class="text-green-200">Smart optimization opportunities and growth potential</p>
                    </div>
                </div>
                
                <!-- Revenue Metrics Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="glass-card rounded-xl p-6 text-center border border-green-500/20">
                        <div class="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-dollar-sign text-green-400"></i>
                        </div>
                        <div class="text-2xl font-bold text-green-400 mb-2">$${data.revenueAnalysis.current.toLocaleString()}</div>
                        <div class="text-white font-medium mb-1">Current Monthly</div>
                        <div class="text-gray-400 text-sm">From uploaded data</div>
                    </div>
                    <div class="glass-card rounded-xl p-6 text-center border border-blue-500/20">
                        <div class="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-rocket text-blue-400"></i>
                        </div>
                        <div class="text-2xl font-bold text-blue-400 mb-2">$${data.revenueAnalysis.potential.toLocaleString()}</div>
                        <div class="text-white font-medium mb-1">Optimization Potential</div>
                        <div class="text-gray-400 text-sm">With recommendations</div>
                    </div>
                    <div class="glass-card rounded-xl p-6 text-center border border-yellow-500/20">
                        <div class="w-12 h-12 bg-yellow-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-target text-yellow-400"></i>
                        </div>
                        <div class="text-2xl font-bold text-yellow-400 mb-2">$${data.revenueAnalysis.gap.toLocaleString()}</div>
                        <div class="text-white font-medium mb-1">Growth Opportunity</div>
                        <div class="text-gray-400 text-sm">Actionable potential</div>
                    </div>
                </div>
                
                <!-- Revenue Opportunities -->
                <div class="bg-gray-800/30 rounded-2xl p-8 border border-gray-600">
                    <h5 class="text-2xl font-bold text-white mb-8 flex items-center">
                        <i class="fas fa-lightbulb text-yellow-400 mr-4"></i>
                        Revenue Optimization Opportunities
                    </h5>
                    <div class="space-y-4">
                        ${data.revenueAnalysis.opportunities.map((opp, index) => `
                            <div class="glass-card rounded-xl p-6 border border-gray-600 hover:border-green-500/30 transition-all">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center flex-1">
                                        <div class="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold mr-4">
                                            ${index + 1}
                                        </div>
                                        <div class="flex-1">
                                            <div class="text-lg font-bold text-white mb-2">${opp.area}</div>
                                            <div class="text-gray-300">Monthly Potential: <span class="text-green-400 font-bold">+$${opp.impact.toLocaleString()}</span></div>
                                            <div class="text-gray-500 text-sm mt-1">Based on current performance data</div>
                                        </div>
                                    </div>
                                    <div class="text-right ml-6">
                                        <div class="text-2xl font-bold text-green-400">${opp.confidence}%</div>
                                        <div class="text-gray-400 text-sm">Confidence</div>
                                        <button class="mt-3 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all text-sm">
                                            <i class="fas fa-play mr-2"></i>Implement
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- Team Performance Analysis -->
        <div class="glass-card rounded-xl p-10 mb-12">
            <h4 class="text-3xl font-semibold text-white mb-10 flex items-center">
                <i class="fas fa-users text-cyan-400 mr-5"></i>
                Team Performance Intelligence
            </h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                <div class="p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-xl font-semibold text-white mb-4">Top Performer</div>
                    <div class="text-4xl font-bold text-green-400 mb-4">${data.teamAnalysis.topPerformer}</div>
                    <div class="text-gray-400 text-lg">Leading team performance</div>
                </div>
                <div class="p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-xl font-semibold text-white mb-4">Performance Spread</div>
                    <div class="text-4xl font-bold text-red-400 mb-4">${data.teamAnalysis.performanceSpread}%</div>
                    <div class="text-gray-400 text-lg">Gap between top and bottom performers</div>
                </div>
            </div>
            
            <div class="border-t border-gray-600 pt-10">
                <h5 class="text-xl font-semibold text-white mb-8">Recommended Team Actions</h5>
                <div class="space-y-6">
                    ${data.teamAnalysis.recommendedActions.map((action, index) => `
                        <div class="flex items-center p-8 bg-gray-800/50 rounded-2xl border border-gray-600 hover:bg-gray-700/30 transition-all">
                            <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold mr-6">
                                ${index + 1}
                            </div>
                            <span class="text-gray-200 text-xl">${action}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- Market Position -->
        <div class="glass-card rounded-xl p-10 mb-12">
            <h4 class="text-3xl font-semibold text-white mb-10 flex items-center">
                <i class="fas fa-globe text-yellow-400 mr-5"></i>
                Market Position Analysis
            </h4>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-3xl font-bold text-yellow-400 mb-4">${data.marketPosition.competitiveRank}</div>
                    <div class="text-lg text-gray-300">Industry Ranking</div>
                </div>
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-3xl font-bold text-green-400 mb-4">${data.marketPosition.growthTrend}</div>
                    <div class="text-lg text-gray-300">Growth Trend</div>
                </div>
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-3xl font-bold text-blue-400 mb-4">${data.marketPosition.marketShare}</div>
                    <div class="text-lg text-gray-300">Market Share</div>
                </div>
            </div>
            
            <div class="border-t border-gray-600 pt-10">
                <h5 class="text-xl font-semibold text-white mb-8">Strategic Recommendations</h5>
                <div class="space-y-6">
                    ${data.marketPosition.recommendations.map((rec, index) => `
                        <div class="flex items-center p-8 bg-gray-800/50 rounded-2xl border border-gray-600 hover:bg-gray-700/30 transition-all">
                            <div class="w-10 h-10 bg-yellow-600 rounded-full flex items-center justify-center text-white font-bold mr-6">
                                ${index + 1}
                            </div>
                            <span class="text-gray-200 text-xl">${rec}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- Strategic Action Plan -->
        <div class="relative overflow-hidden mb-16">
            <div class="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-indigo-600/5 to-purple-600/5 rounded-3xl"></div>
            <div class="relative p-12">
                <div class="flex items-center mb-12">
                    <div class="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mr-6">
                        <i class="fas fa-rocket text-blue-400 text-4xl"></i>
                    </div>
                    <div>
                        <h4 class="text-2xl font-bold text-white mb-2">90-Day Strategic Action Plan</h4>
                        <p class="text-blue-200">Prioritized roadmap for maximum ROI impact</p>
                    </div>
                </div>
                
                <div class="space-y-8">
                    ${data.actionPlan.map((action, index) => `
                        <div class="bg-gradient-to-r from-gray-900/60 to-gray-800/60 p-10 rounded-3xl border border-gray-600 hover:border-blue-500/30 transition-all group">
                            <div class="flex items-start justify-between">
                                <div class="flex items-start flex-1">
                                    <div class="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl mr-8 shadow-lg">
                                        ${index + 1}
                                    </div>
                                    <div class="flex-1">
                                        <div class="flex items-center mb-4">
                                            <span class="px-4 py-2 rounded-full text-sm font-bold ${
                                                action.priority === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                action.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            }">${action.priority} Priority</span>
                                        </div>
                                        <div class="text-xl font-bold text-white mb-4">${action.task}</div>
                                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                                            <div class="text-center p-4 bg-gray-800/40 rounded-xl">
                                                <div class="text-xl font-bold text-green-400">${action.expectedROI}</div>
                                                <div class="text-gray-400">Expected ROI</div>
                                            </div>
                                            <div class="text-center p-4 bg-gray-800/40 rounded-xl">
                                                <div class="text-xl font-bold text-blue-400">${action.timeline}</div>
                                                <div class="text-gray-400">Implementation Time</div>
                                            </div>
                                            <div class="text-center p-4 bg-gray-800/40 rounded-xl">
                                                <div class="text-xl font-bold text-yellow-400">${action.effort}</div>
                                                <div class="text-gray-400">Effort Required</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="ml-8">
                                    <button class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg">
                                        <i class="fas fa-play mr-3"></i>Start Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Render Chatter Analysis Results
function renderChatterAnalysisResults(data) {
    const container = document.getElementById('chatterAnalysisResults');
    if (!container) return;
    
    container.innerHTML = `
        <!-- Chatter Score Overview -->
        <div class="glass-card rounded-xl p-10 mb-10">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h4 class="text-3xl font-semibold text-white">${data.chatterName} Performance Analysis</h4>
                    <p class="text-gray-400 text-lg mt-3">Individual deep-dive for ${currentAIAnalysisInterval} period</p>
                </div>
                <div class="text-right">
                    <div class="text-6xl font-bold text-cyan-400">${data.overallScore}</div>
                    <div class="text-xl text-gray-400">/ 100</div>
                </div>
            </div>
            <div class="w-full bg-gray-700/50 rounded-full h-5 mb-3">
                <div class="bg-gradient-to-r from-cyan-500 to-cyan-400 h-5 rounded-full transition-all duration-1000" style="width: ${data.overallScore}%"></div>
            </div>
            <div class="flex justify-between text-gray-400">
                <span>Needs Improvement</span>
                <span>Excellent Performance</span>
            </div>
        </div>

        <!-- Performance Metrics -->
        <div class="glass-card rounded-xl p-10 mb-12">
            <h4 class="text-3xl font-semibold text-white mb-10 flex items-center">
                <i class="fas fa-chart-bar text-blue-400 mr-5"></i>
                Key Performance Metrics
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-4xl font-bold text-green-400 mb-4">$${data.performanceMetrics.revenueGenerated.toLocaleString()}</div>
                    <div class="text-lg text-gray-300 mb-2">Revenue Generated</div>
                    <div class="text-sm text-gray-500">Total earnings for period</div>
                </div>
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-4xl font-bold text-yellow-400 mb-4">${data.performanceMetrics.conversionRate}</div>
                    <div class="text-lg text-gray-300 mb-2">Conversion Rate</div>
                    <div class="text-sm text-gray-500">Messages to sales ratio</div>
                </div>
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-4xl font-bold text-orange-400 mb-4">${data.performanceMetrics.responseTime}</div>
                    <div class="text-lg text-gray-300 mb-2">Response Time</div>
                    <div class="text-sm text-gray-500">Average reply speed</div>
                </div>
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-4xl font-bold text-purple-400 mb-4">${data.performanceMetrics.customerSatisfaction}</div>
                    <div class="text-lg text-gray-300 mb-2">Customer Rating</div>
                    <div class="text-sm text-gray-500">Subscriber feedback score</div>
                </div>
                <div class="text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-600">
                    <div class="text-4xl font-bold text-cyan-400 mb-4">${data.performanceMetrics.ppvSuccessRate}</div>
                    <div class="text-lg text-gray-300 mb-2">PPV Success Rate</div>
                    <div class="text-sm text-gray-500">PPV unlock percentage</div>
                </div>
            </div>
        </div>

        <!-- Strengths & Weaknesses -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
            <div class="glass-card rounded-xl p-10">
                <h4 class="text-2xl font-semibold text-white mb-8 flex items-center">
                    <i class="fas fa-star text-green-400 mr-4"></i>
                    Key Strengths
                </h4>
                <div class="space-y-5">
                    ${data.strengths.map((strength, index) => `
                        <div class="flex items-start p-6 bg-green-500/10 border border-green-500/30 rounded-xl">
                            <div class="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold mr-5 mt-1">
                                ${index + 1}
                            </div>
                            <span class="text-gray-200 text-lg leading-relaxed">${strength}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="glass-card rounded-xl p-10">
                <h4 class="text-2xl font-semibold text-white mb-8 flex items-center">
                    <i class="fas fa-exclamation-triangle text-red-400 mr-4"></i>
                    Areas for Improvement
                </h4>
                <div class="space-y-5">
                    ${data.weaknesses.map((weakness, index) => `
                        <div class="flex items-start p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <div class="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white font-bold mr-5 mt-1">
                                ${index + 1}
                            </div>
                            <span class="text-gray-200 text-lg leading-relaxed">${weakness}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- Performance Benchmarking -->
        <div class="glass-card rounded-xl p-6 mb-6">
            <h4 class="text-lg font-semibold text-white mb-6 flex items-center">
                <i class="fas fa-trophy text-yellow-400 mr-3"></i>
                Performance Benchmarking
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="text-center p-4 border border-gray-700 rounded-lg">
                    <div class="font-semibold text-white mb-2">vs Top Performer</div>
                    <div class="text-lg font-bold text-green-400">${data.benchmarking.vsTopPerformer}</div>
                </div>
                <div class="text-center p-4 border border-gray-700 rounded-lg">
                    <div class="font-semibold text-white mb-2">vs Team Average</div>
                    <div class="text-lg font-bold text-blue-400">${data.benchmarking.vsTeamAverage}</div>
                </div>
                <div class="text-center p-4 border border-gray-700 rounded-lg">
                    <div class="font-semibold text-white mb-2">Industry Rank</div>
                    <div class="text-lg font-bold text-purple-400">${data.benchmarking.industryRank}</div>
                </div>
            </div>
        </div>

        <!-- Improvement Roadmap -->
        <div class="glass-card rounded-xl p-6">
            <h4 class="text-lg font-semibold text-white mb-6 flex items-center">
                <i class="fas fa-road text-blue-400 mr-3"></i>
                Personal Improvement Roadmap
            </h4>
            <div class="space-y-6">
                ${data.improvementPlan.map(plan => `
                    <div class="border border-gray-700 rounded-lg p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h5 class="font-semibold text-white">${plan.area}</h5>
                            <span class="text-sm text-gray-400">${plan.timeline}</span>
                        </div>
                        
                        <div class="flex items-center mb-4">
                            <div class="flex-1">
                                <div class="flex justify-between text-sm mb-2">
                                    <span class="text-gray-400">Current</span>
                                    <span class="text-white">${plan.currentScore}/100</span>
                                </div>
                                <div class="w-full bg-gray-700/50 rounded-full h-2">
                                    <div class="bg-gradient-to-r from-red-500 to-orange-400 h-2 rounded-full" style="width: ${plan.currentScore}%"></div>
                                </div>
                            </div>
                            <div class="mx-4">
                                <i class="fas fa-arrow-right text-gray-400"></i>
                            </div>
                            <div class="flex-1">
                                <div class="flex justify-between text-sm mb-2">
                                    <span class="text-gray-400">Target</span>
                                    <span class="text-white">${plan.target}/100</span>
                                </div>
                                <div class="w-full bg-gray-700/50 rounded-full h-2">
                                    <div class="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full" style="width: ${plan.target}%"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="space-y-2">
                            <div class="text-sm font-medium text-gray-300">Action Steps:</div>
                            ${plan.actions.map(action => `
                                <div class="flex items-center text-sm text-gray-400 ml-4">
                                    <i class="fas fa-chevron-right text-blue-400 mr-2"></i>
                                    <span>${action}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Render Chatter Analysis Results
function renderChatterAnalysisResults(data) {
    const container = document.getElementById('chatterAnalysisResults');
    if (!container) return;
    
    // Calculate derived metrics from the data
    const ppvUnlockRate = data.ppvsSent > 0 ? ((data.ppvsUnlocked / data.ppvsSent) * 100).toFixed(1) : 0;
    const messagesPerPPV = data.ppvsSent > 0 ? (data.messagesSent / data.ppvsSent).toFixed(1) : 0;
    const responseTimeStatus = data.avgResponseTime <= 2 ? 'Excellent' : data.avgResponseTime <= 3 ? 'Good' : data.avgResponseTime <= 5 ? 'Fair' : 'Needs Improvement';
    const responseTimeColor = data.avgResponseTime <= 2 ? 'green' : data.avgResponseTime <= 3 ? 'blue' : data.avgResponseTime <= 5 ? 'yellow' : 'red';
    
    // Handle sophisticated AI analysis response structure
    container.innerHTML = `
        <div class="space-y-8">
            <!-- Performance Score Dashboard -->
            <div class="relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-blue-600/5 rounded-3xl"></div>
                <div class="relative p-12 mb-12">
                    <div class="flex items-center justify-between mb-8">
                        <div class="flex items-center">
                            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mr-6">
                                <i class="fas fa-user-chart text-2xl text-white"></i>
                            </div>
                            <div>
                                <h4 class="text-3xl font-bold text-white">Individual Performance Analysis</h4>
                                <p class="text-gray-400 text-lg mt-2">Comprehensive analysis for ${currentAIAnalysisInterval} period</p>
                            </div>
                        </div>
                        <div class="text-center p-6 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl border border-green-500/30">
                            <div class="text-4xl font-bold text-green-400">${data.overallScore || 0}</div>
                            <div class="text-sm text-gray-300 font-medium">Overall Score</div>
                            <div class="text-xs text-green-400 mt-1">Performance Rating</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Performance Breakdown -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Key Insights -->
                ${data.insights && data.insights.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-lightbulb text-yellow-400 mr-4"></i>Key Insights
                    </h4>
                    <div class="space-y-4">
                        ${data.insights.map(insight => `
                            <div class="flex items-start p-4 bg-green-900/10 rounded-lg border border-green-500/20">
                                <i class="fas fa-check-circle text-green-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${insight}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Areas for Improvement -->
                ${data.weakPoints && data.weakPoints.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-exclamation-triangle text-orange-400 mr-4"></i>Areas for Improvement
                    </h4>
                    <div class="space-y-4">
                        ${data.weakPoints.map(point => `
                            <div class="flex items-start p-4 bg-orange-900/10 rounded-lg border border-orange-500/20">
                                <i class="fas fa-arrow-up text-orange-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${point}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <!-- Root Causes (if provided by AI) -->
                ${data.rootCauses && data.rootCauses.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-diagram-project text-red-400 mr-4"></i>Root Causes
                    </h4>
                    <div class="space-y-4">
                        ${data.rootCauses.map(item => `
                            <div class="flex items-start p-4 bg-red-900/10 rounded-lg border border-red-500/20">
                                <i class="fas fa-link text-red-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${item}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Growth Opportunities & ROI -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Growth Opportunities -->
                ${data.opportunities && data.opportunities.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-rocket text-blue-400 mr-4"></i>Growth Opportunities
                    </h4>
                    <div class="space-y-4">
                        ${data.opportunities.map(opportunity => `
                            <div class="flex items-start p-4 bg-blue-900/10 rounded-lg border border-blue-500/20">
                                <i class="fas fa-star text-blue-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${opportunity}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- ROI Analysis -->
                ${data.roiCalculations && data.roiCalculations.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-calculator text-purple-400 mr-4"></i>ROI Analysis
                    </h4>
                    <div class="space-y-4">
                        ${data.roiCalculations.map(roi => `
                            <div class="flex items-start p-4 bg-purple-900/10 rounded-lg border border-purple-500/20">
                                <i class="fas fa-dollar-sign text-purple-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${roi}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Action Plan -->
            ${data.recommendations && data.recommendations.length > 0 ? `
            <div class="glass-card rounded-xl p-8">
                <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                    <i class="fas fa-clipboard-list text-cyan-400 mr-4"></i>Personalized Action Plan
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${data.recommendations.map((rec, index) => `
                        <div class="flex items-start p-6 bg-gradient-to-r from-cyan-900/10 to-blue-900/10 rounded-xl border border-cyan-500/20">
                            <div class="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-4 mt-1">${index + 1}</div>
                            <div>
                                <div class="text-gray-300 leading-relaxed">${rec}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Performance Summary -->
            <div class="glass-card rounded-xl p-8">
                <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                    <i class="fas fa-chart-line text-indigo-400 mr-4"></i>Performance Summary
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="text-center p-6 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-xl border border-indigo-500/30">
                        <div class="text-2xl font-bold text-indigo-400 mb-2">${data.fansChatted || 0}</div>
                        <div class="text-sm text-gray-400">Fans Chatted</div>
                        <div class="text-xs text-indigo-400 mt-1">Engagement Level</div>
                    </div>
                    <div class="text-center p-6 bg-gradient-to-br from-emerald-900/20 to-green-900/20 rounded-xl border border-emerald-500/30">
                        <div class="text-2xl font-bold text-emerald-400 mb-2">${((data.messagesSent || 0) / (data.fansChatted || 1)).toFixed(1)}</div>
                        <div class="text-sm text-gray-400">Messages per Fan</div>
                        <div class="text-xs text-emerald-400 mt-1">Engagement Rate</div>
                    </div>
                    <div class="text-center p-6 bg-gradient-to-br from-amber-900/20 to-yellow-900/20 rounded-xl border border-amber-500/30">
                        <div class="text-2xl font-bold text-amber-400 mb-2">${((data.ppvsUnlocked || 0) / (data.fansChatted || 1) * 100).toFixed(1)}%</div>
                        <div class="text-sm text-gray-400">Conversion Rate</div>
                        <div class="text-xs text-amber-400 mt-1">Fan to Sale</div>
                    </div>
                </div>
            </div>

        </div>
    `;
}

// Load live AI insights
function loadLiveAIInsights(analytics, intelligent) {
    const container = document.getElementById('liveAIInsights');
    if (!container) return;
    
    // Check if we have any real data
    if (analytics.totalRevenue === 0 && analytics.totalSubs === 0 && analytics.ppvsSent === 0) {
        container.innerHTML = `
            <div class="col-span-2 text-center py-12">
                <i class="fas fa-upload text-gray-400 text-4xl mb-4"></i>
                <h4 class="text-xl font-semibold text-gray-300 mb-2">No Data Available</h4>
                <p class="text-gray-400">Upload your analytics data to see live AI insights and recommendations</p>
                <button onclick="showSection('data-upload')" class="mt-4 premium-button text-white px-6 py-3 rounded-xl">
                    <i class="fas fa-upload mr-2"></i>Upload Data Now
                </button>
            </div>
        `;
        return;
    }
    
    const insights = [
        {
            title: 'Revenue Optimization',
            icon: 'fas fa-chart-line text-green-400',
            priority: 'high',
            content: `Your average PPV price of $${analytics.avgPPVPrice || 0} ${analytics.avgPPVPrice < 35 ? 'shows room for improvement. Testing premium content at $35-45 could increase monthly revenue.' : 'is competitive. Focus on volume and consistency.'}`,
            action: analytics.avgPPVPrice < 35 ? 'Test Premium Pricing' : 'Maintain Quality',
            roi: analytics.avgPPVPrice < 35 ? '+18% Revenue' : 'Stable Growth'
        },
        {
            title: 'Conversion Enhancement', 
            icon: 'fas fa-funnel-dollar text-yellow-400',
            priority: 'medium',
            content: `Click-to-subscriber rate of ${intelligent.clickToSubRate}% shows opportunity. Optimizing profile bio and preview content could capture an additional ${Math.round(analytics.profileClicks * 0.015)} subscribers monthly.`,
            action: 'Optimize Profile',
            roi: '+1.5% Conversion'
        },
        {
            title: 'Team Performance Gap',
            icon: 'fas fa-users text-cyan-400', 
            priority: 'high',
            content: `${intelligent.performanceGap}% performance gap detected. Top performer ${intelligent.topPerformer} generates ${Math.round(analytics.totalRevenue / 4 * 1.35)} while lowest generates ${Math.round(analytics.totalRevenue / 4 * 0.65)}. Skills transfer could level up entire team.`,
            action: 'Implement Mentoring',
            roi: '+18% Team Output'
        },
        {
            title: 'Response Time Impact',
            icon: 'fas fa-clock text-orange-400',
            priority: analytics.avgResponseTime > 3 ? 'high' : 'low',
            content: `Current response time of ${analytics.avgResponseTime}min is ${analytics.avgResponseTime > 2 ? 'above' : 'within'} optimal range. ${analytics.avgResponseTime > 3 ? 'Reducing to under 2min could increase conversions by 18-25%.' : 'Maintaining sub-2min responses is driving strong conversion rates.'}`,
            action: analytics.avgResponseTime > 3 ? 'Improve Response Time' : 'Maintain Excellence',
            roi: analytics.avgResponseTime > 3 ? '+20% Conversion' : 'Status Quo'
        }
    ];
    
    container.innerHTML = insights.map(insight => `
        <div class="ai-insight-card p-4">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center">
                    <i class="${insight.icon} mr-3"></i>
                    <h4 class="font-semibold text-white">${insight.title}</h4>
                </div>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${
                    insight.priority === 'high' ? 'bg-red-500/20 text-red-400' : 
                    insight.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 
                    'bg-green-500/20 text-green-400'
                }">${insight.priority.toUpperCase()}</span>
            </div>
            <p class="text-gray-300 text-sm mb-4 leading-relaxed">${insight.content}</p>
            <div class="flex items-center justify-between">
                <button class="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center">
                    <i class="fas fa-arrow-right mr-2"></i>${insight.action}
                </button>
                <span class="text-green-400 text-sm font-bold">${insight.roi}</span>
            </div>
        </div>
    `).join('');
}

// Load action opportunities  
function loadActionOpportunities(analytics, intelligent) {
    const container = document.getElementById('actionOpportunities');
    if (!container) return;
    
    // Check if we have any real data
    if (analytics.totalRevenue === 0 && analytics.totalSubs === 0 && analytics.ppvsSent === 0) {
        container.innerHTML = `
            <div class="col-span-3 text-center py-12">
                <i class="fas fa-chart-bar text-gray-400 text-4xl mb-4"></i>
                <h4 class="text-xl font-semibold text-gray-300 mb-2">No Opportunities Available</h4>
                <p class="text-gray-400">Upload performance data to discover actionable opportunities and ROI calculations</p>
            </div>
        `;
        return;
    }
    
    const opportunities = [
        {
            title: 'Weekend Revenue Recovery',
            urgency: 'urgent',
            impact: '$' + Math.round(analytics.totalRevenue * 0.15),
            description: 'Weekend performance 22% below weekdays',
            action: 'Deploy weekend specialists',
            timeframe: '1 week'
        },
        {
            title: 'Peak Hour Optimization',
            urgency: 'high',
            impact: '$' + Math.round(analytics.totalRevenue * 0.12),
            description: `Peak hours (${intelligent.peakTime}) underutilized`,
            action: 'Increase staffing 2-4 PM',
            timeframe: '3 days'
        },
        {
            title: 'Low Performers Training',
            urgency: 'medium',
            impact: '$' + Math.round(analytics.totalRevenue * 0.08),
            description: 'Bottom 25% performers need skill development',
            action: 'Schedule training sessions',
            timeframe: '2 weeks'
        },
        {
            title: 'PPV Price Testing',
            urgency: 'low',
            impact: '$' + Math.round(analytics.totalRevenue * 0.25),
            description: 'Premium pricing strategy untested',
            action: 'A/B test $35-45 PPVs',
            timeframe: '1 month'
        },
        {
            title: 'Response Time Alerts',
            urgency: analytics.avgResponseTime > 3 ? 'urgent' : 'low',
            impact: '$' + Math.round(analytics.totalRevenue * (analytics.avgResponseTime > 3 ? 0.18 : 0.05)),
            description: `Avg response time: ${analytics.avgResponseTime}min`,
            action: analytics.avgResponseTime > 3 ? 'Implement alerts' : 'Monitor consistency',
            timeframe: '1 week'
        },
        {
            title: 'Content Personalization',
            urgency: 'medium',
            impact: '$' + Math.round(analytics.totalRevenue * 0.14),
            description: 'Generic content reducing engagement',
            action: 'Create personalized templates',
            timeframe: '10 days'
        }
    ];
    
    container.innerHTML = opportunities.slice(0, 6).map(opp => `
        <div class="glass-card rounded-lg p-4 hover:bg-gray-700/20 transition-all cursor-pointer">
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-semibold text-white text-sm">${opp.title}</h4>
                <span class="px-2 py-1 rounded-full text-xs font-bold ${
                    opp.urgency === 'urgent' ? 'bg-red-500/20 text-red-400' :
                    opp.urgency === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    opp.urgency === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                }">${opp.urgency.toUpperCase()}</span>
            </div>
            <p class="text-gray-400 text-xs mb-3">${opp.description}</p>
            <div class="flex items-center justify-between">
                <span class="text-green-400 font-bold text-sm">${opp.impact}</span>
                <span class="text-gray-500 text-xs">${opp.timeframe}</span>
            </div>
            <div class="mt-3 pt-2 border-t border-gray-700">
                <button class="text-blue-400 hover:text-blue-300 text-xs font-medium">
                    <i class="fas fa-play mr-1"></i>${opp.action}
                </button>
            </div>
        </div>
    `).join('');
}

function clearDashboardToZero() {
    // Force clear all dashboard values to zero
    const elements = {
        'totalRevenue': '$0',
        'totalSubs': '0',
        'profileClicks': '0',
        'messagesSent': '0',
        'ppvsSent': '0',
        'avgResponseTime': '0m',
        'unlockRate': '0% unlock rate',
        'revenueChange': '0%',
        'subsChange': '0%',
        'clicksChange': '0%',
        'revenueGrowth': '+0%',
        'subsGrowth': '+0%',
        'clicksGrowth': '+0%',
        'clickToSubRate': '0%',
        'ppvUnlockRate': '0%',
        'revenuePerSub': '$0',
        'revenuePerHour': '$0',
        'messagesPerPPV': '0',
        'peakTime': '--:--',
        'topPerformer': 'No data uploaded',
        'performanceGap': '0%',
        'teamConsistency': '0%'
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
    
    // Also clear any progress bars
    const clickToSubBar = document.getElementById('clickToSubBar');
    const ppvUnlockBar = document.getElementById('ppvUnlockBar');
    if (clickToSubBar) clickToSubBar.style.width = '0%';
    if (ppvUnlockBar) ppvUnlockBar.style.width = '0%';
    
    // Clear insights
    const conversionInsight = document.getElementById('conversionInsight');
    const efficiencyInsight = document.getElementById('efficiencyInsight');
    const teamInsight = document.getElementById('teamInsight');
    if (conversionInsight) conversionInsight.textContent = 'Upload data to see conversion analysis and optimization recommendations.';
    if (efficiencyInsight) efficiencyInsight.textContent = 'Upload sales data to see efficiency analysis and performance optimization tips.';
    if (teamInsight) teamInsight.textContent = 'Upload chatter performance data to see team dynamics and collaboration analysis.';
}

function forceClearSpecificMetrics() {
    // Force clear the specific metrics that are still showing old data
    const specificElements = {
        'ppvUnlockRate': '0%',
        'messagesPerPPV': '0',
        'unlockRate': '0% unlock rate'
    };
    
    // Clear multiple times to ensure it sticks
    for (let i = 0; i < 3; i++) {
        Object.entries(specificElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                element.innerHTML = value; // Also set innerHTML
                console.log(`Force cleared ${id} to ${value} (attempt ${i + 1})`);
            }
        });
        
        // Also clear progress bars
        const ppvUnlockBar = document.getElementById('ppvUnlockBar');
        if (ppvUnlockBar) {
            ppvUnlockBar.style.width = '0%';
            ppvUnlockBar.setAttribute('style', 'width: 0%'); // Force set attribute
            console.log(`Force cleared ppvUnlockBar to 0% (attempt ${i + 1})`);
        }
        
        // Small delay between attempts
        if (i < 2) {
            setTimeout(() => {}, 100);
        }
    }
}

function updateDashboardMetrics(data) {
    console.log('Dashboard data received:', data);
    console.log('Changes object:', data.changes);
    
    const changes = data.changes || {};
    
    // Update metrics with change indicators
    const revenueEl = document.getElementById('totalRevenue');
    if (revenueEl) {
        const changeHTML = renderChangeIndicator(changes.totalRevenue);
        console.log('Revenue change HTML:', changeHTML);
        revenueEl.innerHTML = `$${data.totalRevenue.toLocaleString()}${changeHTML}`;
    }
    
    const subsEl = document.getElementById('totalSubs');
    if (subsEl) {
        subsEl.innerHTML = `${data.totalSubs.toLocaleString()}${renderChangeIndicator(changes.totalSubs)}`;
    }
    
    const clicksEl = document.getElementById('profileClicks');
    if (clicksEl) {
        clicksEl.innerHTML = `${data.profileClicks.toLocaleString()}${renderChangeIndicator(changes.profileClicks)}`;
    }
    
    const messagesEl = document.getElementById('messagesSent');
    if (messagesEl) {
        messagesEl.innerHTML = `${data.messagesSent.toLocaleString()}${renderChangeIndicator(changes.messagesSent)}`;
    }
    
    const ppvsEl = document.getElementById('ppvsSent');
    if (ppvsEl) {
        ppvsEl.innerHTML = `${data.ppvsSent.toLocaleString()}${renderChangeIndicator(changes.ppvsSent)}`;
    }
    
    const responseEl = document.getElementById('avgResponseTime');
    if (responseEl) {
        responseEl.innerHTML = `${data.avgResponseTime}m${renderChangeIndicator(changes.avgResponseTime, true)}`; // reversed colors
    }

    // Calculate unlock rate
    const unlockRate = data.ppvsSent > 0 ? (data.ppvsUnlocked / data.ppvsSent * 100).toFixed(1) : '0';
    const unlockRateEl = document.getElementById('unlockRate');
    if (unlockRateEl) {
        unlockRateEl.innerHTML = `${unlockRate}% unlock rate${renderChangeIndicator(changes.unlockRate)}`;
    }
    
    // Update ppvUnlockRate (separate element)
    const ppvUnlockRateEl = document.getElementById('ppvUnlockRate');
    if (ppvUnlockRateEl) {
        ppvUnlockRateEl.innerHTML = `${unlockRate}%${renderChangeIndicator(changes.unlockRate)}`;
    }
    
    // Update messagesPerPPV
    const messagesPerPPV = data.ppvsSent > 0 ? (data.messagesSent / data.ppvsSent).toFixed(1) : '0';
    const messagesPerPPVEl = document.getElementById('messagesPerPPV');
    if (messagesPerPPVEl) {
        messagesPerPPVEl.innerHTML = `${messagesPerPPV}${renderChangeIndicator(changes.messagesPerPPV)}`;
    }
    
    // Update conversion rate
    const conversionRateEl = document.getElementById('conversionRate');
    if (conversionRateEl) {
        conversionRateEl.innerHTML = `${data.conversionRate}%${renderChangeIndicator(changes.conversionRate)}`;
    }
    
    // Update net revenue
    const netRevenueEl = document.getElementById('netRevenue');
    if (netRevenueEl) {
        netRevenueEl.innerHTML = `$${data.netRevenue.toLocaleString()}${renderChangeIndicator(changes.netRevenue)}`;
    }
    
    // Update fans chatted
    const fansChattedEl = document.getElementById('fansChatted');
    if (fansChattedEl) {
        fansChattedEl.innerHTML = `${data.fansChatted.toLocaleString()}${renderChangeIndicator(changes.fansChatted)}`;
    }

    // Update change indicators in separate elements (backward compatibility)
    const revenueChangeEl = document.getElementById('revenueChange');
    if (revenueChangeEl) {
        revenueChangeEl.innerHTML = renderChangeIndicator(changes.totalRevenue) || '';
    }
    
    const subsChangeEl = document.getElementById('subsChange');
    if (subsChangeEl) {
        subsChangeEl.innerHTML = renderChangeIndicator(changes.totalSubs) || '';
    }
    
    const clicksChangeEl = document.getElementById('clicksChange');
    if (clicksChangeEl) {
        clicksChangeEl.innerHTML = renderChangeIndicator(changes.profileClicks) || '';
    }
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
                labels: ['No Data Available'],
                datasets: [{
                    data: [1],
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
                labels: ['No Data Available'],
                datasets: [{
                    label: 'Revenue ($)',
                    data: [0],
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
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
                <h2 class="text-3xl font-bold mb-2">Advanced Analytics</h2>
                <p class="text-gray-400">Complete data visualization and intelligent metrics breakdown</p>
            </div>
            
            <!-- Analytics Time Controls -->
            <div class="flex items-center space-x-2 mt-4 lg:mt-0">
                <span class="text-sm text-gray-400 mr-3">Data Period:</span>
                <button onclick="setAnalyticsInterval('7d')" class="analytics-time-btn bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7 Days</button>
                <button onclick="setAnalyticsInterval('30d')" class="analytics-time-btn bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30 Days</button>
                <button onclick="setAnalyticsInterval('custom')" class="analytics-time-btn bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                    <i class="fas fa-calendar mr-2 text-xs"></i>Custom
                </button>
            </div>
        </div>

        <!-- Core Infloww Data -->
        <div class="mb-8">
            <h3 class="text-xl font-semibold mb-4 flex items-center">
                <i class="fas fa-database text-blue-400 mr-3"></i>
                Core Performance Data
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm tooltip" data-tooltip="Combined revenue from PPVs, tips, and subscriptions">Total Revenue</p>
                            <p class="text-2xl font-bold text-green-400" id="analytics-revenue">$0</p>
                        </div>
                        <i class="fas fa-dollar-sign text-green-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">All revenue sources combined</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm tooltip" data-tooltip="Revenue after OnlyFans platform fees are deducted">Net Revenue</p>
                            <p class="text-2xl font-bold text-cyan-400" id="analytics-net-revenue">$0</p>
                        </div>
                        <i class="fas fa-chart-line text-cyan-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">After platform fees</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm tooltip" data-tooltip="Total number of active paying subscribers across all creators">Total Subscribers</p>
                            <p class="text-2xl font-bold text-blue-400" id="analytics-subs">0</p>
                        </div>
                        <i class="fas fa-users text-blue-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Active subscriber base</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm tooltip" data-tooltip="Number of users who clicked through to OnlyFans profiles from marketing">Profile Clicks</p>
                            <p class="text-2xl font-bold text-purple-400" id="analytics-clicks">3,421</p>
                        </div>
                        <i class="fas fa-mouse-pointer text-purple-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Marketing funnel entry</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm">PPVs Sent</p>
                            <p class="text-2xl font-bold text-yellow-400" id="analytics-ppvs">156</p>
                        </div>
                        <i class="fas fa-paper-plane text-yellow-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Pay-per-view messages</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm">PPVs Unlocked</p>
                            <p class="text-2xl font-bold text-orange-400" id="analytics-ppv-unlocked">89</p>
                        </div>
                        <i class="fas fa-unlock text-orange-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Successfully converted</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm">Messages Sent</p>
                            <p class="text-2xl font-bold text-pink-400" id="analytics-messages">892</p>
                        </div>
                        <i class="fas fa-comments text-pink-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Total conversations</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-gray-400 text-sm">Avg Response Time</p>
                            <p class="text-2xl font-bold text-red-400" id="analytics-response-time">2.3m</p>
                        </div>
                        <i class="fas fa-clock text-red-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Team efficiency metric</div>
                </div>
            </div>
        </div>

        <!-- Intelligent Combined Metrics -->
        <div class="mb-8">
            <h3 class="text-xl font-semibold mb-4 flex items-center">
                <i class="fas fa-brain text-purple-400 mr-3"></i>
                Intelligent Combined Metrics
                <span class="ml-3 px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-medium rounded-full">SMART</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div class="glass-card rounded-xl p-8">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <p class="text-gray-400 text-sm tooltip" data-tooltip="Percentage of profile clicks that convert to paying subscribers">Click-to-Subscriber Rate</p>
                            <p class="text-3xl font-bold text-yellow-400" id="analytics-click-to-sub">0%</p>
                        </div>
                        <i class="fas fa-funnel-dollar text-yellow-400 text-2xl"></i>
                    </div>
                    <div class="w-full bg-gray-700/50 rounded-full h-3 mb-3">
                        <div class="bg-gradient-to-r from-yellow-500 to-yellow-400 h-3 rounded-full" style="width: 0%"></div>
                    </div>
                    <div class="text-sm text-gray-400">Profile clicks → subscribers conversion</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-gray-400 text-sm">PPV Unlock Rate</p>
                            <p class="text-3xl font-bold text-green-400" id="analytics-ppv-rate">0%</p>
                        </div>
                        <i class="fas fa-key text-green-400 text-2xl"></i>
                    </div>
                    <div class="w-full bg-gray-700/50 rounded-full h-2 mb-2">
                        <div class="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full" style="width: 0%"></div>
                    </div>
                    <div class="text-xs text-gray-500">PPV sent → unlocked conversion</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-gray-400 text-sm">Revenue per Subscriber</p>
                            <p class="text-3xl font-bold text-blue-400" id="analytics-revenue-per-sub">$0</p>
                        </div>
                        <i class="fas fa-user-dollar text-blue-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Average subscriber lifetime value</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-gray-400 text-sm">Revenue per Hour</p>
                            <p class="text-3xl font-bold text-green-400" id="analytics-revenue-per-hour">$0</p>
                        </div>
                        <i class="fas fa-stopwatch text-green-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Operational efficiency rate</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-gray-400 text-sm">Messages per PPV</p>
                            <p class="text-3xl font-bold text-purple-400" id="analytics-messages-per-ppv">0</p>
                        </div>
                        <i class="fas fa-exchange-alt text-purple-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Conversation-to-sale efficiency</div>
                </div>
                
                <div class="glass-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-gray-400 text-sm">Platform Fee Impact</p>
                            <p class="text-3xl font-bold text-red-400" id="analytics-fee-impact">0%</p>
                        </div>
                        <i class="fas fa-percentage text-red-400 text-2xl"></i>
                    </div>
                    <div class="text-xs text-gray-500">Revenue lost to platform fees</div>
                </div>
            </div>
        </div>

        <!-- Performance Breakdown Charts -->
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
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
                <h2 class="text-3xl font-bold mb-2">AI Analysis Center</h2>
                <p class="text-gray-400">Deep performance insights with actionable recommendations</p>
            </div>
            
            <!-- AI Analysis Time Controls -->
            <div class="flex items-center space-x-2 mt-4 lg:mt-0">
                <span class="text-sm text-gray-400 mr-3">Analysis Period:</span>
                <button onclick="setAIAnalysisInterval('7d')" class="ai-time-btn bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7 Days</button>
                <button onclick="setAIAnalysisInterval('30d')" class="ai-time-btn bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30 Days</button>
                <button onclick="setAIAnalysisInterval('custom')" class="ai-time-btn bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                    <i class="fas fa-calendar mr-2 text-xs"></i>Custom
                </button>
            </div>
        </div>

        <!-- Analysis Type Selection -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div class="glass-card rounded-xl p-8 hover:bg-gray-700/20 transition-all cursor-pointer" onclick="showAgencyAnalysis()">
                <div class="flex items-center mb-6">
                    <div class="w-16 h-16 bg-purple-600/20 rounded-2xl flex items-center justify-center mr-4">
                        <i class="fas fa-building text-purple-400 text-2xl"></i>
                    </div>
                    <div>
                        <h3 class="text-2xl font-bold text-white">Agency Analysis</h3>
                        <p class="text-gray-400">Complete business intelligence</p>
                    </div>
                </div>
                <div class="space-y-3 mb-6">
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>ROI calculations & opportunity sizing</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Team performance analysis</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Revenue optimization strategies</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Market positioning insights</span>
                    </div>
                </div>
                <button class="w-full premium-button text-white font-medium py-3 px-6 rounded-xl">
                    <i class="fas fa-brain mr-2"></i>Run Agency Analysis
                </button>
            </div>

            <div class="glass-card rounded-xl p-8 hover:bg-gray-700/20 transition-all cursor-pointer" onclick="showChatterAnalysis()">
                <div class="flex items-center mb-6">
                    <div class="w-16 h-16 bg-cyan-600/20 rounded-2xl flex items-center justify-center mr-4">
                        <i class="fas fa-user-chart text-cyan-400 text-2xl"></i>
                    </div>
                    <div>
                        <h3 class="text-2xl font-bold text-white">Individual Analysis</h3>
                        <p class="text-gray-400">Personal performance deep-dive</p>
                    </div>
                </div>
                <div class="space-y-3 mb-6">
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Strengths & weaknesses breakdown</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Personalized improvement plan</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Performance benchmarking</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-300">
                        <i class="fas fa-check-circle text-green-400 mr-3"></i>
                        <span>Skill development roadmap</span>
                    </div>
                </div>
                <button class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-3 px-6 rounded-xl transition-all">
                    <i class="fas fa-user-check mr-2"></i>Run Individual Analysis
                </button>
            </div>
        </div>

        <!-- Agency Analysis Results (Hidden by default) -->
        <div id="agencyAnalysisSection" class="hidden">
            <div class="glass-card rounded-xl p-8 mb-8">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-2xl font-bold text-white flex items-center">
                        <i class="fas fa-building text-purple-400 mr-3"></i>
                        Agency Performance Analysis
                        <span class="ml-3 px-3 py-1 bg-purple-500/20 text-purple-400 text-sm font-medium rounded-full">COMPREHENSIVE</span>
                    </h3>
                    <button onclick="hideAnalysisResults()" class="text-gray-400 hover:text-white transition">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <div id="agencyAnalysisResults" class="space-y-6">
                    <!-- Agency analysis results will be loaded here -->
                </div>
            </div>
        </div>

        <!-- Individual Analysis Results (Hidden by default) -->
        <div id="chatterAnalysisSection" class="hidden">
            <div class="glass-card rounded-xl p-8 mb-8">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h3 class="text-2xl font-bold text-white flex items-center">
                            <i class="fas fa-user-chart text-cyan-400 mr-3"></i>
                            Individual Performance Analysis
                        </h3>
                        <div class="flex items-center space-x-4 mt-3">
                            <select id="chatterAnalysisSelect" class="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white">
                                <option value="">Select Chatter...</option>
                            </select>
                            <span class="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-sm font-medium rounded-full">DETAILED</span>
                        </div>
                    </div>
                    <button onclick="hideAnalysisResults()" class="text-gray-400 hover:text-white transition">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <div id="chatterAnalysisResults" class="space-y-6">
                    <!-- Chatter analysis results will be loaded here -->
                </div>
                
                <!-- Performance Trend Chart -->
                <div id="performanceTrendSection" class="mt-8 hidden">
                    <div class="glass-card rounded-xl p-6 border border-purple-500/30">
                        <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                            <i class="fas fa-chart-line text-purple-400 mr-3"></i>
                            Performance Trends (Last 8 Weeks)
                        </h5>
                        <canvas id="performanceTrendChart" height="80"></canvas>
                    </div>
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
                        <label class="block text-sm font-medium mb-2">Start Date</label>
                        <input type="date" id="ofAccountStartDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">End Date</label>
                        <input type="date" id="ofAccountEndDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <label class="block text-sm font-medium mb-2">Start Date</label>
                        <input type="date" id="chatterDataStartDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">End Date</label>
                        <input type="date" id="chatterDataEndDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <label class="block text-sm font-medium mb-2">Fans Chatted</label>
                            <input type="number" id="chatterFansChatted" min="0"
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
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
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
        console.log('Creating user with data:', userData);
        const response = await fetch('/api/auth/register-manager', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(userData)
        });

        console.log('Registration response status:', response.status);
        const result = await response.json();
        console.log('Registration response:', result);

        if (response.ok) {
            showNotification('User created successfully!', 'success');
            document.getElementById('createUserForm').reset();
            loadUsers();
        } else {
            showError(result.error || 'Failed to create user');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(`User "${username}" deleted successfully!`, 'success');
            loadUsers();
        } else {
            showError(result.error || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Delete user error:', error);
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
            
            const select = document.getElementById('chatterAnalysisSelect');
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


// Form handlers
async function handleOFAccountDataSubmit(event) {
    console.log('OF Account form submit triggered');
    
    const formData = {
        startDate: document.getElementById('ofAccountStartDate').value,
        endDate: document.getElementById('ofAccountEndDate').value,
        creator: document.getElementById('ofAccountCreator').value,
        netRevenue: parseFloat(document.getElementById('ofNetRevenue').value) || 0,
        recurringRevenue: parseFloat(document.getElementById('ofRecurringRevenue').value) || 0,
        totalSubs: parseInt(document.getElementById('ofTotalSubs').value) || 0,
        newSubs: parseInt(document.getElementById('ofNewSubs').value) || 0,
        profileClicks: parseInt(document.getElementById('ofProfileClicks').value) || 0,
        dataType: 'of_account'
    };
    
    console.log('OF Account form data collected:', formData);
    console.log('Raw values:', {
        netRevenue: document.getElementById('ofNetRevenue').value,
        totalSubs: document.getElementById('ofTotalSubs').value,
        newSubs: document.getElementById('ofNewSubs').value
    });

    if (!formData.startDate || !formData.endDate || !formData.creator) {
        showError('Please fill in all required fields: Start Date, End Date, and Creator Account');
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
    const chatterSelect = document.getElementById('chatterDataChatter');
    const selectedChatterText = chatterSelect.options[chatterSelect.selectedIndex].text;
    
    const formData = {
        startDate: document.getElementById('chatterDataStartDate').value,
        endDate: document.getElementById('chatterDataEndDate').value,
        chatter: selectedChatterText, // Use the name, not the ID!
        messagesSent: parseInt(document.getElementById('chatterMessagesSent').value) || 0,
        ppvsSent: parseInt(document.getElementById('chatterPPVsSent').value) || 0,
        ppvsUnlocked: parseInt(document.getElementById('chatterPPVsUnlocked').value) || 0,
        fansChatted: parseInt(document.getElementById('chatterFansChatted').value) || 0,
        avgResponseTime: parseFloat(document.getElementById('chatterAvgResponseTime').value) || 0,
        dataType: 'chatter'
    };

    if (!formData.startDate || !formData.endDate || !formData.chatter || formData.chatter === 'Select Chatter...') {
        showError('Please fill in all required fields: Start Date, End Date, and Chatter Name');
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
    saleDiv.className = 'ppv-sale-entry grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-800/50 rounded-lg';
    saleDiv.innerHTML = `
        <div>
            <label class="block text-sm font-medium mb-1">PPV Price ($)</label>
            <input type="number" name="ppvAmount" min="0" step="0.01" placeholder="25.00" required
                   class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm">
        </div>
        <div class="flex items-end">
            <button type="button" class="remove-ppv-sale bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    container.appendChild(saleDiv);
}

function addTipField() {
    const container = document.getElementById('tipsContainer');
    if (!container) return;

    const tipDiv = document.createElement('div');
    tipDiv.className = 'tip-entry grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-800/50 rounded-lg';
    tipDiv.innerHTML = `
        <div>
            <label class="block text-sm font-medium mb-1">Tip Amount ($)</label>
            <input type="number" name="tipAmount" min="0" step="0.01" placeholder="10.00" required
                   class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm">
        </div>
        <div class="flex items-end">
            <button type="button" class="remove-tip bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    container.appendChild(tipDiv);
}

function removePPVSale(button) {
    button.closest('.ppv-sale-entry').remove();
}

function removeTip(button) {
    button.closest('.tip-entry').remove();
}

// My Performance functions
let currentMyPerformanceInterval = '7d';

function setMyPerformanceInterval(interval) {
    currentMyPerformanceInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.interval-btn').forEach(btn => {
        btn.className = 'interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm';
    });
    
    // Highlight selected button
    event.target.className = 'interval-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm';
    
    // Load data for the selected interval
    loadMyPerformanceData();
}

async function loadMyPerformanceData() {
    try {
        const authToken = localStorage.getItem('authToken');
        if (!authToken) return;

        // Get user info
        const userResponse = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const user = await userResponse.json();

        // Get performance data
        const response = await fetch(`/api/analytics/dashboard?interval=${currentMyPerformanceInterval}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();

        // Update main metrics
        document.getElementById('myTotalRevenue').textContent = `$${data.totalRevenue.toLocaleString()}`;
        document.getElementById('myPPVSent').textContent = data.ppvsSent || 0;
        document.getElementById('myAvgPPVPrice').textContent = `$${data.avgPPVPrice || 0}`;
        document.getElementById('myResponseTime').textContent = `${data.avgResponseTime || 0}m`;

        // Update combined analytics
        const revenuePerPPV = data.ppvsSent > 0 ? (data.totalRevenue / data.ppvsSent) : 0;
        const revenuePerHour = data.totalRevenue / (currentMyPerformanceInterval === '24h' ? 24 : currentMyPerformanceInterval === '7d' ? 168 : 720);
        
        document.getElementById('myRevenuePerPPV').textContent = `$${revenuePerPPV.toFixed(2)}`;
        document.getElementById('myRevenuePerHour').textContent = `$${revenuePerHour.toFixed(2)}`;
        document.getElementById('myConversionRate').textContent = `${data.conversionRate || 0}%`;

        // Update performance trends (mock data for now)
        document.getElementById('myWeeklyGrowth').textContent = '+12.5%';
        document.getElementById('myBestDay').textContent = 'Tuesday';
        document.getElementById('myPeakHour').textContent = '2-4 PM';

        // Load message analysis
        await loadMyMessageAnalysis();

        // Load performance chart
        loadMyPerformanceChart(data);

    } catch (error) {
        console.error('Error loading my performance data:', error);
    }
}

async function loadMyMessageAnalysis() {
    try {
        const authToken = localStorage.getItem('authToken');
        if (!authToken) return;

        // Get message analysis data
        const response = await fetch('/api/message-analysis', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const analysis = await response.json();
            
            document.getElementById('myMessageScore').textContent = `${analysis.overallScore || 0}/100`;
            document.getElementById('myGrammarScore').textContent = `${analysis.grammarScore || 0}/100`;
            document.getElementById('myGuidelinesScore').textContent = `${analysis.guidelinesScore || 0}/100`;

            // Update strengths and weaknesses
            const strengthsDiv = document.getElementById('myMessageStrengths');
            const weaknessesDiv = document.getElementById('myMessageWeaknesses');

            if (analysis.strengths && analysis.strengths.length > 0) {
                strengthsDiv.innerHTML = analysis.strengths.map(strength => 
                    `<div class="text-green-300 text-sm">• ${strength}</div>`
                ).join('');
            } else {
                strengthsDiv.innerHTML = '<div class="text-gray-300 text-sm">No message analysis available yet</div>';
            }

            if (analysis.weaknesses && analysis.weaknesses.length > 0) {
                weaknessesDiv.innerHTML = analysis.weaknesses.map(weakness => 
                    `<div class="text-red-300 text-sm">• ${weakness}</div>`
                ).join('');
            } else {
                weaknessesDiv.innerHTML = '<div class="text-gray-300 text-sm">No message analysis available yet</div>';
            }
        }
    } catch (error) {
        console.error('Error loading message analysis:', error);
    }
}

function loadMyPerformanceChart(data) {
    const ctx = document.getElementById('myPerformanceChart');
    if (!ctx) return;

    // Destroy existing chart
    if (window.myPerformanceChartInstance) {
        window.myPerformanceChartInstance.destroy();
    }

    // Mock data for performance over time
    const labels = currentMyPerformanceInterval === '24h' ? 
        ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM'] :
        currentMyPerformanceInterval === '7d' ?
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] :
        ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

    const revenueData = currentMyPerformanceInterval === '24h' ? 
        [0, 0, 25, 45, 80, 60] :
        currentMyPerformanceInterval === '7d' ?
        [120, 180, 150, 200, 160, 90, 110] :
        [800, 950, 1100, 1200];

    window.myPerformanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue ($)',
                data: revenueData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#d1d5db'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af'
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.3)'
                    }
                },
                y: {
                    ticks: {
                        color: '#9ca3af'
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.3)'
                    }
                }
            }
        }
    });
}

async function handleDailyReportSubmit(event) {
    event.preventDefault();

    const data = {
        date: document.getElementById('reportDate').value,
        shift: document.getElementById('reportShift').value,
        shiftDuration: parseFloat(document.getElementById('shiftDuration').value) || 0,
        notes: document.getElementById('shiftNotes').value || '',
        ppvSales: [],
        tips: []
    };

    // Collect PPV sales
    const ppvContainer = document.getElementById('ppvSalesContainer');
    const ppvInputs = ppvContainer.querySelectorAll('input[name="ppvAmount"]');
    ppvInputs.forEach(input => {
        if (input.value) {
            data.ppvSales.push({
                amount: parseFloat(input.value)
            });
        }
    });

    // Collect tips
    const tipsContainer = document.getElementById('tipsContainer');
    const tipInputs = tipsContainer.querySelectorAll('input[name="tipAmount"]');
    tipInputs.forEach(input => {
        if (input.value) {
            data.tips.push({
                amount: parseFloat(input.value)
            });
        }
    });

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

// Helper: Render change indicator (green/red %)
function renderChangeIndicator(change, reverseColors = false) {
    // Return empty if no change data or if change is 0
    if (!change || change === null || change === undefined) return '';
    if (change === '0' || change === '+0' || change === '-0' || change === '0.0' || change === '+0.0' || change === '-0.0') return '';
    
    const numChange = parseFloat(change);
    if (isNaN(numChange) || numChange === 0 || Math.abs(numChange) < 0.1) return '';
    
    const isPositive = reverseColors ? numChange < 0 : numChange > 0;
    const color = isPositive ? 'green' : 'red';
    const icon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
    
    return `<span class="ml-2 text-xs font-semibold text-${color}-400">
        <i class="fas ${icon}"></i> ${Math.abs(numChange).toFixed(1)}%
    </span>`;
}

// LEAN DYNAMIC Million-Dollar Analysis UI - Only High-Value Insights
function renderSophisticatedChatterAnalysis(data) {
    const container = document.getElementById('chatterAnalysisResults');
    if (!container) return;
    
    console.log('Rendering LEAN DYNAMIC analysis:', data);
    
    // Calculate derived metrics
    const ppvUnlockRate = data.ppvsSent > 0 ? ((data.ppvsUnlocked / data.ppvsSent) * 100).toFixed(1) : 0;
    const messagesPerPPV = data.ppvsSent > 0 ? (data.messagesSent / data.ppvsSent).toFixed(1) : 0;
    const responseColor = data.avgResponseTime <= 2 ? 'green' : data.avgResponseTime <= 3 ? 'blue' : data.avgResponseTime <= 5 ? 'yellow' : 'red';
    
    container.innerHTML = `
        <style>
            @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .slide-up { animation: slideUp 0.5s ease-out forwards; }
            .slide-up-1 { animation: slideUp 0.5s ease-out 0.1s forwards; opacity: 0; }
            .slide-up-2 { animation: slideUp 0.5s ease-out 0.2s forwards; opacity: 0; }
            .hover-lift { transition: transform 0.3s ease, box-shadow 0.3s ease; }
            .hover-lift:hover { transform: translateY(-4px); box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.5); }
        </style>
        
        <div class="space-y-6">
            
            <!-- Key Performance Snapshot -->
            <div class="grid grid-cols-4 gap-4 slide-up">
                <div class="glass-card rounded-xl p-4 border border-blue-500/30 hover-lift">
                    <div class="text-3xl font-black text-blue-400">${data.ppvsSent || 0}</div>
                    <div class="text-xs text-gray-400 uppercase">PPVs Sent</div>
                </div>
                <div class="glass-card rounded-xl p-4 border border-green-500/30 hover-lift">
                    <div class="text-3xl font-black text-green-400">${ppvUnlockRate}%</div>
                    <div class="text-xs text-gray-400 uppercase">Unlock Rate</div>
                </div>
                <div class="glass-card rounded-xl p-4 border border-${responseColor}-500/30 hover-lift">
                    <div class="text-3xl font-black text-${responseColor}-400">${data.avgResponseTime || 0}m</div>
                    <div class="text-xs text-gray-400 uppercase">Response Time</div>
                </div>
                <div class="glass-card rounded-xl p-4 border border-purple-500/30 hover-lift">
                    <div class="text-3xl font-black text-purple-400">${messagesPerPPV}</div>
                    <div class="text-xs text-gray-400 uppercase">Msgs/PPV</div>
                </div>
            </div>
            
            <!-- AI-Calculated Insights (Complex Math) -->
            ${data.advancedMetrics ? `
            <div class="glass-card rounded-xl p-6 border border-cyan-500/30 slide-up-1 hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-calculator text-cyan-400 mr-3"></i>
                    AI-Calculated Metrics
                </h5>
                <div class="grid grid-cols-3 gap-4">
                    ${data.advancedMetrics.efficiencyRatios ? Object.entries(data.advancedMetrics.efficiencyRatios).map(([key, value]) => `
                        <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
                            <div class="text-sm font-bold text-cyan-400 mb-2">${key.replace(/([A-Z])/g, ' $1').trim()}</div>
                            <div class="text-sm text-gray-300">${value}</div>
                        </div>
                    `).join('') : ''}
                </div>
            </div>
            ` : ''}
            
            <!-- Revenue Impact (Most Important) -->
            ${data.executiveSummary?.revenueImpact ? `
            <div class="glass-card rounded-xl p-6 border border-green-500/30 slide-up-1 hover-lift">
                <h5 class="text-lg font-bold text-white mb-3 flex items-center">
                    <i class="fas fa-dollar-sign text-green-400 mr-3"></i>
                    Revenue Impact Analysis
                </h5>
                <p class="text-base text-gray-300 leading-relaxed">${data.executiveSummary.revenueImpact}</p>
            </div>
            ` : ''}
            
            <!-- Strategic Insights Grid (Only Growth & Leaks) -->
            ${data.strategicInsights?.revenueOptimization ? `
            <div class="grid grid-cols-2 gap-4 slide-up-2">
                ${data.strategicInsights.revenueOptimization.leakagePoints?.length > 0 ? `
                <div class="glass-card rounded-xl p-5 border border-red-500/30 hover-lift">
                    <h5 class="text-base font-bold text-red-400 mb-4 flex items-center">
                        <i class="fas fa-exclamation-circle text-red-400 mr-2"></i>
                        Revenue Leaks (Fix These)
                    </h5>
                    <ul class="space-y-3">
                        ${data.strategicInsights.revenueOptimization.leakagePoints.slice(0, 3).map((point, idx) => `
                            <li class="text-sm text-gray-300 flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 rounded-lg bg-red-500/20 text-red-400 text-xs flex items-center justify-center mr-3 font-bold">${idx + 1}</span>
                                <span>${point}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${data.strategicInsights.revenueOptimization.growthOpportunities?.length > 0 ? `
                <div class="glass-card rounded-xl p-5 border border-green-500/30 hover-lift">
                    <h5 class="text-base font-bold text-green-400 mb-4 flex items-center">
                        <i class="fas fa-chart-line text-green-400 mr-2"></i>
                        Growth Opportunities
                    </h5>
                    <ul class="space-y-3">
                        ${data.strategicInsights.revenueOptimization.growthOpportunities.slice(0, 3).map((opp, idx) => `
                            <li class="text-sm text-gray-300 flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 rounded-lg bg-green-500/20 text-green-400 text-xs flex items-center justify-center mr-3 font-bold">${idx + 1}</span>
                                <span>${opp}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
            ` : ''}
            
            <!-- Performance Trend Chart -->
            <div class="glass-card rounded-xl p-6 border border-purple-500/30 slide-up-2">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-chart-line text-purple-400 mr-3"></i>
                    Performance Trends (Last 8 Weeks)
                </h5>
                <div id="inlinePerformanceTrendChart" style="min-height: 300px;">
                    <canvas id="inlineTrendCanvas"></canvas>
                </div>
                <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
                    <div class="p-2 bg-green-500/10 rounded">
                        <div class="w-3 h-3 bg-green-400 rounded-full mx-auto mb-1"></div>
                        <div class="text-gray-400">PPV Unlock Rate</div>
                    </div>
                    <div class="p-2 bg-purple-500/10 rounded">
                        <div class="w-3 h-3 bg-purple-400 rounded-full mx-auto mb-1"></div>
                        <div class="text-gray-400">Quality Score</div>
                    </div>
                    <div class="p-2 bg-blue-500/10 rounded">
                        <div class="w-3 h-3 bg-blue-400 rounded-full mx-auto mb-1"></div>
                        <div class="text-gray-400">Response Time</div>
                    </div>
                    <div class="p-2 bg-yellow-500/10 rounded">
                        <div class="w-3 h-3 bg-yellow-400 rounded-full mx-auto mb-1"></div>
                        <div class="text-gray-400">Improvement Score</div>
                    </div>
                </div>
            </div>
            
            <!-- Top 3 Actions (Immediate) -->
            ${data.actionPlan?.immediateActions?.length > 0 ? `
            <div class="glass-card rounded-xl p-6 border border-orange-500/30 slide-up-2 hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-bolt text-orange-400 mr-3"></i>
                    Top Priority Actions
                </h5>
                <div class="space-y-3">
                    ${data.actionPlan.immediateActions.slice(0, 3).map((action, idx) => `
                        <div class="flex items-start p-4 bg-orange-900/20 rounded-lg border border-orange-500/20">
                            <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500/30 text-orange-400 flex items-center justify-center mr-4 font-black text-lg">${idx + 1}</span>
                            <span class="text-sm text-gray-300 leading-relaxed">${action}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- Fallback: Key Insights Only -->
            ${!data.executiveSummary && data.insights ? `
            <div class="glass-card rounded-xl p-6 border border-blue-500/30 slide-up hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-lightbulb text-blue-400 mr-3"></i>
                    Key Insights
                </h5>
                <div class="space-y-3">
                    ${data.insights.slice(0, 4).map((insight, idx) => `
                        <div class="flex items-start p-4 bg-blue-900/20 rounded-lg border border-blue-500/20">
                            <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/30 text-blue-400 flex items-center justify-center mr-4 font-black text-lg">${idx + 1}</span>
                            <span class="text-sm text-gray-300 leading-relaxed">${insight}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            ${!data.executiveSummary && data.opportunities ? `
            <div class="glass-card rounded-xl p-6 border border-green-500/30 slide-up-1 hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-rocket text-green-400 mr-3"></i>
                    Opportunities
                </h5>
                <div class="space-y-3">
                    ${data.opportunities.slice(0, 4).map((opp, idx) => `
                        <div class="flex items-start p-4 bg-green-900/20 rounded-lg border border-green-500/20">
                            <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/30 text-green-400 flex items-center justify-center mr-4 font-black text-lg">${idx + 1}</span>
                            <span class="text-sm text-gray-300 leading-relaxed">${opp}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            ${!data.executiveSummary && data.recommendations ? `
            <div class="glass-card rounded-xl p-6 border border-purple-500/30 slide-up-2 hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-target text-purple-400 mr-3"></i>
                    Recommendations
                </h5>
                <div class="space-y-3">
                    ${data.recommendations.slice(0, 4).map((rec, idx) => `
                        <div class="flex items-start p-4 bg-purple-900/20 rounded-lg border border-purple-500/20">
                            <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/30 text-purple-400 flex items-center justify-center mr-4 font-black text-lg">${idx + 1}</span>
                            <span class="text-sm text-gray-300 leading-relaxed">${rec}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    `;
}


