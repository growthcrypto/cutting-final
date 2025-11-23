// Global variables
let currentUser = null;
let authToken = null;
let creatorAccounts = [];
let currentTimeInterval = '7d';
let customDateRange = null;
let availableWeeks = [];
let availableMonths = [];
let currentFilterType = null; // 'week' or 'month'
let currentWeekFilter = null;
let currentMonthFilter = null;
let trafficSources = []; // Marketing: Available traffic sources
let vipFans = []; // Marketing: VIP fans for autocomplete
let cachedChatters = []; // Cache for chatter dropdown population

// Auto-populate dropdown on focus if empty
function setupDropdownAutopopulate() {
    document.addEventListener('focus', (e) => {
        if (e.target.id === 'messagesChatter' || e.target.id === 'chatterDataChatter') {
            if (e.target.options.length <= 1) {
                console.log(`Dropdown ${e.target.id} focused but empty, populating...`);
                if (cachedChatters.length > 0) {
                    updateEmployeeDropdown(e.target.id, cachedChatters);
                } else {
                    loadEmployees();
                }
            }
        }
    }, true);
}

// ==================== MARKETING FUNCTIONS ====================

// Load traffic sources from backend
async function loadTrafficSources() {
    try {
        const response = await fetch('/api/marketing/traffic-sources', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            trafficSources = data.sources || [];
            console.log('📊 Loaded traffic sources:', trafficSources.length);
        }
    } catch (error) {
        console.error('Error loading traffic sources:', error);
        trafficSources = [];
    }
}

// Load VIP fans for autocomplete
async function loadVIPFans() {
    try {
        const response = await fetch('/api/marketing/vip-fans', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            vipFans = data.fans || [];
            console.log('⭐ Loaded VIP fans:', vipFans.length);
            updateVIPFansDatalist();
        }
    } catch (error) {
        console.error('Error loading VIP fans:', error);
        vipFans = [];
    }
}

// Update VIP fans datalist for autocomplete
function updateVIPFansDatalist() {
    let datalist = document.getElementById('vipFansList');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'vipFansList';
        document.body.appendChild(datalist);
    }
    
    datalist.innerHTML = vipFans.map(fan => 
        `<option value="${fan.username}">${fan.username} - $${fan.lifetimeSpend} lifetime</option>`
    ).join('');
}

// Populate traffic source dropdowns in PPV/Tip forms
function populateTrafficSourceDropdowns() {
    const selects = document.querySelectorAll('.traffic-source-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Unknown</option>';
        
        // Group by category
        const categories = {
            reddit: [],
            twitter: [],
            threads: [],
            instagram: [],
            tiktok: [],
            youtube: [],
            other: []
        };
        
        trafficSources.forEach(source => {
            if (source.isActive) {
                categories[source.category].push(source);
            }
        });
        
        // Add optgroups for each category with sources
        Object.entries(categories).forEach(([category, sources]) => {
            if (sources.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category.charAt(0).toUpperCase() + category.slice(1);
                sources.forEach(source => {
                    const option = document.createElement('option');
                    option.value = source._id;
                    option.textContent = source.name;
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            }
        });
        
        // Restore previous value if it exists
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// Load available weeks and months from backend
async function loadAvailablePeriods() {
    try {
        const response = await fetch('/api/analytics/available-periods', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        availableWeeks = data.weeks || [];
        availableMonths = data.months || [];
        
        console.log('📅 Loaded periods:', { weeks: availableWeeks.length, months: availableMonths.length });
        
        // Populate selectors
        populateWeekSelector();
        populateMonthSelector();
        
        // Auto-select latest week if available
        if (availableWeeks.length > 0) {
            const latestWeek = availableWeeks[availableWeeks.length - 1];
            selectWeek(latestWeek);
        }
    } catch (error) {
        console.error('Error loading available periods:', error);
    }
}

// Populate week selector dropdown
function populateWeekSelector() {
    const selector = document.getElementById('weekSelector');
    if (!selector) {
        console.log('⚠️ Week selector not found in DOM');
        return;
    }
    
    console.log('📅 Populating week selector with', availableWeeks.length, 'weeks');
    selector.innerHTML = '<option value="">Select Week...</option>';
    availableWeeks.forEach(week => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ start: week.start, end: week.end });
        option.textContent = week.label;
        selector.appendChild(option);
    });
    
    // Add change listener
    selector.addEventListener('change', (e) => {
        const monthSelector = document.getElementById('monthSelector');
        if (e.target.value) {
            const week = JSON.parse(e.target.value);
            selectWeek(week);
            if (monthSelector) monthSelector.value = ''; // Clear month
        }
    });
}

// Populate month selector dropdown
function populateMonthSelector() {
    const selector = document.getElementById('monthSelector');
    if (!selector) {
        console.log('⚠️ Month selector not found in DOM');
        return;
    }
    
    console.log('📅 Populating month selector with', availableMonths.length, 'months');
    selector.innerHTML = '<option value="">Select Month...</option>';
    availableMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ firstDay: month.firstDay, lastDay: month.lastDay });
        option.textContent = month.label;
        selector.appendChild(option);
    });
    
    // Add change listener
    selector.addEventListener('change', (e) => {
        const weekSelector = document.getElementById('weekSelector');
        if (e.target.value) {
            const month = JSON.parse(e.target.value);
            selectMonth(month);
            if (weekSelector) weekSelector.value = ''; // Clear week
        }
    });
}

// Select a specific week
function selectWeek(week) {
    currentFilterType = 'week';
    currentWeekFilter = week;
    currentMonthFilter = null;
    
    // Update Manager Dashboard display
    const display = document.getElementById('currentFilterDisplay');
    const text = document.getElementById('currentFilterText');
    if (display && text) {
        text.textContent = `Week: ${new Date(week.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(week.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        display.classList.remove('hidden');
    }
    
    // Update Team Dashboard display
    const teamDisplay = document.getElementById('teamCurrentFilterDisplay');
    const teamText = document.getElementById('teamCurrentFilterText');
    if (teamDisplay && teamText) {
        teamText.textContent = `Week: ${new Date(week.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(week.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        teamDisplay.classList.remove('hidden');
    }
    
    // Reload dashboard
    loadDashboardData();
}

// Select a specific month
function selectMonth(month) {
    currentFilterType = 'month';
    currentMonthFilter = month;
    currentWeekFilter = null;
    
    // Update Manager Dashboard display
    const display = document.getElementById('currentFilterDisplay');
    const text = document.getElementById('currentFilterText');
    if (display && text) {
        text.textContent = `Month: ${new Date(month.firstDay).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        display.classList.remove('hidden');
    }
    
    // Update Team Dashboard display
    const teamDisplay = document.getElementById('teamCurrentFilterDisplay');
    const teamText = document.getElementById('teamCurrentFilterText');
    if (teamDisplay && teamText) {
        teamText.textContent = `Month: ${new Date(month.firstDay).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        teamDisplay.classList.remove('hidden');
    }
    
    // Reload dashboard
    loadDashboardData();
}

// ==================== TRAFFIC SOURCES MANAGEMENT ====================

let currentTrafficSourceFilter = 'all';
let allTrafficSourcesData = [];

async function loadTrafficSourcesData() {
    try {
        await loadTrafficSources(); // Load global trafficSources array
        allTrafficSourcesData = trafficSources;
        renderTrafficSources();
    } catch (error) {
        console.error('Error loading traffic sources:', error);
        showNotification('Failed to load traffic sources', 'error');
    }
}

function renderTrafficSources() {
    const grid = document.getElementById('trafficSourcesGrid');
    if (!grid) return;
    
    // Filter sources
    const filtered = currentTrafficSourceFilter === 'all' 
        ? allTrafficSourcesData 
        : allTrafficSourcesData.filter(s => s.category === currentTrafficSourceFilter);
    
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-inbox text-6xl text-gray-600 mb-4"></i>
                <p class="text-gray-400 text-lg">No traffic sources found</p>
                <button onclick="showAddTrafficSourceModal()" class="mt-4 premium-button text-white font-medium py-2 px-4 rounded-lg">
                    <i class="fas fa-plus mr-2"></i>Add Your First Source
                </button>
            </div>
        `;
        return;
    }
    
    // Render source cards
    grid.innerHTML = filtered.map(source => {
        const categoryIcons = {
            reddit: 'fab fa-reddit',
            twitter: 'fab fa-twitter',
            instagram: 'fab fa-instagram',
            tiktok: 'fab fa-tiktok',
            youtube: 'fab fa-youtube',
            other: 'fas fa-globe'
        };
        
        const categoryColors = {
            reddit: 'from-orange-500 to-red-500',
            twitter: 'from-blue-400 to-blue-600',
            instagram: 'from-pink-500 to-purple-600',
            tiktok: 'from-black to-cyan-500',
            youtube: 'from-red-500 to-red-700',
            other: 'from-gray-500 to-gray-700'
        };
        
        return `
            <div class="glass-card rounded-xl p-5 hover:scale-105 transition-transform duration-200 border border-gray-700 hover:border-${source.category === 'reddit' ? 'orange' : source.category === 'twitter' ? 'blue' : source.category === 'instagram' ? 'pink' : 'purple'}-500/50">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${categoryColors[source.category]} flex items-center justify-center">
                            <i class="${categoryIcons[source.category]} text-white text-xl"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-white">${source.name}</h4>
                            ${source.subcategory ? `<p class="text-xs text-gray-400">${source.subcategory}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="editTrafficSource('${source._id}')" class="p-2 hover:bg-gray-700 rounded-lg transition-all" title="Edit">
                            <i class="fas fa-edit text-blue-400"></i>
                        </button>
                        <button onclick="deleteTrafficSource('${source._id}', '${source.name}')" class="p-2 hover:bg-gray-700 rounded-lg transition-all" title="Delete">
                            <i class="fas fa-trash text-red-400"></i>
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-gray-700">
                    <span class="text-xs text-gray-400 capitalize">
                        <i class="fas fa-tag mr-1"></i>${source.category}
                    </span>
                    <span class="text-xs ${source.isActive ? 'text-green-400' : 'text-gray-500'}">
                        <i class="fas fa-circle text-xs mr-1"></i>${source.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function filterTrafficSources(category) {
    currentTrafficSourceFilter = category;
    
    // Update button styles
    document.querySelectorAll('.traffic-source-filter').forEach(btn => {
        btn.className = 'traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all';
    });
    event.target.className = 'traffic-source-filter px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium';
    
    renderTrafficSources();
}

function showAddTrafficSourceModal() {
    document.getElementById('modalTitle').textContent = 'Add Traffic Source';
    document.getElementById('editSourceId').value = '';
    document.getElementById('sourceName').value = '';
    document.getElementById('sourceCategory').value = '';
    document.getElementById('sourceSubcategory').value = '';
    document.getElementById('trafficSourceModal').style.display = 'flex';
}

function closeTrafficSourceModal() {
    document.getElementById('trafficSourceModal').style.display = 'none';
}

async function editTrafficSource(sourceId) {
    const source = allTrafficSourcesData.find(s => s._id === sourceId);
    if (!source) return;
    
    document.getElementById('modalTitle').textContent = 'Edit Traffic Source';
    document.getElementById('editSourceId').value = source._id;
    document.getElementById('sourceName').value = source.name;
    document.getElementById('sourceCategory').value = source.category;
    document.getElementById('sourceSubcategory').value = source.subcategory || '';
    document.getElementById('trafficSourceModal').style.display = 'flex';
}

async function deleteTrafficSource(sourceId, sourceName) {
    if (!confirm(`Are you sure you want to delete "${sourceName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/marketing/traffic-sources/${sourceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Traffic source deleted successfully', 'success');
            loadTrafficSourcesData();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to delete traffic source', 'error');
        }
    } catch (error) {
        console.error('Error deleting traffic source:', error);
        showNotification('Failed to delete traffic source', 'error');
    }
}

// Handle traffic source form submission
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'trafficSourceForm') {
        e.preventDefault();
        
        const sourceId = document.getElementById('editSourceId').value;
        const data = {
            name: document.getElementById('sourceName').value,
            category: document.getElementById('sourceCategory').value,
            subcategory: document.getElementById('sourceSubcategory').value || undefined
        };
        
        try {
            const url = sourceId 
                ? `/api/marketing/traffic-sources/${sourceId}`
                : '/api/marketing/traffic-sources';
            
            const method = sourceId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showNotification(`Traffic source ${sourceId ? 'updated' : 'created'} successfully`, 'success');
                closeTrafficSourceModal();
                loadTrafficSourcesData();
            } else {
                const result = await response.json();
                console.error('Traffic source creation failed:', result);
                showNotification(result.error || 'Failed to save traffic source', 'error');
            }
        } catch (error) {
            console.error('Error saving traffic source:', error);
            showNotification('Failed to save traffic source', 'error');
        }
    }
});

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('trafficSourceModal');
    if (modal && e.target === modal) {
        closeTrafficSourceModal();
    }
});

// ==================== MARKETING DASHBOARD FUNCTIONS ====================

let currentMarketingFilter = { type: null, week: null, month: null };
let marketingDashboardData = null;

// Marketing Dashboard Custom Date Picker Functions
function applyMarketingDateFilter() {
    const startDate = document.getElementById('marketingStartDate').value;
    const endDate = document.getElementById('marketingEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    // Set custom filter
    currentMarketingFilter = {
        type: 'custom',
        customStart: startDate,
        customEnd: endDate
    };
    
    console.log('✅ Marketing custom date filter applied:', currentMarketingFilter);
    loadMarketingDashboard();
}

function setMarketingQuickFilter(type) {
    const today = new Date();
    let startDate, endDate;
    
    if (type === 'week') {
        const dayOfWeek = today.getDay();
        startDate = new Date(today);
        startDate.setDate(today.getDate() - dayOfWeek);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
    } else if (type === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    document.getElementById('marketingStartDate').value = formatDate(startDate);
    document.getElementById('marketingEndDate').value = formatDate(endDate);
    
    applyMarketingDateFilter();
}

function initializeMarketingDatePicker() {
    // Marketing dashboard uses interval buttons (24h, 7d, 30d), not date pickers
    // Just load the default dashboard with 24h interval (already set)
    loadMarketingDashboard();
}

// Populate model dropdown for marketing dashboard
async function populateMarketingModelDropdown() {
    try {
        const dropdown = document.getElementById('marketingModelFilter');
        if (!dropdown) {
            console.log('⚠️ Marketing model dropdown not found');
            return;
        }
        
        console.log('🔍 Fetching creator accounts...');
        const response = await fetch('/api/creator-accounts', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        console.log('📡 Creator accounts response status:', response.status);
        
        if (response.ok) {
            const creators = await response.json();
            console.log('✅ Creator accounts loaded:', creators);
            
            if (creators.length === 0) {
                console.log('⚠️ No creator accounts found in database');
                dropdown.innerHTML = `
                    <option value="all">All Models</option>
                    <option value="" disabled>No models found - create in Settings</option>
                `;
                return;
            }
            
            // Keep "All Models" as first option, add specific models
            const modelOptions = creators.map(creator => 
                `<option value="${creator._id}">${creator.name}</option>`
            ).join('');
            
            dropdown.innerHTML = `
                <option value="all">All Models</option>
                ${modelOptions}
            `;
            
            console.log(`✅ Populated marketing model dropdown with ${creators.length} models`);
        } else {
            console.error('❌ Failed to fetch creator accounts:', response.status);
        }
    } catch (error) {
        console.error('Error populating model dropdown:', error);
    }
}

async function loadMarketingDashboard() {
    console.log('🚀 loadMarketingDashboard() called');
    try {
        // Get selected model from dropdown
        const modelFilter = document.getElementById('marketingModelFilter');
        const selectedModel = modelFilter ? modelFilter.value : 'all';
        
        // Calculate date range based on current interval
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentMarketingInterval === 'custom' && marketingCustomDates) {
            startDate = new Date(marketingCustomDates.start);
            endDate = new Date(marketingCustomDates.end);
        } else if (currentMarketingInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
        } else if (currentMarketingInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        } else if (currentMarketingInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        
        // Build query params
        let params = new URLSearchParams();
        params.append('filterType', 'custom');
        params.append('customStart', formatDate(startDate));
        params.append('customEnd', formatDate(endDate));
        params.append('creatorAccountId', selectedModel); // Add model filter
        
        console.log('📡 Fetching marketing dashboard from:', `/api/marketing/dashboard?${params}`);
        console.log('Marketing interval:', currentMarketingInterval);
        console.log('Model filter:', selectedModel);
        console.log('Date range:', formatDate(startDate), 'to', formatDate(endDate));
        const response = await fetch(`/api/marketing/dashboard?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        console.log('📡 Response status:', response.status);
        if (response.ok) {
            marketingDashboardData = await response.json();
            console.log('✅ Marketing data loaded:', marketingDashboardData);
            renderMarketingDashboard();
        } else {
            console.error('❌ Failed to load marketing dashboard, status:', response.status);
            showNotification('Failed to load marketing dashboard', 'error');
        }
    } catch (error) {
        console.error('Error loading marketing dashboard:', error);
        showNotification('Failed to load marketing dashboard', 'error');
    }
}

function renderMarketingDashboard() {
    if (!marketingDashboardData) return;
    
    const data = marketingDashboardData;
    console.log('📊 Rendering marketing dashboard with data:', data);
    
    // Render overview cards
    const overviewCards = document.getElementById('marketingOverviewCards');
    if (overviewCards) {
        // Use backend's global unique spenders count (not summed from sources to avoid double-counting)
        const totalSpenders = data.totalSpenders || 0;
        
        overviewCards.innerHTML = `
            <div class="glass-card rounded-xl p-6 border border-green-500/30 hover:border-green-500/50 transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-semibold text-gray-400">Total Revenue</span>
                    <i class="fas fa-dollar-sign text-green-400 text-xl"></i>
                </div>
                <div class="text-3xl font-bold text-white mb-1">$${data.totalRevenue?.toFixed(2) || '0.00'}</div>
                <div class="text-xs text-gray-400">From all sources</div>
            </div>
            
            <div class="glass-card rounded-xl p-6 border border-purple-500/30 hover:border-purple-500/50 transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-semibold text-gray-400">VIP Fans</span>
                    <i class="fas fa-star text-purple-400 text-xl"></i>
                </div>
                <div class="text-3xl font-bold text-white mb-1">${data.totalVIPs || 0}</div>
                <div class="text-xs text-gray-400">High-value customers</div>
            </div>
            
            <div class="glass-card rounded-xl p-6 border border-blue-500/30 hover:border-blue-500/50 transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-semibold text-gray-400">Total Spenders</span>
                    <i class="fas fa-users text-blue-400 text-xl"></i>
                </div>
                <div class="text-3xl font-bold text-white mb-1">${totalSpenders}</div>
                <div class="text-xs text-gray-400">Unique buyers</div>
            </div>
        `;
    }
    
    // Render top sources
    const performanceGrid = document.getElementById('sourcePerformanceGrid');
    if (performanceGrid && data.sources && data.sources.length > 0) {
        const topSources = data.sources.slice(0, 6);
        
        performanceGrid.innerHTML = topSources.map((source, index) => {
                    const qualityColor = source.qualityGrade >= 80 ? 'green' : source.qualityGrade >= 60 ? 'yellow' : source.qualityGrade >= 40 ? 'orange' : 'red';
                    
                    return `
                        <div class="glass-card rounded-xl p-6 border border-${qualityColor}-500/30 hover:border-${qualityColor}-500/50 transition-all">
                            <div class="flex items-center justify-between mb-4">
                                <div>
                                    <h4 class="font-bold text-white text-lg">${source.name}</h4>
                                    <p class="text-xs text-gray-400 capitalize">${source.category}</p>
                                </div>
                                ${index === 0 ? '<i class="fas fa-trophy text-yellow-400 text-2xl"></i>' : ''}
                            </div>
                            
                            <div class="space-y-3">
                                <div class="p-3 bg-gray-800/30 rounded-lg">
                                    <div class="text-xs font-semibold text-blue-300 mb-1">FUNNEL</div>
                                    <div class="text-sm text-gray-300">
                                        Clicks: <span class="font-bold text-white">${source.linkClicks || 0}</span> →
                                        Spenders: <span class="font-bold text-green-400">${source.spenders || 0}</span>
                                        (<span class="font-bold ${source.spenderRate >= 3 ? 'text-green-400' : source.spenderRate >= 1.5 ? 'text-yellow-400' : 'text-red-400'}">${source.spenderRate?.toFixed(1) || '0'}%</span>)
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <div class="text-xs text-gray-400 mb-1">Revenue</div>
                                        <div class="text-xl font-bold text-green-400">$${source.revenue?.toFixed(2) || '0.00'}</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-gray-400 mb-1">Per Click</div>
                                        <div class="text-xl font-bold text-cyan-400">$${source.revenuePerClick?.toFixed(2) || '0.00'}</div>
                                    </div>
                                </div>
                                
                                <div class="p-3 bg-gray-800/30 rounded-lg">
                                    <div class="text-xs font-semibold text-purple-300 mb-1">7-DAY RETENTION</div>
                                    <div class="text-sm text-gray-300">
                                        <span class="font-bold ${source.retentionRate >= 70 ? 'text-green-400' : source.retentionRate >= 50 ? 'text-yellow-400' : 'text-red-400'}">${source.retentionRate?.toFixed(0) || '0'}%</span>
                                        (${source.retainedCount || 0}/${source.totalTracked || 0})
                                    </div>
                                </div>
                                
                                <div class="p-3 bg-gray-800/30 rounded-lg border border-green-500/20">
                                    <div class="text-xs font-semibold text-green-300 mb-1">RENEW RATE</div>
                                    <div class="text-sm text-gray-300">
                                        <span class="font-bold ${source.renewRate >= 60 ? 'text-green-400' : source.renewRate >= 40 ? 'text-yellow-400' : 'text-red-400'}">${source.renewRate?.toFixed(0) || '0'}%</span>
                                        (${source.renewCount || 0}/${source.vips || 0} with auto-renew)
                                    </div>
                                </div>
                                
                                <div class="pt-3 border-t border-gray-700 flex items-center justify-between">
                                    <span class="text-sm text-gray-400">Quality Score</span>
                                    <div class="text-lg font-bold text-${qualityColor}-400">${source.qualityScore || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
    } else if (performanceGrid) {
        performanceGrid.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-chart-bar text-6xl text-gray-600 mb-4"></i>
                <p class="text-gray-400 text-lg">No data yet</p>
                <p class="text-gray-500 text-sm">Upload link tracking and log sales to see analytics</p>
            </div>
        `;
    }
    
    // Render detailed table with category grouping
    const detailedTableBody = document.getElementById('marketingDetailedTableBody');
    console.log('📊 Rendering detailed table:', {
        tableExists: !!detailedTableBody,
        sourcesExist: !!data.sources,
        sourcesLength: data.sources?.length
    });
    
    if (detailedTableBody && data.sources && data.sources.length > 0) {
        console.log('✅ Populating detailed table with', data.sources.length, 'sources');
        
        // Calculate total agency revenue
        const totalAgencyRevenue = data.sources.reduce((sum, s) => sum + (s.revenue || 0), 0);
        
        // Group sources by category
        const categoryMap = {};
        data.sources.forEach(source => {
            if (!categoryMap[source.category]) {
                categoryMap[source.category] = {
                    sources: [],
                    totalRevenue: 0,
                    totalClicks: 0,
                    totalSpenders: 0,
                    avgRetention: 0,
                    avgQualityGrade: 0
                };
            }
            categoryMap[source.category].sources.push(source);
            categoryMap[source.category].totalRevenue += source.revenue || 0;
            categoryMap[source.category].totalClicks += source.linkClicks || 0;
            categoryMap[source.category].totalSpenders += source.spenders || 0;
        });
        
        // Calculate averages and percentages for each category
        Object.keys(categoryMap).forEach(category => {
            const cat = categoryMap[category];
            const sourceCount = cat.sources.length;
            cat.avgRetention = cat.sources.reduce((sum, s) => sum + (s.retentionRate || 0), 0) / sourceCount;
            cat.avgRetention30d = cat.sources.reduce((sum, s) => sum + (s.retentionRate30d || 0), 0) / sourceCount;
            cat.avgQualityGrade = cat.sources.reduce((sum, s) => sum + (s.qualityGrade || 0), 0) / sourceCount;
            cat.spenderRate = cat.totalClicks > 0 ? (cat.totalSpenders / cat.totalClicks) * 100 : 0;
            cat.revenuePerClick = cat.totalClicks > 0 ? cat.totalRevenue / cat.totalClicks : 0;
            cat.revenuePercent = totalAgencyRevenue > 0 ? (cat.totalRevenue / totalAgencyRevenue) * 100 : 0;
        });
        
        // Render rows
        let html = '';
        Object.keys(categoryMap).forEach(category => {
            const cat = categoryMap[category];
            const categoryId = category.replace(/\s+/g, '-');
            const qualityColor = cat.avgQualityGrade >= 80 ? 'text-green-400' : cat.avgQualityGrade >= 60 ? 'text-yellow-400' : 'text-orange-400';
            const spenderRateColor = cat.spenderRate >= 3 ? 'text-green-400' : cat.spenderRate >= 1.5 ? 'text-yellow-400' : 'text-red-400';
            const retentionColor = cat.avgRetention >= 70 ? 'text-green-400' : cat.avgRetention >= 50 ? 'text-yellow-400' : 'text-red-400';
            const retention30dColor = cat.avgRetention30d >= 70 ? 'text-green-400' : cat.avgRetention30d >= 50 ? 'text-yellow-400' : 'text-red-400';
            
            // Category row (expandable)
            html += `
                <tr class="border-b border-gray-700 bg-gray-800/30 hover:bg-gray-800/50 transition-all cursor-pointer" onclick="toggleCategoryRow('${categoryId}')">
                    <td class="px-4 py-4">
                        <div class="flex items-center">
                            <i id="icon-${categoryId}" class="fas fa-chevron-right text-gray-400 mr-3 transition-transform"></i>
                            <span class="font-bold text-white uppercase">${category}</span>
                            <span class="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">${cat.sources.length} sources</span>
                        </div>
                    </td>
                    <td class="px-4 py-4 text-right text-green-400 font-bold text-lg">$${cat.totalRevenue?.toFixed(2) || '0.00'}</td>
                    <td class="px-4 py-4 text-right text-green-300 font-semibold">${cat.revenuePercent?.toFixed(1) || '0'}%</td>
                    <td class="px-4 py-4 text-right text-white font-semibold">${cat.totalClicks}</td>
                    <td class="px-4 py-4 text-right text-blue-400 font-semibold">${cat.totalSpenders}</td>
                    <td class="px-4 py-4 text-right ${spenderRateColor} font-semibold">${cat.spenderRate?.toFixed(1) || '0'}%</td>
                    <td class="px-4 py-4 text-right text-cyan-400 font-semibold">$${cat.revenuePerClick?.toFixed(2) || '0.00'}</td>
                    <td class="px-4 py-4 text-right ${retentionColor} font-semibold">${cat.avgRetention?.toFixed(0) || '0'}%</td>
                    <td class="px-4 py-4 text-right ${retention30dColor} font-semibold">${cat.avgRetention30d?.toFixed(0) || '0'}%</td>
                    <td class="px-4 py-4 text-center">
                        <span class="font-bold ${qualityColor} text-lg">${Math.round(cat.avgQualityGrade)}</span>
                    </td>
                </tr>
            `;
            
            // Individual source rows (hidden by default)
            cat.sources.forEach(source => {
                const sourceQualityColor = source.qualityGrade >= 80 ? 'text-green-400' : source.qualityGrade >= 60 ? 'text-yellow-400' : source.qualityGrade >= 40 ? 'text-orange-400' : 'text-red-400';
                const sourceSpenderRateColor = source.spenderRate >= 3 ? 'text-green-400' : source.spenderRate >= 1.5 ? 'text-yellow-400' : 'text-red-400';
                const sourceRetentionColor = source.retentionRate >= 70 ? 'text-green-400' : source.retentionRate >= 50 ? 'text-yellow-400' : 'text-red-400';
                const sourceRetention30dColor = source.retentionRate30d >= 70 ? 'text-green-400' : source.retentionRate30d >= 50 ? 'text-yellow-400' : 'text-red-400';
                const sourceRevenuePercent = totalAgencyRevenue > 0 ? (source.revenue / totalAgencyRevenue) * 100 : 0;
                
                html += `
                    <tr class="category-${categoryId} border-b border-gray-800/50 bg-gray-900/50 hidden">
                        <td class="px-4 py-3 pl-12">
                            <div class="text-sm text-gray-300">${source.name}</div>
                        </td>
                        <td class="px-4 py-3 text-right text-sm text-green-300 font-semibold">$${source.revenue?.toFixed(2) || '0.00'}</td>
                        <td class="px-4 py-3 text-right text-sm text-gray-400">${sourceRevenuePercent?.toFixed(1) || '0'}%</td>
                        <td class="px-4 py-3 text-right text-sm text-gray-400">${source.linkClicks || 0}</td>
                        <td class="px-4 py-3 text-right text-sm text-blue-300">${source.spenders || 0}</td>
                        <td class="px-4 py-3 text-right text-sm ${sourceSpenderRateColor}">${source.spenderRate?.toFixed(1) || '0'}%</td>
                        <td class="px-4 py-3 text-right text-sm text-cyan-300">$${source.revenuePerClick?.toFixed(2) || '0.00'}</td>
                        <td class="px-4 py-3 text-right text-sm ${sourceRetentionColor}">${source.retentionRate?.toFixed(0) || '0'}%</td>
                        <td class="px-4 py-3 text-right text-sm ${sourceRetention30dColor}">${source.retentionRate30d?.toFixed(0) || '0'}%</td>
                        <td class="px-4 py-3 text-center">
                            <span class="text-sm font-semibold ${sourceQualityColor}">${source.qualityScore || 'N/A'}</span>
                        </td>
                    </tr>
                `;
            });
        });
        
        detailedTableBody.innerHTML = html;
    } else if (detailedTableBody) {
        detailedTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400">No data yet - upload link tracking and log sales</td></tr>';
    }
    
    // Calculate and display avg spender rate in 4th card
    if (overviewCards && data.sources && data.sources.length > 0) {
        let totalSpenders = 0;
        let totalClicks = 0;
        data.sources.forEach(s => {
            totalSpenders += (s.spenders || 0);
            totalClicks += (s.linkClicks || 0);
        });
        const avgSpenderRate = totalClicks > 0 ? (totalSpenders / totalClicks) * 100 : 0;
        
        // Update the 4th card
        const cards = overviewCards.querySelectorAll('.glass-card');
        if (cards[3]) {
            cards[3].querySelector('.text-3xl').textContent = `${avgSpenderRate.toFixed(1)}%`;
        }
    }
}

function populateMarketingSelectors() {
    const weekSelector = document.getElementById('marketingWeekSelector');
    const monthSelector = document.getElementById('marketingMonthSelector');
    
    if (weekSelector && availableWeeks.length > 0) {
        weekSelector.innerHTML = '<option value="">Select Week...</option>';
        availableWeeks.forEach(week => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ start: week.start, end: week.end });
            option.textContent = week.label;
            weekSelector.appendChild(option);
        });
        
        weekSelector.onchange = function() {
            if (this.value) {
                const week = JSON.parse(this.value);
                currentMarketingFilter = { type: 'week', week, month: null };
                monthSelector.value = '';
                updateMarketingFilterDisplay();
                loadMarketingDashboard();
            }
        };
    }
    
    if (monthSelector && availableMonths.length > 0) {
        monthSelector.innerHTML = '<option value="">Select Month...</option>';
        availableMonths.forEach(month => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ start: month.start, end: month.end });
            option.textContent = month.label;
            monthSelector.appendChild(option);
        });
        
        monthSelector.onchange = function() {
            if (this.value) {
                const month = JSON.parse(this.value);
                currentMarketingFilter = { type: 'month', week: null, month };
                weekSelector.value = '';
                updateMarketingFilterDisplay();
                loadMarketingDashboard();
            }
        };
    }
}

function updateMarketingFilterDisplay() {
    const display = document.getElementById('marketingFilterDisplay');
    if (!display) return;
    
    if (currentMarketingFilter.type === 'week' && currentMarketingFilter.week) {
        const startDate = new Date(currentMarketingFilter.week.start);
        const endDate = new Date(currentMarketingFilter.week.end);
        display.textContent = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else if (currentMarketingFilter.type === 'month' && currentMarketingFilter.month) {
        const startDate = new Date(currentMarketingFilter.month.start);
        display.textContent = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
        display.textContent = 'All Time';
    }
}

function showLinkTrackingModal() {
    // Populate traffic sources
    // Link tracking modal functions removed - form now in Data Upload section
}

// Toggle category expansion in marketing table
function toggleCategoryRow(categoryId) {
    const rows = document.querySelectorAll(`.category-${categoryId}`);
    const icon = document.getElementById(`icon-${categoryId}`);
    
    rows.forEach(row => {
        row.classList.toggle('hidden');
    });
    
    // Rotate icon
    if (icon) {
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('fa-chevron-down');
    }
}

// Handle link tracking form submission
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'linkTrackingForm') {
        e.preventDefault();
        
        const data = {
            category: document.getElementById('linkCategory').value, // CHANGED: Use category instead of sourceId
            weekStart: document.getElementById('linkWeekStart').value,
            weekEnd: document.getElementById('linkWeekEnd').value,
            landingPageViews: parseInt(document.getElementById('linkLandingViews').value),
            onlyFansClicks: parseInt(document.getElementById('linkOFClicks').value)
        };
        
        try {
            const response = await fetch('/api/marketing/link-tracking', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showNotification('Link tracking data uploaded successfully!', 'success');
                e.target.reset();
                // Reload dashboard if on marketing page
                if (document.getElementById('marketing-dashboard')?.classList.contains('hidden') === false) {
                    loadMarketingDashboard();
                }
            } else {
                const result = await response.json();
                showNotification(result.error || 'Failed to upload link tracking data', 'error');
            }
        } catch (error) {
            console.error('Error uploading link tracking data:', error);
            showNotification('Failed to upload link tracking data', 'error');
        }
    }
});

// ==================== DATA MANAGEMENT FUNCTIONS ====================

let currentDataTab = 'messages';

async function loadDataManagement() {
    showDataTab('messages');
}

function showDataTab(tabName) {
    currentDataTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.data-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-gradient-to-r', 'from-purple-600', 'to-blue-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });
    event?.target.classList.remove('bg-gray-700', 'text-gray-300');
    event?.target.classList.add('active', 'bg-gradient-to-r', 'from-purple-600', 'to-blue-600', 'text-white');
    
    // Show/hide tabs
    document.querySelectorAll('.data-tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(`dataTab-${tabName}`)?.classList.remove('hidden');
    
    // Load data
    refreshDataTab(tabName);
}

async function refreshDataTab(tabName) {
    switch(tabName) {
        case 'messages':
            await loadMessagesData();
            break;
        case 'daily-reports':
            await loadDailyReportsData();
            break;
        case 'sales-logs':
            await loadSalesLogsData();
            break;
        case 'chatter-performance':
            await loadChatterPerformanceData();
            break;
        case 'daily-snapshots':
            await loadDailySnapshotsData();
            break;
        case 'link-tracking':
            await loadLinkTrackingData();
            break;
        case 'traffic-sources':
            await loadTrafficSourcesDataTable();
            break;
        case 'vip-fans':
            await loadVIPFansData();
            break;
    }
}

// Load Messages Data
// Re-analyze messages
async function reanalyzeMessages(messageId) {
    if (!confirm('This will re-run AI analysis on these messages. This may take a few minutes and use API credits. Continue?')) {
        return;
    }
    
    showLoading(true);
    
    try {
        console.log('🔄 Triggering re-analysis for:', messageId);
        const response = await fetch(`/api/messages/reanalyze/${messageId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Messages re-analyzed successfully! Check AI Analysis page for results.', 'success');
            loadMessagesData(); // Refresh the table
        } else {
            showError(result.error || 'Failed to re-analyze messages');
        }
    } catch (error) {
        console.error('Re-analysis error:', error);
        showError('Failed to re-analyze messages. Check console for details.');
    } finally {
        showLoading(false);
    }
}

async function loadMessagesData() {
    try {
        const response = await fetch('/api/data-management/messages', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const tbody = document.getElementById('messagesTableBody');
        if (!tbody) return;
        
        if (!data.messages || data.messages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">No messages uploaded yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.messages.map(msg => `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                <td class="px-4 py-4 text-white font-medium">${msg.chatterName}</td>
                <td class="px-4 py-4 text-gray-300">${new Date(msg.weekStartDate).toLocaleDateString()} - ${new Date(msg.weekEndDate).toLocaleDateString()}</td>
                <td class="px-4 py-4 text-right text-blue-400">${msg.totalMessages || 0}</td>
                <td class="px-4 py-4 text-right text-gray-300">${msg.creatorAccount || 'N/A'}</td>
                <td class="px-4 py-4 text-center">
                    <button onclick="deleteMessageRecord('${msg._id}', '${msg.chatterName}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading messages:', error);
        showNotification('Failed to load messages', 'error');
    }
}

// Load Sales Logs Data (Individual FanPurchase records)
async function loadSalesLogsData() {
    try {
        const response = await fetch('/api/data-management/sales-logs', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to load sales logs');
        
        const data = await response.json();
        const tbody = document.getElementById('salesLogsTableBody');
        
        if (!tbody) return;
        
        if (!data.salesLogs || data.salesLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400">No sales logs found</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.salesLogs.map(sale => {
            const uploadDate = new Date(sale.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const saleDate = new Date(sale.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const modelName = sale.creatorAccountName || 'Unknown';
            const sourceName = sale.trafficSourceName || '-';
            
            return `
                <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                    <td class="px-3 py-3 text-xs text-gray-400">${uploadDate}</td>
                    <td class="px-3 py-3 text-sm text-white">${saleDate}</td>
                    <td class="px-3 py-3 text-sm text-cyan-400">${modelName}</td>
                    <td class="px-3 py-3 text-sm text-purple-400">${sale.chatterName || '-'}</td>
                    <td class="px-3 py-3 text-sm text-blue-400">${sale.fanUsername || '-'}</td>
                    <td class="px-3 py-3 text-xs">
                        <span class="px-2 py-1 rounded ${sale.type === 'ppv' ? 'bg-purple-600/20 text-purple-300' : 'bg-green-600/20 text-green-300'}">${sale.type.toUpperCase()}</span>
                    </td>
                    <td class="px-3 py-3 text-right text-green-400 font-bold">$${sale.amount.toFixed(2)}</td>
                    <td class="px-3 py-3 text-xs text-gray-400">${sourceName}</td>
                    <td class="px-3 py-3 text-center">
                        <button onclick="deleteSaleLog('${sale._id}', '${saleDate}', '${sale.fanUsername}')" class="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded text-xs transition-all">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading sales logs:', error);
        const tbody = document.getElementById('salesLogsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-400">Failed to load sales logs</td></tr>';
        }
    }
}

async function deleteSaleLog(saleId, date, fan) {
    if (!confirm(`Delete this sale?\n\nDate: ${date}\nFan: ${fan || 'Unknown'}\n\nThis cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/data-management/sales-logs/${saleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Sale deleted successfully', 'success');
            refreshDataTab('sales-logs');
        } else {
            showNotification('Failed to delete sale', 'error');
        }
    } catch (error) {
        console.error('Error deleting sale:', error);
        showNotification('Error deleting sale', 'error');
    }
}

// Load Daily Reports Data
async function loadDailyReportsData() {
    try {
        const response = await fetch('/api/data-management/daily-reports', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const tbody = document.getElementById('dailyReportsTableBody');
        if (!tbody) return;
        
        if (!data.reports || data.reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">No daily reports yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.reports.map(report => `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all cursor-pointer" onclick="toggleReportDetails('${report._id}')">
                <td class="px-4 py-4 text-yellow-400 font-medium capitalize">${report.creator || 'N/A'}</td>
                <td class="px-4 py-4 text-white font-medium">${report.chatterName}</td>
                <td class="px-4 py-4 text-gray-300">${new Date(report.date).toLocaleDateString()}</td>
                <td class="px-4 py-4 text-gray-300 capitalize">${report.shift}</td>
                <td class="px-4 py-4 text-right text-white font-bold">$${report.totalRevenue?.toFixed(2) || '0.00'}</td>
                <td class="px-4 py-4 text-center" onclick="event.stopPropagation()">
                    <button onclick="deleteReport('${report._id}', '${report.chatterName}', '${new Date(report.date).toLocaleDateString()}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </td>
            </tr>
            <tr id="reportDetails-${report._id}" class="hidden bg-gray-900/50">
                <td colspan="6" class="px-4 py-4">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div class="font-semibold text-purple-400 mb-2">PPV Sales (${(report.ppvSales || []).length}):</div>
                            ${(report.ppvSales || []).map((sale, i) => `
                                <div class="pl-3 text-gray-300 mb-2 border-l-2 border-purple-500/30 pl-3">
                                    <div class="font-medium text-white">${i+1}. $${sale.amount.toFixed(2)}</div>
                                    ${sale.fanUsername || sale.vipFanUsername ? `<div class="text-xs text-blue-400">👤 Fan: ${sale.fanUsername || sale.vipFanUsername}</div>` : '<div class="text-xs text-gray-500">👤 Fan: Not tracked</div>'}
                                    ${sale.trafficSourceName ? `<div class="text-xs text-cyan-400">📍 Source: ${sale.trafficSourceName}</div>` : '<div class="text-xs text-gray-500">📍 Source: None</div>'}
                                    ${sale.isVIP ? '<div class="text-xs text-yellow-400">⭐ VIP</div>' : ''}
                                </div>
                            `).join('') || '<div class="pl-3 text-gray-500">None</div>'}
                        </div>
                        <div>
                            <div class="font-semibold text-green-400 mb-2">Tips (${(report.tips || []).length}):</div>
                            ${(report.tips || []).map((tip, i) => `
                                <div class="pl-3 text-gray-300 mb-2 border-l-2 border-green-500/30 pl-3">
                                    <div class="font-medium text-white">${i+1}. $${tip.amount.toFixed(2)}</div>
                                    ${tip.fanUsername || tip.vipFanUsername ? `<div class="text-xs text-blue-400">👤 Fan: ${tip.fanUsername || tip.vipFanUsername}</div>` : '<div class="text-xs text-gray-500">👤 Fan: Not tracked</div>'}
                                    ${tip.trafficSourceName ? `<div class="text-xs text-cyan-400">📍 Source: ${tip.trafficSourceName}</div>` : '<div class="text-xs text-gray-500">📍 Source: None</div>'}
                                </div>
                            `).join('') || '<div class="pl-3 text-gray-500">None</div>'}
                        </div>
                    </div>
                    ${report.notes ? `<div class="mt-3 text-gray-400"><strong>Notes:</strong> ${report.notes}</div>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading daily reports:', error);
        showNotification('Failed to load daily reports', 'error');
    }
}

async function loadChatterPerformanceData() {
    try {
        const response = await fetch('/api/data-management/chatter-performance', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const tbody = document.getElementById('chatterPerformanceTableBody');
        if (!tbody) return;
        
        if (!data.performance || data.performance.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">No chatter performance data uploaded yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.performance.map(perf => {
            const unlockRate = perf.ppvsSent > 0 ? ((perf.ppvsUnlocked / perf.ppvsSent) * 100).toFixed(1) : '0.0';
            return `
                <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                    <td class="px-4 py-4 text-white font-medium">${perf.chatterName}</td>
                    <td class="px-4 py-4 text-gray-300">${new Date(perf.weekStartDate).toLocaleDateString()} - ${new Date(perf.weekEndDate).toLocaleDateString()}</td>
                    <td class="px-4 py-4 text-right text-blue-400">${perf.messagesSent || 0}</td>
                    <td class="px-4 py-4 text-right text-purple-400">${perf.ppvsSent || 0}</td>
                    <td class="px-4 py-4 text-right text-green-400">${perf.ppvsUnlocked || 0}</td>
                    <td class="px-4 py-4 text-right font-bold ${unlockRate >= 50 ? 'text-green-400' : unlockRate >= 30 ? 'text-yellow-400' : 'text-red-400'}">${unlockRate}%</td>
                    <td class="px-4 py-4 text-center">
                        <button onclick="deleteChatterPerformance('${perf._id}', '${perf.chatterName}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                            <i class="fas fa-trash mr-1"></i>Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading chatter performance:', error);
        showNotification('Failed to load chatter performance', 'error');
    }
}

async function loadDailySnapshotsData() {
    try {
        const response = await fetch('/api/data-management/daily-snapshots', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const tbody = document.getElementById('dailySnapshotsTableBody');
        if (!tbody) return;
        
        if (!data.snapshots || data.snapshots.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">No daily snapshots uploaded yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.snapshots.map(snapshot => `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                <td class="px-4 py-4 text-yellow-400 font-medium capitalize">${snapshot.creator || 'N/A'}</td>
                <td class="px-4 py-4 text-white font-medium">${new Date(snapshot.date).toLocaleDateString()}</td>
                <td class="px-4 py-4 text-right text-blue-400">${snapshot.totalSubs || 0}</td>
                <td class="px-4 py-4 text-right text-green-400">${snapshot.activeFans || 0}</td>
                <td class="px-4 py-4 text-right text-purple-400 font-bold">$${snapshot.totalRevenue?.toFixed(2) || '0.00'}</td>
                <td class="px-4 py-4 text-center">
                    <button onclick="deleteSnapshot('${snapshot._id}', '${new Date(snapshot.date).toLocaleDateString()}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading daily snapshots:', error);
        showNotification('Failed to load daily snapshots', 'error');
    }
}

// Load Link Tracking Data
async function loadLinkTrackingData() {
    try {
        const response = await fetch('/api/data-management/link-tracking', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const tbody = document.getElementById('linkTrackingTableBody');
        if (!tbody) return;
        
        if (!data.linkData || data.linkData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">No link tracking data yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.linkData.map(link => `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                <td class="px-4 py-4">
                    <span class="px-3 py-1 rounded-lg bg-gray-700 text-sm capitalize font-medium">${link.category}</span>
                </td>
                <td class="px-4 py-4 text-gray-300">${new Date(link.weekStartDate).toLocaleDateString()} - ${new Date(link.weekEndDate).toLocaleDateString()}</td>
                <td class="px-4 py-4 text-right text-blue-400">${link.landingPageViews?.toLocaleString() || 0}</td>
                <td class="px-4 py-4 text-right text-green-400">${link.onlyFansClicks?.toLocaleString() || 0}</td>
                <td class="px-4 py-4 text-right text-cyan-400">${link.clickThroughRate?.toFixed(1) || 0}%</td>
                <td class="px-4 py-4 text-center">
                    <button onclick="deleteLinkTracking('${link._id}', '${link.category}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading link tracking:', error);
        showNotification('Failed to load link tracking data', 'error');
    }
}

// Load Traffic Sources for Data Table
async function loadTrafficSourcesDataTable() {
    try {
        await loadTrafficSources();
        
        const tbody = document.getElementById('trafficSourcesTableBody');
        if (!tbody) return;
        
        if (!trafficSources || trafficSources.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">No traffic sources created yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = trafficSources.map(source => `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                <td class="px-4 py-4 text-white font-medium">${source.name}</td>
                <td class="px-4 py-4">
                    <span class="px-3 py-1 rounded-lg bg-gray-700 text-xs capitalize">${source.category}</span>
                </td>
                <td class="px-4 py-4 text-gray-300">${source.subcategory || '-'}</td>
                <td class="px-4 py-4 text-center">
                    <span class="text-xs ${source.isActive ? 'text-green-400' : 'text-gray-500'}">
                        <i class="fas fa-circle text-xs mr-1"></i>${source.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-4 py-4 text-center">
                    <button onclick="deleteTrafficSource('${source._id}', '${source.name}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading traffic sources:', error);
        showNotification('Failed to load traffic sources', 'error');
    }
}

// Load VIP Fans Data
async function loadVIPFansData() {
    try {
        const response = await fetch('/api/data-management/vip-fans', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const tbody = document.getElementById('vipFansTableBody');
        if (!tbody) return;
        
        if (!data.fans || data.fans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">No VIP fans yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.fans.map(fan => `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-all">
                <td class="px-4 py-4 text-white font-medium">${fan.username}</td>
                <td class="px-4 py-4 text-gray-300">${fan.trafficSourceName || 'Unknown'}</td>
                <td class="px-4 py-4 text-right text-green-400 font-bold">$${fan.lifetimeSpend?.toFixed(2) || '0.00'}</td>
                <td class="px-4 py-4 text-right text-blue-400">${fan.purchaseCount || 0}</td>
                <td class="px-4 py-4 text-center">
                    <span class="text-xs ${fan.status === 'active' ? 'text-green-400' : 'text-red-400'}">
                        <i class="fas fa-circle text-xs mr-1"></i>${fan.status || 'active'}
                    </span>
                </td>
                <td class="px-4 py-4 text-center">
                    <button onclick="deleteVIPFan('${fan._id}', '${fan.username}')" class="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 rounded-lg text-sm transition-all">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading VIP fans:', error);
        showNotification('Failed to load VIP fans', 'error');
    }
}

// Toggle report details
function toggleReportDetails(reportId) {
    const detailsRow = document.getElementById(`reportDetails-${reportId}`);
    if (detailsRow) {
        detailsRow.classList.toggle('hidden');
    }
}

// Delete functions
async function deleteMessageRecord(id, chatterName) {
    if (!confirm(`Delete message upload for ${chatterName}? This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`/api/data-management/messages/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Message record deleted', 'success');
            refreshDataTab('messages');
        } else {
            showNotification('Failed to delete message record', 'error');
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        showNotification('Failed to delete message record', 'error');
    }
}

async function deleteReport(id, chatterName, date) {
    if (!confirm(`Delete daily report for ${chatterName} on ${date}? This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`/api/data-management/daily-reports/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Daily report deleted', 'success');
            refreshDataTab('daily-reports');
        } else {
            showNotification('Failed to delete report', 'error');
        }
    } catch (error) {
        console.error('Error deleting report:', error);
        showNotification('Failed to delete report', 'error');
    }
}

async function deleteChatterPerformance(id, chatterName) {
    if (!confirm(`Delete chatter performance data for ${chatterName}? This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`/api/data-management/chatter-performance/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Chatter performance data deleted', 'success');
            refreshDataTab('chatter-performance');
        } else {
            showNotification('Failed to delete chatter performance', 'error');
        }
    } catch (error) {
        console.error('Error deleting chatter performance:', error);
        showNotification('Failed to delete chatter performance', 'error');
    }
}

async function deleteSnapshot(id, date) {
    if (!confirm(`Delete daily snapshot for ${date}? This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`/api/data-management/daily-snapshots/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Daily snapshot deleted', 'success');
            refreshDataTab('daily-snapshots');
        } else {
            showNotification('Failed to delete snapshot', 'error');
        }
    } catch (error) {
        console.error('Error deleting snapshot:', error);
        showNotification('Failed to delete snapshot', 'error');
    }
}

async function deleteLinkTracking(id, category) {
    if (!confirm(`Delete link tracking data for ${category}? This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`/api/data-management/link-tracking/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('Link tracking data deleted', 'success');
            refreshDataTab('link-tracking');
        } else {
            showNotification('Failed to delete link tracking', 'error');
        }
    } catch (error) {
        console.error('Error deleting link tracking:', error);
        showNotification('Failed to delete link tracking', 'error');
    }
}

async function deleteVIPFan(id, username) {
    if (!confirm(`Delete VIP fan "${username}"? This will also delete their purchase history. This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`/api/data-management/vip-fans/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            showNotification('VIP fan deleted', 'success');
            refreshDataTab('vip-fans');
        } else {
            showNotification('Failed to delete VIP fan', 'error');
        }
    } catch (error) {
        console.error('Error deleting VIP fan:', error);
        showNotification('Failed to delete VIP fan', 'error');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App initializing...');
    setupEventListeners();
    checkAuthStatus();
    
    // Initialize sidebar after a brief delay to ensure DOM is ready
    setTimeout(() => {
        initializeSidebar();
    }, 100);
    
    setDefaultDate();
    setupDropdownAutopopulate(); // Setup auto-populate on dropdown focus
    // loadEmployees() will be called after authentication in checkAuthStatus()
});

// Load employees from database
async function loadEmployees() {
    console.log('Loading employees...', authToken ? 'Token available' : 'No token');
    
    // Wait for elements to be available
    const waitForElement = (id) => {
        return new Promise((resolve) => {
            const checkElement = () => {
                const element = document.getElementById(id);
                if (element) {
                    resolve(element);
                } else {
                    setTimeout(checkElement, 100);
                }
            };
            checkElement();
        });
    };
    
    try {
        const response = await fetch('/api/chatters', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
            const chatters = await response.json();
            console.log('Loaded chatters:', chatters);
            cachedChatters = chatters.filter(chatter => chatter.isActive);
            
            // Wait for elements to be available before updating
            await waitForElement('chatterDataChatter');
            await waitForElement('messagesChatter');
            
            // Update both dropdowns
            updateEmployeeDropdown('chatterDataChatter', cachedChatters);
            updateEmployeeDropdown('messagesChatter', cachedChatters);
        } else {
            console.error('Failed to load employees:', response.statusText);
            // Fallback to empty dropdowns
            updateEmployeeDropdown('chatterDataChatter', []);
            updateEmployeeDropdown('messagesChatter', []);
        }
    } catch (error) {
        console.error('Error loading employees:', error);
        // Fallback to empty dropdowns
        updateEmployeeDropdown('chatterDataChatter', []);
        updateEmployeeDropdown('messagesChatter', []);
    }
}

// Update employee dropdown with real data
function updateEmployeeDropdown(selectId, employees) {
    const select = document.getElementById(selectId);
    if (!select) {
        console.log(`Dropdown ${selectId} not found (may not be visible yet)`);
        return;
    }
    
    console.log(`Updating dropdown ${selectId} with ${employees.length} employees`);
    
    // Clear existing options
    select.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = employees.length > 0 ? 'Select Employee...' : 'No employees found';
    select.appendChild(defaultOption);
    
    // Add employee options
    employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.chatterName || employee.username;
        option.textContent = employee.chatterName || employee.username;
        select.appendChild(option);
    });
    
    console.log(`✅ Dropdown ${selectId} updated with ${employees.length} options`);
}

// Populate all chatter dropdowns (call this when showing forms)
function populateAllChatterDropdowns() {
    if (cachedChatters.length > 0) {
        updateEmployeeDropdown('chatterDataChatter', cachedChatters);
        updateEmployeeDropdown('messagesChatter', cachedChatters);
    } else {
        console.log('No cached chatters, loading from API...');
        loadEmployees();
    }
}

function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');

    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        showMainApp();
        // Load employees after authentication
        loadEmployees();
    } else {
        showAuthScreen();
    }
}

// Tab switching function for breakdown analysis
function switchBreakdownTab(tabName) {
    // Hide all content sections
    const allContents = document.querySelectorAll('.breakdown-content');
    allContents.forEach(content => content.classList.add('hidden'));
    
    // Remove active styling from all tabs
    const allTabs = document.querySelectorAll('.breakdown-tab');
    allTabs.forEach(tab => {
        tab.classList.remove('bg-blue-500/20', 'text-blue-400', 'border-blue-500/30');
        tab.classList.remove('bg-red-500/20', 'text-red-400', 'border-red-500/30');
        tab.classList.remove('bg-green-500/20', 'text-green-400', 'border-green-500/30');
        tab.classList.add('text-gray-400');
    });
    
    // Show selected content
    const selectedContent = document.getElementById(`content-${tabName}`);
    if (selectedContent) {
        selectedContent.classList.remove('hidden');
    }
    
    // Add active styling to selected tab
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.remove('text-gray-400');
        if (tabName === 'overall') {
            selectedTab.classList.add('bg-blue-500/20', 'text-blue-400', 'border-blue-500/30');
        } else if (tabName === 'grammar') {
            selectedTab.classList.add('bg-red-500/20', 'text-red-400', 'border-red-500/30');
        } else if (tabName === 'guidelines') {
            selectedTab.classList.add('bg-green-500/20', 'text-green-400', 'border-green-500/30');
        }
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
    const managerNav = document.getElementById('managerNav');
    const chatterNav = document.getElementById('chatterNav');
    const marketerNav = document.getElementById('marketerNav');
    
    // Hide all navs first
    [managerNav, chatterNav, marketerNav].forEach(nav => nav?.classList.add('hidden'));
    
    if (currentUser.role === 'manager') {
        managerNav.classList.remove('hidden');
        showSection('dashboard');
    } else if (currentUser.role === 'marketer') {
        marketerNav.classList.remove('hidden');
        showSection('marketing-dashboard');
    } else {
        chatterNav.classList.remove('hidden');
        showSection('daily-report'); // Start chatters on daily report page
    }

    // Load initial data
    loadCreatorAccounts();
    if (currentUser.role === 'manager') {
        loadUsers();
        // Clear dashboard to zero on initial load only
        clearDashboardToZero();
        // Initialize dashboard with default 7d interval (this will load real data)
        setDashboardInterval('7d');
        loadAIRecommendations();
        // Removed aggressive metric clearing - it was interfering with data display
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

    // Chatter selection for AI analysis (removed auto-trigger - now use "Start Analysis" button)

    // Daily report form
    const dailyReportForm = document.getElementById('dailyReportForm');
    if (dailyReportForm) {
        dailyReportForm.addEventListener('submit', handleDailyReportSubmit);
    }

    // Nuclear option: Capture phase event listener for PPV/Tip buttons
    document.addEventListener('click', function(e) {
        // Check if the click is on the button or any child of the button (like the icon)
        const addPPVBtn = e.target.id === 'addPPVSale' ? e.target : e.target.closest('#addPPVSale');
        const addTipBtn = e.target.id === 'addTip' ? e.target : e.target.closest('#addTip');
        
        console.log('🔍 Click detected:', {
            targetId: e.target.id,
            targetTag: e.target.tagName,
            closestPPV: addPPVBtn ? 'YES' : 'NO',
            closestTip: addTipBtn ? 'YES' : 'NO'
        });
        
        if (addPPVBtn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('🔥 CAPTURED Add PPV click!');
            window.addPPVSaleField();
            return false;
        }
        
        if (addTipBtn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('🔥 CAPTURED Add Tip click!');
            window.addTipField();
            return false;
        }
    }, true); // TRUE = capture phase (fires BEFORE any other handlers)

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

    // Debug: Log all button clicks
    document.addEventListener('click', function(e) {
        if (e.target.type === 'submit' || e.target.closest('button[type="submit"]')) {
            console.log('🔘 Submit button clicked!', e.target);
        }
    }, true);

    // Form submissions
    document.addEventListener('submit', function(e) {
        console.log('📝 Form submitted:', e.target.id);
        if (e.target.id === 'createUserForm') {
            e.preventDefault();
            console.log('✅ Create user form detected, calling handler...');
            handleCreateUser(e);
        } else if (e.target.id === 'addGuidelineForm') {
            e.preventDefault();
            handleAddGuideline(e);
        } else if (e.target.id === 'ofAccountDataForm') {
            e.preventDefault();
            handleOFAccountDataSubmit(e);
        } else if (e.target.id === 'dailySnapshotForm') {
            e.preventDefault();
            handleDailySnapshotSubmit(e);
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
            
            // Load creator accounts after successful login
            loadCreatorAccounts();
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

    // SPECIAL: Always recreate these sections to ensure fresh HTML
    if (sectionId === 'analytics' || sectionId === 'ai-analysis') {
        const existingSection = document.getElementById(sectionId);
        if (existingSection) {
            console.log('🗑️ Removing old section:', sectionId);
            existingSection.remove();
        }
    }

    // Show selected section
    let targetSection = document.getElementById(sectionId);
    if (!targetSection) {
        // Create section dynamically if it doesn't exist
        console.log('📝 Creating section:', sectionId);
        targetSection = createSection(sectionId);
    }
    
    if (targetSection) {
        targetSection.classList.remove('hidden');
        console.log('✅ Section shown:', sectionId);
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
    
    // Ensure creator dropdowns are populated for forms that need them
    if (['daily-report', 'data-upload'].includes(sectionId)) {
        // Always try to populate, and load if needed
        setTimeout(() => {
            if (creatorAccounts.length > 0) {
                populateAllCreatorDropdowns();
            } else {
                console.log('🔄 Creator accounts empty, loading...');
                loadCreatorAccounts();
            }
        }, 300);
    }
    
    // If showing dashboard, load available periods
    if (sectionId === 'dashboard' && currentUser?.role === 'manager') {
        loadAvailablePeriods();
        // Don't forcibly clear metrics here - let the data load update them properly
    }
    
    // If showing AI analysis, populate selectors
    if (sectionId === 'ai-analysis') {
        if (availableWeeks.length === 0) {
            loadAvailablePeriods().then(() => {
                populateAISelectors();
                // If chatter, auto-show individual analysis for themselves
                if (currentUser?.role === 'chatter') {
                    setTimeout(() => showChatterAnalysisAuto(), 200);
                }
            });
        } else {
            populateAISelectors();
            // If chatter, auto-show individual analysis for themselves
            if (currentUser?.role === 'chatter') {
                setTimeout(() => showChatterAnalysisAuto(), 200);
            }
        }
    }
}

// Populate AI Analysis selectors
function populateAISelectors() {
    const weekSelector = document.getElementById('aiWeekSelector');
    const monthSelector = document.getElementById('aiMonthSelector');
    
    if (weekSelector) {
        weekSelector.innerHTML = '<option value="">Select Week...</option>';
        availableWeeks.forEach(week => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ start: week.start, end: week.end });
            option.textContent = week.label;
            if (currentWeekFilter && week.start === currentWeekFilter.start) {
                option.selected = true;
            }
            weekSelector.appendChild(option);
        });
        
        weekSelector.addEventListener('change', (e) => {
            if (e.target.value) {
                const week = JSON.parse(e.target.value);
                selectWeek(week);
                if (monthSelector) monthSelector.value = '';
            }
        });
    }
    
    if (monthSelector) {
        monthSelector.innerHTML = '<option value="">Select Month...</option>';
        availableMonths.forEach(month => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ firstDay: month.firstDay, lastDay: month.lastDay });
            option.textContent = month.label;
            if (currentMonthFilter && month.firstDay === currentMonthFilter.firstDay) {
                option.selected = true;
            }
            monthSelector.appendChild(option);
        });
        
        monthSelector.addEventListener('change', (e) => {
            if (e.target.value) {
                const month = JSON.parse(e.target.value);
                selectMonth(month);
                if (weekSelector) weekSelector.value = '';
            }
        });
    }
    
    // Update display
    const display = document.getElementById('aiCurrentFilterDisplay');
    const text = document.getElementById('aiCurrentFilterText');
    if (display && text) {
        if (currentFilterType === 'week' && currentWeekFilter) {
            text.textContent = `Week: ${new Date(currentWeekFilter.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(currentWeekFilter.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            display.classList.remove('hidden');
        } else if (currentFilterType === 'month' && currentMonthFilter) {
            text.textContent = `Month: ${new Date(currentMonthFilter.firstDay).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
            display.classList.remove('hidden');
        }
    }
}

function createSection(sectionId) {
    const main = document.querySelector('main');
    const section = document.createElement('div');
    section.id = sectionId;
    section.className = 'section hidden p-8';
    
    switch(sectionId) {
        case 'analytics':
            const analyticsHTML = createAnalyticsSection();
            console.log('📝 Analytics HTML to insert:', analyticsHTML.substring(0, 200));
            section.innerHTML = analyticsHTML;
            console.log('✅ Analytics HTML inserted into section');
            console.log('📍 Section element:', section);
            console.log('📍 First element check:', document.getElementById('analyticsNetRevenue'));
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
        case 'team-comparison':
            section.innerHTML = createTeamComparisonSection();
            break;
        case 'traffic-sources':
            section.innerHTML = createTrafficSourcesSection();
            break;
        case 'marketing-dashboard':
            section.innerHTML = createMarketingDashboardSection();
            break;
        case 'data-management':
            section.innerHTML = createDataManagementSection();
            break;
        case 'settings':
            section.innerHTML = createSettingsSection();
            break;
        case 'chatter-dashboard':
            section.innerHTML = createChatterDashboardSection();
            break;
        case 'daily-report':
            section.innerHTML = createDailyReportSection();
            // Attach event listeners after section is created
            setTimeout(() => {
                const addPPVBtn = document.getElementById('addPPVSale');
                const addTipBtn = document.getElementById('addTip');
                if (addPPVBtn) {
                    addPPVBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🎯 Add PPV clicked via event listener');
                        window.addPPVSaleField();
                    });
                }
                if (addTipBtn) {
                    addTipBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🎯 Add Tip clicked via event listener');
                        window.addTipField();
                    });
                }
            }, 100);
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
        case 'team-comparison':
            loadTeamComparisonData();
            break;
        case 'traffic-sources':
            loadTrafficSourcesData();
            break;
        case 'guidelines':
            loadGuidelines();
            break;
        case 'analytics':
            setTimeout(() => {
                console.log('🔄 Initializing analytics with interval:', currentAnalyticsInterval);
                console.log('🔍 Analytics buttons found:', document.querySelectorAll('.analytics-interval-btn').length);
                // Just call setAnalyticsInterval - it will handle button styling AND data loading
                setAnalyticsInterval(currentAnalyticsInterval);
            }, 300);
            break;
        case 'ai-analysis':
            loadChattersForAnalysis();
            break;
        case 'data-upload':
            loadChattersForInfloww();
            setDefaultDateRanges();
            break;
        case 'daily-report':
            // Load marketing data for daily report
            loadTrafficSources();
            loadVIPFans();
            // Ensure creator dropdown is populated
            if (creatorAccounts.length > 0) {
                populateAllCreatorDropdowns();
            } else {
                loadCreatorAccounts();
            }
            // Add one PPV and one Tip field by default with new format
            setTimeout(() => {
                // Clear containers first to avoid duplicates
                const ppvContainer = document.getElementById('ppvSalesContainer');
                const tipsContainer = document.getElementById('tipsContainer');
                if (ppvContainer) ppvContainer.innerHTML = '';
                if (tipsContainer) tipsContainer.innerHTML = '';
                
                // Now add one of each
                addPPVSaleField();
                addTipField();
            }, 100);
            break;
        case 'my-performance':
            loadMyPerformanceData();
            break;
        case 'marketing-dashboard':
            // First populate model dropdown, then load data
            populateMarketingModelDropdown().then(() => {
                initializeMarketingDatePicker();
            });
            break;
        case 'data-management':
            // Load all data for management
            loadDataManagement();
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
            
            // Chatter data form now uses static options (Arya, Iris, Lilla)
        }
        
        // Don't load creators here - let populateAllCreatorDropdowns() handle it
        // This prevents race conditions and ensures consistency
        // Just ensure creatorAccounts is loaded and dropdowns are populated
        if (!creatorAccounts || creatorAccounts.length === 0) {
            await loadCreatorAccounts();
        } else {
            // Use existing creatorAccounts to populate
            populateAllCreatorDropdowns();
        }
    } catch (error) {
        console.error('Error loading chatters for Infloww:', error);
    }
}

// Load chatters for AI Analysis dropdown
async function loadChattersForAnalysis() {
    try {
        const chatterSelect = document.getElementById('chatterAnalysisSelect');
        if (!chatterSelect) return;

        // For chatters, only show their own account
        if (currentUser && currentUser.role === 'chatter') {
            chatterSelect.innerHTML = `<option value="${currentUser._id}" selected>${currentUser.chatterName || currentUser.username}</option>`;
            // Automatically trigger analysis for their account
            setTimeout(() => runChatterAnalysis(), 500);
            return;
        }

        // For managers, show all chatters
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const users = await response.json();
            const chatters = users.filter(user => user.role === 'chatter');
            
            chatterSelect.innerHTML = '<option value="">Select Chatter...</option>' +
                chatters.map(chatter => 
                    `<option value="${chatter._id}">${chatter.chatterName || chatter.username}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading chatters for analysis:', error);
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

    console.log('🔧 Initializing sidebar:', { sidebar: !!sidebar, mainContent: !!mainContent, sidebarToggle: !!sidebarToggle, sidebarToggleIcon: !!sidebarToggleIcon, floatingSidebarToggle: !!floatingSidebarToggle });
    
    if (!sidebar || !mainContent) {
        console.error('❌ Sidebar or mainContent not found');
        return;
    }

    function setCollapsedState(collapsed) {
        console.log('🔄 Setting sidebar collapsed state:', collapsed);
        sidebar.classList.toggle('sidebar-hidden', collapsed);
        
        if (floatingSidebarToggle) {
            floatingSidebarToggle.classList.toggle('hidden', !collapsed);
        }
        
        if (sidebarToggleIcon) {
            const toggleIcon = sidebarToggleIcon.querySelector('i');
            if (toggleIcon) {
                toggleIcon.className = collapsed
                    ? 'fas fa-angle-double-right'
                    : 'fas fa-angle-double-left';
            }
        }

        // Move content left to fill sidebar space when collapsed
        if (collapsed) {
            mainContent.style.marginLeft = '0';
        } else {
            mainContent.style.marginLeft = '288px';
        }
        
        console.log('✅ Sidebar state set. Collapsed:', collapsed);
    }

    function toggleSidebarState(forceState) {
        console.log('🎯 toggleSidebarState called, forceState:', forceState);
        const isCollapsed = sidebar.classList.contains('sidebar-hidden');
        const nextState = typeof forceState === 'boolean' ? forceState : !isCollapsed;
        console.log('  Current collapsed:', isCollapsed, '→ Next state:', nextState);
        setCollapsedState(nextState);
    }

    // Make these functions global so they can be called from anywhere
    window.toggleSidebarState = toggleSidebarState;
    window.setCollapsedState = setCollapsedState;

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            console.log('📱 Mobile sidebar toggle clicked');
            toggleSidebarState();
        });
    }
    if (sidebarToggleIcon) {
        sidebarToggleIcon.addEventListener('click', () => {
            console.log('🔲 Sidebar collapse button clicked');
            toggleSidebarState();
        });
    }
    if (floatingSidebarToggle) {
        floatingSidebarToggle.addEventListener('click', () => {
            console.log('🔵 Floating button clicked');
            toggleSidebarState(false);
        });
    }

    // Removed auto-collapse on click - was interfering with form submissions

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
        
        // Hide custom date range indicator
        const indicator = document.getElementById('customDateRangeIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
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

// REMOVED DUPLICATE - See line 1272 for the real applyCustomDateRange(context) function

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
        // Always try to get token from localStorage if authToken is null
        const token = authToken || localStorage.getItem('authToken');
        
        if (!token) {
            console.warn('⚠️ No auth token available, cannot load creator accounts');
            // Still try to populate with empty array so dropdowns show "Select Creator..."
            populateAllCreatorDropdowns();
            return null;
        }
        
        const headers = {
            'Authorization': `Bearer ${token}`
        };
        
        // Add cache-busting timestamp to prevent browser caching
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/creator-accounts?t=${timestamp}`, {
            headers: headers,
            cache: 'no-store'
        });

        if (response.ok) {
            creatorAccounts = await response.json();
            console.log('✅ Creator accounts loaded from API:', creatorAccounts.length, 'accounts');
            console.log('📋 Accounts:', creatorAccounts.map(c => `${c.name} (${c._id})`).join(', '));
            
            // Populate all creator account dropdowns
            populateAllCreatorDropdowns();
            return creatorAccounts;
        } else if (response.status === 403) {
            console.warn('⚠️ 403 Forbidden - Token may be expired or invalid');
            console.warn('💡 Attempting to refresh token from localStorage...');
            
            // Try to refresh token from localStorage
            const refreshedToken = localStorage.getItem('authToken');
            if (refreshedToken && refreshedToken !== token) {
                console.log('🔄 Token refreshed, retrying...');
                authToken = refreshedToken;
                // Retry once with refreshed token
                return loadCreatorAccounts();
            }
            
            // If still failing, check if user is logged in
            const storedUser = localStorage.getItem('currentUser');
            if (!storedUser) {
                console.error('❌ No user found in localStorage - user needs to log in');
                // Don't break the UI - just show empty dropdowns
                creatorAccounts = [];
                populateAllCreatorDropdowns();
                return null;
            }
            
            // Token is invalid but user exists - might need to re-login
            console.warn('⚠️ Token appears to be expired. User may need to log in again.');
            // Don't break the UI - just show empty dropdowns
            creatorAccounts = [];
            populateAllCreatorDropdowns();
            return null;
        } else {
            console.error('❌ Failed to load creator accounts:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            // Fallback: try to use any existing creatorAccounts
            if (creatorAccounts && creatorAccounts.length > 0) {
                console.log('⚠️ Using cached creator accounts');
                populateAllCreatorDropdowns();
            } else {
                // Ensure dropdowns are at least populated with empty state
                populateAllCreatorDropdowns();
            }
            return null;
        }
    } catch (error) {
        console.error('❌ Error loading creator accounts:', error);
        // Fallback: try to use any existing creatorAccounts
        if (creatorAccounts && creatorAccounts.length > 0) {
            console.log('⚠️ Using cached creator accounts after error');
            populateAllCreatorDropdowns();
        } else {
            // Ensure dropdowns are at least populated with empty state
            populateAllCreatorDropdowns();
        }
        return null;
    }
}

// Populate all creator account dropdowns in forms
function populateAllCreatorDropdowns() {
    // Always populate dropdowns, even if empty (shows "Select Creator..." option)
    if (!creatorAccounts || creatorAccounts.length === 0) {
        console.log('⚠️ No creator accounts to populate - array is empty');
        
        // Only try to reload if we have a token
        const token = authToken || localStorage.getItem('authToken');
        if (token) {
            console.log('💡 Attempting to reload creator accounts...');
            loadCreatorAccounts();
        } else {
            console.log('⚠️ No token available, populating with empty state');
        }
        
        // Still populate with empty state so dropdowns show "Select Creator..."
        creatorAccounts = [];
    }

    console.log(`🔄 Populating dropdowns with ${creatorAccounts.length} creator(s): ${creatorAccounts.map(c => c.name).join(', ')}`);

    let populatedCount = 0;

    // Daily Report form - creatorAccount dropdown
    const dailyReportSelect = document.getElementById('creatorAccount');
    if (dailyReportSelect) {
        const currentValue = dailyReportSelect.value;
        dailyReportSelect.innerHTML = '<option value="">Select Creator...</option>' +
            creatorAccounts.map(account => 
                `<option value="${account.name.toLowerCase()}">${account.name}</option>`
            ).join('');
        if (currentValue) {
            dailyReportSelect.value = currentValue;
        }
        populatedCount++;
        console.log('✅ Populated daily report creator dropdown:', dailyReportSelect.options.length, 'options');
    } else {
        console.log('⚠️ creatorAccount dropdown not found');
    }

    // Account Snapshots form - snapshotCreator dropdown
    const snapshotSelect = document.getElementById('snapshotCreator');
    if (snapshotSelect) {
        const currentValue = snapshotSelect.value;
        snapshotSelect.innerHTML = '<option value="">Select Creator...</option>' +
            creatorAccounts.map(account => 
                `<option value="${account.name.toLowerCase()}">${account.name}</option>`
            ).join('');
        if (currentValue) {
            snapshotSelect.value = currentValue;
        }
        populatedCount++;
        console.log('✅ Populated snapshot creator dropdown:', snapshotSelect.options.length, 'options');
    } else {
        console.log('⚠️ snapshotCreator dropdown not found');
    }

    // OF Account Data form - ofAccountCreator dropdown
    const ofAccountSelect = document.getElementById('ofAccountCreator');
    if (ofAccountSelect) {
        const currentValue = ofAccountSelect.value;
        ofAccountSelect.innerHTML = '<option value="">Select Creator...</option>' +
            creatorAccounts.map(account => 
                `<option value="${account.name}">${account.name}</option>`
            ).join('');
        if (currentValue) {
            ofAccountSelect.value = currentValue;
        }
        populatedCount++;
        console.log('✅ Populated OF account creator dropdown:', ofAccountSelect.options.length, 'options');
    } else {
        console.log('⚠️ ofAccountCreator dropdown not found');
    }

    // Any other creator account dropdowns (by name attribute like name="creatorName")
    document.querySelectorAll('select[name*="creator"], select[name*="Creator"], select[id*="creator"], select[id*="Creator"]').forEach(select => {
        // Skip marketing filter and already populated dropdowns
        if (select.id !== 'marketingModelFilter' && 
            select.id !== 'creatorAccount' && 
            select.id !== 'snapshotCreator' && 
            select.id !== 'ofAccountCreator') {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Select Creator...</option>' +
                creatorAccounts.map(account => 
                    `<option value="${account.name}">${account.name}</option>`
                ).join('');
            if (currentValue) {
                select.value = currentValue;
            }
            populatedCount++;
            console.log(`✅ Populated ${select.name || select.id || 'unnamed'} dropdown`);
        }
    });
    
    console.log(`✅ Finished populating ${populatedCount} dropdown(s) with: ${creatorAccounts.map(c => c.name).join(', ')}`);
    
    // If no dropdowns were found, retry after a delay (elements might not be loaded yet)
    if (populatedCount === 0) {
        console.log('⚠️ No dropdowns found, retrying in 500ms...');
        setTimeout(() => populateAllCreatorDropdowns(), 500);
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
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${user.email}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        user.role === 'manager' ? 'bg-red-900/30 text-red-400' : 
                        user.role === 'marketer' ? 'bg-purple-900/30 text-purple-400' : 
                        'bg-blue-900/30 text-blue-400'
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

// ==================== TEAM COMPARISON FUNCTIONS ====================

let teamComparisonData = [];
let currentSortBy = 'revenue';
let currentSortOrder = 'desc';

async function loadTeamComparisonData() {
    try {
        // Calculate date range based on current interval
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentTeamComparisonInterval === 'custom' && teamComparisonCustomDates) {
            startDate = new Date(teamComparisonCustomDates.start);
            endDate = new Date(teamComparisonCustomDates.end);
        } else if (currentTeamComparisonInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
        } else if (currentTeamComparisonInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        } else if (currentTeamComparisonInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        const url = `/api/analytics/team-dashboard?filterType=custom&customStart=${formatDate(startDate)}&customEnd=${formatDate(endDate)}&_t=${Date.now()}`;
        
        console.log('Team Comparison URL:', url);
        console.log('Team Comparison interval:', currentTeamComparisonInterval);
        console.log('Date range:', formatDate(startDate), 'to', formatDate(endDate));
        
        // Get all chatter performance data from team dashboard API
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) throw new Error('Failed to load team data');

        const data = await response.json();
        // 🔥 FILTER OUT chatters with NO data (0 revenue, 0 messages, 0 PPVs)
        teamComparisonData = (data.chatters || []).filter(c => 
            c.revenue > 0 || c.messagesSent > 0 || c.ppvsSent > 0 || c.fansChatted > 0
        );

        console.log('🎯 Filtered team data for period:', {
            interval: currentTeamComparisonInterval,
            dateRange: `${formatDate(startDate)} to ${formatDate(endDate)}`,
            total: data.chatters?.length || 0,
            withData: teamComparisonData.length,
            filtered: (data.chatters?.length || 0) - teamComparisonData.length
        });

        // Sort by revenue by default (this will trigger renderTeamComparison which updates "Your Position")
        sortTeamBy('revenue');
    } catch (error) {
        console.error('Error loading team comparison:', error);
        showNotification('Failed to load team comparison data', 'error');
    }
}

function sortTeamBy(metric) {
    // Toggle sort order if clicking same column
    if (currentSortBy === metric) {
        currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
    } else {
        currentSortBy = metric;
        currentSortOrder = 'desc'; // Default to descending
    }

    // For response time, lower is better (so reverse the sort)
    const isLowerBetter = metric === 'responseTime';

    teamComparisonData.sort((a, b) => {
        let aVal = a[metric] || 0;
        let bVal = b[metric] || 0;

        if (metric === 'name') {
            aVal = a.chatterName || a.username || '';
            bVal = b.chatterName || b.username || '';
            return currentSortOrder === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        }

        if (isLowerBetter) {
            return currentSortOrder === 'desc' ? aVal - bVal : bVal - aVal;
        }
        return currentSortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    renderTeamComparison();
}

function renderTeamComparison() {
    const tbody = document.getElementById('teamComparisonTableBody');
    const yourPositionCard = document.getElementById('yourPositionCard');
    const teamAverageRow = document.getElementById('teamAverageRow');

    if (!tbody || !yourPositionCard || !teamAverageRow) return;

    // Calculate team averages
    const teamAvg = {
        revenue: teamComparisonData.reduce((sum, c) => sum + (c.revenue || 0), 0) / (teamComparisonData.length || 1),
        unlockRate: teamComparisonData.reduce((sum, c) => sum + (c.unlockRate || 0), 0) / (teamComparisonData.length || 1),
        responseTime: teamComparisonData.reduce((sum, c) => sum + (c.responseTime || 0), 0) / (teamComparisonData.length || 1),
        messagesPerPPV: teamComparisonData.reduce((sum, c) => sum + (c.messagesPerPPV || 0), 0) / (teamComparisonData.length || 1),
        overallScore: teamComparisonData.reduce((sum, c) => sum + (c.overallScore || 0), 0) / (teamComparisonData.length || 1),
        grammarScore: teamComparisonData.reduce((sum, c) => sum + (c.grammarScore || 0), 0) / (teamComparisonData.length || 1),
        guidelinesScore: teamComparisonData.reduce((sum, c) => sum + (c.guidelinesScore || 0), 0) / (teamComparisonData.length || 1)
    };

    // Find current user's data
    const currentUserData = teamComparisonData.find(c => 
        c.chatterName === currentUser.chatterName || c.username === currentUser.username
    );
    const userRank = teamComparisonData.indexOf(currentUserData) + 1;

    console.log('👤 Your Position for period:', {
        interval: currentTeamComparisonInterval,
        rank: userRank,
        totalChatters: teamComparisonData.length,
        yourRevenue: currentUserData?.revenue || 0,
        topRevenue: teamComparisonData[0]?.revenue || 0
    });

    // Render "Your Position" card
    if (currentUserData && userRank > 0) {
        const getRankEmoji = (rank) => {
            if (rank === 1) return '🥇';
            if (rank === 2) return '🥈';
            if (rank === 3) return '🥉';
            return `#${rank}`;
        };

        const rankDisplay = getRankEmoji(userRank);
        const isTop3 = userRank <= 3;

        yourPositionCard.innerHTML = `
            <div class="relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-r ${isTop3 ? 'from-yellow-600/20 to-orange-600/10' : 'from-blue-600/10 to-cyan-600/5'} rounded-3xl"></div>
                <div class="relative glass-card rounded-3xl p-8 border-2 ${isTop3 ? 'border-yellow-500/50' : 'border-cyan-500/30'}">
                    <div class="flex items-center justify-between mb-6">
                        <div class="flex items-center">
                            <div class="text-6xl mr-6">${rankDisplay}</div>
                            <div>
                                <h3 class="text-3xl font-bold text-white">Your Position</h3>
                                <p class="text-gray-400 text-lg">${currentUserData.chatterName || currentUser.username}</p>
                            </div>
                        </div>
                        ${userRank > 1 ? `
                            <div class="text-right">
                                <div class="text-sm text-gray-400">Gap to #1</div>
                                <div class="text-2xl font-bold text-orange-400">$${(teamComparisonData[0].revenue - currentUserData.revenue).toFixed(0)}</div>
                            </div>
                        ` : `
                            <div class="text-center p-4 bg-yellow-500/20 rounded-xl">
                                <div class="text-2xl font-bold text-yellow-400">👑 Top Performer!</div>
                            </div>
                        `}
                    </div>
                    <div class="grid grid-cols-3 md:grid-cols-7 gap-4">
                        ${renderMetricCard('Revenue', currentUserData.revenue, teamAvg.revenue, '$', 0)}
                        ${renderMetricCard('Unlock %', currentUserData.unlockRate, teamAvg.unlockRate, '', 1, '%')}
                        ${renderMetricCard('Response', currentUserData.responseTime, teamAvg.responseTime, '', 1, 'm', true)}
                        ${renderMetricCard('Msgs/PPV', currentUserData.messagesPerPPV, teamAvg.messagesPerPPV, '', 1)}
                        ${renderMetricCard('Overall', currentUserData.overallScore, teamAvg.overallScore, '', 0)}
                        ${renderMetricCard('Grammar', currentUserData.grammarScore, teamAvg.grammarScore, '', 0)}
                        ${renderMetricCard('Guidelines', currentUserData.guidelinesScore, teamAvg.guidelinesScore, '', 0)}
                    </div>
                </div>
            </div>
        `;
    } else {
        // No data for this period - show message
        yourPositionCard.innerHTML = `
            <div class="glass-card rounded-2xl p-8 border-2 border-gray-600/30">
                <div class="text-center py-4">
                    <i class="fas fa-calendar-times text-gray-500 text-4xl mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-400 mb-2">No Data for Selected Period</h3>
                    <p class="text-gray-500">You don't have any performance data for this date range. Try selecting a different period.</p>
                </div>
            </div>
        `;
    }

    // Render table rows
    tbody.innerHTML = teamComparisonData.map((chatter, index) => {
        const rank = index + 1;
        const isCurrentUser = chatter.chatterName === currentUser.chatterName || chatter.username === currentUser.username;
        const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

        return `
            <tr class="${isCurrentUser ? 'bg-cyan-500/10 border-l-4 border-cyan-400' : ''} hover:bg-gray-700/30 transition-colors">
                <td class="px-4 py-4 text-left font-bold ${rank <= 3 ? 'text-yellow-400 text-xl' : 'text-gray-300'}">${rankIcon}</td>
                <td class="px-4 py-4 text-left font-medium ${isCurrentUser ? 'text-cyan-400' : 'text-white'}">${chatter.chatterName || chatter.username}</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.revenue, teamAvg.revenue)}">$${(chatter.revenue || 0).toFixed(0)}</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.unlockRate, teamAvg.unlockRate)}">${(chatter.unlockRate || 0).toFixed(1)}%</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.responseTime, teamAvg.responseTime, true)}">${(chatter.responseTime || 0).toFixed(1)}m</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.messagesPerPPV, teamAvg.messagesPerPPV)}">${(chatter.messagesPerPPV || 0).toFixed(1)}</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.overallScore, teamAvg.overallScore)}">${chatter.overallScore || '-'}</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.grammarScore, teamAvg.grammarScore)}">${chatter.grammarScore || '-'}</td>
                <td class="px-4 py-4 text-right ${getMetricColor(chatter.guidelinesScore, teamAvg.guidelinesScore)}">${chatter.guidelinesScore || '-'}</td>
            </tr>
        `;
    }).join('');

    // Render team average row
    teamAverageRow.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="text-lg font-bold text-gray-300">
                <i class="fas fa-chart-line text-blue-400 mr-3"></i>Team Average
            </div>
            <div class="grid grid-cols-7 gap-6 text-right">
                <div class="text-blue-400 font-bold">$${teamAvg.revenue.toFixed(0)}</div>
                <div class="text-blue-400 font-bold">${teamAvg.unlockRate.toFixed(1)}%</div>
                <div class="text-blue-400 font-bold">${teamAvg.responseTime.toFixed(1)}m</div>
                <div class="text-blue-400 font-bold">${teamAvg.messagesPerPPV.toFixed(1)}</div>
                <div class="text-blue-400 font-bold">${teamAvg.overallScore.toFixed(0)}</div>
                <div class="text-blue-400 font-bold">${teamAvg.grammarScore.toFixed(0)}</div>
                <div class="text-blue-400 font-bold">${teamAvg.guidelinesScore.toFixed(0)}</div>
            </div>
        </div>
    `;
}

function renderMetricCard(label, value, avg, prefix = '', decimals = 0, suffix = '', lowerIsBetter = false) {
    const numValue = parseFloat(value) || 0;
    const numAvg = parseFloat(avg) || 0;
    const isBetter = lowerIsBetter ? numValue < numAvg : numValue > numAvg;
    const color = isBetter ? 'text-green-400' : numValue < numAvg ? 'text-red-400' : 'text-gray-300';

    return `
        <div class="text-center">
            <div class="text-xs text-gray-400 mb-1">${label}</div>
            <div class="text-lg font-bold ${color}">${prefix}${numValue.toFixed(decimals)}${suffix}</div>
            <div class="text-xs text-gray-500">avg: ${prefix}${numAvg.toFixed(decimals)}${suffix}</div>
        </div>
    `;
}

function getMetricColor(value, avg, lowerIsBetter = false) {
    const numValue = parseFloat(value) || 0;
    const numAvg = parseFloat(avg) || 0;
    
    if (lowerIsBetter) {
        return numValue < numAvg ? 'text-green-400 font-bold' : numValue > numAvg ? 'text-red-400' : 'text-gray-300';
    }
    return numValue > numAvg ? 'text-green-400 font-bold' : numValue < numAvg ? 'text-red-400' : 'text-gray-300';
}

// ==================== CUSTOM DATE PICKER FUNCTIONS ====================

let currentDashboardInterval = '7d';
let currentAnalyticsInterval = '7d';
let currentMarketingInterval = '7d';
let currentTeamDashInterval = '7d';
let currentTeamComparisonInterval = '7d';
let currentAIInterval = '7d';
let currentPerformanceInterval = '7d';
let currentModalContext = null; // Track which page opened the modal

// Independent custom date ranges for each dashboard
let dashboardCustomDates = null;
let analyticsCustomDates = null;
let marketingCustomDates = null;
let aiAnalysisCustomDates = null;
let teamDashCustomDates = null;
let teamComparisonCustomDates = null;
let performanceCustomDates = null;

window.setDashboardInterval = function(interval) {
    currentDashboardInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.dashboard-interval-btn').forEach(btn => {
        const btnInterval = btn.getAttribute('data-interval');
        if (btnInterval === interval) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
            
            // Update button text if custom
            if (interval === 'custom' && dashboardCustomDates) {
                const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                btn.innerHTML = `<i class="fas fa-calendar mr-2"></i>${formatDate(dashboardCustomDates.start)} - ${formatDate(dashboardCustomDates.end)}`;
            }
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-300');
            
            // Reset custom button text
            if (btnInterval === 'custom') {
                btn.innerHTML = '<i class="fas fa-calendar mr-2"></i>Custom';
            }
        }
    });
    
    if (interval === 'custom') {
        // Clear modal inputs and show popup
        document.getElementById('modalStartDate').value = '';
        document.getElementById('modalEndDate').value = '';
        currentModalContext = 'dashboard';
        document.getElementById('customDateModal').classList.remove('hidden');
    } else {
        // Clear custom dates when selecting preset
        dashboardCustomDates = null;
        loadDashboardData();
    }
}

window.setAnalyticsInterval = function(interval) {
    console.log('🎯 setAnalyticsInterval called with:', interval);
    
    // Store the selected interval
    currentAnalyticsInterval = interval;
    
    // Update button styles
    const buttons = document.querySelectorAll('.analytics-interval-btn');
    console.log('📊 Found', buttons.length, 'analytics buttons');
    
    buttons.forEach(btn => {
        const btnInterval = btn.getAttribute('data-interval');
        console.log('  Button:', btnInterval, 'Match:', btnInterval === interval);
        
        if (btnInterval === interval) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
            console.log('  ✅ Highlighted button:', btnInterval);
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-300');
        }
    });
    
    if (interval === 'custom') {
        currentModalContext = 'analytics';
        document.getElementById('customDateModal').classList.remove('hidden');
    } else {
        // Clear custom dates when selecting a preset interval
        analyticsCustomDates = null;
        
        console.log('✅ Analytics interval set to:', interval);
        loadAnalyticsData();
    }
}

window.setMarketingInterval = function(interval) {
    currentMarketingInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.marketing-interval-btn').forEach(btn => {
        if (btn.getAttribute('data-interval') === interval) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-300');
        }
    });
    
    if (interval === 'custom') {
        currentModalContext = 'marketing';
        document.getElementById('customDateModal').classList.remove('hidden');
    } else {
        // Clear custom dates when selecting a preset interval
        marketingCustomDates = null;
        
        console.log('✅ Marketing interval set to:', interval);
        loadMarketingDashboard();
    }
}

window.setTeamComparisonInterval = function(interval) {
    currentTeamComparisonInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.team-comparison-interval-btn').forEach(btn => {
        if (btn.getAttribute('data-interval') === interval) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-300');
        }
    });
    
    if (interval === 'custom') {
        currentModalContext = 'team-comparison';
        document.getElementById('customDateModal').classList.remove('hidden');
    } else {
        // Clear custom dates when selecting a preset interval
        teamComparisonCustomDates = null;
        
        console.log('✅ Team Comparison interval set to:', interval);
        loadTeamComparisonData();
    }
}

window.setAIInterval = function(interval) {
    currentAIInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.ai-interval-btn').forEach(btn => {
        if (btn.getAttribute('data-interval') === interval) {
            btn.classList.remove('bg-gray-700', 'text-gray-300', 'border-gray-600');
            btn.classList.add('bg-cyan-600', 'text-white', 'border-cyan-500', 'border-2');
        } else {
            btn.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-500', 'border-2');
            btn.classList.add('bg-gray-700', 'text-gray-300', 'border-gray-600');
        }
    });
    
    if (interval === 'custom') {
        currentModalContext = 'ai-analysis';
        document.getElementById('customDateModal').classList.remove('hidden');
    } else {
        // Clear custom dates when selecting a preset interval
        aiAnalysisCustomDates = null;
        
        console.log('✅ AI Analysis interval set to:', interval);
        // Don't auto-run - wait for "Start Analysis" button click
    }
}

window.setTeamDashInterval = function(interval) {
    currentTeamDashInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.team-interval-btn').forEach(btn => {
        const btnInterval = btn.getAttribute('data-interval');
        if (btnInterval === interval) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
            
            // Update button text if custom
            if (interval === 'custom' && teamDashCustomDates) {
                const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                btn.innerHTML = `<i class="fas fa-calendar mr-2"></i>${formatDate(teamDashCustomDates.start)} - ${formatDate(teamDashCustomDates.end)}`;
            }
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-300');
            
            // Reset custom button text
            if (btnInterval === 'custom') {
                btn.innerHTML = '<i class="fas fa-calendar mr-2"></i>Custom';
            }
        }
    });
    
    if (interval === 'custom') {
        // Clear modal inputs and show popup
        document.getElementById('modalStartDate').value = '';
        document.getElementById('modalEndDate').value = '';
        currentModalContext = 'team';
        document.getElementById('customDateModal').classList.remove('hidden');
    } else {
        // Clear custom dates when selecting preset
        teamDashCustomDates = null;
        loadTeamDashboard();
    }
}

function closeCustomDateModal() {
    document.getElementById('customDateModal').classList.add('hidden');
    currentModalContext = null;
}

function applyModalDateFilter() {
    const startDate = document.getElementById('modalStartDate').value;
    const endDate = document.getElementById('modalEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Please select both dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    // Store dates in the correct independent variable based on context
    const dateObj = { start: startDate, end: endDate };
    
    if (currentModalContext === 'dashboard') {
        dashboardCustomDates = dateObj;
        currentDashboardInterval = 'custom';
        setDashboardInterval('custom'); // This will update button text
        loadDashboardData();
    } else if (currentModalContext === 'analytics') {
        analyticsCustomDates = dateObj;
        currentAnalyticsInterval = 'custom';
        setAnalyticsInterval('custom');
        loadAnalyticsData();
    } else if (currentModalContext === 'marketing') {
        marketingCustomDates = dateObj;
        currentMarketingInterval = 'custom';
        setMarketingInterval('custom');
        loadMarketingDashboard();
    } else if (currentModalContext === 'team') {
        teamDashCustomDates = dateObj;
        currentTeamDashInterval = 'custom';
        setTeamDashInterval('custom');
        loadTeamDashboard();
    } else if (currentModalContext === 'team-comparison') {
        teamComparisonCustomDates = dateObj;
        currentTeamComparisonInterval = 'custom';
        setTeamComparisonInterval('custom');
        loadTeamComparisonData();
    } else if (currentModalContext === 'ai-analysis') {
        aiAnalysisCustomDates = dateObj;
        currentAIInterval = 'custom';
        setAIInterval('custom');
        // Reload AI analysis based on which section is open
        const agencySection = document.getElementById('agencyAnalysisSection');
        if (agencySection && !agencySection.classList.contains('hidden')) {
            runAgencyAnalysis();
        } else {
            runChatterAnalysis();
        }
    } else if (currentModalContext === 'performance') {
        performanceCustomDates = dateObj;
        currentPerformanceInterval = 'custom';
        setPerformanceInterval('custom');
        loadPerformanceData();
    }
    
    closeCustomDateModal();
}

function applyCustomDateFilter() {
    const startDate = document.getElementById('dashboardStartDate').value;
    const endDate = document.getElementById('dashboardEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    // Set custom filter
    currentFilterType = 'custom';
    currentWeekFilter = null;
    currentMonthFilter = null;
    customDateRange = {
        start: startDate,
        end: endDate
    };
    
    console.log('✅ Custom date filter applied:', customDateRange);
    loadDashboardData();
}

function setQuickFilter(type) {
    const today = new Date();
    let startDate, endDate = new Date();
    
    if (type === '24h') {
        // Last 24 hours
        startDate = new Date(today);
        startDate.setHours(today.getHours() - 24);
    } else if (type === '7d') {
        // Last 7 days
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
    } else if (type === '30d') {
        // Last 30 days
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
    } else if (type === 'week') {
        // Get start of this week (Sunday)
        const dayOfWeek = today.getDay();
        startDate = new Date(today);
        startDate.setDate(today.getDate() - dayOfWeek);
        
        // Get end of this week (Saturday)
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
    } else if (type === 'month') {
        // First day of current month
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        
        // Last day of current month
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    
    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Set input values
    document.getElementById('dashboardStartDate').value = formatDate(startDate);
    document.getElementById('dashboardEndDate').value = formatDate(endDate);
    
    // Apply filter
    applyCustomDateFilter();
}

// Initialize with current week on load
function initializeDatePicker() {
    setQuickFilter('week');
}

async function loadDashboardData() {
    try {
        // Use currentDashboardInterval and calculate date range
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentDashboardInterval === 'custom' && dashboardCustomDates) {
            startDate = new Date(dashboardCustomDates.start);
            endDate = new Date(dashboardCustomDates.end);
        } else if (currentDashboardInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
        } else if (currentDashboardInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        } else if (currentDashboardInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        const url = `/api/analytics/dashboard?filterType=custom&customStart=${formatDate(startDate)}&customEnd=${formatDate(endDate)}&_t=${Date.now()}`;
        
        console.log('Loading dashboard with URL:', url);
        console.log('Dashboard interval:', currentDashboardInterval);
        console.log('Date range:', formatDate(startDate), 'to', formatDate(endDate));
        
        // Fetch real data from API
        const response = await fetch(url, {
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
        
        // Load new charts
        loadRevenueAttributionChart();
        loadConversionFunnelChart(data);
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
        
        loadRevenueAttributionChart();
        loadConversionFunnelChart(emptyData);
    }
}

// Calculate intelligent metrics not available in Infloww
function calculateIntelligentMetrics(analytics) {
    // FIXED: Use linkClicks instead of profileClicks for Click-to-Sub Rate
    const clickToSubRate = analytics.linkClicks > 0 ? (analytics.newSubs / analytics.linkClicks * 100) : 0;
    const ppvUnlockRate = analytics.ppvsSent > 0 ? (analytics.ppvsUnlocked / analytics.ppvsSent * 100) : 0;
    const revenuePerSub = analytics.totalSubs > 0 ? (analytics.totalRevenue / analytics.totalSubs) : 0;
    // Calculate revenue per hour based on actual time period
    const timePeriodHours = currentTimeInterval === '24h' ? 24 : 
                           currentTimeInterval === '7d' ? 24 * 7 : 
                           currentTimeInterval === '30d' ? 24 * 30 : 24 * 7; // Default to 7 days
    const revenuePerHour = analytics.totalRevenue / timePeriodHours;
    const messagesPerPPV = analytics.ppvsSent > 0 ? (analytics.messagesSent / analytics.ppvsSent) : 0;
    
    // Team performance calculations
    // Top performer will be set from backend data if available, otherwise show message
    const topPerformer = 'See Team Dashboard';
    const performanceGap = 0;
    const teamConsistency = 0;
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
        revenueGrowth: intelligent.revenueGrowth > 0 ? `+${intelligent.revenueGrowth}%` : 'No growth data',
        subsGrowth: intelligent.subsGrowth > 0 ? `+${intelligent.subsGrowth}%` : 'No growth data',
        clicksGrowth: intelligent.clicksGrowth > 0 ? `+${intelligent.clicksGrowth}%` : 'No growth data',
        
        // Conversion intelligence
        clickToSubRate: `${intelligent.clickToSubRate}%`,
        ppvUnlockRate: `${intelligent.ppvUnlockRate}%`,
        revenuePerSub: `$${intelligent.revenuePerSub.toFixed(2)}`,
        
        // Efficiency metrics - NEW
        effActiveFans: analytics.activeFans > 0 ? analytics.activeFans.toLocaleString() : '-',
        effFansWithRenew: analytics.fansWithRenew > 0 ? analytics.fansWithRenew.toLocaleString() : '-',
        clicksToSpenders: analytics.linkClicks > 0 ? `${((analytics.uniqueSpenders / analytics.linkClicks) * 100).toFixed(1)}%` : '0%',
        
        // Team quality - NEW (scores are 0-100 scale)
        topPerformer: analytics.topPerformer || 'No data',
        avgOverallScore: analytics.avgOverallScore != null ? `${analytics.avgOverallScore}/100` : '-',
        avgGrammarScore: analytics.avgGrammarScore != null ? `${analytics.avgGrammarScore}/100` : '-',
        avgGuidelinesScore: analytics.avgGuidelinesScore != null ? `${analytics.avgGuidelinesScore}/100` : '-'
    };

    console.log('🎨 Dashboard quality scores:', {
        grammar: analytics.avgGrammarScore,
        guidelines: analytics.avgGuidelinesScore,
        overall: analytics.avgOverallScore
    });

    // Update all elements
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
            
            // Apply color coding to quality scores
            if (id === 'avgGrammarScore' || id === 'avgGuidelinesScore' || id === 'avgOverallScore') {
                const scoreKey = id.replace('avg', '').replace('Score', '');
                const scoreValue = analytics[id];
                const color = window.getScoreColor(scoreValue);
                console.log(`🎨 ${id}: ${scoreValue} → ${color}`);
                element.className = element.className.replace(/text-\w+-\d+/g, '') + ' ' + color;
            }
            
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
        
        // Show date range indicator
        const indicator = document.getElementById('customDateRangeIndicator');
        const textSpan = document.getElementById('customDateRangeText');
        if (indicator && textSpan) {
            textSpan.textContent = `${startDate} to ${endDate}`;
            indicator.classList.remove('hidden');
        }
        
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
    const cards = document.getElementById('analysisTypeCards');
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    // Hide selection cards
    if (cards) cards.classList.add('hidden');
    
    // Show agency section and run analysis
    if (agencySection) {
        agencySection.classList.remove('hidden');
        runAgencyAnalysis();
    }
    
    // Hide individual section
    if (chatterSection) {
        chatterSection.classList.add('hidden');
    }
}

// Auto-show chatter analysis for logged-in chatter
function showChatterAnalysisAuto() {
    const typeSelection = document.getElementById('analysisTypeSelection');
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    // Hide type selection for chatters (they only get individual analysis)
    if (typeSelection) {
        typeSelection.classList.add('hidden');
    }
    
    // Hide agency analysis for chatters
    if (agencySection) {
        agencySection.classList.add('hidden');
    }
    
    // Show chatter analysis section
    if (chatterSection) {
        chatterSection.classList.remove('hidden');
        
        // Auto-select current chatter in dropdown
        const chatterSelect = document.getElementById('chatterSelect');
        if (chatterSelect && currentUser?.id) {
            chatterSelect.value = currentUser.id;
            console.log('✅ Auto-selected chatter:', currentUser.username || currentUser.chatterName);
            
            // Hide the chatter dropdown too (they can only analyze themselves)
            const chatterSelectContainer = chatterSelect.closest('.mb-8');
            if (chatterSelectContainer) {
                chatterSelectContainer.classList.add('hidden');
            }
        }
    }
}

// Show Chatter Analysis
function showChatterAnalysis() {
    const cards = document.getElementById('analysisTypeCards');
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    // Hide selection cards
    if (cards) cards.classList.add('hidden');
    
    // Show individual section
    if (chatterSection) {
        chatterSection.classList.remove('hidden');
        loadChattersForAnalysis();
    }
    
    // Hide agency section
    if (agencySection) {
        agencySection.classList.add('hidden');
    }
}

// Hide Analysis Results
function hideAnalysisResults() {
    const cards = document.getElementById('analysisTypeCards');
    const agencySection = document.getElementById('agencyAnalysisSection');
    const chatterSection = document.getElementById('chatterAnalysisSection');
    
    // Show selection cards again
    if (cards) cards.classList.remove('hidden');
    
    // Hide both analysis sections
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
        const response = await fetch('/api/chatters', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const chatters = await response.json();
            
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
            opportunities.push(`Reducing response time could increase conversions`);
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
            opportunities.push(`Reducing response time could increase conversions`);
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
            roiCalculations.push(`Response time improvement: $${potentialResponseTimeGain} potential monthly gain`);
        }
        
        const potentialConversionGain = clickToSubRate < 10 ? Math.round(analyticsData.totalRevenue * 0.2) : 0;
        if (potentialConversionGain > 0) {
            roiCalculations.push(`Conversion optimization: $${potentialConversionGain} potential monthly gain`);
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

// DEEP INSIGHTS GENERATION - The Brain of the System
function generateDeepInsights(data) {
    const insights = {
        critical: [],    // 🔴 Critical problems
        opportunities: [], // 🟡 Revenue opportunities
        strengths: [],   // 🟢 What's working
        predictions: []  // 💎 Predictive insights
    };
    
    // Calculate key ratios
    const revenuePerSub = data.totalSubs > 0 ? data.netRevenue / data.totalSubs : 0;
    const unlockRate = data.ppvsSent > 0 ? (data.ppvsUnlocked / data.ppvsSent) * 100 : 0;
    const spenderRate = data.linkClicks > 0 ? (data.uniqueSpenders / data.linkClicks) * 100 : 0;
    const clickToSubRate = data.linkClicks > 0 ? (data.newSubs / data.linkClicks) * 100 : 0;
    const vipDependency = data.vipRevenuePercent || 0;
    
    // 🔴 CRITICAL PROBLEMS
    if (vipDependency > 70) {
        const risk = ((vipDependency - 70) / 30 * 100).toFixed(0);
        insights.critical.push({
            title: 'SEVERE Revenue Concentration Risk',
            description: `${vipDependency.toFixed(1)}% of revenue from VIPs - if top 3 VIPs churn, you lose ${(vipDependency * 0.6).toFixed(0)}% of income`,
            impact: '$' + (data.netRevenue * (vipDependency * 0.006)).toFixed(0) + ' at risk',
            severity: 'CRITICAL',
            action: 'Diversify: Focus on converting more regular fans to consistent spenders'
        });
    }
    
    if (unlockRate < 35 && data.ppvsSent > 20) {
        const potential = ((45 - unlockRate) / 100 * data.ppvsSent * (data.avgPPVPrice || 10)).toFixed(0);
        insights.critical.push({
            title: 'PPV Unlock Rate Bottleneck',
            description: `Only ${unlockRate.toFixed(1)}% unlock rate - chatters sending low-value PPVs or poor timing`,
            impact: '+$' + potential + '/week potential',
            severity: 'HIGH',
            action: 'Audit PPV quality: Check prices, preview appeal, and send timing'
        });
    }
    
    if (data.avgResponseTime > 5) {
        insights.critical.push({
            title: 'Response Time Killing Conversions',
            description: `${data.avgResponseTime}min average - fans lose interest after 3min`,
            impact: 'Losing 15-25% potential sales',
            severity: 'HIGH',
            action: 'Implement response templates and set 2min response time target'
        });
    }
    
    if (spenderRate < 2 && data.linkClicks > 50) {
        const wasted = (data.linkClicks * (1 - spenderRate/100)).toFixed(0);
        insights.critical.push({
            title: 'Traffic Conversion Crisis',
            description: `${spenderRate.toFixed(1)}% spender rate - ${wasted} clicks produced no revenue`,
            impact: '${((3 - spenderRate) / 100 * data.linkClicks * 50).toFixed(0)} weekly revenue missed',
            severity: 'CRITICAL',
            action: 'Fix: Landing page → First message flow is broken. Review welcome scripts'
        });
    }
    
    // 🟡 OPPORTUNITIES (Hidden money on the table)
    if (data.avgPPVPrice && data.avgPPVPrice < 15 && data.ppvsUnlocked > 10) {
        const gain = ((20 - data.avgPPVPrice) * data.ppvsUnlocked).toFixed(0);
        insights.opportunities.push({
            title: 'PPV Pricing Leaving Money on Table',
            description: `Avg PPV price $${data.avgPPVPrice} - premium content sells for $20-30`,
            potential: '+$' + gain + '/week',
            confidence: '85%',
            action: 'Test $20-25 PPVs with exclusive content angles'
        });
    }
    
    if (clickToSubRate < 5 && data.linkClicks > 100) {
        const potentialSubs = (data.linkClicks * 0.05 - data.newSubs).toFixed(0);
        insights.opportunities.push({
            title: 'Link Click → Subscriber Conversion Gap',
            description: `${clickToSubRate.toFixed(1)}% conversion - ${potentialSubs} more subs available from existing traffic`,
            potential: '+$' + (potentialSubs * revenuePerSub).toFixed(0) + '/week',
            confidence: '90%',
            action: 'Optimize: Free trial offers, profile appeal, subscription price testing'
        });
    }
    
    if (data.renewRate && data.renewRate < 50 && data.activeFans > 50) {
        const churning = (data.activeFans * (1 - data.renewRate/100)).toFixed(0);
        insights.opportunities.push({
            title: 'Retention Leakage',
            description: `${data.renewRate.toFixed(1)}% renew rate - ${churning} fans will churn next month`,
            potential: '+$' + (churning * 10).toFixed(0) + '/month saved',
            confidence: '95%',
            action: 'Launch re-engagement campaign 3 days before renewal dates'
        });
    }
    
    // 🟢 STRENGTHS (What to double down on)
    if (unlockRate >= 40) {
        insights.strengths.push({
            title: 'PPV Conversion Excellence',
            description: `${unlockRate.toFixed(1)}% unlock rate - your chatters know how to sell`,
            impact: 'Keep this quality as you scale',
            action: 'Document what works: PPV types, timing, messaging style'
        });
    }
    
    if (spenderRate >= 3) {
        insights.strengths.push({
            title: 'Traffic Quality is Premium',
            description: `${spenderRate.toFixed(1)}% of clicks become buyers - your sources are gold`,
            impact: 'Traffic → Revenue machine working',
            action: 'Double marketing budget on current best-performing sources'
        });
    }
    
    if (data.vipRevenuePercent > 0 && data.vipRevenuePercent < 60 && data.avgVIPSpend > 200) {
        insights.strengths.push({
            title: 'Balanced Revenue + Strong VIPs',
            description: `${data.vipRevenuePercent.toFixed(1)}% from VIPs with $${data.avgVIPSpend.toFixed(0)} avg spend - healthy mix`,
            impact: 'Low risk, high stability',
            action: 'Maintain: Keep cultivating VIPs while growing regular fan base'
        });
    }
    
    // 💎 PREDICTIVE INSIGHTS
    if (data.ppvsUnlocked > 0 && unlockRate < 45) {
        const currentRevenue = data.ppvsUnlocked * (data.avgPPVPrice || 10);
        const targetRevenue = data.ppvsSent * 0.45 * (data.avgPPVPrice || 10);
        const gain = (targetRevenue - currentRevenue).toFixed(0);
        insights.predictions.push({
            title: 'Unlock Rate Optimization',
            current: `${unlockRate.toFixed(1)}% → $${currentRevenue.toFixed(0)}/week`,
            target: `45% → $${targetRevenue.toFixed(0)}/week`,
            gain: '+$' + gain + '/week',
            timeframe: '2-3 weeks',
            action: 'Improve PPV preview quality + timing optimization'
        });
    }
    
    if (data.linkClicks > 100 && spenderRate < 4) {
        const currentSpenders = data.uniqueSpenders;
        const targetSpenders = data.linkClicks * 0.04;
        const gain = ((targetSpenders - currentSpenders) * (data.avgPPVPrice || 15)).toFixed(0);
        insights.predictions.push({
            title: 'Traffic Conversion Upside',
            current: `${spenderRate.toFixed(1)}% spender rate → ${currentSpenders} buyers`,
            target: `4% → ${targetSpenders.toFixed(0)} buyers`,
            gain: '+$' + gain + '/week',
            timeframe: '1-2 weeks',
            action: 'Fix first message + faster response times'
        });
    }
    
    return insights;
}

// Render Agency Insights with BEAUTIFUL UI
function renderAgencyInsights(insights) {
    const criticalHTML = insights.critical.map(c => `
        <div class="glass-card rounded-2xl p-6 border-2 border-red-500/40 bg-gradient-to-br from-red-900/20 to-red-800/10 hover:border-red-500/60 transition-all">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                        <i class="fas fa-exclamation-triangle text-red-400 text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white">${c.title}</h4>
                        <span class="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full">${c.severity}</span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-400">Impact</div>
                    <div class="text-lg font-bold text-red-400">${c.impact}</div>
                </div>
            </div>
            <p class="text-gray-300 mb-4 text-base leading-relaxed">${c.description}</p>
            <div class="pt-4 border-t border-red-500/20">
                <div class="flex items-start gap-2">
                    <i class="fas fa-lightbulb text-yellow-400 mt-1"></i>
                    <div>
                        <div class="text-xs text-gray-500 mb-1">ACTION REQUIRED</div>
                        <div class="text-sm font-medium text-white">${c.action}</div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    const opportunitiesHTML = insights.opportunities.map(o => `
        <div class="glass-card rounded-2xl p-6 border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 hover:border-yellow-500/60 transition-all">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                        <i class="fas fa-treasure-chest text-yellow-400 text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white">${o.title}</h4>
                        <span class="px-3 py-1 bg-yellow-500/80 text-gray-900 text-xs font-bold rounded-full">${o.confidence} CONFIDENCE</span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-400">Potential</div>
                    <div class="text-2xl font-bold text-green-400">${o.potential}</div>
                </div>
            </div>
            <p class="text-gray-300 mb-4 text-base leading-relaxed">${o.description}</p>
            <div class="pt-4 border-t border-yellow-500/20">
                <div class="flex items-start gap-2">
                    <i class="fas fa-rocket text-green-400 mt-1"></i>
                    <div>
                        <div class="text-xs text-gray-500 mb-1">HOW TO CAPTURE</div>
                        <div class="text-sm font-medium text-white">${o.action}</div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    const strengthsHTML = insights.strengths.map(s => `
        <div class="glass-card rounded-xl p-5 border border-green-500/30 bg-gradient-to-br from-green-900/10 to-green-800/5">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-check-circle text-green-400"></i>
                </div>
                <div class="flex-1">
                    <h5 class="font-bold text-white mb-1">${s.title}</h5>
                    <p class="text-sm text-gray-300 mb-2">${s.description}</p>
                    <div class="flex items-center gap-4 text-xs">
                        <span class="text-green-400">✓ ${s.impact}</span>
                        <span class="text-gray-500">→ ${s.action}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    const predictionsHTML = insights.predictions.map(p => `
        <div class="glass-card rounded-2xl p-6 border-2 border-purple-500/40 bg-gradient-to-br from-purple-900/20 to-pink-900/10">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <i class="fas fa-crystal-ball text-purple-400 text-xl"></i>
                </div>
                <h4 class="text-xl font-bold text-white">${p.title}</h4>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="p-3 bg-gray-800/50 rounded-lg">
                    <div class="text-xs text-gray-500 mb-1">CURRENT STATE</div>
                    <div class="text-sm font-medium text-gray-300">${p.current}</div>
                </div>
                <div class="p-3 bg-purple-900/30 rounded-lg border border-purple-500/30">
                    <div class="text-xs text-purple-400 mb-1">TARGET STATE</div>
                    <div class="text-sm font-medium text-white">${p.target}</div>
                </div>
            </div>
            <div class="flex items-center justify-between pt-4 border-t border-purple-500/20">
                <div>
                    <div class="text-xs text-gray-500">PROJECTED GAIN</div>
                    <div class="text-2xl font-bold text-green-400">${p.gain}</div>
                    <div class="text-xs text-gray-400">in ${p.timeframe}</div>
                </div>
                <div class="text-right flex-1 ml-4">
                    <div class="text-xs text-gray-500 mb-1">ACTION PLAN</div>
                    <div class="text-sm text-white">${p.action}</div>
                </div>
            </div>
        </div>
    `).join('');
    
    return `
        <div class="mb-6">
            <div class="flex items-center justify-between">
                <h3 class="text-2xl font-bold text-white">Analysis Complete</h3>
                <div class="flex items-center gap-3 text-sm">
                    <span class="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg">${insights.critical.length} Critical</span>
                    <span class="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg">${insights.opportunities.length} Opportunities</span>
                    <span class="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg">${insights.strengths.length} Strengths</span>
                </div>
            </div>
        </div>
        
        ${insights.critical.length > 0 ? `
            <div class="mb-8">
                <h3 class="text-2xl font-bold mb-4 flex items-center">
                    <i class="fas fa-exclamation-circle text-red-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">Critical Issues</span>
                </h3>
                <div class="space-y-4">
                    ${criticalHTML}
                </div>
            </div>
        ` : ''}
        
        ${insights.opportunities.length > 0 ? `
            <div class="mb-8">
                <h3 class="text-2xl font-bold mb-4 flex items-center">
                    <i class="fas fa-gem text-yellow-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-yellow-400 to-green-500 bg-clip-text text-transparent">Revenue Opportunities</span>
                </h3>
                <div class="space-y-4">
                    ${opportunitiesHTML}
                </div>
            </div>
        ` : ''}
        
        ${insights.predictions.length > 0 ? `
            <div class="mb-8">
                <h3 class="text-2xl font-bold mb-4 flex items-center">
                    <i class="fas fa-chart-line text-purple-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Predictive Models</span>
                </h3>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${predictionsHTML}
                </div>
            </div>
        ` : ''}
        
        ${insights.strengths.length > 0 ? `
            <div class="mb-8">
                <h3 class="text-2xl font-bold mb-4 flex items-center">
                    <i class="fas fa-trophy text-green-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Core Strengths</span>
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${strengthsHTML}
                </div>
            </div>
        ` : ''}
        
        ${insights.critical.length === 0 && insights.opportunities.length === 0 ? `
            <div class="text-center py-16 glass-card rounded-2xl border-2 border-green-500/30">
                <i class="fas fa-check-circle text-6xl text-green-400 mb-4"></i>
                <h3 class="text-3xl font-bold text-white mb-3">Agency Running Optimally</h3>
                <p class="text-gray-400 text-lg">No critical issues or major opportunities detected. Keep executing!</p>
            </div>
        ` : ''}
    `;
}

// Render Agency Intelligence Dashboard
function renderAgencyIntelligence(intel) {
    const exec = intel.executive || {};
    const revenue = intel.revenue || {};
    const traffic = intel.traffic || {};
    const retention = intel.retention || {};
    const team = intel.team || {};
    const patterns = intel.patterns || [];
    const recommendations = intel.recommendations || [];
    
    const statusColor = {
        growing: 'text-green-400',
        declining: 'text-red-400',
        stable: 'text-yellow-400'
    }[exec.status] || 'text-gray-400';
    
    const statusIcon = {
        growing: 'fa-arrow-trend-up',
        declining: 'fa-arrow-trend-down',
        stable: 'fa-minus'
    }[exec.status] || 'fa-minus';
    
    return `
        <!-- Executive Summary -->
        <div class="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border-2 border-purple-500/40 mb-8">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h2 class="text-3xl font-bold text-white mb-2">
                        <i class="fas fa-crown text-yellow-400 mr-3"></i>
                        Executive Intelligence Report
                    </h2>
                    <p class="text-gray-300">
                        ${new Date(exec.period?.start).toLocaleDateString()} - ${new Date(exec.period?.end).toLocaleDateString()}
                    </p>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-400 mb-1">Status</div>
                    <div class="${statusColor} text-2xl font-bold flex items-center justify-end">
                        <i class="fas ${statusIcon} mr-2"></i>
                        ${exec.status?.toUpperCase() || 'ANALYZING'}
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-black/30 rounded-xl p-6 border border-purple-500/20">
                    <div class="text-purple-300 text-sm font-medium mb-2">REVENUE</div>
                    <div class="text-4xl font-bold text-white mb-2">$${exec.revenue?.current || 0}</div>
                    <div class="flex items-center text-sm ${exec.revenue?.change >= 0 ? 'text-green-400' : 'text-red-400'}">
                        <i class="fas ${exec.revenue?.change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} mr-2"></i>
                        ${exec.revenue?.changePercent >= 0 ? '+' : ''}${exec.revenue?.changePercent || 0}% vs last period
                    </div>
                </div>
                
                <div class="bg-black/30 rounded-xl p-6 border border-cyan-500/20">
                    <div class="text-cyan-300 text-sm font-medium mb-2">TEAM UNLOCK RATE</div>
                    <div class="text-4xl font-bold text-white mb-2">${exec.team?.unlockRate || 0}%</div>
                    <div class="text-sm text-gray-400">${exec.team?.activeChatters || 0} active chatters</div>
                </div>
                
                <div class="bg-black/30 rounded-xl p-6 border border-pink-500/20">
                    <div class="text-pink-300 text-sm font-medium mb-2">AVG QUALITY</div>
                    <div class="text-4xl font-bold text-white mb-2">${exec.team?.avgQualityScore || 0}/100</div>
                    <div class="text-sm text-gray-400">Message quality score</div>
                </div>
            </div>
        </div>
        
        <!-- Strategic Recommendations -->
        ${recommendations.length > 0 ? `
            <div class="glass-card rounded-2xl p-8 mb-8 border-2 border-red-500/40">
                <h3 class="text-2xl font-bold text-white mb-6">
                    <i class="fas fa-exclamation-triangle text-red-400 mr-3"></i>
                    Strategic Priorities
                </h3>
                <div class="space-y-4">
                    ${recommendations.map((rec, idx) => `
                        <div class="bg-gradient-to-r ${rec.priority === 'high' ? 'from-red-900/40 to-red-800/20 border-red-500/40' : rec.priority === 'medium' ? 'from-yellow-900/40 to-yellow-800/20 border-yellow-500/40' : 'from-blue-900/40 to-blue-800/20 border-blue-500/40'} border-2 rounded-xl p-6">
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex items-center">
                                    <div class="w-8 h-8 rounded-lg ${rec.priority === 'high' ? 'bg-red-500' : rec.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'} text-white flex items-center justify-center font-bold mr-3">
                                        ${idx + 1}
                                    </div>
                                    <div>
                                        <div class="text-lg font-bold text-white">${rec.title}</div>
                                        <div class="text-xs ${rec.priority === 'high' ? 'text-red-400' : rec.priority === 'medium' ? 'text-yellow-400' : 'text-blue-400'} font-bold uppercase">${rec.priority} PRIORITY • ${rec.category}</div>
                                    </div>
                                </div>
                                <div class="px-3 py-1 rounded-full text-xs font-bold ${rec.priority === 'high' ? 'bg-red-500/20 text-red-300' : rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300'}">
                                    ${rec.timeframe}
                                </div>
                            </div>
                            <div class="mb-3">
                                <div class="text-sm text-gray-400 mb-1">Issue:</div>
                                <div class="text-white">${rec.issue}</div>
                            </div>
                            <div class="mb-3">
                                <div class="text-sm text-gray-400 mb-1">Impact:</div>
                                <div class="text-white">${rec.impact}</div>
                            </div>
                            <div class="bg-black/30 rounded-lg p-4 border border-white/10">
                                <div class="text-sm font-bold text-green-400 mb-2">
                                    <i class="fas fa-lightbulb mr-2"></i>ACTION PLAN:
                                </div>
                                <div class="text-white">${rec.action}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <!-- Revenue Analysis -->
        ${revenue.current ? `
            <div class="glass-card rounded-2xl p-8 mb-8">
                <h3 class="text-2xl font-bold text-white mb-4">
                    <i class="fas fa-chart-line text-green-400 mr-3"></i>
                    Revenue Mechanical Breakdown
                </h3>
                
                ${revenue.previous.revenue > 0 ? `
                    <div class="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-600/30">
                        <p class="text-gray-300 leading-relaxed">
                            Revenue ${revenue.changes.revenue >= 0 ? 'grew' : 'declined'} by <span class="font-bold text-white">${revenue.changes.revenuePercent >= 0 ? '+' : ''}${revenue.changes.revenuePercent}%</span> this period 
                            ($${revenue.previous.revenue} → $${revenue.current.revenue}). 
                            ${Math.abs(revenue.drivers.volumeContribution) > Math.abs(revenue.drivers.priceContribution) 
                                ? `Volume changes contributed $${Math.abs(revenue.drivers.volumeContribution)}, while pricing contributed $${Math.abs(revenue.drivers.priceContribution)}.`
                                : `Pricing changes contributed $${Math.abs(revenue.drivers.priceContribution)}, while volume contributed $${Math.abs(revenue.drivers.volumeContribution)}.`
                            }
                            ${revenue.changes.unlockRate < -5 ? `Unlock rate decline cost you potential revenue.` : revenue.changes.unlockRate > 5 ? `Unlock rate improvement boosted revenue.` : ''}
                        </p>
                    </div>
                ` : ''}
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6" style="display: none;">
                    <div class="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-xl p-6 border border-green-500/30">
                        <div class="text-green-300 text-sm font-bold mb-4">CURRENT PERIOD</div>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-300">Revenue:</span>
                                <span class="text-white font-bold">$${revenue.current.revenue}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-300">PPVs Unlocked:</span>
                                <span class="text-white font-bold">${revenue.current.ppvCount}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-300">PPVs Sent:</span>
                                <span class="text-white font-bold">${revenue.current.ppvsSent}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-300">Avg PPV Price:</span>
                                <span class="text-white font-bold">$${revenue.current.avgPrice}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-300">Unlock Rate:</span>
                                <span class="text-white font-bold">${revenue.current.unlockRate}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-600/30">
                        <div class="text-gray-400 text-sm font-bold mb-4">PREVIOUS PERIOD</div>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-400">Revenue:</span>
                                <span class="text-gray-300">$${revenue.previous.revenue}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">PPVs Unlocked:</span>
                                <span class="text-gray-300">${revenue.previous.ppvCount}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">PPVs Sent:</span>
                                <span class="text-gray-300">${revenue.previous.ppvsSent}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">Avg PPV Price:</span>
                                <span class="text-gray-300">$${revenue.previous.avgPrice}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">Unlock Rate:</span>
                                <span class="text-gray-300">${revenue.previous.unlockRate}%</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-blue-500/10 rounded-xl p-6 border border-blue-500/30">
                    <div class="text-blue-300 font-bold mb-4">
                        <i class="fas fa-calculator mr-2"></i>WHAT DROVE THE CHANGE:
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="bg-gray-800/50 rounded-lg p-4">
                            <div class="text-sm text-gray-400 mb-2">Volume Impact</div>
                            <div class="text-3xl font-bold ${revenue.drivers?.volumeContribution >= 0 ? 'text-green-400' : 'text-red-400'} mb-2">
                                ${revenue.drivers?.volumeContribution >= 0 ? '+' : ''}$${revenue.drivers?.volumeContribution || 0}
                            </div>
                            <div class="text-xs text-gray-500 mb-2">${revenue.changes?.ppvCount >= 0 ? '+' : ''}${revenue.changes?.ppvCount || 0} PPVs unlocked</div>
                            <div class="text-xs text-gray-400 leading-tight">
                                ${revenue.changes?.ppvCount > 0 
                                    ? `Sending more PPVs increased potential revenue`
                                    : revenue.changes?.ppvCount < 0
                                    ? `Fewer PPVs sent reduced revenue`
                                    : `Volume unchanged`
                                }
                            </div>
                        </div>
                        <div class="bg-gray-800/50 rounded-lg p-4">
                            <div class="text-sm text-gray-400 mb-2">Pricing Impact</div>
                            <div class="text-3xl font-bold ${revenue.drivers?.priceContribution >= 0 ? 'text-green-400' : 'text-red-400'} mb-2">
                                ${revenue.drivers?.priceContribution >= 0 ? '+' : ''}$${revenue.drivers?.priceContribution || 0}
                            </div>
                            <div class="text-xs text-gray-500 mb-2">${revenue.changes?.avgPrice >= 0 ? '+' : ''}$${revenue.changes?.avgPrice || 0} avg price change</div>
                            <div class="text-xs text-gray-400 leading-tight">
                                ${revenue.changes?.avgPrice > 5 
                                    ? `Higher prices drove more revenue per PPV`
                                    : revenue.changes?.avgPrice < -5
                                    ? `Lower prices reduced revenue per PPV`
                                    : `Pricing remained consistent`
                                }
                            </div>
                        </div>
                        <div class="bg-gray-800/50 rounded-lg p-4">
                            <div class="text-sm text-gray-400 mb-2">Conversion Impact</div>
                            <div class="text-3xl font-bold ${revenue.changes?.unlockRate >= 0 ? 'text-green-400' : 'text-red-400'} mb-2">
                                ${revenue.changes?.unlockRate >= 0 ? '+' : ''}${revenue.changes?.unlockRate || 0}%
                            </div>
                            <div class="text-xs text-gray-500 mb-2">${revenue.current.unlockRate}% current rate</div>
                            <div class="text-xs text-gray-400 leading-tight">
                                ${revenue.changes?.unlockRate > 3 
                                    ? `Better captions/timing improved conversions`
                                    : revenue.changes?.unlockRate < -3
                                    ? `Lower unlock rate hurt revenue potential`
                                    : `Conversion rate stable`
                                }
                            </div>
                        </div>
                    </div>
                    <div class="text-center text-white pt-4 border-t border-white/10">
                        <i class="fas fa-bolt text-yellow-400 mr-2"></i>
                        <span class="font-bold">${revenue.drivers?.primaryDriver === 'volume' ? 'Volume Growth' : 'Price Changes'}</span> was the primary revenue driver this period
                    </div>
                </div>
            </div>
        ` : ''}
        
        <!-- Traffic Source Intelligence -->
        ${traffic.sortedSources && traffic.sortedSources.length > 0 ? `
            <div class="glass-card rounded-2xl p-8 mb-8">
                <h3 class="text-2xl font-bold text-white mb-4">
                    <i class="fas fa-route text-blue-400 mr-3"></i>
                    Traffic Source Intelligence
                </h3>
                
                <div class="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-600/30">
                    <p class="text-gray-300 leading-relaxed">
                        ${traffic.sortedSources.length} traffic source${traffic.sortedSources.length > 1 ? 's' : ''} generated $${traffic.totalRevenue} this period. 
                        <span class="font-bold text-white">${traffic.topSource?.name}</span> is your top performer with $${traffic.topSource?.revenue} 
                        (<span class="${parseFloat(traffic.concentration) > 70 ? 'text-red-400' : 'text-green-400'} font-bold">${traffic.concentration}%</span> of revenue).
                        ${parseFloat(traffic.concentration) > 70 
                            ? ` This high concentration creates risk - if ${traffic.topSource?.name} underperforms, you lose most of your revenue.`
                            : ` Your revenue is well-diversified across multiple sources.`
                        }
                    </p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div class="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 rounded-xl p-6 border border-blue-500/30">
                        <div class="text-blue-300 text-sm font-bold mb-3">TOP SOURCE</div>
                        <div class="text-3xl font-bold text-white mb-2">${traffic.topSource?.name || 'N/A'}</div>
                        <div class="text-gray-300 mb-3">$${traffic.topSource?.revenue || 0} revenue (${traffic.concentration}% of total)</div>
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <div class="text-gray-400">Buyers:</div>
                                <div class="text-white font-bold">${traffic.topSource?.buyerCount || 0}</div>
                            </div>
                            <div>
                                <div class="text-gray-400">VIP Rate:</div>
                                <div class="text-white font-bold">${traffic.topSource?.vipRate || 0}%</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-xl p-6 border border-purple-500/30">
                        <div class="text-purple-300 text-sm font-bold mb-3">DIVERSITY ANALYSIS</div>
                        <div class="text-3xl font-bold text-white mb-2">${traffic.sortedSources.length} Sources</div>
                        <div class="text-gray-300 mb-3">Diversity Score: ${traffic.diversityScore}/100</div>
                        ${parseFloat(traffic.concentration) > 70 ? `
                            <div class="flex items-start bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                <i class="fas fa-exclamation-triangle text-red-400 mt-1 mr-2"></i>
                                <div class="text-xs text-red-300">High concentration risk - diversify sources</div>
                            </div>
                        ` : `
                            <div class="flex items-start bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                                <i class="fas fa-check-circle text-green-400 mt-1 mr-2"></i>
                                <div class="text-xs text-green-300">Well-diversified traffic portfolio</div>
                            </div>
                        `}
                    </div>
                </div>
                
                <!-- Source Breakdown -->
                <div class="space-y-3">
                    ${traffic.sortedSources.map(source => {
                        const percentOfTotal = traffic.totalRevenue > 0 ? ((source.revenue / traffic.totalRevenue) * 100).toFixed(1) : 0;
                        return `
                            <div class="bg-gray-700/30 rounded-xl p-4 border border-gray-600/30 hover:border-cyan-500/50 transition-all">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center">
                                        <div class="w-10 h-10 rounded-lg bg-${source.category === 'reddit' ? 'orange' : source.category === 'twitter' ? 'blue' : source.category === 'instagram' ? 'pink' : 'purple'}-500/20 flex items-center justify-center mr-3">
                                            <i class="fab fa-${source.category} text-${source.category === 'reddit' ? 'orange' : source.category === 'twitter' ? 'blue' : source.category === 'instagram' ? 'pink' : 'purple'}-400"></i>
                                        </div>
                                        <div>
                                            <div class="text-white font-bold">${source.name}</div>
                                            <div class="text-xs text-gray-400 uppercase">${source.category}</div>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-2xl font-bold text-white">$${source.revenue}</div>
                                        <div class="text-xs text-gray-400">${percentOfTotal}% of total</div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-4 gap-4 text-center">
                                    <div>
                                        <div class="text-xs text-gray-400">Buyers</div>
                                        <div class="text-white font-bold">${source.buyerCount}</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-gray-400">VIP Rate</div>
                                        <div class="text-white font-bold">${source.vipRate}%</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-gray-400">Avg Purchase</div>
                                        <div class="text-white font-bold">$${source.avgPurchaseValue}</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-gray-400">Growth</div>
                                        <div class="font-bold ${source.revenueChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}">
                                            ${source.revenueChangePercent >= 0 ? '+' : ''}${source.revenueChangePercent}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        ` : ''}
        
        <!-- Retention & Churn -->
        ${retention.overall ? `
            <div class="glass-card rounded-2xl p-8 mb-8">
                <h3 class="text-2xl font-bold text-white mb-4">
                    <i class="fas fa-users text-cyan-400 mr-3"></i>
                    Retention & Churn Intelligence
                </h3>
                
                <div class="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-600/30">
                    <p class="text-gray-300 leading-relaxed">
                        ${retention.overall.retention30Day > 0 
                            ? `<span class="font-bold text-white">${retention.overall.retention30Day}%</span> of fans remain active after 30 days, dropping to 
                               <span class="font-bold text-white">${retention.overall.retention90Day}%</span> by 90 days.`
                            : 'No retention data available - track VIP fan engagement to monitor churn.'
                        }
                        ${retention.atRisk.count > 0 
                            ? ` <span class="text-yellow-400 font-bold">${retention.atRisk.count} fans</span> haven't messaged in 15+ days and are at risk of churning.`
                            : ''
                        }
                        ${retention.likelyChurned.count > 0 
                            ? ` <span class="text-red-400 font-bold">${retention.likelyChurned.count} fans</span> are likely already churned (30+ days inactive).`
                            : ''
                        }
                    </p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div class="bg-gradient-to-br from-cyan-900/20 to-blue-900/20 rounded-xl p-6 border border-cyan-500/30">
                        <div class="text-cyan-300 text-sm font-bold mb-2">30-DAY RETENTION</div>
                        <div class="text-4xl font-bold text-white">${retention.overall.retention30Day}%</div>
                        <div class="text-xs text-gray-400 mt-2">Short-term health</div>
                    </div>
                    <div class="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 rounded-xl p-6 border border-blue-500/30">
                        <div class="text-blue-300 text-sm font-bold mb-2">60-DAY RETENTION</div>
                        <div class="text-4xl font-bold text-white">${retention.overall.retention60Day}%</div>
                        <div class="text-xs text-gray-400 mt-2">Medium-term health</div>
                    </div>
                    <div class="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-xl p-6 border border-indigo-500/30">
                        <div class="text-indigo-300 text-sm font-bold mb-2">90-DAY RETENTION</div>
                        <div class="text-4xl font-bold text-white">${retention.overall.retention90Day}%</div>
                        <div class="text-xs text-gray-400 mt-2">Long-term health</div>
                    </div>
                    <div class="bg-gradient-to-br from-red-900/20 to-orange-900/20 rounded-xl p-6 border border-red-500/30">
                        <div class="text-red-300 text-sm font-bold mb-2">CHURN RATE</div>
                        <div class="text-4xl font-bold text-white">${retention.overall.churnRate}%</div>
                        <div class="text-xs text-gray-400 mt-2">${retention.overall.churnedVIPs} churned VIPs</div>
                    </div>
                </div>
                
                ${retention.atRisk.count > 0 ? `
                    <div class="bg-yellow-500/10 border-2 border-yellow-500/40 rounded-xl p-6 mb-6">
                        <div class="flex items-center mb-4">
                            <i class="fas fa-exclamation-circle text-yellow-400 text-2xl mr-3"></i>
                            <div>
                                <div class="text-lg font-bold text-white">${retention.atRisk.count} At-Risk Fans</div>
                                <div class="text-sm text-yellow-300">No message in 15+ days - immediate action needed</div>
                            </div>
                        </div>
                        ${retention.atRisk.fans.slice(0, 5).map(fan => `
                            <div class="text-sm text-gray-300 mb-1">
                                <i class="fas fa-user text-yellow-400 mr-2"></i>
                                ${fan.username} - Last message: ${new Date(fan.lastMessage).toLocaleDateString()}
                            </div>
                        `).join('')}
                        ${retention.atRisk.count > 5 ? `<div class="text-xs text-gray-500 mt-2">...and ${retention.atRisk.count - 5} more</div>` : ''}
                    </div>
                ` : ''}
                
                ${retention.bySource && Object.keys(retention.bySource).length > 0 ? `
                    <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-600/30">
                        <div class="text-white font-bold mb-4">Retention by Traffic Source:</div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            ${Object.entries(retention.bySource).map(([source, data]) => `
                                <div class="bg-gray-700/50 rounded-lg p-4">
                                    <div class="text-sm text-gray-400 mb-2">${source}</div>
                                    <div class="flex justify-between text-sm">
                                        <span class="text-gray-300">30-day:</span>
                                        <span class="text-white font-bold">${data.retention30}%</span>
                                    </div>
                                    <div class="flex justify-between text-sm">
                                        <span class="text-gray-300">90-day:</span>
                                        <span class="text-white font-bold">${data.retention90}%</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        
        <!-- Team Performance Matrix -->
        ${team.chatters && team.chatters.length > 0 ? `
            <div class="glass-card rounded-2xl p-8 mb-8">
                <h3 class="text-2xl font-bold text-white mb-4">
                    <i class="fas fa-users-cog text-purple-400 mr-3"></i>
                    Team Performance Matrix
                </h3>
                
                <div class="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-600/30">
                    <p class="text-gray-300 leading-relaxed">
                        ${team.count} ${team.count > 1 ? 'chatters are' : 'chatter is'} active this period. 
                        ${team.rankings?.revenue?.[0] 
                            ? `<span class="font-bold text-white">${team.rankings.revenue[0].name}</span> leads in revenue with $${team.rankings.revenue[0].revenue}.`
                            : ''
                        }
                        ${team.averages?.unlockRate > 0 
                            ? ` Team average unlock rate is <span class="font-bold text-white">${team.averages.unlockRate}%</span>.`
                            : ''
                        }
                        ${team.correlations?.qualityUnlockRate?.isSignificant
                            ? ` Strong ${team.correlations.qualityUnlockRate.strength.toFixed(0)}% correlation detected between quality scores and unlock rates.`
                            : team.count >= 3 ? ` Upload message analyses for all chatters to detect quality correlations.` : ''
                        }
                    </p>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    ${team.rankings?.revenue?.slice(0, 3).map((chatter, idx) => `
                        <div class="bg-gradient-to-br ${idx === 0 ? 'from-yellow-900/30 to-amber-900/30 border-yellow-500/40' : 'from-gray-800/30 to-gray-900/30 border-gray-600/30'} rounded-xl p-6 border-2">
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex items-center">
                                    ${idx === 0 ? '<i class="fas fa-crown text-yellow-400 text-2xl mr-3"></i>' : `<div class="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center font-bold mr-3">${idx + 1}</div>`}
                                    <div>
                                        <div class="text-white font-bold text-lg">${chatter.name}</div>
                                        <div class="text-xs text-gray-400">Revenue Leader</div>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-2xl font-bold text-white">$${chatter.revenue}</div>
                                    <div class="text-xs text-gray-400">${chatter.unlockRate}% unlock</div>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div class="bg-black/30 rounded p-2">
                                    <div class="text-gray-400">Per Fan</div>
                                    <div class="text-white font-bold">$${chatter.revenuePerFan}</div>
                                </div>
                                <div class="bg-black/30 rounded p-2">
                                    <div class="text-gray-400">Quality</div>
                                    <div class="text-white font-bold">${chatter.analysis?.overallScore || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Quality Correlation -->
                ${team.correlations?.qualityUnlockRate?.isSignificant ? `
                    <div class="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-2 border-green-500/40 rounded-xl p-6">
                        <div class="flex items-center mb-4">
                            <i class="fas fa-link text-green-400 text-2xl mr-3"></i>
                            <div>
                                <div class="text-lg font-bold text-white">Strong Correlation Detected</div>
                                <div class="text-sm text-green-300">Guidelines Score ↔ Unlock Rate</div>
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-4 mb-4">
                            ${team.correlations.qualityUnlockRate.high.count > 0 ? `
                                <div class="text-center">
                                    <div class="text-xs text-gray-400 mb-1">High Quality (90-100)</div>
                                    <div class="text-2xl font-bold text-green-400">${team.correlations.qualityUnlockRate.high.avgUnlockRate}%</div>
                                    <div class="text-xs text-gray-500">${team.correlations.qualityUnlockRate.high.count} chatters</div>
                                </div>
                            ` : ''}
                            ${team.correlations.qualityUnlockRate.mid.count > 0 ? `
                                <div class="text-center">
                                    <div class="text-xs text-gray-400 mb-1">Mid Quality (70-89)</div>
                                    <div class="text-2xl font-bold text-yellow-400">${team.correlations.qualityUnlockRate.mid.avgUnlockRate}%</div>
                                    <div class="text-xs text-gray-500">${team.correlations.qualityUnlockRate.mid.count} chatters</div>
                                </div>
                            ` : ''}
                            ${team.correlations.qualityUnlockRate.low.count > 0 ? `
                                <div class="text-center">
                                    <div class="text-xs text-gray-400 mb-1">Low Quality (<70)</div>
                                    <div class="text-2xl font-bold text-red-400">${team.correlations.qualityUnlockRate.low.avgUnlockRate}%</div>
                                    <div class="text-xs text-gray-500">${team.correlations.qualityUnlockRate.low.count} chatters</div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="text-white text-sm">
                            <i class="fas fa-lightbulb text-yellow-400 mr-2"></i>
                            <strong>Insight:</strong> ${team.correlations.qualityUnlockRate.strength.toFixed(1)}% unlock rate difference between quality tiers. Improving message quality directly boosts conversions.
                        </div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        
        <!-- Pattern Detection -->
        ${patterns.length > 0 ? `
            <div class="glass-card rounded-2xl p-8 mb-8">
                <h3 class="text-2xl font-bold text-white mb-6">
                    <i class="fas fa-brain text-pink-400 mr-3"></i>
                    Pattern Detection & Insights
                </h3>
                <div class="space-y-4">
                    ${patterns.map(pattern => `
                        <div class="bg-gradient-to-r from-pink-900/30 to-purple-900/30 rounded-xl p-6 border border-pink-500/30">
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex items-center">
                                    <div class="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center mr-4">
                                        <i class="fas ${pattern.type === 'saturation' ? 'fa-exclamation-triangle' : 'fa-chart-line'} text-pink-400 text-xl"></i>
                                    </div>
                                    <div>
                                        <div class="text-lg font-bold text-white">${pattern.title}</div>
                                        <div class="text-xs text-pink-300 uppercase font-bold">${pattern.type.replace('_', ' ')}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="text-gray-300 mb-4">${pattern.insight}</div>
                            <div class="bg-black/30 rounded-lg p-4 border border-pink-500/20">
                                <div class="text-sm text-pink-300 font-bold mb-2">
                                    <i class="fas fa-bullseye mr-2"></i>RECOMMENDED ACTION:
                                </div>
                                <div class="text-white">${pattern.action}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${team.count === 0 && traffic.sortedSources.length === 0 && retention.overall === null ? `
            <div class="glass-card rounded-2xl p-12 text-center border-2 border-yellow-500/40">
                <i class="fas fa-database text-yellow-400 text-5xl mb-6"></i>
                <h3 class="text-2xl font-bold text-white mb-4">Insufficient Data for Intelligence Analysis</h3>
                <p class="text-gray-300 mb-6 max-w-2xl mx-auto">
                    To generate comprehensive agency intelligence with traffic source analysis, retention metrics, 
                    team correlations, and strategic recommendations, please upload:
                </p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                    <div class="bg-gray-700/30 rounded-xl p-4">
                        <i class="fas fa-users text-cyan-400 text-2xl mb-2"></i>
                        <div class="text-white font-bold">2+ Chatters</div>
                        <div class="text-xs text-gray-400">For team correlations</div>
                    </div>
                    <div class="bg-gray-700/30 rounded-xl p-4">
                        <i class="fas fa-calendar text-purple-400 text-2xl mb-2"></i>
                        <div class="text-white font-bold">2+ Periods</div>
                        <div class="text-xs text-gray-400">For trend analysis</div>
                    </div>
                    <div class="bg-gray-700/30 rounded-xl p-4">
                        <i class="fas fa-route text-blue-400 text-2xl mb-2"></i>
                        <div class="text-white font-bold">Traffic Sources</div>
                        <div class="text-xs text-gray-400">For source analysis</div>
                    </div>
                </div>
            </div>
        ` : ''}
    `;
}

// Enhanced Agency Analysis - NEW VERSION
async function runAgencyAnalysis() {
    const resultsContainer = document.getElementById('agencyAnalysisResults');
    if (!resultsContainer) {
        console.error('❌ agencyAnalysisResults container not found');
        return;
    }
    
    console.log('🔍 Running agency analysis...');
    
    // Show loading state with beautiful animation
    resultsContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20">
            <div class="relative w-32 h-32 mb-8">
                <div class="absolute inset-0 rounded-full border-4 border-purple-500/20"></div>
                <div class="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin"></div>
                <div class="absolute inset-4 rounded-full border-4 border-transparent border-t-pink-500 animate-spin" style="animation-duration: 1.5s;"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                    <i class="fas fa-brain text-3xl text-purple-400"></i>
                </div>
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">Deep Analysis in Progress</h3>
            <p class="text-gray-400">Processing metrics, identifying patterns, calculating opportunities...</p>
        </div>
    `;
    
    try {
        // Calculate date range based on current AI interval
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentAIInterval === 'custom' && aiAnalysisCustomDates) {
            startDate = new Date(aiAnalysisCustomDates.start);
            endDate = new Date(aiAnalysisCustomDates.end);
        } else if (currentAIInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
        } else if (currentAIInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        } else if (currentAIInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        
        console.log('🔍 Agency Analysis date range:', formatDate(startDate), 'to', formatDate(endDate));
        
        // Get dashboard data for analysis
        const url = `/api/analytics/dashboard?filterType=custom&customStart=${formatDate(startDate)}&customEnd=${formatDate(endDate)}&_t=${Date.now()}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Cache-Control': 'no-cache'
            }
        });

        console.log('AI analysis response status:', response.status);
        
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        // Call the NEW intelligence endpoint
        const intelligenceUrl = `/api/analytics/agency-intelligence?filterType=custom&customStart=${formatDate(startDate)}&customEnd=${formatDate(endDate)}&_t=${Date.now()}`;
        
        const intelligenceResponse = await fetch(intelligenceUrl, {
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!intelligenceResponse.ok) {
            throw new Error('Failed to fetch intelligence data');
        }
        
        const intelligence = await intelligenceResponse.json();
        console.log('🧠 Agency Intelligence:', intelligence);
        
        // Render comprehensive intelligence dashboard
        resultsContainer.innerHTML = renderAgencyIntelligence(intelligence);
        
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
    console.log('🔍 runChatterAnalysis called!');
    console.log('📊 Current AI Interval:', currentAIInterval);
    console.log('📊 Custom Dates:', aiAnalysisCustomDates);
    
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

        // Calculate date range based on current AI interval
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentAIInterval === 'custom' && aiAnalysisCustomDates) {
            startDate = new Date(aiAnalysisCustomDates.start);
            endDate = new Date(aiAnalysisCustomDates.end);
            console.log('🗓️ Using CUSTOM dates:', aiAnalysisCustomDates);
        } else if (currentAIInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
            console.log('🗓️ Using 24h interval');
        } else if (currentAIInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
            console.log('🗓️ Using 7d interval');
        } else if (currentAIInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
            console.log('🗓️ Using 30d interval');
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
            console.log('🗓️ Using DEFAULT 7d interval');
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        
        // Prepare request body for AI analysis
        const requestBody = {
            analysisType: 'individual',
            interval: currentAIInterval || '7d',
            chatterId: select.value,
            startDate: formatDate(startDate),
            endDate: formatDate(endDate)
        };
        
        console.log('✅ AI Analysis using interval:', currentAIInterval);
        console.log('📅 Chatter Analysis Date Range:', formatDate(startDate), 'to', formatDate(endDate));
        
        // OLD CODE - Remove this
        if (false && currentFilterType === 'month' && currentMonthFilter) {
            requestBody.startDate = currentMonthFilter.firstDay;
            requestBody.endDate = currentMonthFilter.lastDay;
            console.log('✅ AI Analysis using MONTH filter:', currentMonthFilter);
        } else if (currentAIAnalysisInterval === 'custom' && window.customDateRange) {
            requestBody.startDate = window.customDateRange.start;
            requestBody.endDate = window.customDateRange.end;
        } else {
            requestBody.interval = currentAIAnalysisInterval || '7d';
            console.log('⚠️ AI Analysis using interval fallback:', requestBody.interval);
        }

        console.log('Sending enhanced chatter analysis request');
        
        // Get chatter name from select
        const chatterName = select.options[select.selectedIndex].text;
        
        // Build query params using the date range we calculated above
        let params = new URLSearchParams();
        params.append('filterType', 'custom');
        params.append('customStart', formatDate(startDate));
        params.append('customEnd', formatDate(endDate));
        
        console.log('🔍 AI Analysis API call:', {
            chatterName,
            filterType: 'custom',
            start: formatDate(startDate),
            end: formatDate(endDate)
        });
        
        // First, get the MessageAnalysis ID for this chatter
        const messagesListResponse = await fetch(`/api/message-analysis/${encodeURIComponent(chatterName)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!messagesListResponse.ok) {
            throw new Error('No messages found for this chatter. Upload messages first in Data Management.');
        }
        
        const messagesList = await messagesListResponse.json();
        if (!messagesList || messagesList.length === 0) {
            throw new Error('No messages found for this chatter. Upload messages first in Data Management.');
        }
        
        console.log(`🔍 Found ${messagesList.length} message analysis records for ${chatterName}`);
        
        // Filter records that fall within the date range and haven't been analyzed
        const recordsInRange = messagesList.filter(ma => {
            const maStart = new Date(ma.weekStartDate);
            const maEnd = new Date(ma.weekEndDate);
            return maStart <= endDate && maEnd >= startDate;
        });
        
        const unanalyzedRecords = recordsInRange.filter(ma => ma.overallScore == null);
        console.log(`📊 Records in date range: ${recordsInRange.length}, Unanalyzed: ${unanalyzedRecords.length}`);
        
        // Analyze all unanalyzed records
        if (unanalyzedRecords.length > 0) {
            console.log(`🔄 Analyzing ${unanalyzedRecords.length} unanalyzed records...`);
            for (const record of unanalyzedRecords) {
                console.log(`  - Analyzing ${record.weekStartDate}: ${record.totalMessages} messages`);
                await fetch(`/api/messages/reanalyze/${record._id}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        startDate: formatDate(new Date(record.weekStartDate)),
                        endDate: formatDate(new Date(record.weekEndDate))
                    })
                });
            }
            console.log(`✅ All ${unanalyzedRecords.length} records analyzed!`);
        } else {
            console.log('✅ All records already analyzed!');
        }
        
        // Just trigger one analysis to get the response (the backend will average all analyzed records)
        const latestMessage = recordsInRange[0] || messagesList[0];
        const reanalyzeResponse = await fetch(`/api/messages/reanalyze/${latestMessage._id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                startDate: formatDate(startDate),
                endDate: formatDate(endDate)
            })
        });
        
        if (!reanalyzeResponse.ok) {
            const errorText = await reanalyzeResponse.text();
            console.error('❌ Re-analyze failed:', reanalyzeResponse.status, errorText);
            throw new Error(`Failed to run analysis: ${reanalyzeResponse.status}`);
        }
        
        const reanalyzeData = await reanalyzeResponse.json();
        console.log('✅ Analysis triggered successfully:', reanalyzeData);
        console.log('   Grammar Score:', reanalyzeData.analysis?.grammarScore);
        console.log('   Guidelines Score:', reanalyzeData.analysis?.guidelinesScore);
        console.log('   Overall Score:', reanalyzeData.analysis?.overallScore);
        console.log('   Messages Analyzed:', reanalyzeData.analysis?.messagesAnalyzed);
        
        // Now fetch the updated analysis
        const response = await fetch(`/api/analytics/chatter-deep-analysis/${encodeURIComponent(chatterName)}?${params}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('Enhanced chatter analysis response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Failed to get enhanced analysis: ${response.status}`);
        }

        const analysisData = await response.json();
        console.log('✅ Enhanced chatter analysis data received');
        console.log('   Overall Score:', analysisData.overallScore);
        console.log('   Grammar Score:', analysisData.grammarScore);
        console.log('   Guidelines Score:', analysisData.guidelinesScore);
        console.log('   Analysis Summary:', analysisData.analysisSummary);
        console.log('   Deep Insights:', analysisData.deepInsights?.length || 0);
        console.log('   Total Messages (from backend):', analysisData.totalMessages);
        
        // Note: Backend now correctly sums totalMessages from all analyzed days, so don't override it!
        
        // Render analysis even if scores are null - the render function will handle it
        renderNewChatterAnalysis(analysisData);
        
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
                growthTrend: data.newSubs > 0 ? 'Growth detected' : 'No growth data',
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
    const efficiency = Math.floor(Math.random() * 30) + 70; // 70-100
    
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
            'Strong weekend performance above average',
            'Effective upselling techniques'
        ],
        weaknesses: [
            'Response time during peak hours needs improvement',
            'Could increase PPV frequency',
            'Opportunity to improve closing techniques',
            'Grammar and spelling consistency'
        ],
        benchmarking: {
            vsTopPerformer: efficiency > 85 ? 'Matching top tier' : 'Below top performer',
            vsTeamAverage: efficiency > 76 ? 'Above average' : 'Below average',
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

// Render Chatter Analysis Results (ENHANCED with new sections)
// Helper function to format dates
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
}

// MILLION DOLLAR AI ANALYSIS UI - Dense, Beautiful, Insightful
function renderNewChatterAnalysis(data) {
    const container = document.getElementById('chatterAnalysisResults');
    if (!container) return;
    
    console.log('🎨 Rendering million dollar UI with data:', data);
    console.log('🔍 Grammar breakdown:', data.grammarBreakdown);
    console.log('🔍 Guidelines breakdown:', data.guidelinesBreakdown);
    console.log('🔍 Insights:', data.insights);
    console.log('🔍 WeakPoints:', data.weakPoints);
    console.log('🔍 Opportunities:', data.opportunities);
    console.log('🔍 ROI:', data.roiCalculations);
    console.log('🔍 Recommendations:', data.recommendations);
    
    // Check if we have analysis data
    if (!data || data.overallScore === null || data.overallScore === undefined) {
        container.innerHTML = `
            <div class="p-8 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border border-gray-700 text-center">
                <i class="fas fa-chart-line text-gray-500 text-4xl mb-3"></i>
                <h4 class="text-lg font-bold text-gray-300 mb-2">No Analysis Available</h4>
                <p class="text-sm text-gray-400">Upload messages and click "Run Analysis"</p>
            </div>
        `;
        return;
    }
    
    // Build CSV export URL with current filter parameters
    // Use currentAIInterval to determine filter type
    const currentFilterType = (typeof currentAIInterval !== 'undefined' && currentAIInterval) ? currentAIInterval : 'custom';
    const customStart = data.weekStartDate ? new Date(data.weekStartDate).toISOString().split('T')[0] : '';
    const customEnd = data.weekEndDate ? new Date(data.weekEndDate).toISOString().split('T')[0] : '';
    
    // Date display
    const dateRange = data.weekStartDate && data.weekEndDate 
        ? `${formatDateShort(data.weekStartDate)} - ${formatDateShort(data.weekEndDate)}`
        : (data.interval ? `Last ${data.interval}` : 'Period');
    
    // Get chatter name for CSV export
    const chatterName = data.chatterName || document.getElementById('chatterAnalysisSelect')?.value || '';
    
    // Parse grammar breakdown for counts
    const spellingCount = data.grammarBreakdown?.spellingErrors?.match(/Found (\d+)/)?.[1] || '0';
    const grammarCount = data.grammarBreakdown?.grammarIssues?.match(/Found (\d+)/)?.[1] || '0';
    const punctuationCount = data.grammarBreakdown?.punctuationProblems?.match(/Found (\d+)/)?.[1] || '0';
    
    // Calculate percentages
    const totalMessages = data.totalMessages || data.messagesSent || data.grammarBreakdown?.totalMessages || 0;
    const spellingPct = ((parseInt(spellingCount) / totalMessages) * 100).toFixed(1);
    const grammarPct = ((parseInt(grammarCount) / totalMessages) * 100).toFixed(1);
    const punctuationPct = ((parseInt(punctuationCount) / totalMessages) * 100).toFixed(1);
    
    // Parse guidelines by category (pass totalMessages for accurate percentages)
    const guidelinesByCategory = parseGuidelinesByCategory(data.guidelinesBreakdown, totalMessages);
    
    // Get previous period data for comparisons
    const prev = data.previousPeriodData || {};
    console.log('🔍 RAW PREV DATA:', JSON.stringify(prev, null, 2));
    
    // Helper function to calculate % change
    const calcChange = (current, previous) => {
        if (!previous || previous === 0 || previous === null) return null;
        const change = ((current - previous) / previous * 100).toFixed(1);
        return change > 0 ? `+${change}%` : `${change}%`;
    };
    
    const getChangeClass = (current, previous) => {
        if (!previous || previous === 0 || previous === null) return '';
        const change = ((current - previous) / previous * 100);
        return change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-gray-400';
    };
    
    // Calculate changes for all metrics
    const grammarScoreChange = calcChange(data.grammarScore || 0, prev.grammarScore || 0);
    const grammarScoreChangeClass = getChangeClass(data.grammarScore || 0, prev.grammarScore || 0);
    const spellingChange = calcChange(parseInt(spellingCount), prev.spellingErrors || 0);
    const grammarChange = calcChange(parseInt(grammarCount), prev.grammarIssues || 0);
    const punctuationChange = calcChange(parseInt(punctuationCount), prev.punctuationCount || 0);
    
    const guidelinesScoreChange = calcChange(data.guidelinesScore || 0, prev.guidelinesScore || 0);
    const guidelinesScoreChangeClass = getChangeClass(data.guidelinesScore || 0, prev.guidelinesScore || 0);
    
    const revenue = data.revenue || 0;
    const revenueChange = calcChange(revenue, prev.revenue || 0);
    const unlockRate = data.ppvsSent > 0 ? ((data.ppvsUnlocked / data.ppvsSent) * 100) : 0;
    const prevUnlockRate = prev.unlockRate !== undefined && prev.unlockRate !== null ? parseFloat(prev.unlockRate) : null;
    // Show unlock rate change as percentage points to match narrative
    const unlockRatePointChange = (prevUnlockRate !== null) ? (unlockRate - prevUnlockRate) : null;
    const revenuePerMessage = data.messagesSent > 0 ? (revenue / data.messagesSent) : 0;
    const prevRevenuePerMessage = prev.messagesSent > 0 ? ((prev.revenue || 0) / prev.messagesSent) : 0;
    const revenuePerMessageChange = calcChange(revenuePerMessage, prevRevenuePerMessage);
    const revenuePerFan = data.fansChatted > 0 ? (revenue / data.fansChatted) : 0;
    const prevRevenuePerFan = prev.fansChatted > 0 ? ((prev.revenue || 0) / prev.fansChatted) : 0;
    const revenuePerFanChange = calcChange(revenuePerFan, prevRevenuePerFan);
    
    // Get deep insights
    const deepInsights = data.deepInsights || [];
    const improvements = data.improvements || [];
    const strengths = data.strengths || [];
    const analysisSummary = data.analysisSummary || '';
    
    // DEBUG: Log what we're receiving
    console.log('🔍 Deep Insights:', deepInsights);
    console.log('🔍 Improvements:', improvements);
    console.log('🔍 Strengths:', strengths);
    console.log('🔍 Analysis Summary:', analysisSummary);
    console.log('🔍 Previous Period Data:', prev);
    console.log('🔍 Grammar Score Change:', grammarScoreChange);
    console.log('🔍 Spelling Change:', spellingChange);
    console.log('🔍 Guidelines Score Change:', guidelinesScoreChange);
    console.log('🔍 Revenue Change:', revenueChange);
    
    container.innerHTML = `
        <div class="space-y-4">
            
            <!-- Header with Overall Score -->
            <div class="bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-pink-600/20 rounded-lg p-6 border border-indigo-500/30">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="flex items-center justify-between mb-2">
                            <h3 class="text-2xl font-bold text-white">Individual Analysis</h3>
                            ${chatterName ? `
                            <button onclick="downloadViolationsCSV('${chatterName}', '${customStart}', '${customEnd}', '${currentFilterType}')" 
                                    class="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-all shadow-lg hover:shadow-cyan-500/50 text-sm font-medium">
                                <i class="fas fa-download"></i>
                                <span>Download Violations CSV</span>
                            </button>
                            ` : ''}
                        </div>
                        <p class="text-sm text-gray-400">📅 ${dateRange} · ${totalMessages.toLocaleString()} messages analyzed</p>
                    </div>
                    <div class="text-center ml-4">
                        <div class="text-5xl font-black ${data.overallScore >= 80 ? 'text-green-400' : data.overallScore >= 60 ? 'text-yellow-400' : 'text-red-400'} mb-1">
                            ${data.overallScore}
                        </div>
                        <div class="text-xs text-gray-400">Overall Score</div>
                    </div>
                </div>
            </div>
            
            <!-- Analysis Summary -->
            ${analysisSummary ? `
            <div class="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-lg p-6 border border-purple-500/30">
                <h4 class="text-lg font-bold text-purple-300 mb-3 flex items-center">
                    <i class="fas fa-chart-line mr-2"></i>Analysis Summary
                </h4>
                <p class="text-gray-300 leading-relaxed">${analysisSummary}</p>
            </div>
            ` : ''}
            
            <!-- AI Quality Scores - Premium Design -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <!-- Grammar Score - Detailed -->
                <div class="bg-gradient-to-br from-blue-600/10 via-cyan-600/10 to-blue-800/10 rounded-xl p-6 border ${data.grammarScore >= 80 ? 'border-green-500/40' : data.grammarScore >= 60 ? 'border-yellow-500/40' : 'border-red-500/40'} relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16"></div>
                    <div class="relative">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h4 class="text-xl font-bold text-white mb-1">Grammar Quality</h4>
                                <p class="text-xs text-gray-400">Message professionalism</p>
                            </div>
                            <div class="text-right">
                                <div class="text-5xl font-black ${data.grammarScore >= 80 ? 'text-green-400' : data.grammarScore >= 60 ? 'text-yellow-400' : 'text-red-400'}">
                                    ${data.grammarScore}
                                </div>
                                ${grammarScoreChange ? `<div class="text-xs font-bold ${grammarScoreChangeClass}">${grammarScoreChange}</div>` : ''}
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-gray-300">Spelling Errors</span>
                                    <div class="flex items-center gap-2">
                                        <span class="${parseInt(spellingCount) === 0 ? 'text-green-400' : 'text-red-400'} font-bold text-sm">${spellingCount}</span>
                                        ${spellingChange ? `<span class="text-xs font-bold ${getChangeClass(parseInt(spellingCount), prev.spellingErrors || 0)}">${spellingChange}</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-xs text-gray-500">${spellingCount} typos out of ${totalMessages} messages (${spellingPct}% error rate)</div>
                            </div>
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-gray-300">Grammar Mistakes</span>
                                    <div class="flex items-center gap-2">
                                        <span class="${parseInt(grammarCount) === 0 ? 'text-green-400' : 'text-red-400'} font-bold text-sm">${grammarCount}</span>
                                        ${grammarChange ? `<span class="text-xs font-bold ${getChangeClass(parseInt(grammarCount), prev.grammarIssues || 0)}">${grammarChange}</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-xs text-gray-500">${grammarCount} grammar errors in ${totalMessages} messages (${grammarPct}% error rate)</div>
                            </div>
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-gray-300">Formal Punctuation</span>
                                    <div class="flex items-center gap-2">
                                        <span class="${parseInt(punctuationCount) === 0 ? 'text-green-400' : 'text-red-400'} font-bold text-sm">${punctuationCount}</span>
                                        ${punctuationChange ? `<span class="text-xs font-bold ${getChangeClass(parseInt(punctuationCount), prev.punctuationCount || 0)}">${punctuationChange}</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-xs text-gray-500">${punctuationCount} messages with periods/commas (${punctuationPct}% - should be casual)</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Guidelines Score - Detailed -->
                <div class="bg-gradient-to-br from-green-600/10 via-emerald-600/10 to-green-800/10 rounded-xl p-6 border ${data.guidelinesScore >= 80 ? 'border-green-500/40' : data.guidelinesScore >= 60 ? 'border-yellow-500/40' : 'border-red-500/40'} relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -mr-16 -mt-16"></div>
                    <div class="relative">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h4 class="text-xl font-bold text-white mb-1">Guidelines</h4>
                                <p class="text-xs text-gray-400">Best practices compliance</p>
                            </div>
                            <div class="text-right">
                                <div class="text-5xl font-black ${data.guidelinesScore >= 80 ? 'text-green-400' : data.guidelinesScore >= 60 ? 'text-yellow-400' : 'text-red-400'}">
                                    ${data.guidelinesScore}
                                </div>
                                ${guidelinesScoreChange ? `<div class="text-xs font-bold ${guidelinesScoreChangeClass}">${guidelinesScoreChange}</div>` : ''}
                            </div>
                        </div>
                        <div class="space-y-3">
                            ${guidelinesByCategory.slice(0, 3).map(cat => {
                                // Find matching category in previous period
                                const prevCat = prev.guidelinesBreakdown?.find(pc => pc.name === cat.name);
                                const catChange = calcChange(cat.violations, prevCat?.violations || 0);
                                return `
                                <div class="bg-gray-800/50 rounded-lg p-3">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs font-bold text-gray-300">${cat.name}</span>
                                        <div class="flex items-center gap-2">
                                            <span class="${cat.violations === 0 ? 'text-green-400' : 'text-red-400'} font-bold text-sm">${cat.violations}</span>
                                            ${catChange ? `<span class="text-xs font-bold ${getChangeClass(cat.violations, prevCat?.violations || 0)}">${catChange}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="text-xs text-gray-500">${cat.violations} violations (${cat.pct}% of messages break this rule)</div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
                
                <!-- Overall Performance - New -->
                <div class="bg-gradient-to-br from-purple-600/10 via-pink-600/10 to-purple-800/10 rounded-xl p-6 border border-purple-500/40 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16"></div>
                    <div class="relative">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h4 class="text-xl font-bold text-white mb-1">Performance</h4>
                                <p class="text-xs text-gray-400">Revenue & conversion</p>
                            </div>
                            <div class="text-right">
                                <div class="text-5xl font-black text-purple-400">
                                    ${data.revenue ? '$' + data.revenue : '—'}
                                </div>
                                ${revenueChange ? `<div class="text-xs font-bold ${getChangeClass(revenue, prev.revenue || 0)}">${revenueChange}</div>` : ''}
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-gray-300">Unlock Rate</span>
                                    <div class="flex items-center gap-2">
                                        <span class="text-cyan-400 font-bold text-sm">${unlockRate.toFixed(1)}%</span>
                                        ${unlockRatePointChange !== null ? `<span class="text-xs font-bold ${(unlockRatePointChange > 0 ? 'text-green-400' : (unlockRatePointChange < 0 ? 'text-red-400' : 'text-gray-400'))}">${unlockRatePointChange > 0 ? '+' : ''}${unlockRatePointChange.toFixed(1)} pp</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-xs text-gray-500">${data.ppvsUnlocked || 0} of ${data.ppvsSent || 0} PPVs unlocked by fans</div>
                            </div>
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-gray-300">Revenue/Message</span>
                                    <div class="flex items-center gap-2">
                                        <span class="text-green-400 font-bold text-sm">$${revenuePerMessage.toFixed(2)}</span>
                                        ${revenuePerMessageChange ? `<span class="text-xs font-bold ${getChangeClass(revenuePerMessage, prevRevenuePerMessage)}">${revenuePerMessageChange}</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-xs text-gray-500">Earning $${revenuePerMessage.toFixed(2)} per message sent</div>
                            </div>
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-gray-300">Revenue/Fan</span>
                                    <div class="flex items-center gap-2">
                                        <span class="text-yellow-400 font-bold text-sm">$${revenuePerFan.toFixed(2)}</span>
                                        ${revenuePerFanChange ? `<span class="text-xs font-bold ${getChangeClass(revenuePerFan, prevRevenuePerFan)}">${revenuePerFanChange}</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-xs text-gray-500">Average $${revenuePerFan.toFixed(2)} per fan chatted</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 🧠 DEEP CONNECTED INSIGHTS (THE FLAGSHIP SECTION) -->
            ${deepInsights && deepInsights.length > 0 ? `
            <div class="bg-gradient-to-br from-indigo-900/30 via-purple-900/20 to-pink-900/20 rounded-xl p-6 border border-indigo-500/40">
                <div class="flex items-center mb-5">
                    <div class="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center mr-4">
                        <i class="fas fa-brain text-indigo-400 text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white">🧠 Deep Performance Analysis</h4>
                        <p class="text-xs text-gray-400">Connecting messages, quality, and revenue</p>
                    </div>
                </div>
                <div class="space-y-4">
                    ${deepInsights.map((item, idx) => `
                        <div class="bg-gradient-to-r ${
                            item.type === 'positive' ? 'from-green-900/40 to-emerald-900/20 border-green-500/40' :
                            item.type === 'warning' ? 'from-red-900/40 to-orange-900/20 border-orange-500/40' :
                            item.type === 'opportunity' ? 'from-yellow-900/40 to-amber-900/20 border-yellow-500/40' :
                            'from-blue-900/40 to-cyan-900/20 border-cyan-500/40'
                        } rounded-xl p-5 border hover:scale-[1.01] transition-all">
                            <div class="flex items-start">
                                <div class="w-12 h-12 ${
                                    item.type === 'positive' ? 'bg-green-500/20' :
                                    item.type === 'warning' ? 'bg-orange-500/20' :
                                    item.type === 'opportunity' ? 'bg-yellow-500/20' :
                                    'bg-cyan-500/20'
                                } rounded-lg flex items-center justify-center mr-4 shrink-0">
                                    <i class="fas ${item.icon} ${
                                        item.type === 'positive' ? 'text-green-400' :
                                        item.type === 'warning' ? 'text-orange-400' :
                                        item.type === 'opportunity' ? 'text-yellow-400' :
                                        'text-cyan-400'
                                    } text-xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h5 class="text-base font-bold ${
                                        item.type === 'positive' ? 'text-green-300' :
                                        item.type === 'warning' ? 'text-orange-300' :
                                        item.type === 'opportunity' ? 'text-yellow-300' :
                                        'text-cyan-300'
                                    } mb-2">${item.title}</h5>
                                    <p class="text-sm text-gray-200 mb-3 leading-relaxed">${item.insight}</p>
                                    <div class="bg-gray-900/50 rounded-lg p-3 mb-3">
                                        <div class="text-xs text-gray-400 mb-1">📊 Key Metrics:</div>
                                        <div class="text-xs font-mono text-cyan-300">${item.metrics}</div>
                                    </div>
                                    <div class="flex items-start p-3 bg-gray-900/50 rounded-lg border-l-2 ${
                                        item.type === 'positive' ? 'border-green-500' :
                                        item.type === 'warning' ? 'border-orange-500' :
                                        item.type === 'opportunity' ? 'border-yellow-500' :
                                        'border-cyan-500'
                                    }">
                                        <i class="fas fa-lightbulb text-cyan-400 mr-2 mt-0.5"></i>
                                        <div class="text-xs text-cyan-300 font-medium">${item.action}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- 🔥 IMPROVEMENT OPPORTUNITIES -->
            ${improvements && improvements.length > 0 ? `
            <div class="bg-gradient-to-br from-red-900/30 via-orange-900/20 to-yellow-900/20 rounded-xl p-6 border border-orange-500/40">
                <div class="flex items-center mb-5">
                    <div class="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center mr-4">
                        <i class="fas fa-wrench text-orange-400 text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white">🔥 Quick Wins</h4>
                        <p class="text-xs text-gray-400">Fix these specific issues now</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${improvements.map((item, idx) => `
                        <div class="bg-gray-800/40 rounded-lg p-4 border-l-4 border-orange-500 hover:bg-gray-800/60 transition-all">
                            <div class="flex items-start justify-between mb-2">
                                <div class="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 font-bold text-sm">${idx + 1}</div>
                                ${item.count > 0 ? `<div class="px-2 py-1 bg-red-500/20 rounded text-xs font-bold text-red-400">${item.count}</div>` : ''}
                            </div>
                            <h5 class="text-sm font-bold text-orange-300 mb-2">${item.issue}</h5>
                            <p class="text-xs text-gray-300 mb-2 leading-relaxed">${item.detail}</p>
                            <div class="flex items-start">
                                <i class="fas fa-lightbulb text-cyan-400 text-xs mr-2 mt-0.5"></i>
                                <p class="text-xs text-cyan-400 leading-relaxed">${item.action}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- ✅ WHAT'S WORKING WELL -->
            ${strengths && strengths.length > 0 ? `
            <div class="bg-gradient-to-br from-green-900/30 via-emerald-900/20 to-teal-900/20 rounded-xl p-6 border border-green-500/40">
                <div class="flex items-center mb-5">
                    <div class="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mr-4">
                        <i class="fas fa-star text-green-400 text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white">✅ Your Strengths</h4>
                        <p class="text-xs text-gray-400">What's driving your success</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${strengths.map((item, idx) => `
                        <div class="bg-gray-800/40 rounded-lg p-4 border-l-4 border-green-500 hover:bg-gray-800/60 transition-all">
                            <div class="flex items-center mb-3">
                                <div class="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center mr-3">
                                    <i class="fas fa-check text-green-400 text-sm"></i>
                                </div>
                                <h5 class="text-sm font-bold text-green-300">${item.strength}</h5>
                            </div>
                            <p class="text-xs text-gray-300 mb-2 leading-relaxed">${item.detail}</p>
                            <div class="flex items-start">
                                <i class="fas fa-arrow-right text-green-400 text-xs mr-2 mt-0.5"></i>
                                <p class="text-xs text-gray-400 italic leading-relaxed">${item.impact}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
        </div>
    `;
}

// Parse guidelines by category with counts
function parseGuidelinesByCategory(guidelinesBreakdown, totalMessages = 0) {
    if (!guidelinesBreakdown) return [];
    
    const categories = [
        { key: 'generalChatting', name: 'General' },
        { key: 'psychology', name: 'Psychology' },
        { key: 'captions', name: 'Captions' },
        { key: 'sales', name: 'Sales' }
    ];
    
    // Use provided totalMessages or fallback to guidelinesBreakdown.totalMessages
    const msgCount = totalMessages || guidelinesBreakdown.totalMessages || 544;
    
    return categories.map(cat => {
        const items = guidelinesBreakdown[cat.key]?.items || [];
        let violations = items.reduce((sum, item) => sum + (item.count || 0), 0);
        
        // Safety cap: violations can't exceed total messages
        if (msgCount > 0 && violations > msgCount) {
            violations = msgCount;
        }
        
        const pct = msgCount > 0 ? ((violations / msgCount) * 100).toFixed(1) : '0.0';
        
        // Get titles of violated guidelines (count > 0), deduplicate by normalized title
        // Backend now normalizes titles, but we dedupe here as a safety net
        const seenTitles = new Set();
        const violatedTitles = items
            .filter(item => item.count > 0)
            .map(item => {
                // Normalize title (match backend logic)
                let normalized = item.title.trim();
                normalized = normalized.replace(/^(general\s+chatting|general\s+-|general)\s*[:-\s]*/gi, '');
                normalized = normalized.replace(/^(psychology|psych)\s*[:-\s]*/gi, '');
                normalized = normalized.replace(/^(captions|caption)\s*[:-\s]*/gi, '');
                normalized = normalized.replace(/^(sales|sale)\s*[:-\s]*/gi, '');
                normalized = normalized.trim().toLowerCase();
                if (seenTitles.has(normalized)) return null;
                seenTitles.add(normalized);
                return item.title; // Backend already normalized, so this should be clean
            })
            .filter(Boolean)
            .join(', ');
        
        // Create display name with violated guideline titles
        const displayName = violatedTitles ? `${cat.name} - ${violatedTitles}` : cat.name;
        
        return { name: displayName, violations, pct };
    });
}

// Render detailed guidelines with individual items
function renderDetailedGuidelines(guidelinesBreakdown, totalMessages) {
    if (!guidelinesBreakdown) return '<div class="text-xs text-gray-400">No guidelines data</div>';
    
    const categories = [
        { key: 'generalChatting', name: 'General Chatting', color: 'blue' },
        { key: 'psychology', name: 'Psychology', color: 'purple' },
        { key: 'captions', name: 'Captions', color: 'pink' },
        { key: 'sales', name: 'Sales', color: 'green' }
    ];
    
    let html = '';
    
    categories.forEach(cat => {
        const items = guidelinesBreakdown[cat.key]?.items || [];
        const totalViolations = items.reduce((sum, item) => sum + (item.count || 0), 0);
        const pct = ((totalViolations / totalMessages) * 100).toFixed(1);
        
        if (items.length > 0) {
            html += `
                <div class="p-3 bg-${cat.color}-500/10 rounded border-l-2 border-${cat.color}-500">
                    <div class="font-bold text-${cat.color}-400 text-xs mb-2">${cat.name.toUpperCase()} (${totalViolations} violations, ${pct}%)</div>
                    <div class="space-y-1">
                        ${items.map(item => `
                            <div class="flex justify-between items-center text-xs">
                                <span class="text-gray-400">${item.title}</span>
                                <span class="${item.count === 0 ? 'text-green-400' : 'text-red-400'} font-bold">${item.count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    });
    
    return html || '<div class="text-xs text-gray-400">No violations</div>';
}

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
                            ${data.overallScore ? `
                                <div class="text-4xl font-bold text-green-400">${data.overallScore}</div>
                                <div class="text-sm text-gray-300 font-medium">Overall Score</div>
                                <div class="text-xs text-green-400 mt-1">Performance Rating</div>
                            ` : `
                                <div class="text-2xl font-bold text-yellow-400">
                                    <i class="fas fa-file-upload mb-2"></i>
                                </div>
                                <div class="text-sm text-gray-300 font-medium">No Message Analysis</div>
                                <div class="text-xs text-yellow-400 mt-1">Upload messages to see scores</div>
                            `}
                        </div>
                    </div>
                </div>
            </div>

            <!-- NEW: Team Comparison Rankings -->
            ${data.rankings ? `
            <div class="glass-card rounded-2xl p-6 border-2 border-cyan-500/40 bg-gradient-to-br from-cyan-900/20 to-blue-900/10 mb-8">
                <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                    <i class="fas fa-trophy text-cyan-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Your Team Rankings</span>
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="p-6 bg-gradient-to-br from-yellow-900/20 to-orange-900/10 rounded-xl border border-yellow-500/30">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-gray-300">Revenue Rank</span>
                            <div class="text-4xl font-black ${data.rankings.revenue === 1 ? 'text-yellow-400' : data.rankings.revenue === 2 ? 'text-gray-300' : data.rankings.revenue === 3 ? 'text-orange-400' : 'text-gray-500'}">
                                #${data.rankings.revenue || '-'}
                            </div>
                        </div>
                        <div class="text-sm text-gray-400">
                            You: $${(data.chatter?.revenue || 0).toFixed(0)} vs Team: $${(data.team?.avgRevenue || 0).toFixed(0)}
                        </div>
                    </div>
                    <div class="p-6 bg-gradient-to-br from-green-900/20 to-emerald-900/10 rounded-xl border border-green-500/30">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-gray-300">Unlock Rate Rank</span>
                            <div class="text-4xl font-black ${data.rankings.unlockRate === 1 ? 'text-yellow-400' : data.rankings.unlockRate === 2 ? 'text-gray-300' : data.rankings.unlockRate === 3 ? 'text-orange-400' : 'text-gray-500'}">
                                #${data.rankings.unlockRate || '-'}
                            </div>
                        </div>
                        <div class="text-sm text-gray-400">
                            You: ${(data.chatter?.unlockRate || 0).toFixed(1)}% vs Team: ${(data.team?.avgUnlockRate || 0).toFixed(1)}%
                        </div>
                    </div>
                    <div class="p-6 bg-gradient-to-br from-purple-900/20 to-pink-900/10 rounded-xl border border-purple-500/30">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-gray-300">Avg PPV Price</span>
                            <div class="text-2xl font-bold text-purple-400">
                                $${(data.chatter?.avgPPVPrice || 0).toFixed(0)}
                            </div>
                        </div>
                        <div class="text-sm text-gray-400">
                            Team avg: $${(data.team?.avgPPVPrice || 0).toFixed(0)}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Performance Breakdown -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Strengths -->
                ${data.strengths && data.strengths.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-lightbulb text-yellow-400 mr-4"></i>Key Insights
                    </h4>
                    <div class="space-y-4">
                        ${data.strengths.map(strength => `
                            <div class="flex items-start p-4 bg-green-900/10 rounded-lg border border-green-500/20">
                                <i class="fas fa-check-circle text-green-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${strength}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Areas for Improvement -->
                ${data.weaknesses && data.weaknesses.length > 0 ? `
                <div class="glass-card rounded-xl p-8">
                    <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                        <i class="fas fa-exclamation-triangle text-orange-400 mr-4"></i>Areas for Improvement
                    </h4>
                    <div class="space-y-4">
                        ${data.weaknesses.map(weakness => `
                            <div class="flex items-start p-4 bg-orange-900/10 rounded-lg border border-orange-500/20">
                                <i class="fas fa-arrow-up text-orange-400 mr-4 mt-1"></i>
                                <span class="text-gray-300 leading-relaxed">${weakness}</span>
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

            <!-- Grammar & Guidelines Scores -->
            ${(data.grammarScore !== null || data.guidelinesScore !== null) ? `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                ${data.grammarScore !== null ? `
                <div class="glass-card rounded-xl p-6 border-2 border-blue-500/40">
                    <h4 class="text-xl font-bold text-white mb-4 flex items-center">
                        <i class="fas fa-spell-check text-blue-400 mr-3"></i>Grammar Score
                    </h4>
                    <div class="text-5xl font-bold text-blue-400 mb-2">${data.grammarScore}/100</div>
                    ${data.grammarBreakdown ? `
                        <div class="mt-4 space-y-2 text-sm">
                            <div class="text-gray-300">${data.grammarBreakdown.spellingErrors || 'No spelling errors'}</div>
                            <div class="text-gray-300">${data.grammarBreakdown.grammarIssues || 'No grammar issues'}</div>
                            <div class="text-gray-300">${data.grammarBreakdown.punctuationProblems || 'No punctuation issues'}</div>
                        </div>
                    ` : ''}
                </div>
                ` : ''}
                
                ${data.guidelinesScore !== null ? `
                <div class="glass-card rounded-xl p-6 border-2 border-purple-500/40">
                    <h4 class="text-xl font-bold text-white mb-4 flex items-center">
                        <i class="fas fa-book text-purple-400 mr-3"></i>Guidelines Score
                    </h4>
                    <div class="text-5xl font-bold text-purple-400 mb-2">${data.guidelinesScore}/100</div>
                    <div class="text-sm text-gray-400 mt-2">Based on ${data.guidelinesBreakdown ? Object.values(data.guidelinesBreakdown).reduce((sum, cat) => sum + (cat.items?.length || 0), 0) : 0} guidelines</div>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <!-- Action Plan -->
            ${data.recommendations && data.recommendations.length > 0 ? `
            <div class="glass-card rounded-xl p-8 mb-8">
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

            <!-- NEW: Traffic Source Performance -->
            ${data.topSource ? `
            <div class="glass-card rounded-2xl p-6 border-2 border-purple-500/40 bg-gradient-to-br from-purple-900/20 to-pink-900/10 mb-8">
                <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                    <i class="fas fa-bullseye text-purple-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Your Traffic Source Performance</span>
                </h4>
                <div class="p-6 bg-gray-800/50 rounded-xl border border-purple-500/20">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <div class="text-sm text-gray-400 mb-1">Your Best Source</div>
                            <div class="text-2xl font-bold text-white">${data.topSource.name}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-400 mb-1">Revenue</div>
                            <div class="text-2xl font-bold text-green-400">$${data.topSource.revenue.toFixed(0)}</div>
                        </div>
                    </div>
                    <div class="text-base text-purple-300 leading-relaxed">
                        <i class="fas fa-lightbulb text-yellow-400 mr-2"></i>
                        When you talk to ${data.topSource.category} fans, they're ${(data.topSource.revenue / data.topSource.count).toFixed(0)}x more likely to spend
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- NEW: Pricing Intelligence -->
            ${data.pricing && (data.pricing.low.count > 0 || data.pricing.mid.count > 0 || data.pricing.high.count > 0) ? `
            <div class="glass-card rounded-2xl p-6 border-2 border-green-500/40 bg-gradient-to-br from-green-900/20 to-emerald-900/10 mb-8">
                <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                    <i class="fas fa-dollar-sign text-green-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Your Pricing Strategy</span>
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                        <div class="text-sm text-gray-400 mb-2">$0-15 PPVs</div>
                        <div class="text-2xl font-bold text-red-400">${data.pricing.low.unlockRate.toFixed(1)}%</div>
                        <div class="text-xs text-gray-500">${data.pricing.low.count} sent</div>
                    </div>
                    <div class="p-4 bg-gray-800/50 rounded-xl border border-yellow-500/30">
                        <div class="text-sm text-gray-400 mb-2">$15-25 PPVs</div>
                        <div class="text-2xl font-bold text-yellow-400">${data.pricing.mid.unlockRate.toFixed(1)}%</div>
                        <div class="text-xs text-gray-500">${data.pricing.mid.count} sent</div>
                    </div>
                    <div class="p-4 bg-gray-800/50 rounded-xl border border-green-500/30">
                        <div class="text-sm text-gray-400 mb-2">$25+ PPVs</div>
                        <div class="text-2xl font-bold text-green-400">${data.pricing.high.unlockRate.toFixed(1)}%</div>
                        <div class="text-xs text-gray-500">${data.pricing.high.count} sent</div>
                    </div>
                </div>
                <div class="p-4 bg-green-900/20 rounded-lg border border-green-500/20">
                    <p class="text-sm text-gray-300">
                        <i class="fas fa-chart-line text-green-400 mr-2"></i>
                        <strong>Insight:</strong> Your avg PPV price: $${(data.chatter?.avgPPVPrice || 0).toFixed(0)} vs Team: $${(data.team?.avgPPVPrice || 0).toFixed(0)}
                        ${data.chatter?.avgPPVPrice < data.team?.avgPPVPrice ? ' - Consider raising prices!' : ' - Great pricing!'}
                    </p>
                </div>
            </div>
            ` : ''}

            <!-- NEW: VIP Performance -->
            ${data.chatter?.vipCount > 0 ? `
            <div class="glass-card rounded-2xl p-6 border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-900/20 to-orange-900/10 mb-8">
                <h4 class="text-2xl font-bold text-white mb-6 flex items-center">
                    <i class="fas fa-crown text-yellow-400 mr-3"></i>
                    <span class="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">Your VIP Performance</span>
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="text-center p-6 bg-yellow-900/20 rounded-xl border border-yellow-500/30">
                        <div class="text-3xl font-bold text-yellow-400 mb-2">${data.chatter.vipCount}</div>
                        <div class="text-sm text-gray-400">VIPs Created</div>
                        <div class="text-xs text-yellow-400 mt-1">This period</div>
                    </div>
                    <div class="text-center p-6 bg-green-900/20 rounded-xl border border-green-500/30">
                        <div class="text-3xl font-bold text-green-400 mb-2">$${data.chatter.avgVIPSpend.toFixed(0)}</div>
                        <div class="text-sm text-gray-400">Avg VIP Spend</div>
                        <div class="text-xs text-green-400 mt-1">Per VIP fan</div>
                    </div>
                    <div class="text-center p-6 bg-purple-900/20 rounded-xl border border-purple-500/30">
                        <div class="text-3xl font-bold text-purple-400 mb-2">${((data.chatter.vipCount / (data.chatter.fansChatted || 1)) * 100).toFixed(1)}%</div>
                        <div class="text-sm text-gray-400">VIP Conversion</div>
                        <div class="text-xs text-purple-400 mt-1">Fans → VIPs</div>
                    </div>
                </div>
            </div>
            ` : ''}

        </div>
    `;
}

// Generate real data-driven insights based on actual performance data
async function generateRealDataInsights(analytics, intelligent) {
    try {
        // Only fetch AI recommendations for managers
        if (currentUser?.role !== 'manager') {
            console.log('Skipping AI recommendations - not a manager');
            return generateBasicInsights(analytics, intelligent);
        }
        
        // Fetch real AI recommendations from backend
        const response = await fetch(`/api/ai/recommendations?interval=${currentTimeInterval}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const recommendations = await response.json();
            return recommendations.map(rec => ({
                title: getTitleFromCategory(rec.category),
                icon: getIconFromCategory(rec.category),
                priority: rec.priority,
                content: rec.description,
                action: getActionFromCategory(rec.category),
                roi: rec.expectedImpact,
                data: rec.data || {}
            }));
        }
    } catch (error) {
        console.error('Error fetching real AI insights:', error);
    }

    // Fallback to basic insights if API fails
    return generateBasicInsights(analytics, intelligent);
}

// Convert category to display title
function getTitleFromCategory(category) {
    const titles = {
        'pricing_optimization': 'Revenue Optimization',
        'efficiency': 'Response Time Impact',
        'training': 'Team Performance Gap',
        'conversion_optimization': 'Conversion Enhancement',
        'scheduling': 'Scheduling Optimization',
        'maintenance': 'Performance Maintenance',
        'system': 'System Status'
    };
    return titles[category] || 'Performance Insight';
}

// Convert category to icon
function getIconFromCategory(category) {
    const icons = {
        'pricing_optimization': 'fas fa-chart-line text-green-400',
        'efficiency': 'fas fa-clock text-orange-400',
        'training': 'fas fa-users text-cyan-400',
        'conversion_optimization': 'fas fa-funnel-dollar text-yellow-400',
        'scheduling': 'fas fa-calendar text-purple-400',
        'maintenance': 'fas fa-check-circle text-green-400',
        'system': 'fas fa-exclamation-triangle text-red-400'
    };
    return icons[category] || 'fas fa-lightbulb text-blue-400';
}

// Convert category to action
function getActionFromCategory(category) {
    const actions = {
        'pricing_optimization': 'Optimize Pricing',
        'efficiency': 'Improve Response Time',
        'training': 'Implement Training',
        'conversion_optimization': 'Improve Conversions',
        'scheduling': 'Optimize Schedule',
        'maintenance': 'Maintain Performance',
        'system': 'Check System'
    };
    return actions[category] || 'Take Action';
}

// Generate basic insights as fallback
function generateBasicInsights(analytics, intelligent) {
    const insights = [];

    // Revenue Optimization - Basic analysis
    if (analytics.totalRevenue > 0) {
        const avgPPVPrice = analytics.ppvsSent > 0 ? analytics.totalRevenue / analytics.ppvsSent : 0;
        if (avgPPVPrice > 0 && avgPPVPrice < 30) {
            insights.push({
                title: 'Revenue Optimization',
                icon: 'fas fa-chart-line text-green-400',
                priority: 'high',
                content: `Average PPV price is $${avgPPVPrice.toFixed(2)}. Upload more data to get personalized pricing recommendations.`,
                action: 'Upload Data for Analysis',
                roi: 'Data Required'
            });
        }
    }

    // Response Time - Only show if we have meaningful data
    if (analytics.avgResponseTime > 0 && analytics.avgResponseTime < 10) { // Reasonable response time range
        insights.push({
            title: 'Response Time Impact',
            icon: 'fas fa-clock text-orange-400',
            priority: analytics.avgResponseTime > 5 ? 'high' : 'low', // Your threshold: 5 minutes
            content: `Current response time is ${analytics.avgResponseTime}min. Upload more data to compare with team performance.`,
            action: 'Upload Data for Analysis',
            roi: 'Data Required'
        });
    }

    // Team Performance - Basic analysis
    if (analytics.totalRevenue > 0) {
        insights.push({
            title: 'Team Performance Gap',
            icon: 'fas fa-users text-cyan-400',
            priority: 'medium',
            content: `Upload daily reports from multiple chatters to analyze performance gaps and identify improvement opportunities.`,
            action: 'Upload Team Data',
            roi: 'Data Required'
        });
    }

    // Conversion Enhancement - Basic analysis (chatter-specific metrics)
    if (analytics.ppvsSent > 0) {
        const unlockRate = analytics.ppvsUnlocked > 0 ? (analytics.ppvsUnlocked / analytics.ppvsSent * 100) : 0;
        insights.push({
            title: 'Conversion Enhancement',
            icon: 'fas fa-funnel-dollar text-yellow-400',
            priority: 'medium',
            content: `Current PPV unlock rate is ${unlockRate.toFixed(1)}%. Upload daily reports from multiple chatters to analyze conversion opportunities.`,
            action: 'Upload Chatter Data',
            roi: 'Data Required'
        });
    }

    return insights;
}

// Render insights to the container
function renderInsights(insights, container) {
    container.innerHTML = `
        <div class="mb-6">
            <h3 class="text-lg font-bold text-white mb-2 flex items-center">
                <i class="fas fa-lightbulb text-yellow-400 mr-3"></i>
                AI Recommendations & Potential Impact
            </h3>
            <p class="text-sm text-gray-400">These are data-driven improvements based on your actual performance patterns</p>
        </div>
        ${insights.map(insight => `
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
                ${insight.roi && insight.roi !== 'Data Required' && insight.roi !== 'Status Quo' && insight.roi !== 'Stable Growth' ? 
                    `<span class="text-green-400 text-sm font-bold">${insight.roi}</span>` : 
                    `<span class="text-gray-400 text-sm">Analysis Complete</span>`
                }
            </div>
        </div>
    `).join('')}
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
    
    // DEEP ANALYSIS - Find critical weaknesses and strengths
    const insights = [];
    
    // 1. PPV UNLOCK RATE ANALYSIS
    if (analytics.ppvsSent > 0) {
        const unlockRate = intelligent.ppvUnlockRate;
        if (unlockRate < 25) {
            const potentialRevenue = (analytics.ppvsSent * 0.35 - analytics.ppvsUnlocked) * (analytics.avgPPVPrice || 20);
            insights.push({
                type: 'critical',
                icon: 'fa-exclamation-triangle',
                title: 'Critical: Low PPV Unlock Rate',
                value: `${unlockRate.toFixed(1)}%`,
                message: `Only ${analytics.ppvsUnlocked} of ${analytics.ppvsSent} PPVs unlocked. Missing $${potentialRevenue.toFixed(0)}/period potential if rate improved to 35%.`,
                action: 'Review message quality and PPV pricing strategy'
            });
        } else if (unlockRate > 45) {
            insights.push({
                type: 'strength',
                icon: 'fa-trophy',
                title: 'Strength: Excellent PPV Performance',
                value: `${unlockRate.toFixed(1)}%`,
                message: `${analytics.ppvsUnlocked} of ${analytics.ppvsSent} PPVs unlocked - team is crushing it!`,
                action: 'Document what is working and scale this approach'
            });
        }
    }
    
    // 2. ANALYSIS SCORE TREND (scores are 0-100 scale)
    if (analytics.avgOverallScore != null || analytics.avgGrammarScore != null || analytics.avgGuidelinesScore != null) {
        const lowestScore = Math.min(
            analytics.avgOverallScore || 100,
            analytics.avgGrammarScore || 100,
            analytics.avgGuidelinesScore || 100
        );
        const lowestCategory = lowestScore === analytics.avgGrammarScore ? 'Grammar' :
                               lowestScore === analytics.avgGuidelinesScore ? 'Guidelines' : 'Overall';
        
        if (lowestScore < 60) { // Below 60/100
            insights.push({
                type: 'critical',
                icon: 'fa-exclamation-circle',
                title: `Critical: ${lowestCategory} Score Low`,
                value: `${lowestScore}/100`,
                message: `Team ${lowestCategory.toLowerCase()} score is below acceptable. This impacts fan experience and revenue.`,
                action: `Immediate training session on ${lowestCategory.toLowerCase()} improvement needed`
            });
        } else if (lowestScore >= 80) { // 80/100 or higher
            insights.push({
                type: 'strength',
                icon: 'fa-star',
                title: 'Strength: High Quality Messaging',
                value: `${Math.max(analytics.avgOverallScore || 0, analytics.avgGrammarScore || 0, analytics.avgGuidelinesScore || 0)}/100`,
                message: 'Team maintaining excellent messaging standards across all categories.',
                action: 'Keep current training and quality standards'
            });
        }
    }
    
    // 3. SPENDER CONVERSION ANALYSIS
    if (analytics.fansChatted > 0 && analytics.uniqueSpenders != null) {
        const convRate = analytics.spenderConversionRate;
        if (convRate < 5) {
            const targetSpenders = Math.ceil(analytics.fansChatted * 0.08);
            const missedRevenue = (targetSpenders - analytics.uniqueSpenders) * (analytics.avgPPVPrice || 20);
            insights.push({
                type: 'warning',
                icon: 'fa-user-slash',
                title: 'Warning: Low Spender Conversion',
                value: `${convRate.toFixed(1)}%`,
                message: `Only ${analytics.uniqueSpenders} of ${analytics.fansChatted} fans became buyers. Missing ~$${missedRevenue.toFixed(0)} if rate improved to 8%.`,
                action: 'Focus on identifying buying signals and targeted selling'
            });
        } else if (convRate > 10) {
            insights.push({
                type: 'strength',
                icon: 'fa-chart-line',
                title: 'Strength: High Conversion Efficiency',
                value: `${convRate.toFixed(1)}%`,
                message: `${analytics.uniqueSpenders} buyers from ${analytics.fansChatted} fans - excellent qualification!`,
                action: 'Scale this approach across all chatters'
            });
        }
    }
    
    // 4. RESPONSE TIME IMPACT
    if (analytics.avgResponseTime > 0) {
        if (analytics.avgResponseTime > 7) {
            const estimatedLoss = analytics.totalRevenue * 0.15; // 15% loss from slow responses
            insights.push({
                type: 'warning',
                icon: 'fa-clock',
                title: 'Warning: Slow Response Times',
                value: `${analytics.avgResponseTime}min`,
                message: `Avg response time above 7min can reduce conversions by ~15%. Potential loss: $${estimatedLoss.toFixed(0)}/period.`,
                action: 'Implement response time targets and monitoring'
            });
        } else if (analytics.avgResponseTime < 4) {
            insights.push({
                type: 'strength',
                icon: 'fa-bolt',
                title: 'Strength: Lightning Fast Responses',
                value: `${analytics.avgResponseTime}min`,
                message: 'Team responding quickly - this drives higher engagement and sales.',
                action: 'Maintain current response standards'
            });
        }
    }
    
    // 5. REVENUE PER SUB ANALYSIS
    if (analytics.totalSubs > 0) {
        const revPerSub = intelligent.revenuePerSub;
        if (revPerSub < 10) {
            const potentialRevenue = analytics.totalSubs * 15 - analytics.totalRevenue;
            insights.push({
                type: 'warning',
                icon: 'fa-dollar-sign',
                title: 'Warning: Low Revenue per Subscriber',
                value: `$${revPerSub.toFixed(2)}`,
                message: `Each subscriber generating only $${revPerSub.toFixed(2)}. Missing $${potentialRevenue.toFixed(0)} potential at $15/sub target.`,
                action: 'Increase PPV frequency and improve upselling techniques'
            });
        } else if (revPerSub > 20) {
            insights.push({
                type: 'strength',
                icon: 'fa-gem',
                title: 'Strength: High-Value Subscribers',
                value: `$${revPerSub.toFixed(2)}`,
                message: `Subscribers generating $${revPerSub.toFixed(2)} each - excellent monetization!`,
                action: 'Analyze and replicate what\'s working'
            });
        }
    }
    
    // 6. AVG PPV PRICE OPTIMIZATION
    if (analytics.avgPPVPrice > 0 && analytics.ppvsUnlocked > 10) {
        if (analytics.avgPPVPrice < 15) {
            const revenueIncrease = analytics.ppvsUnlocked * 5; // $5 increase per PPV
            insights.push({
                type: 'opportunity',
                icon: 'fa-arrow-up',
                title: 'Opportunity: Increase PPV Pricing',
                value: `$${analytics.avgPPVPrice}`,
                message: `Avg PPV at $${analytics.avgPPVPrice}. Raising to $${analytics.avgPPVPrice + 5} could add $${revenueIncrease.toFixed(0)}/period.`,
                action: 'Test higher PPV prices with high-engagement fans'
            });
        } else if (analytics.avgPPVPrice > 30) {
            insights.push({
                type: 'strength',
                icon: 'fa-fire',
                title: 'Strength: Premium PPV Pricing',
                value: `$${analytics.avgPPVPrice}`,
                message: 'Team successfully selling premium-priced content!',
                action: 'Continue premium positioning strategy'
            });
        }
    }
    
    // 7. MESSAGES PER PPV EFFICIENCY
    if (intelligent.messagesPerPPV > 0) {
        if (intelligent.messagesPerPPV > 150) {
            const timeWasted = (intelligent.messagesPerPPV - 100) * analytics.ppvsSent * 0.5; // minutes
            insights.push({
                type: 'warning',
                icon: 'fa-comments',
                title: 'Warning: High Message-to-Sale Ratio',
                value: `${intelligent.messagesPerPPV.toFixed(0)}`,
                message: `${intelligent.messagesPerPPV.toFixed(0)} messages per PPV sale. Team spending ~${timeWasted.toFixed(0)} extra minutes. Improve qualification.`,
                action: 'Train on buyer signal recognition and faster closing'
            });
        } else if (intelligent.messagesPerPPV < 80) {
            insights.push({
                type: 'strength',
                icon: 'fa-bullseye',
                title: 'Strength: Efficient Sales Process',
                value: `${intelligent.messagesPerPPV.toFixed(0)}`,
                message: 'Team closing sales quickly with minimal message waste!',
                action: 'Share best practices across team'
            });
        }
    }
    
    // 8. LINK CLICK TO SUBSCRIBER CONVERSION
    if (analytics.linkClicks > 0 && analytics.newSubs > 0) {
        const linkToSubRate = (analytics.newSubs / analytics.linkClicks) * 100;
        if (linkToSubRate < 3) {
            const potentialSubs = Math.ceil(analytics.linkClicks * 0.05 - analytics.newSubs);
            insights.push({
                type: 'warning',
                icon: 'fa-link',
                title: 'Warning: Poor Link-to-Sub Conversion',
                value: `${linkToSubRate.toFixed(1)}%`,
                message: `${analytics.newSubs} subs from ${analytics.linkClicks} clicks. Missing ${potentialSubs} potential subs at 5% conversion.`,
                action: 'Optimize landing page and OnlyFans profile appeal'
            });
        } else if (linkToSubRate > 5) {
            insights.push({
                type: 'strength',
                icon: 'fa-rocket',
                title: 'Strength: Excellent Traffic Quality',
                value: `${linkToSubRate.toFixed(1)}%`,
                message: `${analytics.newSubs} subs from ${analytics.linkClicks} clicks - traffic sources are high-quality!`,
                action: 'Scale winning traffic sources'
            });
        }
    }
    
    // Sort: Critical first, then warnings, then opportunities, then strengths
    const sortOrder = { critical: 0, warning: 1, opportunity: 2, strength: 3 };
    insights.sort((a, b) => sortOrder[a.type] - sortOrder[b.type]);
    
    // Render insights (max 8, only show if actionable)
    if (insights.length === 0) {
        container.innerHTML = `
            <div class="col-span-2 text-center py-8">
                <i class="fas fa-check-circle text-green-400 text-4xl mb-4"></i>
                <h4 class="text-xl font-semibold text-green-300 mb-2">All Systems Optimal</h4>
                <p class="text-gray-400">No critical issues detected. Team performing well!</p>
            </div>
        `;
    } else {
        container.innerHTML = insights.slice(0, 8).map(insight => {
            const colorClass = {
                critical: 'border-red-500/50 bg-red-900/10',
                warning: 'border-yellow-500/50 bg-yellow-900/10',
                opportunity: 'border-blue-500/50 bg-blue-900/10',
                strength: 'border-green-500/50 bg-green-900/10'
            }[insight.type];
            
            const iconColor = {
                critical: 'text-red-400',
                warning: 'text-yellow-400',
                opportunity: 'text-blue-400',
                strength: 'text-green-400'
            }[insight.type];
            
            return `
                <div class="glass-card rounded-lg p-5 border ${colorClass} hover:border-opacity-75 transition-all">
                    <div class="flex items-start space-x-4">
                        <div class="w-10 h-10 rounded-lg bg-gray-800/50 flex items-center justify-center flex-shrink-0">
                            <i class="fas ${insight.icon} ${iconColor} text-lg"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-white text-sm">${insight.title}</h4>
                                <span class="px-2 py-1 rounded-lg ${colorClass} text-xs font-bold">${insight.value}</span>
                            </div>
                            <p class="text-gray-300 text-xs mb-3 leading-relaxed">${insight.message}</p>
                            <div class="flex items-center pt-2 border-t border-gray-700/50">
                                <i class="fas fa-lightbulb text-purple-400 mr-2 text-xs"></i>
                                <span class="text-purple-300 text-xs font-medium">${insight.action}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Load action opportunities with REAL calculations and predictions
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
    
    // Generate REAL actionable opportunities with calculations
    const opportunities = [];
    const avgPrice = analytics.avgPPVPrice || 0;
    
    // 1. IMPROVE PPV UNLOCK RATE
    if (analytics.ppvsSent > 0 && intelligent.ppvUnlockRate < 40) {
        const currentUnlocked = analytics.ppvsUnlocked;
        const targetUnlocked = Math.ceil(analytics.ppvsSent * 0.40);
        const additionalUnlocks = targetUnlocked - currentUnlocked;
        const revenueGain = additionalUnlocks * avgPrice;
        
        if (revenueGain > 50) { // Only show if meaningful
            opportunities.push({
                title: 'Improve PPV Unlock Rate',
                urgency: 'high',
                impact: `+$${revenueGain.toFixed(0)}/week`,
                description: `Get ${additionalUnlocks} more fans to unlock PPVs (raise rate from ${intelligent.ppvUnlockRate.toFixed(1)}% to 40%)`,
                action: 'Train chatters on message quality and timing',
                calculation: `${additionalUnlocks} more unlocks × $${avgPrice.toFixed(0)} avg PPV`
            });
        }
    }
    
    // 2. IMPROVE BUYER CONVERSION
    if (analytics.fansChatted > 0 && analytics.uniqueSpenders != null) {
        const convRate = analytics.spenderConversionRate;
        if (convRate < 8) {
            const targetSpenders = Math.ceil(analytics.fansChatted * 0.10);
            const additionalSpenders = targetSpenders - analytics.uniqueSpenders;
            const revenuePerBuyer = analytics.uniqueSpenders > 0 ? analytics.totalRevenue / analytics.uniqueSpenders : avgPrice;
            const revenueGain = additionalSpenders * revenuePerBuyer;
            
            if (revenueGain > 50) {
                opportunities.push({
                    title: 'Convert More Fans to Buyers',
                    urgency: 'high',
                    impact: `+$${revenueGain.toFixed(0)}/week`,
                    description: `Turn ${additionalSpenders} more chatted fans into paying customers (current: ${analytics.uniqueSpenders} buyers from ${analytics.fansChatted} fans)`,
                    action: 'Focus on fans showing buying signals',
                    calculation: `${additionalSpenders} new buyers × $${revenuePerBuyer.toFixed(0)} avg per buyer`
                });
            }
        }
    }
    
    // 3. OPTIMIZE RESPONSE TIME
    if (analytics.avgResponseTime > 5 && analytics.totalRevenue > 0) {
        const revenueLoss = analytics.totalRevenue * 0.12; // 12% loss from slow responses
        const revenueGain = revenueLoss * 0.8; // 80% recoverable
        
        if (revenueGain > 50) {
            opportunities.push({
                title: 'Speed Up Response Times',
                urgency: 'high',
                impact: `+$${revenueGain.toFixed(0)}/week`,
                description: `Reduce avg response time from ${analytics.avgResponseTime}min to under 5min (recover lost conversions)`,
                action: 'Set response time alerts and team targets',
                calculation: `Recover 80% of estimated $${revenueLoss.toFixed(0)} loss from delays`
            });
        }
    }
    
    // 4. INCREASE AVG PPV PRICE
    if (avgPrice > 0 && avgPrice < 25 && analytics.ppvsUnlocked > 10) {
        const priceIncrease = 5;
        const revenueGain = analytics.ppvsUnlocked * priceIncrease;
        
        if (revenueGain > 50) {
            opportunities.push({
                title: 'Raise PPV Prices',
                urgency: 'medium',
                impact: `+$${revenueGain.toFixed(0)}/week`,
                description: `Test increasing avg PPV price from $${avgPrice.toFixed(0)} to $${(avgPrice + priceIncrease).toFixed(0)}`,
                action: 'Start with high-engagement fans, monitor unlock rate',
                calculation: `${analytics.ppvsUnlocked} unlocked PPVs × $${priceIncrease} increase`
            });
        }
    }
    
    // 5. IMPROVE REVENUE PER SUB
    if (analytics.totalSubs > 0 && intelligent.revenuePerSub < 12) {
        const target = 15;
        const revenueGain = analytics.totalSubs * (target - intelligent.revenuePerSub);
        
        if (revenueGain > 50) {
            opportunities.push({
                title: 'Increase Revenue per Subscriber',
                urgency: 'medium',
                impact: `+$${revenueGain.toFixed(0)}/week`,
                description: `Raise revenue per sub from $${intelligent.revenuePerSub.toFixed(2)} to $${target} target`,
                action: 'Send more PPVs and improve upselling',
                calculation: `${analytics.totalSubs} subs × $${(target - intelligent.revenuePerSub).toFixed(2)} gap`
            });
        }
    }
    
    // 6. IMPROVE LINK-TO-SUB CONVERSION
    if (analytics.linkClicks > 50 && analytics.newSubs > 0) {
        const linkToSubRate = (analytics.newSubs / analytics.linkClicks) * 100;
        if (linkToSubRate < 4) {
            const targetSubs = Math.ceil(analytics.linkClicks * 0.05);
            const additionalSubs = targetSubs - analytics.newSubs;
            const revenueGain = additionalSubs * intelligent.revenuePerSub;
            
            if (revenueGain > 50) {
                opportunities.push({
                    title: 'Improve Link Conversion',
                    urgency: 'medium',
                    impact: `+$${revenueGain.toFixed(0)}/week`,
                    description: `Get ${additionalSubs} more subs from your ${analytics.linkClicks} link clicks (raise rate from ${linkToSubRate.toFixed(1)}% to 5%)`,
                    action: 'Optimize OnlyFans profile and landing pages',
                    calculation: `${additionalSubs} more subs × $${intelligent.revenuePerSub.toFixed(0)} revenue/sub`
                });
            }
        }
    }
    
    // Sort by impact (highest revenue first)
    opportunities.sort((a, b) => {
        const impactA = parseFloat(a.impact.replace(/[^0-9.-]/g, '')) || 0;
        const impactB = parseFloat(b.impact.replace(/[^0-9.-]/g, '')) || 0;
        return impactB - impactA;
    });
    
    // Show top 6 opportunities
    if (opportunities.length === 0) {
        container.innerHTML = `
            <div class="col-span-3 text-center py-8">
                <i class="fas fa-check-circle text-green-400 text-4xl mb-4"></i>
                <h4 class="text-xl font-semibold text-green-300 mb-2">Performance Optimal</h4>
                <p class="text-gray-400">No immediate optimization opportunities detected!</p>
            </div>
        `;
    } else {
        container.innerHTML = opportunities.slice(0, 6).map(opp => {
            const urgencyClass = {
                urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
                high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                low: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            }[opp.urgency];
            
            return `
                <div class="glass-card rounded-xl p-5 border border-gray-700 hover:border-green-500/30 transition-all">
                    <div class="flex items-start justify-between mb-3">
                        <h4 class="font-bold text-white text-sm flex-1">${opp.title}</h4>
                        <span class="px-2 py-1 rounded-lg text-xs font-bold ${urgencyClass} ml-2">${opp.urgency.toUpperCase()}</span>
                    </div>
                    <div class="mb-3">
                        <div class="text-lg font-bold text-green-400 mb-2">${opp.impact}</div>
                        <p class="text-gray-300 text-sm leading-relaxed">${opp.description}</p>
                    </div>
                    <div class="mb-3 p-2 bg-gray-800/50 rounded-lg">
                        <div class="text-xs text-gray-400 mb-1">Calculation:</div>
                        <div class="text-xs text-blue-300 font-mono">${opp.calculation}</div>
                    </div>
                    <div class="flex items-center pt-3 border-t border-gray-700">
                        <i class="fas fa-play text-purple-400 mr-2 text-xs"></i>
                        <span class="text-purple-300 text-xs font-medium">${opp.action}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
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
        'revenueGrowth': 'No growth data',
        'subsGrowth': 'No growth data',
        'clicksGrowth': 'No growth data',
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
    
    // Update metrics with change indicators (showing NET revenue, not total)
    const revenueEl = document.getElementById('totalRevenue');
    if (revenueEl) {
        const changeHTML = renderChangeIndicator(changes.netRevenue);
        console.log('Revenue change HTML:', changeHTML);
        revenueEl.innerHTML = `$${data.netRevenue.toLocaleString()}${changeHTML}`;
    }
    
    const subsEl = document.getElementById('totalSubs');
    if (subsEl) {
        subsEl.innerHTML = `${data.totalSubs.toLocaleString()}${renderChangeIndicator(changes.totalSubs)}`;
    }
    
    const clicksEl = document.getElementById('linkClicks');
    if (clicksEl) {
        clicksEl.innerHTML = `${(data.linkClicks || 0).toLocaleString()}${renderChangeIndicator(changes.linkClicks)}`;
    }
    
    // NEW: Update VIP & Retention metrics
    const vipRevenuePercentEl = document.getElementById('vipRevenuePercent');
    if (vipRevenuePercentEl) {
        vipRevenuePercentEl.textContent = data.vipRevenuePercent > 0 ? `${data.vipRevenuePercent.toFixed(1)}%` : '-';
    }
    
    const renewRateEl = document.getElementById('renewRate');
    if (renewRateEl) {
        renewRateEl.textContent = data.renewRate > 0 ? `${data.renewRate.toFixed(1)}%` : '-';
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
        revenueChangeEl.innerHTML = renderChangeIndicator(changes.netRevenue) || '';
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
// Load Revenue Attribution Chart (Donut chart by category)
async function loadRevenueAttributionChart() {
    const ctx = document.getElementById('revenueAttributionChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (chartInstances.revenueAttributionChart) {
        chartInstances.revenueAttributionChart.destroy();
    }
    
    try {
        // Fetch traffic source data
        const params = new URLSearchParams();
        if (currentTimeInterval === '7d') {
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - 7);
            params.append('filterType', 'week');
            params.append('weekStart', weekStart.toISOString());
            params.append('weekEnd', new Date().toISOString());
        }
        
        const response = await fetch(`/api/marketing/dashboard?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch marketing data');
        }
        
        const data = await response.json();
        
        // Aggregate by category
        const categoryRevenue = {};
        if (data.sources && data.sources.length > 0) {
            data.sources.forEach(source => {
                if (!categoryRevenue[source.category]) {
                    categoryRevenue[source.category] = 0;
                }
                categoryRevenue[source.category] += source.revenue || 0;
            });
        }
        
        const categories = Object.keys(categoryRevenue);
        const revenues = Object.values(categoryRevenue);
        
        // If no data, show placeholder
        if (categories.length === 0) {
            categories.push('No Data');
            revenues.push(100);
        }
        
        const colors = {
            reddit: '#FF4500',
            twitter: '#1DA1F2',
            instagram: '#E4405F',
            tiktok: '#00F2EA',
            youtube: '#FF0000',
            other: '#6B7280',
            'No Data': '#374151'
        };
        
        chartInstances.revenueAttributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)),
                datasets: [{
                    data: revenues,
                    backgroundColor: categories.map(c => colors[c] || colors.other),
                    borderColor: '#1f2937',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#e5e7eb',
                            padding: 15,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: $${value.toFixed(0)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading revenue attribution chart:', error);
        // Show fallback
        chartInstances.revenueAttributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{
                    data: [100],
                    backgroundColor: ['#374151'],
                    borderColor: '#1f2937',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: '#9ca3af' }
                    }
                }
            }
        });
    }
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

// Load Conversion Funnel Chart (Link Clicks → Subs → Spenders → Revenue)
function loadConversionFunnelChart(analytics) {
    const ctx = document.getElementById('conversionFunnelChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (chartInstances.conversionFunnelChart) {
        chartInstances.conversionFunnelChart.destroy();
    }

    // Build funnel data
    const linkClicks = analytics.linkClicks || 0;
    const newSubs = analytics.newSubs || 0;
    const spenders = analytics.uniqueSpenders || 0;
    const revenue = analytics.totalRevenue || 0;
    
    // Calculate percentages
    const clickToSubRate = linkClicks > 0 ? (newSubs / linkClicks * 100).toFixed(1) : 0;
    const subToSpenderRate = newSubs > 0 ? (spenders / newSubs * 100).toFixed(1) : 0;
    const spenderToRevenueRate = spenders > 0 ? (revenue / spenders).toFixed(0) : 0;
    
    chartInstances.conversionFunnelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [
                `Link Clicks\n${linkClicks.toLocaleString()}`,
                `Subscribers\n${newSubs.toLocaleString()} (${clickToSubRate}%)`,
                `Spenders\n${spenders.toLocaleString()} (${subToSpenderRate}%)`,
                `Revenue\n$${revenue.toLocaleString()}`
            ],
            datasets: [{
                label: 'Conversion Funnel',
                data: [
                    linkClicks,
                    newSubs,
                    spenders,
                    revenue / 10 // Scale down revenue for visual comparison
                ],
                backgroundColor: [
                    'rgba(147, 51, 234, 0.8)', // Purple
                    'rgba(59, 130, 246, 0.8)', // Blue
                    'rgba(16, 185, 129, 0.8)', // Green
                    'rgba(245, 158, 11, 0.8)'  // Yellow
                ],
                borderColor: [
                    'rgba(147, 51, 234, 1)',
                    'rgba(59, 130, 246, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            if (index === 3) {
                                return `Revenue: $${(context.parsed.x * 10).toFixed(0)}`;
                            }
                            return `${context.label.split('\n')[0]}: ${context.parsed.x.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    ticks: {
                        color: '#e5e7eb',
                        font: {
                            size: 11,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Section creation functions
function createAnalyticsSection() {
    console.log('🎯 createAnalyticsSection() called - returning new HTML');
    const html = `
        <div class="mb-8">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 class="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-600 bg-clip-text text-transparent">
                        <i class="fas fa-chart-line mr-2"></i>Analytics Overview
                    </h2>
                    <p class="text-gray-400">All your key metrics in one place</p>
                </div>
                <!-- Time Period Selector -->
                <div class="flex flex-wrap gap-2 items-center">
                    <span class="text-sm font-medium text-gray-400 mr-2">Time Period:</span>
                    <button onclick="setAnalyticsInterval('24h')" class="analytics-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="24h">24h</button>
                    <button onclick="setAnalyticsInterval('7d')" class="analytics-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7d</button>
                    <button onclick="setAnalyticsInterval('30d')" class="analytics-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30d</button>
                    <button onclick="setAnalyticsInterval('custom')" class="analytics-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                        <i class="fas fa-calendar mr-1 text-xs"></i>Custom
                    </button>
                </div>
            </div>
        </div>

        <!-- Sales Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-dollar-sign text-green-400 mr-3"></i>
                Sales
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Net Revenue</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsNetRevenue">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">PPV Revenue</div>
                    <div class="text-3xl font-bold text-blue-400" id="analyticsPPVRevenue">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Tip Revenue</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsTipRevenue">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Avg PPV Price</div>
                    <div class="text-3xl font-bold text-cyan-400" id="analyticsAvgPPV">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Total Spenders</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsTotalSpenders">0</div>
                </div>
            </div>
        </div>

        <!-- Chatting Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-comments text-blue-400 mr-3"></i>
                Chatting
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Messages Sent</div>
                    <div class="text-3xl font-bold text-white" id="analyticsMessagesSent">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Response Rate</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsResponseRate">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">PPVs Unlocked</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsPPVsUnlocked">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Unlock Rate</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsUnlockRate">0%</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Avg Response Time</div>
                    <div class="text-3xl font-bold text-orange-400" id="analyticsAvgResponse">0m</div>
                </div>
            </div>
        </div>

        <!-- Marketing Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-bullseye text-purple-400 mr-3"></i>
                Marketing
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Link Clicks</div>
                    <div class="text-3xl font-bold text-cyan-400" id="analyticsLinkClicks">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Link Views</div>
                    <div class="text-3xl font-bold text-blue-400" id="analyticsLinkViews">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Spender Rate</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsSpenderRate">0%</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Revenue/Click</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsRevenuePerClick">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Click-to-Sub Rate</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsClickToSub">0%</div>
                </div>
            </div>
        </div>

        <!-- Subscriber Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-users text-cyan-400 mr-3"></i>
                Subscribers
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Total Subscribers</div>
                    <div class="text-3xl font-bold text-blue-400" id="analyticsTotalSubs">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Active Fans</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsActiveFans">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Fans with Renew</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsFansWithRenew">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Renew Rate</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsRenewRate">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">New Subscribers</div>
                    <div class="text-3xl font-bold text-cyan-400" id="analyticsNewSubs">0</div>
                </div>
            </div>
        </div>

        <!-- Team Quality Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-star text-yellow-400 mr-3"></i>
                Team Quality
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Overall Score</div>
                    <div class="text-3xl font-bold text-gray-400" id="analyticsOverallScore">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Grammar Score</div>
                    <div class="text-3xl font-bold text-gray-400" id="analyticsGrammarScore">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Guidelines Score</div>
                    <div class="text-3xl font-bold text-gray-400" id="analyticsGuidelinesScore">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Top Performer</div>
                    <div class="text-2xl font-bold text-green-400" id="analyticsTopPerformer">-</div>
                </div>
            </div>
        </div>
    `;
    console.log('✅ Analytics HTML generated, length:', html.length);
    return html;
}

function createAIAnalysisSection() {
    const isChatter = currentUser && currentUser.role === 'chatter';
    
    // For chatters, show ONLY Individual Analysis
    if (isChatter) {
        return `
            <div class="mb-8">
                <div class="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h2 class="text-5xl font-bold mb-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                            <i class="fas fa-user-chart mr-3"></i>My Performance Analysis
                        </h2>
                        <p class="text-gray-400 text-lg">Deep insights into your individual performance</p>
                    </div>
                    <!-- Time Period Selector -->
                    <div class="flex flex-wrap gap-2 items-center">
                        <span class="text-sm font-medium text-gray-400 mr-2">Time Period:</span>
                        <button onclick="setAIInterval('24h')" class="ai-interval-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="24h">24h</button>
                        <button onclick="setAIInterval('7d')" class="ai-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7d</button>
                        <button onclick="setAIInterval('30d')" class="ai-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30d</button>
                        <button onclick="setAIInterval('custom')" class="ai-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                            <i class="fas fa-calendar mr-1 text-xs"></i>Custom
                        </button>
                    </div>
                </div>
            </div>

            <!-- Individual Chatter Analysis -->
            <div class="glass-card rounded-xl p-8 mb-8 border-2 border-cyan-500/30">
                <div class="flex items-center mb-6">
                    <div class="w-16 h-16 bg-cyan-600/20 rounded-2xl flex items-center justify-center mr-4">
                        <i class="fas fa-user-chart text-cyan-400 text-3xl"></i>
                    </div>
                    <div>
                        <h3 class="text-3xl font-bold text-white">Your Performance Deep-Dive</h3>
                        <p class="text-gray-400 text-lg">Select a time period to analyze your performance</p>
                    </div>
                </div>
                
                <!-- Account Selection -->
                <div class="mb-6">
                    <label class="block text-sm font-medium mb-2">Select Your Account</label>
                    <select id="chatterAnalysisSelect" class="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white">
                        <option value="">Choose account to analyze...</option>
                    </select>
                </div>
                
                <!-- Run Analysis Button -->
                <button onclick="runChatterAnalysis()" class="w-full premium-button text-white font-bold py-4 px-6 rounded-xl text-lg mb-6">
                    <i class="fas fa-brain mr-2"></i>Start Individual Analysis
                </button>

                <div id="chatterAnalysisResults" class="mt-6">
                    <div class="text-center py-12">
                        <i class="fas fa-user-times text-gray-400 text-4xl mb-4"></i>
                        <p class="text-gray-400">Select your account and time period above, then click "Start Analysis"</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // For managers, show both Agency and Individual Analysis options
    return `
        <div class="mb-8">
            <h2 class="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
                <i class="fas fa-brain mr-3"></i>AI Intelligence Hub
            </h2>
            <p class="text-gray-400 text-lg">Select time period, then choose analysis type</p>
        </div>
        
        <!-- Date Filter (BEFORE choosing analysis type) -->
        <div class="glass-card rounded-xl p-6 mb-8">
            <label class="block text-sm font-medium mb-3">Select Time Period</label>
            <div class="flex gap-3">
                <button onclick="setAIInterval('7d')" class="ai-interval-btn flex-1 px-6 py-4 rounded-xl bg-cyan-600 text-white border-2 border-cyan-500 transition-all font-medium" data-interval="7d">
                    <i class="fas fa-calendar-week mr-2"></i>7 Days
                </button>
                <button onclick="setAIInterval('30d')" class="ai-interval-btn flex-1 px-6 py-4 rounded-xl bg-gray-700 text-gray-300 border border-gray-600 hover:bg-cyan-600/20 hover:border-cyan-500/50 transition-all font-medium" data-interval="30d">
                    <i class="fas fa-calendar-alt mr-2"></i>30 Days
                </button>
                <button onclick="setAIInterval('custom')" class="ai-interval-btn flex-1 px-6 py-4 rounded-xl bg-gray-700 text-gray-300 border border-gray-600 hover:bg-cyan-600/20 hover:border-cyan-500/50 transition-all font-medium" data-interval="custom">
                    <i class="fas fa-calendar mr-2"></i>Custom
                </button>
            </div>
        </div>

        <!-- Analysis Type Selection Cards -->
        <div id="analysisTypeCards" class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
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
            <div class="glass-card rounded-xl p-8 mb-8 border-2 border-purple-500/30">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center">
                        <div class="w-16 h-16 bg-purple-600/20 rounded-2xl flex items-center justify-center mr-4">
                            <i class="fas fa-building text-purple-400 text-3xl"></i>
                        </div>
                        <div>
                            <h3 class="text-3xl font-bold text-white">Agency Performance Analysis</h3>
                            <p class="text-gray-400 text-lg">Select a time period to analyze team performance</p>
                        </div>
                    </div>
                    <button onclick="hideAnalysisResults()" class="text-gray-400 hover:text-white transition">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <!-- Run Analysis Button -->
                <button onclick="runAgencyAnalysis()" class="w-full premium-button text-white font-bold py-4 px-6 rounded-xl text-lg mb-6">
                    <i class="fas fa-brain mr-2"></i>Start Agency Analysis
                </button>
                
                <div id="agencyAnalysisResults" class="mt-6">
                    <div class="text-center py-12">
                        <i class="fas fa-brain text-gray-400 text-4xl mb-4"></i>
                        <p class="text-gray-400">Click "Start Analysis" above to analyze your team's performance</p>
                    </div>
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
                        <div class="flex items-center gap-4 mt-3">
                            <select id="chatterAnalysisSelect" class="flex-1 max-w-md bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white">
                                <option value="">Select Chatter...</option>
                            </select>
                            <button id="runChatterAnalysisBtn" onclick="runChatterAnalysis()" class="flex-shrink-0 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg hover:shadow-cyan-500/50">
                                <i class="fas fa-play mr-2"></i>START ANALYSIS
                            </button>
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
        
        <!-- Daily Account Snapshot Form (NEW - for custom date ranges) -->
        <div class="glass-card rounded-xl p-6 mb-8 border-2 border-purple-500/30">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h3 class="text-xl font-semibold flex items-center">
                        <i class="fas fa-calendar-day text-purple-400 mr-2"></i>
                        Daily Account Snapshot
                        <span class="ml-3 px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">NEW - Upload Daily!</span>
                    </h3>
                    <p class="text-xs text-gray-400 mt-1">Upload daily for custom date range support</p>
                </div>
            </div>
            <!-- v2.1 - All subscriber fields optional -->
            <form id="dailySnapshotForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium mb-2">Date</label>
                        <input type="date" id="snapshotDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Creator Account</label>
                        <select id="snapshotCreator" required
                                  class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                              <option value="">Select Creator...</option>
                              <!-- Options populated dynamically by populateAllCreatorDropdowns() -->
                          </select>
                    </div>
                </div>

                <div class="border-t border-purple-700/30 pt-6">
                    <h4 class="text-lg font-medium mb-4 text-purple-400">Revenue</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Recurring Revenue ($)
                                <span class="text-xs text-gray-500 block">From subscriptions</span>
                            </label>
                            <input type="number" id="snapshotRecurringRevenue" min="0" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>
                </div>

                <div class="border-t border-purple-700/30 pt-6">
                    <h4 class="text-lg font-medium mb-4 text-purple-400">Subscriber Metrics</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Total Subscribers
                                <span class="text-xs text-gray-500 block">Optional - if you have it</span>
                            </label>
                            <input type="number" id="snapshotTotalSubs" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                   placeholder="Leave blank if unknown">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Active Fans
                                <span class="text-xs text-gray-500 block">Optional - if you have it</span>
                            </label>
                            <input type="number" id="snapshotActiveFans" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                   placeholder="Leave blank if unknown">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Fans with Renew ON
                                <span class="text-xs text-gray-500 block">Optional - if you have it</span>
                            </label>
                            <input type="number" id="snapshotFansWithRenew" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                   placeholder="Leave blank if unknown">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">
                                New Subs Today
                                <span class="text-xs text-gray-500 block">Optional - if you have it</span>
                            </label>
                            <input type="number" id="snapshotNewSubs" min="0"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                   placeholder="Leave blank if unknown">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Renew Rate (%)
                                <span class="text-xs text-gray-500 block">Optional - will auto-calc if blank</span>
                            </label>
                            <input type="number" id="snapshotRenewRate" min="0" max="100" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                   placeholder="Leave blank to auto-calculate">
                        </div>
                    </div>
                    <div class="mt-4 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                        <p class="text-xs text-purple-300">
                            <i class="fas fa-info-circle mr-1"></i>
                            If you leave Renew Rate blank, it will be auto-calculated: (Fans with Renew / Total Subs) × 100
                        </p>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button type="button" onclick="handleDailySnapshotSubmitDirect()" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-save mr-2"></i>Save Daily Snapshot
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
                            <option value="">Loading employees...</option>
                        </select>
                    </div>
                </div>

                <div class="border-t border-gray-700 pt-6">
                    <h4 class="text-lg font-medium mb-4 text-blue-400">Performance Metrics</h4>
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
                            <input type="number" id="chatterAvgResponseTime" min="0" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                            <p class="text-xs text-gray-400 mt-1">Enter as decimal minutes (e.g., 3.5 for 3m 30s, 9.17 for 9m 10s)</p>
                        </div>
                    </div>
                </div>

                <div class="border-t border-gray-700 pt-6">
                    <h4 class="text-lg font-medium mb-4 text-green-400">Revenue</h4>
                    <div class="grid grid-cols-1 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Net Sales (Revenue - Costs)</label>
                            <input type="number" id="chatterNetSales" min="0" step="0.01"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                            <p class="text-xs text-gray-400 mt-1">Net revenue after platform fees, content costs, etc.</p>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button type="button" onclick="handleChatterDataSubmitDirect()" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
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
                <p class="text-xs text-gray-400 mt-2">Select which employee these messages belong to.</p>
            </div>
            <form id="messagesUploadForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Chatter/Employee</label>
                    <select id="messagesChatter" required
                            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        <option value="">Loading employees...</option>
                    </select>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Start Date</label>
                        <input type="date" id="messagesStartDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">End Date</label>
                        <input type="date" id="messagesEndDate" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Weekly Message CSV</label>
                    <input type="file" id="messagesFile" accept=".csv" required
                           class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-600 file:text-white hover:file:bg-green-700">
                </div>
                <button type="button" onclick="handleMessagesUploadDirect()" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                    <i class="fas fa-upload mr-2"></i>Upload Messages
                </button>
            </form>
        </div>

        <!-- Link Tracking Data Upload (MOVED from Marketing Dashboard) -->
        <div class="glass-card rounded-xl p-6 border-2 border-blue-500/30">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h3 class="text-xl font-semibold flex items-center">
                        <i class="fas fa-link text-blue-400 mr-2"></i>
                        Link Tracking Data
                    </h3>
                    <p class="text-xs text-gray-400 mt-1">Upload clicks and views per traffic category (weekly)</p>
                </div>
            </div>
            <div class="mb-4 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
                <h4 class="font-medium text-blue-400 mb-2 flex items-center">
                    <i class="fas fa-info-circle mr-2"></i>How it works:
                </h4>
                <ul class="text-sm text-gray-300 space-y-1">
                    <li>• One link per <strong>category</strong> (e.g., one Reddit link for all subreddits)</li>
                    <li>• Use link shortener analytics (bit.ly, Linktree, etc.)</li>
                    <li>• Upload weekly to track performance over time</li>
                    <li>• Connects to sales logs for ROI calculation</li>
                </ul>
            </div>
            <form id="linkTrackingForm" class="space-y-6">
                <div>
                    <label class="block text-sm font-semibold mb-2 text-gray-300">
                        <i class="fas fa-tag mr-1"></i>Category <span class="text-xs text-gray-500">(One link per category)</span>
                    </label>
                    <select id="linkCategory" required
                            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                        <option value="">Select category...</option>
                        <option value="reddit">📱 Reddit</option>
                        <option value="twitter">🐦 Twitter</option>
                        <option value="instagram">📸 Instagram</option>
                        <option value="tiktok">🎵 TikTok</option>
                        <option value="youtube">📺 YouTube</option>
                        <option value="other">🌐 Other</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">
                            <i class="fas fa-calendar mr-1"></i>Week Start
                        </label>
                        <input type="date" id="linkWeekStart" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">
                            <i class="fas fa-calendar mr-1"></i>Week End
                        </label>
                        <input type="date" id="linkWeekEnd" required
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">
                            <i class="fas fa-eye mr-1"></i>Landing Page Views
                        </label>
                        <input type="number" id="linkLandingViews" required min="0"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50"
                               placeholder="How many saw your link?">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">
                            <i class="fas fa-mouse-pointer mr-1"></i>OnlyFans Clicks
                        </label>
                        <input type="number" id="linkOFClicks" required min="0"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50"
                               placeholder="How many clicked to OF?">
                    </div>
                </div>
                <div class="flex justify-end">
                    <button type="submit" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
                        <i class="fas fa-upload mr-2"></i>Upload Link Data
                    </button>
                </div>
            </form>
        </div>
    `;
}

function createNewAnalyticsSection() {
    return `
        <div class="mb-8">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 class="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-600 bg-clip-text text-transparent">
                        <i class="fas fa-chart-line mr-2"></i>Analytics Overview
                    </h2>
                    <p class="text-gray-400">All your key metrics in one place</p>
                </div>
                
                <!-- Custom Date Range Picker -->
                <div class="flex items-center space-x-3 flex-wrap gap-2">
                    <span class="text-sm text-gray-400 mr-1">Date Range:</span>
                    
                    <!-- Start Date -->
                    <div class="flex items-center bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 rounded-xl px-3 py-2 shadow-lg">
                        <i class="fas fa-calendar text-blue-400 mr-2 text-sm"></i>
                        <input type="date" id="analyticsStartDate" 
                               class="bg-transparent text-white text-sm font-medium border-0 outline-none cursor-pointer"
                               style="color-scheme: dark;">
                    </div>
                    
                    <!-- To -->
                    <span class="text-gray-500 font-medium">→</span>
                    
                    <!-- End Date -->
                    <div class="flex items-center bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-xl px-3 py-2 shadow-lg">
                        <i class="fas fa-calendar text-purple-400 mr-2 text-sm"></i>
                        <input type="date" id="analyticsEndDate" 
                               class="bg-transparent text-white text-sm font-medium border-0 outline-none cursor-pointer"
                               style="color-scheme: dark;">
                    </div>
                    
                    <!-- Apply Button -->
                    <button onclick="applyAnalyticsDateFilter()" 
                            class="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-900/50 flex items-center gap-2">
                        <i class="fas fa-check"></i>
                        Apply
                    </button>
                    
                    <!-- Quick Filters -->
                    <div class="flex items-center gap-2 ml-2 border-l border-gray-700 pl-3">
                        <button onclick="setAnalyticsQuickFilter('week')" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700/50 hover:bg-blue-600/50 text-gray-300 hover:text-white transition-all">
                            This Week
                        </button>
                        <button onclick="setAnalyticsQuickFilter('month')" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700/50 hover:bg-purple-600/50 text-gray-300 hover:text-white transition-all">
                            This Month
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sales Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-dollar-sign text-green-400 mr-3"></i>
                Sales
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Net Revenue</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsNetRevenue">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">PPV Revenue</div>
                    <div class="text-3xl font-bold text-blue-400" id="analyticsPPVRevenue">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Tip Revenue</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsTipRevenue">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Avg PPV Price</div>
                    <div class="text-3xl font-bold text-cyan-400" id="analyticsAvgPPV">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Total Spenders</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsTotalSpenders">0</div>
                </div>
            </div>
        </div>

        <!-- Chatting Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-comments text-blue-400 mr-3"></i>
                Chatting
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Messages Sent</div>
                    <div class="text-3xl font-bold text-white" id="analyticsMessagesSent">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Response Rate</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsResponseRate">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">PPVs Unlocked</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsPPVsUnlocked">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Unlock Rate</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsUnlockRate">0%</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Avg Response Time</div>
                    <div class="text-3xl font-bold text-orange-400" id="analyticsAvgResponse">0m</div>
                </div>
            </div>
        </div>

        <!-- Marketing Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-bullseye text-purple-400 mr-3"></i>
                Marketing
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Link Clicks</div>
                    <div class="text-3xl font-bold text-cyan-400" id="analyticsLinkClicks">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Link Views</div>
                    <div class="text-3xl font-bold text-blue-400" id="analyticsLinkViews">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Spender Rate</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsSpenderRate">0%</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Revenue/Click</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsRevenuePerClick">$0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Click-to-Sub Rate</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsClickToSub">0%</div>
                </div>
            </div>
        </div>

        <!-- Subscriber Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-users text-cyan-400 mr-3"></i>
                Subscribers
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Total Subscribers</div>
                    <div class="text-3xl font-bold text-blue-400" id="analyticsTotalSubs">0</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Active Fans</div>
                    <div class="text-3xl font-bold text-purple-400" id="analyticsActiveFans">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Fans with Renew</div>
                    <div class="text-3xl font-bold text-green-400" id="analyticsFansWithRenew">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Renew Rate</div>
                    <div class="text-3xl font-bold text-yellow-400" id="analyticsRenewRate">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">New Subscribers</div>
                    <div class="text-3xl font-bold text-cyan-400" id="analyticsNewSubs">0</div>
                </div>
            </div>
        </div>

        <!-- Team Quality Metrics -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-star text-yellow-400 mr-3"></i>
                Team Quality
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Overall Score</div>
                    <div class="text-3xl font-bold text-gray-400" id="analyticsOverallScore">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Grammar Score</div>
                    <div class="text-3xl font-bold text-gray-400" id="analyticsGrammarScore">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Guidelines Score</div>
                    <div class="text-3xl font-bold text-gray-400" id="analyticsGuidelinesScore">-</div>
                </div>
                <div class="glass-card rounded-xl p-6">
                    <div class="text-sm text-gray-400 mb-2">Top Performer</div>
                    <div class="text-2xl font-bold text-green-400" id="analyticsTopPerformer">-</div>
                </div>
            </div>
        </div>
    `;
}

// Analytics Date Picker Functions
function applyAnalyticsDateFilter() {
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    customDateRange = {
        start: startDate,
        end: endDate
    };
    
    console.log('✅ Analytics date filter applied:', customDateRange);
    analyticsLoadAttempts = 0; // Reset attempts
    loadAnalyticsData();
}

function setAnalyticsQuickFilter(type) {
    const today = new Date();
    let startDate, endDate;
    
    if (type === 'week') {
        const dayOfWeek = today.getDay();
        startDate = new Date(today);
        startDate.setDate(today.getDate() - dayOfWeek);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
    } else if (type === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    document.getElementById('analyticsStartDate').value = formatDate(startDate);
    document.getElementById('analyticsEndDate').value = formatDate(endDate);
    
    applyAnalyticsDateFilter();
}

// Load Analytics Data
let analyticsLoadAttempts = 0;
async function loadAnalyticsData() {
    try {
        // Calculate date range based on current interval
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentAnalyticsInterval === 'custom' && analyticsCustomDates) {
            startDate = new Date(analyticsCustomDates.start);
            endDate = new Date(analyticsCustomDates.end);
        } else if (currentAnalyticsInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
        } else if (currentAnalyticsInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        } else if (currentAnalyticsInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        const url = `/api/analytics/dashboard?filterType=custom&customStart=${formatDate(startDate)}&customEnd=${formatDate(endDate)}&_t=${Date.now()}`;
        
        console.log('Analytics URL:', url);
        console.log('Analytics interval:', currentAnalyticsInterval);
        console.log('Date range:', formatDate(startDate), 'to', formatDate(endDate));
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (response.ok) {
            const data = await response.json();
            
            // Sales Metrics - check if elements exist first
            const netRevEl = document.getElementById('analyticsNetRevenue');
            if (!netRevEl) {
                analyticsLoadAttempts++;
                if (analyticsLoadAttempts > 10) {
                    console.error('❌ Analytics elements never appeared after 10 attempts - giving up');
                    return;
                }
                console.log(`Analytics elements not found (attempt ${analyticsLoadAttempts}/10) - waiting...`);
                setTimeout(() => loadAnalyticsData(), 300);
                return;
            }
            
            analyticsLoadAttempts = 0; // Reset counter
            console.log('✅ Analytics elements found! Loading data...');
            
            netRevEl.textContent = `$${(data.netRevenue || 0).toLocaleString()}`;
            document.getElementById('analyticsPPVRevenue').textContent = `$${(data.ppvRevenue || 0).toLocaleString()}`;
            document.getElementById('analyticsTipRevenue').textContent = `$${(data.tipRevenue || 0).toLocaleString()}`;
            document.getElementById('analyticsAvgPPV').textContent = `$${(data.avgPPVPrice || 0)}`;
            document.getElementById('analyticsTotalSpenders').textContent = (data.uniqueSpenders || 0).toLocaleString();
            
            // Chatting Metrics
            document.getElementById('analyticsMessagesSent').textContent = (data.messagesSent || 0).toLocaleString();
            // Response Rate: Calculate from message analysis data (placeholder for now)
            document.getElementById('analyticsResponseRate').textContent = '-';
            document.getElementById('analyticsPPVsUnlocked').textContent = (data.ppvsUnlocked || 0).toLocaleString();
            const unlockRate = data.ppvsSent > 0 ? ((data.ppvsUnlocked / data.ppvsSent) * 100).toFixed(1) : '0';
            document.getElementById('analyticsUnlockRate').textContent = `${unlockRate}%`;
            document.getElementById('analyticsAvgResponse').textContent = `${data.avgResponseTime || 0}m`;
            
            // Marketing Metrics
            document.getElementById('analyticsLinkClicks').textContent = (data.linkClicks || 0).toLocaleString();
            document.getElementById('analyticsLinkViews').textContent = (data.linkViews || 0).toLocaleString();
            const spenderRate = data.linkClicks > 0 ? ((data.uniqueSpenders / data.linkClicks) * 100).toFixed(1) : '0';
            document.getElementById('analyticsSpenderRate').textContent = `${spenderRate}%`;
            const revenuePerClick = data.linkClicks > 0 ? (data.netRevenue / data.linkClicks).toFixed(2) : '0.00';
            document.getElementById('analyticsRevenuePerClick').textContent = `$${revenuePerClick}`;
            const clickToSub = data.linkClicks > 0 ? ((data.newSubs / data.linkClicks) * 100).toFixed(1) : '0';
            document.getElementById('analyticsClickToSub').textContent = `${clickToSub}%`;
            
            // Subscriber Metrics
            document.getElementById('analyticsTotalSubs').textContent = (data.totalSubs || 0).toLocaleString();
            document.getElementById('analyticsActiveFans').textContent = data.activeFans > 0 ? data.activeFans.toLocaleString() : '-';
            document.getElementById('analyticsFansWithRenew').textContent = data.fansWithRenew > 0 ? data.fansWithRenew.toLocaleString() : '-';
            document.getElementById('analyticsRenewRate').textContent = data.renewRate > 0 ? `${data.renewRate.toFixed(1)}%` : '-';
            document.getElementById('analyticsNewSubs').textContent = (data.newSubs || 0).toLocaleString();
            
            // Team Quality Metrics with color coding
            const overallScoreEl = document.getElementById('analyticsOverallScore');
            const grammarScoreEl = document.getElementById('analyticsGrammarScore');
            const guidelinesScoreEl = document.getElementById('analyticsGuidelinesScore');
            
            console.log('🎨 Applying score colors:', {
                overall: data.avgOverallScore,
                grammar: data.avgGrammarScore,
                guidelines: data.avgGuidelinesScore
            });
            
            if (overallScoreEl) {
                const score = data.avgOverallScore;
                const color = window.getScoreColor(score);
                console.log(`🎨 Overall: ${score} → ${color}`);
                overallScoreEl.textContent = score != null ? `${score}/100` : '-';
                overallScoreEl.className = `text-3xl font-bold ${color}`;
            }
            
            if (grammarScoreEl) {
                const score = data.avgGrammarScore;
                const color = window.getScoreColor(score);
                console.log(`🎨 Grammar: ${score} → ${color}`);
                grammarScoreEl.textContent = score != null ? `${score}/100` : '-';
                grammarScoreEl.className = `text-3xl font-bold ${color}`;
            }
            
            if (guidelinesScoreEl) {
                const score = data.avgGuidelinesScore;
                const color = window.getScoreColor(score);
                console.log(`🎨 Guidelines: ${score} → ${color}`);
                guidelinesScoreEl.textContent = score != null ? `${score}/100` : '-';
                guidelinesScoreEl.className = `text-3xl font-bold ${color}`;
            }
            
            document.getElementById('analyticsTopPerformer').textContent = data.topPerformer || '-';
        } else {
            console.error('Failed to load analytics data');
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
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
                            <option value="General Chatting">General Chatting</option>
                            <option value="Psychology">Psychology</option>
                            <option value="Captions">Captions</option>
                            <option value="Sales">Sales</option>
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
                        <label class="block text-sm font-medium mb-2">Priority (1-5)</label>
                        <input type="number" id="guidelinePriority" min="1" max="5" value="3" required
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

// ==================== MARKETING DASHBOARD SECTION ====================

function createMarketingDashboardSection() {
    return `
        <div class="mb-8">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-4xl font-bold mb-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                        <i class="fas fa-rocket mr-2"></i>Marketing Analytics
                    </h2>
                    <p class="text-gray-400">Track traffic source performance and ROI</p>
                </div>
            </div>
        </div>
        
        <!-- Model Selector -->
        <div class="mb-6 glass-card rounded-xl p-4">
            <div class="flex items-center gap-4">
                <span class="text-sm font-medium text-gray-400">Model:</span>
                <select id="marketingModelFilter" onchange="loadMarketingDashboard()" class="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white">
                    <option value="all">🌐 All Models (Global View)</option>
                    <!-- Populated dynamically -->
                </select>
            </div>
        </div>
        
        <!-- Time Period Selector -->
        <div class="mb-6 glass-card rounded-xl p-4">
            <div class="flex flex-wrap gap-2 items-center">
                <span class="text-sm font-medium text-gray-400 mr-2">Time Period:</span>
                <button onclick="setMarketingInterval('24h')" class="marketing-interval-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="24h">24h</button>
                <button onclick="setMarketingInterval('7d')" class="marketing-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7d</button>
                <button onclick="setMarketingInterval('30d')" class="marketing-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30d</button>
                <button onclick="setMarketingInterval('custom')" class="marketing-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                    <i class="fas fa-calendar mr-1 text-xs"></i>Custom
                </button>
            </div>
        </div>
        
        <!-- Overview Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="marketingOverviewCards">
            <!-- Will be populated dynamically -->
        </div>
        
        <!-- Source Performance Grid -->
        <div class="mb-8">
            <h3 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-trophy text-yellow-400 mr-2"></i>
                Top Performing Sources
            </h3>
            <div id="sourcePerformanceGrid" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Will be populated dynamically -->
            </div>
        </div>
        
        <!-- Detailed Analytics Table -->
        <div class="glass-card rounded-xl p-6">
            <h3 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-table text-purple-400 mr-2"></i>
                All Sources - Detailed View
            </h3>
            <div class="overflow-x-auto">
                <table class="min-w-full" id="marketingSourcesTable">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Category / Source</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Revenue</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">% of Total</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Clicks</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Spenders</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Spender Rate</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Rev/Click</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">7d Retention</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">30d Retention</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Quality</th>
                        </tr>
                    </thead>
                    <tbody id="marketingDetailedTableBody">
                        <!-- Will be populated dynamically -->
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ==================== DATA MANAGEMENT SECTION ====================

function createDataManagementSection() {
    return `
        <div class="mb-8">
            <h2 class="text-4xl font-bold mb-2 bg-gradient-to-r from-red-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
                <i class="fas fa-database mr-2"></i>Data Management
            </h2>
            <p class="text-gray-400">View, verify, and delete all uploaded data</p>
        </div>
        
        <!-- Tab Navigation -->
        <div class="mb-6 flex flex-wrap gap-2">
            <button onclick="showDataTab('messages')" class="data-tab-btn active px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-comments mr-2"></i>Messages
            </button>
            <button onclick="showDataTab('daily-reports')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-file-alt mr-2"></i>Daily Reports
            </button>
            <button onclick="showDataTab('link-tracking')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-link mr-2"></i>Link Tracking
            </button>
            <button onclick="showDataTab('traffic-sources')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-bullseye mr-2"></i>Traffic Sources
            </button>
            <button onclick="showDataTab('vip-fans')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-star mr-2"></i>VIP Fans
            </button>
        </div>
        
        <!-- Messages Tab -->
        <div id="dataTab-messages" class="data-tab-content">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold flex items-center">
                        <i class="fas fa-comments text-blue-400 mr-2"></i>
                        Uploaded Messages
                    </h3>
                    <button onclick="refreshDataTab('messages')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Chatter</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Week</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Messages</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Creator</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="messagesTableBody">
                            <tr><td colspan="5" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Daily Reports Tab -->
        <div id="dataTab-daily-reports" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold flex items-center">
                        <i class="fas fa-file-alt text-purple-400 mr-2"></i>
                        Daily Sales Reports
                    </h3>
                    <button onclick="refreshDataTab('daily-reports')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Chatter</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Shift</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">PPVs</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Tips</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Revenue</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="dailyReportsTableBody">
                            <tr><td colspan="7" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Sales Logs Tab -->
        <div id="dataTab-sales-logs" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6 border border-yellow-500/30">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h3 class="text-xl font-bold flex items-center">
                            <i class="fas fa-dollar-sign text-yellow-400 mr-2"></i>
                            Individual Sales Logs
                        </h3>
                        <p class="text-sm text-gray-400 mt-1">All individual sales - Find and remove duplicates</p>
                    </div>
                    <button onclick="refreshDataTab('sales-logs')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Uploaded</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Sale Date</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Model</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Chatter</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Fan</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Type</th>
                                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Amount</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Source</th>
                                <th class="px-3 py-2 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="salesLogsTableBody">
                            <tr><td colspan="9" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Link Tracking Tab -->
        <div id="dataTab-link-tracking" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold flex items-center">
                        <i class="fas fa-link text-cyan-400 mr-2"></i>
                        Link Tracking Data
                    </h3>
                    <button onclick="refreshDataTab('link-tracking')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Category</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Week</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Views</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Clicks</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">CTR</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="linkTrackingTableBody">
                            <tr><td colspan="6" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Traffic Sources Tab -->
        <div id="dataTab-traffic-sources" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold flex items-center">
                        <i class="fas fa-bullseye text-orange-400 mr-2"></i>
                        Traffic Sources
                    </h3>
                    <button onclick="refreshDataTab('traffic-sources')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Name</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Category</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Subcategory</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Status</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="trafficSourcesTableBody">
                            <tr><td colspan="5" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- VIP Fans Tab -->
        <div id="dataTab-vip-fans" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold flex items-center">
                        <i class="fas fa-star text-yellow-400 mr-2"></i>
                        VIP Fans
                    </h3>
                    <button onclick="refreshDataTab('vip-fans')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Traffic Source</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Lifetime Spend</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Purchases</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Status</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="vipFansTableBody">
                            <tr><td colspan="6" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ==================== TRAFFIC SOURCES SECTION ====================

function createTrafficSourcesSection() {
    return `
        <div class="mb-8">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        <i class="fas fa-bullseye mr-2"></i>Traffic Sources
                    </h2>
                    <p class="text-gray-400">Manage marketing channels and track performance</p>
                </div>
                <button onclick="showAddTrafficSourceModal()" class="premium-button text-white font-medium py-3 px-6 rounded-xl hover:scale-105 transition-transform">
                    <i class="fas fa-plus mr-2"></i>Add Source
                </button>
            </div>
        </div>
        
        <!-- Category Tabs -->
        <div class="mb-6 flex flex-wrap gap-2">
            <button onclick="filterTrafficSources('all')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium">
                All Sources
            </button>
            <button onclick="filterTrafficSources('reddit')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all">
                <i class="fab fa-reddit mr-1"></i>Reddit
            </button>
            <button onclick="filterTrafficSources('twitter')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all">
                <i class="fab fa-twitter mr-1"></i>Twitter
            </button>
            <button onclick="filterTrafficSources('instagram')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all">
                <i class="fab fa-instagram mr-1"></i>Instagram
            </button>
            <button onclick="filterTrafficSources('tiktok')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all">
                <i class="fab fa-tiktok mr-1"></i>TikTok
            </button>
            <button onclick="filterTrafficSources('youtube')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all">
                <i class="fab fa-youtube mr-1"></i>YouTube
            </button>
            <button onclick="filterTrafficSources('other')" class="traffic-source-filter px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all">
                <i class="fas fa-globe mr-1"></i>Other
            </button>
        </div>
        
        <!-- Traffic Sources Grid -->
        <div id="trafficSourcesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Will be populated dynamically -->
        </div>
        
        <!-- Add/Edit Modal -->
        <div id="trafficSourceModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden items-center justify-center z-50" style="display: none;">
            <div class="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-purple-500/30 shadow-2xl">
                <h3 class="text-2xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    <span id="modalTitle">Add Traffic Source</span>
                </h3>
                <form id="trafficSourceForm" class="space-y-4">
                    <input type="hidden" id="editSourceId">
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">Source Name</label>
                        <input type="text" id="sourceName" required placeholder="e.g., Reddit - r/fitness"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">Category</label>
                        <select id="sourceCategory" required
                                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all">
                            <option value="">Select category...</option>
                            <option value="reddit">Reddit</option>
                            <option value="twitter">Twitter</option>
                            <option value="threads">Threads</option>
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">Subcategory <span class="text-gray-500 font-normal">(optional)</span></label>
                        <input type="text" id="sourceSubcategory" placeholder="e.g., r/fitness, thread_id"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all">
                    </div>
                    <div class="flex gap-3 pt-4">
                        <button type="submit" class="flex-1 premium-button text-white font-medium py-3 px-6 rounded-xl">
                            <i class="fas fa-save mr-2"></i>Save
                        </button>
                        <button type="button" onclick="closeTrafficSourceModal()" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-6 rounded-xl transition-all">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// ==================== MARKETING DASHBOARD HTML ====================


// ==================== DATA MANAGEMENT HTML ====================

function createDataManagementSection() {
    return `
        <div class="mb-8">
            <h2 class="text-4xl font-bold mb-2 bg-gradient-to-r from-red-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
                <i class="fas fa-database mr-2"></i>Data Management
            </h2>
            <p class="text-gray-400">View, verify, and delete all uploaded data</p>
        </div>
        
        <!-- Tab Navigation -->
        <div class="mb-6 flex flex-wrap gap-2">
            <button onclick="showDataTab('messages')" class="data-tab-btn active px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-comments mr-2"></i>Messages
            </button>
            <button onclick="showDataTab('daily-reports')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-file-alt mr-2"></i>Daily Reports
            </button>
            <button onclick="showDataTab('sales-logs')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all bg-yellow-600/20 border border-yellow-500/30">
                <i class="fas fa-dollar-sign mr-2"></i>Sales Logs (Find Duplicates)
            </button>
            <button onclick="showDataTab('chatter-performance')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-chart-line mr-2"></i>Chatter Performance
            </button>
            <button onclick="showDataTab('daily-snapshots')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-camera mr-2"></i>Daily Snapshots
            </button>
            <button onclick="showDataTab('link-tracking')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-link mr-2"></i>Link Tracking
            </button>
            <button onclick="showDataTab('vip-fans')" class="data-tab-btn px-6 py-3 rounded-xl font-medium transition-all">
                <i class="fas fa-star mr-2"></i>VIP Fans
            </button>
        </div>
        
        <!-- Messages Tab -->
        <div id="dataTab-messages" class="data-tab-content">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold">
                        <i class="fas fa-comments text-blue-400 mr-2"></i>Uploaded Messages
                    </h3>
                    <button onclick="refreshDataTab('messages')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Chatter</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Week</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Messages</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="messagesTableBody">
                            <tr><td colspan="4" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Daily Reports Tab -->
        <div id="dataTab-daily-reports" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold">
                        <i class="fas fa-file-alt text-purple-400 mr-2"></i>Daily Sales Reports
                    </h3>
                    <button onclick="refreshDataTab('daily-reports')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Creator</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Chatter</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Shift</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Revenue</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="dailyReportsTableBody">
                            <tr><td colspan="6" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Chatter Performance Tab -->
        <div id="dataTab-chatter-performance" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold">
                        <i class="fas fa-chart-line text-blue-400 mr-2"></i>Chatter Performance Data
                    </h3>
                    <button onclick="refreshDataTab('chatter-performance')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Chatter</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Week</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Messages</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">PPVs Sent</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Unlocked</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Unlock %</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="chatterPerformanceTableBody">
                            <tr><td colspan="7" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Daily Snapshots Tab -->
        <div id="dataTab-daily-snapshots" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold">
                        <i class="fas fa-camera text-green-400 mr-2"></i>Daily Account Snapshots
                    </h3>
                    <button onclick="refreshDataTab('daily-snapshots')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Creator</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Date</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Subs</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Active Fans</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Total Revenue</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="dailySnapshotsTableBody">
                            <tr><td colspan="6" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Link Tracking Tab -->
        <div id="dataTab-link-tracking" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold">
                        <i class="fas fa-link text-cyan-400 mr-2"></i>Link Tracking Data
                    </h3>
                    <button onclick="refreshDataTab('link-tracking')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Category</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Week</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Views</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Clicks</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="linkTrackingTableBody">
                            <tr><td colspan="5" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- VIP Fans Tab -->
        <div id="dataTab-vip-fans" class="data-tab-content hidden">
            <div class="glass-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold">
                        <i class="fas fa-star text-yellow-400 mr-2"></i>VIP Fans
                    </h3>
                    <button onclick="refreshDataTab('vip-fans')" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all">
                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Lifetime</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Purchases</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="vipFansTableBody">
                            <tr><td colspan="4" class="text-center py-8 text-gray-400">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function createTeamManagementSection() {
    return `
        <div class="mb-8">
            <h2 class="text-3xl font-bold mb-2">Team Management</h2>
            <p class="text-gray-400">Manage team accounts and permissions</p>
        </div>
        <div class="glass-card rounded-xl p-6 mb-8">
            <h3 class="text-xl font-semibold mb-4">Create New Team Member</h3>
            <form id="createUserForm" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Role</label>
                        <select id="createRole" required onchange="toggleChatterNameField()"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                            <option value="">Select Role...</option>
                            <option value="chatter">Chatter</option>
                            <option value="marketer">Marketer</option>
                        </select>
                    </div>
                    <div id="chatterNameField">
                        <label class="block text-sm font-medium mb-2">Chatter Name</label>
                        <input type="text" id="createChatterName"
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                        <p class="text-xs text-gray-400 mt-1">Only required for chatters</p>
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
                <button type="button" onclick="handleCreateUserDirect()" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
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
        
        <!-- Danger Zone -->
        <div class="glass-card rounded-xl p-6 mt-8 border-2 border-red-500/30">
            <h3 class="text-xl font-semibold mb-4 text-red-400">
                <i class="fas fa-exclamation-triangle mr-2"></i>Danger Zone
            </h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between p-4 bg-red-900/20 rounded-lg">
                    <div>
                        <h4 class="font-medium text-red-300">Wipe All Data</h4>
                        <p class="text-sm text-gray-400">Delete all operational data (keeps Messages, Analysis, Users, Creators)</p>
                    </div>
                    <button onclick="wipeProductionData()" class="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-xl transition-all">
                        <i class="fas fa-trash mr-2"></i>Wipe Data
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Wipe Production Data Function
async function wipeProductionData() {
    if (!confirm('⚠️ WARNING: This will delete ALL operational data!\n\nThis will DELETE:\n- Daily Reports\n- Account Data\n- Traffic Sources\n- VIP Fans\n- Fan Purchases\n- Link Tracking\n- Daily Snapshots\n\nThis will KEEP:\n- Messages & Analysis\n- Users & Chatters\n- Creator Accounts\n\nAre you sure?')) {
        return;
    }
    
    if (!confirm('🚨 FINAL WARNING: This cannot be undone!\n\nClick OK to proceed with data wipe.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/admin/wipe-data', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('✅ Data wiped successfully! Deleted ' + result.deleted.total + ' documents', 'success');
            console.log('📊 Wipe Results:', result);
            
            // Reload page after 2 seconds
            setTimeout(function() {
                location.reload();
            }, 2000);
        } else {
            showError(result.error || 'Failed to wipe data');
        }
    } catch (error) {
        console.error('❌ Wipe error:', error);
        showError('Connection error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function createChatterDashboardSection() {
    // Load team dashboard data on mount
    setTimeout(() => {
        // First populate the selectors
        if (availableWeeks.length === 0) {
            loadAvailablePeriods().then(() => {
                populateTeamWeekSelector();
                populateTeamMonthSelector();
                updateTeamFilterDisplay();
                loadTeamDashboard();
            });
        } else {
            populateTeamWeekSelector();
            populateTeamMonthSelector();
            updateTeamFilterDisplay();
            loadTeamDashboard();
        }
    }, 100);
    
    return `
        <div class="mb-8">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 class="text-4xl font-black mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                        Team Performance Dashboard
                    </h2>
                    <p class="text-gray-400">Combined analytics across all chatters</p>
                </div>
                
                <!-- Time Period Selector -->
                <div class="flex flex-wrap gap-2 items-center">
                    <span class="text-sm font-medium text-gray-400 mr-2">Time Period:</span>
                    <button onclick="setTeamDashInterval('24h')" class="team-interval-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="24h">24h</button>
                    <button onclick="setTeamDashInterval('7d')" class="team-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7d</button>
                    <button onclick="setTeamDashInterval('30d')" class="team-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30d</button>
                    <button onclick="setTeamDashInterval('custom')" class="team-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                        <i class="fas fa-calendar mr-1 text-xs"></i>Custom
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Loading State -->
        <div id="teamDashboardLoading" class="flex items-center justify-center py-20">
            <div class="text-center">
                <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
                <div class="text-gray-400">Loading team performance...</div>
            </div>
        </div>
        
        <!-- Team Dashboard Content -->
        <div id="teamDashboardContent" class="hidden">
            <!-- Team Metrics Grid -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8" id="teamMetricsGrid">
                <!-- Metrics will be dynamically inserted here -->
            </div>
            
            <!-- Individual Chatter Tabs -->
            <div class="glass-card rounded-xl p-6 border border-purple-500/20">
                <h3 class="text-2xl font-bold mb-6 flex items-center">
                    <i class="fas fa-users text-purple-400 mr-3"></i>
                    Individual Performance
                </h3>
                
                <!-- Chatter Tabs -->
                <div class="flex overflow-x-auto space-x-2 mb-6 pb-2" id="chatterTabsContainer">
                    <!-- Tabs will be dynamically inserted here -->
                </div>
                
                <!-- Chatter Content -->
                <div id="chatterContentContainer">
                    <!-- Individual chatter data will be displayed here -->
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
                        <h3 class="text-lg font-semibold">Tips (Optional)</h3>
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
                    <button type="button" onclick="handleDailyReportSubmitDirect()" class="premium-button text-white font-medium py-3 px-6 rounded-xl">
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


// ==================== TEAM DASHBOARD FUNCTIONS ====================

let currentTeamInterval = '7d';
let currentTeamDateRange = null;
let currentChatterTab = null;

// Team Dashboard Custom Date Picker Functions
function applyTeamDateFilter() {
    const startDate = document.getElementById('teamStartDate').value;
    const endDate = document.getElementById('teamEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    // Set custom filter
    currentFilterType = 'custom';
    currentWeekFilter = null;
    currentMonthFilter = null;
    customDateRange = {
        start: startDate,
        end: endDate
    };
    
    console.log('✅ Team custom date filter applied:', customDateRange);
    loadTeamDashboard();
}

function setTeamQuickFilter(type) {
    const today = new Date();
    let startDate, endDate;
    
    if (type === 'week') {
        const dayOfWeek = today.getDay();
        startDate = new Date(today);
        startDate.setDate(today.getDate() - dayOfWeek);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
    } else if (type === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    document.getElementById('teamStartDate').value = formatDate(startDate);
    document.getElementById('teamEndDate').value = formatDate(endDate);
    
    applyTeamDateFilter();
}

function initializeTeamDatePicker() {
    setTeamQuickFilter('week');
}

// Populate team week selector dropdown
function populateTeamWeekSelector() {
    const selector = document.getElementById('teamWeekSelector');
    if (!selector) {
        console.log('⚠️ TEAM week selector not found in DOM');
        return;
    }
    
    console.log('📅 Populating TEAM week selector with', availableWeeks.length, 'weeks');
    selector.innerHTML = '<option value="">Select Week...</option>';
    availableWeeks.forEach(week => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ start: week.start, end: week.end });
        option.textContent = week.label;
        // Select if this is the current filter
        if (currentWeekFilter && week.start === currentWeekFilter.start) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
    
    // Add change listener (only once)
    selector.replaceWith(selector.cloneNode(true)); // Remove old listeners
    document.getElementById('teamWeekSelector').addEventListener('change', (e) => {
        if (e.target.value) {
            const week = JSON.parse(e.target.value);
            selectWeek(week);
            const monthSelector = document.getElementById('teamMonthSelector');
            if (monthSelector) monthSelector.value = '';
        }
    });
}

// Populate team month selector dropdown
function populateTeamMonthSelector() {
    const selector = document.getElementById('teamMonthSelector');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Select Month...</option>';
    availableMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ firstDay: month.firstDay, lastDay: month.lastDay });
        option.textContent = month.label;
        // Select if this is the current filter
        if (currentMonthFilter && month.firstDay === currentMonthFilter.firstDay) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
    
    // Add change listener (only once)
    selector.replaceWith(selector.cloneNode(true)); // Remove old listeners
    document.getElementById('teamMonthSelector').addEventListener('change', (e) => {
        if (e.target.value) {
            const month = JSON.parse(e.target.value);
            selectMonth(month);
            const weekSelector = document.getElementById('teamWeekSelector');
            if (weekSelector) weekSelector.value = '';
        }
    });
}

// Update team filter display
function updateTeamFilterDisplay() {
    const display = document.getElementById('teamCurrentFilterDisplay');
    const text = document.getElementById('teamCurrentFilterText');
    if (!display || !text) return;
    
    if (currentFilterType === 'week' && currentWeekFilter) {
        text.textContent = `Week: ${new Date(currentWeekFilter.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(currentWeekFilter.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        display.classList.remove('hidden');
    } else if (currentFilterType === 'month' && currentMonthFilter) {
        text.textContent = `Month: ${new Date(currentMonthFilter.firstDay).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        display.classList.remove('hidden');
    } else {
        display.classList.add('hidden');
    }
}

// Load team dashboard data
async function loadTeamDashboard() {
    const loading = document.getElementById('teamDashboardLoading');
    const content = document.getElementById('teamDashboardContent');
    
    if (loading) loading.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    
    // Populate team selectors if available
    if (availableWeeks.length > 0) {
        populateTeamWeekSelector();
        populateTeamMonthSelector();
        updateTeamFilterDisplay();
    }
    
    try {
        // Use currentTeamDashInterval and calculate date range
        const today = new Date();
        let startDate, endDate = today;
        
        if (currentTeamDashInterval === 'custom' && teamDashCustomDates) {
            startDate = new Date(teamDashCustomDates.start);
            endDate = new Date(teamDashCustomDates.end);
        } else if (currentTeamDashInterval === '24h') {
            startDate = new Date(today);
            startDate.setHours(today.getHours() - 24);
        } else if (currentTeamDashInterval === '7d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        } else if (currentTeamDashInterval === '30d') {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
        } else {
            // Default to 7 days
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
        }
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        const url = `/api/analytics/team-dashboard?filterType=custom&customStart=${formatDate(startDate)}&customEnd=${formatDate(endDate)}&_t=${Date.now()}`;
        
        console.log('Team Dashboard URL:', url);
        console.log('Team Dashboard interval:', currentTeamDashInterval);
        console.log('Date range:', formatDate(startDate), 'to', formatDate(endDate));
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('Team Dashboard response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Team Dashboard error response:', errorText);
            throw new Error(`Failed to load team dashboard: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Team dashboard data:', data);
        
        // Cache the data for tab switching
        latestTeamDashboardData = data;
        
        renderTeamMetrics(data.teamMetrics);
        renderChatterTabs(data.chatters);
        
        if (loading) loading.classList.add('hidden');
        if (content) content.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading team dashboard:', error);
        showError('Failed to load team dashboard');
        if (loading) loading.classList.add('hidden');
    }
}

// Render team-wide metrics - REDESIGNED FOR MILLION DOLLAR LOOK
function renderTeamMetrics(metrics) {
    const grid = document.getElementById('teamMetricsGrid');
    if (!grid) return;
    
    console.log('🎨 renderTeamMetrics called with scores:', {
        grammar: metrics.avgGrammarScore,
        guidelines: metrics.avgGuidelinesScore,
        overall: metrics.avgOverallScore
    });
    
    // Green-to-red color scheme based on quality (0-100 scale)
    const getScoreColor = (score) => {
        if (score === null || score === undefined) return 'text-gray-400';
        if (score >= 80) return 'text-green-400'; // 80+/100 - Excellent
        if (score >= 70) return 'text-yellow-400'; // 70-79/100 - Good
        if (score >= 50) return 'text-orange-400'; // 50-69/100 - Needs Improvement
        return 'text-red-400'; // <50/100 - Critical
    };
    
    const getScoreBg = (score) => {
        if (score === null || score === undefined) return 'from-gray-500/10 to-gray-600/10 border-gray-500/20';
        if (score >= 80) return 'from-green-500/10 to-green-600/10 border-green-500/20';
        if (score >= 70) return 'from-yellow-500/10 to-yellow-600/10 border-yellow-500/20';
        if (score >= 50) return 'from-orange-500/10 to-orange-600/10 border-orange-500/20';
        return 'from-red-500/10 to-red-600/10 border-red-500/20';
    };
    
    const getScoreGradient = (score) => {
        if (score === null || score === undefined) return 'from-gray-500 to-gray-600';
        if (score >= 80) return 'from-green-500 to-green-600';
        if (score >= 70) return 'from-yellow-500 to-yellow-600';
        if (score >= 50) return 'from-orange-500 to-orange-600';
        return 'from-red-500 to-red-600';
    };
    
    // Render change badge (green for positive, red for negative)
    const renderChange = (changeValue) => {
        if (!changeValue || changeValue === '0.0') return '';
        const change = parseFloat(changeValue);
        const isPositive = change > 0;
        const color = isPositive ? 'text-green-400' : 'text-red-400';
        const icon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
        return `<span class="ml-2 text-xs font-semibold ${color}">
            <i class="fas ${icon}"></i> ${Math.abs(change).toFixed(1)}%
        </span>`;
    };
    
    const changes = metrics.changes || {};
    
    const metricsHTML = `
        <!-- Total Revenue - REDESIGNED WITH CHANGE -->
        <div class="group relative overflow-hidden rounded-xl p-3 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-purple-500/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/20 backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30">
                        <i class="fas fa-dollar-sign text-purple-400 text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold text-white mb-0.5">
                    ${metrics.totalRevenue > 0 ? '$' + metrics.totalRevenue.toLocaleString() : '$0'}
                    ${renderChange(changes.totalRevenue)}
                </div>
                <div class="text-[11px] text-gray-400 font-medium">Total Revenue</div>
            </div>
        </div>
        
        <!-- PPV Unlock Rate - REDESIGNED WITH CHANGE -->
        <div class="group relative overflow-hidden rounded-xl p-3 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-blue-500/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-blue-500/20 backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30">
                        <i class="fas fa-unlock text-blue-400 text-sm"></i>
                    </div>
                    <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">${metrics.ppvsUnlocked}/${metrics.ppvsSent}</span>
                </div>
                <div class="text-2xl font-bold text-white mb-0.5">
                    ${metrics.unlockRate.toFixed(1)}<span class="text-lg text-blue-300">%</span>
                    ${renderChange(changes.unlockRate)}
                </div>
                <div class="text-[11px] text-gray-400 font-medium">PPV Unlock Rate</div>
            </div>
        </div>
        
        <!-- Avg Response Time - REDESIGNED WITH CHANGE -->
        <div class="group relative overflow-hidden rounded-xl p-3 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-purple-500/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/20 backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30">
                        <i class="fas fa-clock text-purple-400 text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold text-white mb-0.5">
                    ${metrics.avgResponseTime.toFixed(1)}<span class="text-lg text-purple-300 ml-0.5">min</span>
                    ${renderChange(changes.avgResponseTime)}
                </div>
                <div class="text-[11px] text-gray-400 font-medium">Response Time</div>
            </div>
        </div>
        
        <!-- Grammar Score - GREEN TO RED GRADIENT -->
        <div class="group relative overflow-hidden rounded-xl p-3 border ${getScoreBg(metrics.avgGrammarScore)} bg-gradient-to-br from-slate-800/80 to-slate-900/80 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br ${getScoreGradient(metrics.avgGrammarScore)}/20">
                        <i class="fas fa-spell-check ${getScoreColor(metrics.avgGrammarScore)} text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold ${getScoreColor(metrics.avgGrammarScore)} mb-0.5">${Math.round(metrics.avgGrammarScore)}<span class="text-lg text-gray-400">/100</span></div>
                <div class="text-[11px] text-gray-400 font-medium">Grammar Score</div>
            </div>
        </div>
        
        <!-- Guidelines Score - GREEN TO RED GRADIENT -->
        <div class="group relative overflow-hidden rounded-xl p-3 border ${getScoreBg(metrics.avgGuidelinesScore)} bg-gradient-to-br from-slate-800/80 to-slate-900/80 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br ${getScoreGradient(metrics.avgGuidelinesScore)}/20">
                        <i class="fas fa-clipboard-check ${getScoreColor(metrics.avgGuidelinesScore)} text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold ${getScoreColor(metrics.avgGuidelinesScore)} mb-0.5">${Math.round(metrics.avgGuidelinesScore)}<span class="text-lg text-gray-400">/100</span></div>
                <div class="text-[11px] text-gray-400 font-medium">Guidelines Score</div>
            </div>
        </div>
        
        <!-- Overall Score - GREEN TO RED GRADIENT -->
        <div class="group relative overflow-hidden rounded-xl p-3 border ${getScoreBg(metrics.avgOverallScore)} bg-gradient-to-br from-slate-800/80 to-slate-900/80 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br ${getScoreGradient(metrics.avgOverallScore)}/20">
                        <i class="fas fa-star ${getScoreColor(metrics.avgOverallScore)} text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold ${getScoreColor(metrics.avgOverallScore)} mb-0.5">${Math.round(metrics.avgOverallScore)}<span class="text-lg text-gray-400">/100</span></div>
                <div class="text-[11px] text-gray-400 font-medium">Overall Score</div>
            </div>
        </div>
        
        <!-- Avg PPV Price - COMPACT SLATE/PURPLE/BLUE WITH CHANGE -->
        <div class="group relative overflow-hidden rounded-xl p-3 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-blue-500/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-blue-500/20 backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30">
                        <i class="fas fa-tag text-blue-400 text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold text-white mb-0.5">
                    ${metrics.avgPPVPrice > 0 ? '$' + metrics.avgPPVPrice.toFixed(2) : '$0'}
                    ${renderChange(changes.avgPPVPrice)}
                </div>
                <div class="text-[11px] text-gray-400 font-medium">Avg PPV Price</div>
            </div>
        </div>
        
        <!-- Fans Chatted - COMPACT SLATE/PURPLE/BLUE -->
        <div class="group relative overflow-hidden rounded-xl p-3 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-purple-500/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/20 backdrop-blur-sm">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30">
                        <i class="fas fa-users text-purple-400 text-sm"></i>
                    </div>
                </div>
                <div class="text-2xl font-bold text-white mb-0.5">${metrics.fansChatted.toLocaleString()}</div>
                <div class="text-[11px] text-gray-400 font-medium">Fans Chatted</div>
            </div>
        </div>
        
        <!-- Top Performer - COMPACT SLATE/PURPLE/BLUE -->
        ${metrics.topPerformer ? `
        <div class="group relative overflow-hidden rounded-xl p-3 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-purple-500/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/20 backdrop-blur-sm col-span-2">
            <div class="relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30">
                        <i class="fas fa-trophy text-purple-400 text-sm"></i>
                    </div>
                    <span class="text-xl">🏆</span>
                </div>
                <div class="text-2xl font-bold text-purple-400 mb-0.5">${metrics.topPerformer.name || metrics.topPerformer}</div>
                <div class="text-[11px] text-gray-400 font-medium">Top Performer • $${((metrics.topPerformer.revenue || 0)).toLocaleString()}</div>
            </div>
        </div>
        ` : ''}
        
    `;
    
    grid.innerHTML = metricsHTML;
}

// Render chatter tabs
function renderChatterTabs(chatters) {
    const tabsContainer = document.getElementById('chatterTabsContainer');
    const contentContainer = document.getElementById('chatterContentContainer');
    
    if (!tabsContainer || !contentContainer) return;
    
    // Create tabs
    const tabsHTML = chatters.map((chatter, index) => {
        const isActive = index === 0;
        return `
            <button 
                onclick="switchChatterTab('${chatter.chatterName}')" 
                class="chatter-tab px-4 py-2 rounded-lg font-medium transition-all ${isActive ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
                data-chatter="${chatter.chatterName}">
                ${chatter.chatterName}
            </button>
        `;
    }).join('');
    
    tabsContainer.innerHTML = tabsHTML;
    
    // Show first chatter by default
    if (chatters.length > 0) {
        currentChatterTab = chatters[0].chatterName;
        renderChatterContent(chatters[0]);
    }
}

// Store the latest team dashboard data for tab switching
let latestTeamDashboardData = null;

// Switch chatter tab
function switchChatterTab(chatterName) {
    currentChatterTab = chatterName;
    
    // Update tab styles
    document.querySelectorAll('.chatter-tab').forEach(tab => {
        if (tab.dataset.chatter === chatterName) {
            tab.classList.remove('bg-gray-700', 'text-gray-300');
            tab.classList.add('bg-purple-500', 'text-white');
        } else {
            tab.classList.remove('bg-purple-500', 'text-white');
            tab.classList.add('bg-gray-700', 'text-gray-300');
        }
    });
    
    // Use cached data instead of making a new API call
    if (latestTeamDashboardData) {
        const chatter = latestTeamDashboardData.chatters.find(c => c.chatterName === chatterName);
        if (chatter) {
            console.log('📊 Switching to chatter:', chatterName, 'Data:', chatter);
            renderChatterContent(chatter);
        } else {
            console.warn('❌ Chatter not found in cached data:', chatterName);
        }
    } else {
        console.warn('❌ No cached team dashboard data available');
    }
}

// Render individual chatter content
function renderChatterContent(chatter) {
    const container = document.getElementById('chatterContentContainer');
    if (!container) return;
    
    const getScoreColor = (score) => {
        if (score === null || score === undefined) return 'text-gray-400';
        if (score >= 85) return 'text-emerald-400'; // 85+/100
        if (score >= 70) return 'text-yellow-400'; // 70-84/100
        return 'text-red-400'; // Below 70/100
    };
    
    const getScoreBadge = (score) => {
        if (score === null || score === undefined) return '⚪';
        if (score >= 85) return '✨'; // 85+/100
        if (score >= 70) return '⚡'; // 70-84/100
        return '🔴'; // Below 70/100
    };
    
    const formatScore = (score) => {
        if (score === null || score === undefined) return 'No data yet';
        return Math.round(score);
    };
    
    const formatDate = (dateStr) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };
    
    const contentHTML = `
        <!-- Chatter Analytics - REDESIGNED -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div class="relative overflow-hidden p-3 bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 hover:border-purple-500/30 transition-all">
                <div class="flex items-center mb-2">
                    <div class="p-1.5 rounded-lg bg-purple-500/20 mr-2">
                        <i class="fas fa-dollar-sign text-purple-400 text-xs"></i>
                    </div>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Revenue</div>
                </div>
                <div class="text-xl font-bold text-white">${chatter.revenue > 0 ? '$' + chatter.revenue.toLocaleString() : '$0'}</div>
            </div>
            <div class="relative overflow-hidden p-3 bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 hover:border-blue-500/30 transition-all">
                <div class="flex items-center mb-2">
                    <div class="p-1.5 rounded-lg bg-blue-500/20 mr-2">
                        <i class="fas fa-unlock text-blue-400 text-xs"></i>
                    </div>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Unlock Rate</div>
                </div>
                <div class="text-xl font-bold text-white">${chatter.unlockRate.toFixed(1)}%</div>
            </div>
            <div class="relative overflow-hidden p-3 bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 hover:border-cyan-500/30 transition-all">
                <div class="flex items-center mb-2">
                    <div class="p-1.5 rounded-lg bg-cyan-500/20 mr-2">
                        <i class="fas fa-comments text-cyan-400 text-xs"></i>
                    </div>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Messages</div>
                </div>
                <div class="text-xl font-bold text-white">${chatter.messagesSent.toLocaleString()}</div>
            </div>
            <div class="relative overflow-hidden p-3 bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 hover:border-indigo-500/30 transition-all">
                <div class="flex items-center mb-2">
                    <div class="p-1.5 rounded-lg bg-indigo-500/20 mr-2">
                        <i class="fas fa-clock text-indigo-400 text-xs"></i>
                    </div>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Response Time</div>
                </div>
                <div class="text-xl font-bold text-white">${chatter.avgResponseTime.toFixed(1)}<span class="text-sm text-gray-400">min</span></div>
            </div>
        </div>
        
        <!-- Scores - REDESIGNED -->
        <div class="grid grid-cols-3 gap-3 mb-6">
            <div class="relative overflow-hidden p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700/50 hover:border-purple-500/50 transition-all">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Grammar</div>
                    <div class="text-2xl">${getScoreBadge(chatter.grammarScore)}</div>
                </div>
                <div class="text-3xl font-black ${getScoreColor(chatter.grammarScore)} mb-1">${formatScore(chatter.grammarScore)}</div>
                <div class="text-[10px] text-gray-500 uppercase">${chatter.grammarScore ? '/100' : ''}</div>
            </div>
            <div class="relative overflow-hidden p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700/50 hover:border-purple-500/50 transition-all">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Guidelines</div>
                    <div class="text-2xl">${getScoreBadge(chatter.guidelinesScore)}</div>
                </div>
                <div class="text-3xl font-black ${getScoreColor(chatter.guidelinesScore)} mb-1">${formatScore(chatter.guidelinesScore)}</div>
                <div class="text-[10px] text-gray-500 uppercase">${chatter.guidelinesScore ? '/100' : ''}</div>
            </div>
            <div class="relative overflow-hidden p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700/50 hover:border-purple-500/50 transition-all">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Overall</div>
                    <div class="text-2xl">${getScoreBadge(chatter.overallScore)}</div>
                </div>
                <div class="text-3xl font-black ${getScoreColor(chatter.overallScore)} mb-1">${formatScore(chatter.overallScore)}</div>
                <div class="text-[10px] text-gray-500 uppercase">${chatter.overallScore ? '/100' : ''}</div>
            </div>
        </div>
        
        <!-- Last Analysis Report -->
        ${chatter.lastAnalysis ? `
        <div class="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
            <div class="flex items-center justify-between mb-4">
                <h4 class="text-lg font-bold text-white flex items-center">
                    <i class="fas fa-file-alt text-purple-400 mr-2"></i>
                    Last Analysis Report
                </h4>
                <div class="text-xs text-gray-400">${formatDate(chatter.lastAnalysis.timestamp)}</div>
            </div>
            
            <!-- Overall Breakdown -->
            ${chatter.lastAnalysis.overallBreakdown ? `
            <div class="mb-4">
                <h5 class="text-sm font-semibold text-gray-300 mb-2">Overall Summary</h5>
                <div class="text-sm text-gray-400">
                    ${chatter.lastAnalysis.overallBreakdown.scoreExplanation || 'No data available'}
                </div>
            </div>
            ` : ''}
            
            <!-- Grammar Breakdown -->
            ${chatter.lastAnalysis.grammarBreakdown ? `
            <div class="mb-4">
                <h5 class="text-sm font-semibold text-gray-300 mb-2">Grammar Analysis</h5>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">Spelling</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.grammarBreakdown.spellingErrors || 'N/A'}</div>
                    </div>
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">Grammar</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.grammarBreakdown.grammarIssues || 'N/A'}</div>
                    </div>
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">Punctuation</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.grammarBreakdown.punctuationProblems || 'N/A'}</div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <!-- Guidelines Breakdown -->
            ${chatter.lastAnalysis.guidelinesBreakdown?.guidelinesBreakdownV2 ? `
            <div>
                <h5 class="text-sm font-semibold text-gray-300 mb-2">Guidelines Analysis</h5>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">General Chatting</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.guidelinesBreakdown.guidelinesBreakdownV2.generalChatting || 'N/A'}</div>
                    </div>
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">Psychology</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.guidelinesBreakdown.guidelinesBreakdownV2.psychology || 'N/A'}</div>
                    </div>
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">Captions</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.guidelinesBreakdown.guidelinesBreakdownV2.captions || 'N/A'}</div>
                    </div>
                    <div class="p-3 bg-gray-900/50 rounded">
                        <div class="text-xs text-gray-400 mb-1">Sales</div>
                        <div class="text-sm text-gray-300">${chatter.lastAnalysis.guidelinesBreakdown.guidelinesBreakdownV2.sales || 'N/A'}</div>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
        ` : `
        <div class="p-8 bg-gray-800/30 rounded-lg border border-gray-700 text-center">
            <i class="fas fa-inbox text-4xl text-gray-600 mb-3"></i>
            <div class="text-gray-400">No analysis report available for this chatter yet.</div>
        </div>
        `}
    `;
    
    container.innerHTML = contentHTML;
}

// Team date selector functions
function setTeamInterval(interval) {
    currentTeamInterval = interval;
    currentTeamDateRange = null;
    
    document.querySelectorAll('.team-time-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });
    
    document.querySelector(`.team-time-btn[data-interval="${interval}"]`).classList.remove('bg-gray-700', 'text-gray-300');
    document.querySelector(`.team-time-btn[data-interval="${interval}"]`).classList.add('bg-blue-600', 'text-white');
    
    loadTeamDashboard();
}

function toggleTeamCustomDatePicker() {
    const picker = document.getElementById('teamCustomDatePicker');
    if (picker) {
        picker.classList.toggle('hidden');
    }
}

function applyTeamCustomDateRange() {
    const startDate = document.getElementById('teamCustomStartDate').value;
    const endDate = document.getElementById('teamCustomEndDate').value;
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    currentTeamDateRange = { start: startDate, end: endDate };
    currentTeamInterval = 'custom';
    
    document.querySelectorAll('.team-time-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });
    
    document.querySelector('.team-time-btn[data-interval="custom"]').classList.remove('bg-gray-700', 'text-gray-300');
    document.querySelector('.team-time-btn[data-interval="custom"]').classList.add('bg-blue-600', 'text-white');
    
    document.getElementById('teamCustomDatePicker').classList.add('hidden');
    
    loadTeamDashboard();
}

// ==================== END TEAM DASHBOARD FUNCTIONS ====================

// Toggle chatter name field visibility based on role
function toggleChatterNameField() {
    const role = document.getElementById('createRole')?.value;
    const chatterNameField = document.getElementById('chatterNameField');
    const chatterNameInput = document.getElementById('createChatterName');
    
    if (chatterNameField) {
        if (role === 'chatter') {
            chatterNameField.style.display = 'block';
            chatterNameInput.required = true;
        } else {
            chatterNameField.style.display = 'none';
            chatterNameInput.required = false;
            chatterNameInput.value = '';
        }
    }
}

// Form handlers
async function handleCreateUser(event) {
    const role = document.getElementById('createRole').value;
    const userData = {
        username: document.getElementById('createUsername').value,
        email: document.getElementById('createEmail').value,
        password: document.getElementById('createPassword').value,
        role: role
    };
    
    // Only add chatterName if role is chatter
    if (role === 'chatter') {
        userData.chatterName = document.getElementById('createChatterName').value;
    }

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
            showNotification(`${role.charAt(0).toUpperCase() + role.slice(1)} created successfully!`, 'success');
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

// Direct handler for create user button (bypasses event delegation)
async function handleCreateUserDirect() {
    console.log('🎯 Direct button handler called!');
    
    const role = document.getElementById('createRole').value;
    const username = document.getElementById('createUsername').value;
    const email = document.getElementById('createEmail').value;
    const password = document.getElementById('createPassword').value;
    
    // Validate required fields
    if (!role) {
        showError('Please select a role');
        return;
    }
    if (!username) {
        showError('Please enter a username');
        return;
    }
    if (!email) {
        showError('Please enter an email');
        return;
    }
    if (!password || password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }
    
    const userData = {
        username,
        email,
        password,
        role
    };
    
    // Only add chatterName if role is chatter
    if (role === 'chatter') {
        const chatterName = document.getElementById('createChatterName').value;
        if (!chatterName) {
            showError('Please enter a chatter name');
            return;
        }
        userData.chatterName = chatterName;
    }

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
            showNotification(`${role.charAt(0).toUpperCase() + role.slice(1)} created successfully!`, 'success');
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
            document.getElementById('guidelinePriority').value = '3';
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
                            Priority: ${guideline.weight || guideline.priority || 'N/A'}
                        </span>
                    </div>
                    <h4 class="font-semibold text-white mb-1">${guideline.title}</h4>
                    <p class="text-sm text-gray-300">${guideline.description}</p>
                </div>
                <button 
                    onclick="deleteGuideline('${guideline._id}')" 
                    class="ml-4 p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete guideline"
                >
                    <i class="fas fa-trash text-sm"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Delete individual guideline
async function deleteGuideline(guidelineId) {
    if (!confirm('Are you sure you want to delete this guideline? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/guidelines/${guidelineId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            showNotification('Guideline deleted successfully!', 'success');
            loadGuidelines(); // Reload the guidelines list
        } else {
            const result = await response.json();
            showError(result.error || 'Failed to delete guideline');
        }
    } catch (error) {
        console.error('Error deleting guideline:', error);
        showError('Failed to delete guideline');
    }
}



// Form handlers
async function handleOFAccountDataSubmit(event) {
    console.log('OF Account form submit triggered');
    
    const formData = {
        startDate: document.getElementById('ofAccountStartDate').value,
        endDate: document.getElementById('ofAccountEndDate').value,
        creator: document.getElementById('ofAccountCreator').value,
        recurringRevenue: parseFloat(document.getElementById('ofRecurringRevenue').value) || 0,
        totalSubs: parseInt(document.getElementById('ofTotalSubs').value) || 0,
        newSubs: parseInt(document.getElementById('ofNewSubs').value) || 0,
        dataType: 'of_account'
    };
    
    console.log('OF Account form data collected:', formData);

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

// Direct handler for OF Account Data button (bypasses event delegation)
async function handleOFAccountDataSubmitDirect() {
    console.log('🎯 OF Account Data direct button handler called!');
    
    const formData = {
        startDate: document.getElementById('ofAccountStartDate').value,
        endDate: document.getElementById('ofAccountEndDate').value,
        creator: document.getElementById('ofAccountCreator').value,
        recurringRevenue: parseFloat(document.getElementById('ofRecurringRevenue').value) || 0,
        totalSubs: parseInt(document.getElementById('ofTotalSubs').value) || 0,
        newSubs: parseInt(document.getElementById('ofNewSubs').value) || 0,
        dataType: 'of_account'
    };
    
    console.log('OF Account form data collected:', formData);

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

// Direct handler for Daily Snapshot button (bypasses event delegation)
async function handleDailySnapshotSubmitDirect() {
    console.log('🎯 Daily Snapshot direct button handler called!');
    
    const renewRateInput = document.getElementById('snapshotRenewRate').value;
    const recurringRevenueInput = document.getElementById('snapshotRecurringRevenue').value;
    
    const formData = {
        date: document.getElementById('snapshotDate').value,
        creator: document.getElementById('snapshotCreator').value,
        totalSubs: parseInt(document.getElementById('snapshotTotalSubs').value) || 0,
        activeFans: parseInt(document.getElementById('snapshotActiveFans').value) || 0,
        fansWithRenew: parseInt(document.getElementById('snapshotFansWithRenew').value) || 0,
        newSubsToday: parseInt(document.getElementById('snapshotNewSubs').value) || 0
    };
    
    // Only add renewRate if user provided it
    if (renewRateInput && renewRateInput.trim() !== '') {
        formData.renewRate = parseFloat(renewRateInput);
    }
    
    // Only add recurringRevenue if user provided it
    if (recurringRevenueInput && recurringRevenueInput.trim() !== '') {
        formData.recurringRevenue = parseFloat(recurringRevenueInput);
    }
    
    console.log('📊 Daily Snapshot form data:', formData);

    if (!formData.date || !formData.creator) {
        showError('Please fill in Date and Creator Account');
        return;
    }
    
    if (!formData.totalSubs || !formData.activeFans || !formData.fansWithRenew) {
        showError('Please fill in all subscriber metrics');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch('/api/analytics/daily-snapshot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            const renewRate = result.data.renewRate || 0;
            showNotification(`Daily snapshot saved! Renew rate: ${renewRate}%`, 'success');
            document.getElementById('dailySnapshotForm').reset();
            // Update dashboard if we're on it
            if (currentUser && currentUser.role === 'manager') {
                loadDashboardData();
            }
        } else {
            showError(result.error || 'Failed to save snapshot');
        }
    } catch (error) {
        console.error('Daily snapshot error:', error);
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleDailySnapshotSubmit(event) {
    console.log('📊 Daily Snapshot form submit triggered');
    
    const renewRateInput = document.getElementById('snapshotRenewRate').value;
    const recurringRevenueInput = document.getElementById('snapshotRecurringRevenue').value;
    
    const formData = {
        date: document.getElementById('snapshotDate').value,
        creator: document.getElementById('snapshotCreator').value,
        totalSubs: parseInt(document.getElementById('snapshotTotalSubs').value) || 0,
        activeFans: parseInt(document.getElementById('snapshotActiveFans').value) || 0,
        fansWithRenew: parseInt(document.getElementById('snapshotFansWithRenew').value) || 0,
        newSubsToday: parseInt(document.getElementById('snapshotNewSubs').value) || 0
    };
    
    // Only add renewRate if user provided it
    if (renewRateInput && renewRateInput.trim() !== '') {
        formData.renewRate = parseFloat(renewRateInput);
    }
    
    // Only add recurringRevenue if user provided it
    if (recurringRevenueInput && recurringRevenueInput.trim() !== '') {
        formData.recurringRevenue = parseFloat(recurringRevenueInput);
    }
    
    console.log('📊 Daily Snapshot form data:', formData);

    if (!formData.date || !formData.creator) {
        showError('Please fill in Date and Creator Account');
        return;
    }
    
    if (!formData.totalSubs || !formData.activeFans || !formData.fansWithRenew) {
        showError('Please fill in all subscriber metrics');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch('/api/analytics/daily-snapshot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            const renewRate = result.data.renewRate || 0;
            showNotification(`Daily snapshot saved! Renew rate: ${renewRate}%`, 'success');
            document.getElementById('dailySnapshotForm').reset();
            
            // Update dashboards if we're on them
            if (currentUser && currentUser.role === 'manager') {
                loadDashboardData();
            }
        } else {
            showError(result.error || 'Failed to submit snapshot');
        }
    } catch (error) {
        console.error('Daily snapshot error:', error);
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Direct handler for Chatter Data button (bypasses event delegation)
async function handleChatterDataSubmitDirect() {
    console.log('🎯 Chatter Data direct button handler called!');
    
    const chatterSelect = document.getElementById('chatterDataChatter');
    const selectedChatterText = chatterSelect.options[chatterSelect.selectedIndex].text;
    
    // Get form values and only include non-empty fields
    const messagesSentValue = document.getElementById('chatterMessagesSent').value;
    const ppvsSentValue = document.getElementById('chatterPPVsSent').value;
    const ppvsUnlockedValue = document.getElementById('chatterPPVsUnlocked').value;
    const fansChattedValue = document.getElementById('chatterFansChatted').value;
    const avgResponseTimeValue = document.getElementById('chatterAvgResponseTime').value;
    const netSalesValue = document.getElementById('chatterNetSales').value;

    const formData = {
        startDate: document.getElementById('chatterDataStartDate').value,
        endDate: document.getElementById('chatterDataEndDate').value,
        chatter: selectedChatterText,
        dataType: 'chatter'
    };
    
    console.log('📊 Chatter Performance Form Data:', formData);
    console.log('  Start Date:', formData.startDate);
    console.log('  End Date:', formData.endDate);
    console.log('  Chatter:', formData.chatter);

    // Only include fields that have values (not empty)
    if (messagesSentValue) formData.messagesSent = parseInt(messagesSentValue);
    if (ppvsSentValue) formData.ppvsSent = parseInt(ppvsSentValue);
    if (ppvsUnlockedValue) formData.ppvsUnlocked = parseInt(ppvsUnlockedValue);
    if (fansChattedValue) formData.fansChatted = parseInt(fansChattedValue);
    if (avgResponseTimeValue) formData.avgResponseTime = parseFloat(avgResponseTimeValue);
    if (netSalesValue) formData.netSales = parseFloat(netSalesValue);

    if (!formData.startDate || !formData.endDate || !formData.chatter || formData.chatter === 'Select Chatter...') {
        console.error('❌ Form validation failed - missing required fields');
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
            if (currentUser && currentUser.role === 'manager') {
                loadDashboardData();
            }
        } else {
            showError(result.error || 'Failed to submit data');
        }
    } catch (error) {
        console.error('Chatter data error:', error);
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleChatterDataSubmit(event) {
    const chatterSelect = document.getElementById('chatterDataChatter');
    const selectedChatterText = chatterSelect.options[chatterSelect.selectedIndex].text;
    
    // Get form values and only include non-empty fields
    const messagesSentValue = document.getElementById('chatterMessagesSent').value;
    const ppvsSentValue = document.getElementById('chatterPPVsSent').value;
    const ppvsUnlockedValue = document.getElementById('chatterPPVsUnlocked').value;
    const fansChattedValue = document.getElementById('chatterFansChatted').value;
    const avgResponseTimeValue = document.getElementById('chatterAvgResponseTime').value;
    const netSalesValue = document.getElementById('chatterNetSales').value;

    const formData = {
        startDate: document.getElementById('chatterDataStartDate').value,
        endDate: document.getElementById('chatterDataEndDate').value,
        chatter: selectedChatterText, // Use the name, not the ID!
        dataType: 'chatter'
    };

    // Only include fields that have values (not empty)
    if (messagesSentValue) formData.messagesSent = parseInt(messagesSentValue);
    if (ppvsSentValue) formData.ppvsSent = parseInt(ppvsSentValue);
    if (ppvsUnlockedValue) formData.ppvsUnlocked = parseInt(ppvsUnlockedValue);
    if (fansChattedValue) formData.fansChatted = parseInt(fansChattedValue);
    if (avgResponseTimeValue) formData.avgResponseTime = parseFloat(avgResponseTimeValue);
    if (netSalesValue) formData.netSales = parseFloat(netSalesValue);

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

// Direct handler for Messages Upload button (bypasses event delegation)
async function handleMessagesUploadDirect() {
    console.log('🎯 Messages Upload direct button handler called!');
    
    if (!authToken) {
        showError('Please log in first');
        return;
    }
    
    // Ensure employees are loaded before trying to upload
    const dropdown = document.getElementById('messagesChatter');
    if (dropdown && dropdown.options.length <= 1) {
        console.log('Dropdown empty, populating now...');
        if (cachedChatters.length > 0) {
            updateEmployeeDropdown('messagesChatter', cachedChatters);
        } else {
            await loadEmployees();
        }
    }
    
    const file = document.getElementById('messagesFile').files[0];
    const chatter = document.getElementById('messagesChatter').value;
    const startDate = document.getElementById('messagesStartDate').value;
    const endDate = document.getElementById('messagesEndDate').value;
    
    console.log('Form data:', { file: file?.name, chatter, startDate, endDate });
    
    if (!file) {
        showError('Please select a file first');
        return;
    }
    
    if (!chatter) {
        showError('Please select a chatter/employee');
        return;
    }
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showError('Start date cannot be after end date');
        return;
    }

    const formData = new FormData();
    formData.append('messages', file);
    formData.append('chatter', chatter);
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);

    showLoading(true);

    try {
        console.log('Sending request to /api/upload/messages');
        const response = await fetch('/api/upload/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response result:', result);

        if (response.ok) {
            showNotification('Message data uploaded successfully!', 'success');
            document.getElementById('messagesUploadForm').reset();
        } else {
            showError(result.error || 'Failed to upload messages');
        }
    } catch (error) {
        console.error('Messages upload error:', error);
        showError('Connection error. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function handleMessagesUpload(event) {
    console.log('handleMessagesUpload called');
    
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        showError('Please log in first');
        return;
    }
    
    const file = document.getElementById('messagesFile').files[0];
    const chatter = document.getElementById('messagesChatter').value;
    const startDate = document.getElementById('messagesStartDate').value;
    const endDate = document.getElementById('messagesEndDate').value;
    
    console.log('Form data:', { file: file?.name, chatter, startDate, endDate });
    
    if (!file) {
        showError('Please select a file first');
        return;
    }
    
    if (!chatter) {
        showError('Please select a chatter/employee');
        return;
    }
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showError('Start date cannot be after end date');
        return;
    }

    const formData = new FormData();
    formData.append('messages', file);
    formData.append('chatter', chatter);
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);

    showLoading(true);

    try {
        console.log('Sending request to /api/upload/messages');
        const response = await fetch('/api/upload/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response result:', result);

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
window.addPPVSaleField = function() {
    console.log('🎯 addPPVSaleField called!');
    const container = document.getElementById('ppvSalesContainer');
    if (!container) {
        console.error('ppvSalesContainer not found!');
        return;
    }

    const index = container.children.length;

    const saleDiv = document.createElement('div');
    saleDiv.className = 'ppv-sale-entry p-4 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/30 rounded-xl hover:border-purple-500/50 transition-all';
    saleDiv.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
            <!-- Amount -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-purple-300">
                    <i class="fas fa-dollar-sign mr-1"></i>Amount
                </label>
                <input type="number" name="ppvAmount" min="0" step="0.01" placeholder="25.00"
                       class="w-full bg-gray-800 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all">
            </div>
            
            <!-- Spender Username (All paying fans) -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-purple-300">
                    <i class="fas fa-user mr-1"></i>Fan Username
                </label>
                <input type="text" name="ppvSpender" placeholder="username"
                       class="w-full bg-gray-800 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all">
            </div>
            
            <!-- Traffic Source -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-purple-300">
                    <i class="fas fa-bullseye mr-1"></i>Traffic Source
                </label>
                <select name="ppvSource" class="w-full bg-gray-800 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all traffic-source-select">
                    <option value="">Unknown</option>
                    <!-- Will be populated dynamically -->
                </select>
            </div>
            
            <!-- VIP Flag (Optional - if they're already a VIP) -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-purple-300">
                    <i class="fas fa-crown mr-1"></i>VIP? <span class="text-gray-500 font-normal">(optional)</span>
                </label>
                <select name="ppvIsVIP" class="w-full bg-gray-800 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all">
                    <option value="">Unknown</option>
                    <option value="yes">Yes (VIP)</option>
                    <option value="no">No</option>
                </select>
            </div>
            
            <!-- Remove Button -->
            <div class="flex items-end">
                <button type="button" onclick="removePPVSale(this)" class="w-full bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 px-3 py-2 rounded-lg text-sm transition-all">
                    <i class="fas fa-trash mr-1"></i>Remove
                </button>
            </div>
        </div>
    `;

    container.appendChild(saleDiv);
    
    // Populate traffic sources for this new field
    populateTrafficSourceDropdowns();
}

window.addTipField = function() {
    console.log('🎯 addTipField called!');
    const container = document.getElementById('tipsContainer');
    if (!container) {
        console.error('tipsContainer not found!');
        return;
    }

    const tipDiv = document.createElement('div');
    tipDiv.className = 'tip-entry p-4 bg-gradient-to-br from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded-xl hover:border-green-500/50 transition-all';
    tipDiv.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
            <!-- Amount -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-green-300">
                    <i class="fas fa-dollar-sign mr-1"></i>Amount
                </label>
                <input type="number" name="tipAmount" min="0" step="0.01" placeholder="10.00"
                       class="w-full bg-gray-800 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all">
            </div>
            
            <!-- Spender Username (All paying fans) -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-green-300">
                    <i class="fas fa-user mr-1"></i>Fan Username
                </label>
                <input type="text" name="tipSpender" placeholder="username"
                       class="w-full bg-gray-800 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all">
            </div>
            
            <!-- Traffic Source -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-green-300">
                    <i class="fas fa-bullseye mr-1"></i>Traffic Source
                </label>
                <select name="tipSource" class="w-full bg-gray-800 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all traffic-source-select">
                    <option value="">Unknown</option>
                    <!-- Will be populated dynamically -->
                </select>
            </div>
            
            <!-- VIP Flag (Optional - if they're already a VIP) -->
            <div>
                <label class="block text-xs font-semibold mb-1.5 text-green-300">
                    <i class="fas fa-crown mr-1"></i>VIP? <span class="text-gray-500 font-normal">(optional)</span>
                </label>
                <select name="tipIsVIP" class="w-full bg-gray-800 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all">
                    <option value="">Unknown</option>
                    <option value="yes">Yes (VIP)</option>
                    <option value="no">No</option>
                </select>
            </div>
            
            <!-- Remove Button -->
            <div class="flex items-end">
                <button type="button" onclick="removeTip(this)" class="w-full bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500 text-red-300 px-3 py-2 rounded-lg text-sm transition-all">
                    <i class="fas fa-trash mr-1"></i>Remove
                </button>
            </div>
        </div>
    `;

    container.appendChild(tipDiv);
    
    // Populate traffic sources for this new field
    populateTrafficSourceDropdowns();
}


window.removePPVSale = function(button) {
    console.log('🎯 removePPVSale called!');
    button.closest('.ppv-sale-entry').remove();
}

window.removeTip = function(button) {
    console.log('🎯 removeTip called!');
    button.closest('.tip-entry').remove();
}


// Direct handler for Daily Report button (bypasses event delegation)
async function handleDailyReportSubmitDirect() {
    console.log('🎯 Daily Report direct button handler called!');

    const data = {
        date: document.getElementById('reportDate')?.value || new Date().toISOString().split('T')[0],
        creator: document.getElementById('creatorAccount')?.value || '',
        shift: document.getElementById('reportShift')?.value || 'morning',
        fansChatted: parseInt(document.getElementById('fansChatted')?.value || 0),
        avgResponseTime: parseFloat(document.getElementById('avgResponseTimeInput')?.value || 0),
        notes: document.getElementById('reportNotes')?.value || '',
        ppvSales: [],
        tips: []
    };

    // Collect PPV sales with spender tracking
    const ppvContainer = document.getElementById('ppvSalesContainer');
    const ppvEntries = ppvContainer?.querySelectorAll('.ppv-sale-entry') || [];
    ppvEntries.forEach(entry => {
        const amount = entry.querySelector('input[name="ppvAmount"]')?.value;
        const fanUsername = entry.querySelector('input[name="ppvSpender"]')?.value;
        const source = entry.querySelector('select[name="ppvSource"]')?.value;
        const isVIP = entry.querySelector('select[name="ppvIsVIP"]')?.value;
        
        if (amount) {
            const saleData = {
                amount: parseFloat(amount)
            };
            if (fanUsername) saleData.fanUsername = fanUsername.trim();
            if (source) saleData.trafficSource = source;
            if (isVIP === 'yes') saleData.isVIP = true;
            else if (isVIP === 'no') saleData.isVIP = false;
            
            data.ppvSales.push(saleData);
        }
    });

    // Collect tips with spender tracking (OPTIONAL)
    const tipsContainer = document.getElementById('tipsContainer');
    const tipEntries = tipsContainer?.querySelectorAll('.tip-entry') || [];
    tipEntries.forEach(entry => {
        const amount = entry.querySelector('input[name="tipAmount"]')?.value;
        const fanUsername = entry.querySelector('input[name="tipSpender"]')?.value;
        const source = entry.querySelector('select[name="tipSource"]')?.value;
        const isVIP = entry.querySelector('select[name="tipIsVIP"]')?.value;
        
        if (amount) {
            const tipData = {
                amount: parseFloat(amount)
            };
            if (fanUsername) tipData.fanUsername = fanUsername.trim();
            if (source) tipData.trafficSource = source;
            if (isVIP === 'yes') tipData.isVIP = true;
            else if (isVIP === 'no') tipData.isVIP = false;
            
            data.tips.push(tipData);
        }
    });

    console.log('📊 Submitting daily report:', data);

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
            document.getElementById('dailyReportForm')?.reset();
            if (ppvContainer) ppvContainer.innerHTML = '';
            if (tipsContainer) tipsContainer.innerHTML = '';
            console.log('✅ Daily report saved:', result);
        } else {
            showNotification(result.error || 'Failed to save report', 'error');
        }
    } catch (error) {
        console.error('Error submitting daily report:', error);
        showNotification('Connection error. Please try again.', 'error');
    }
}

// Daily Report Form Submission
async function handleDailyReportSubmit(event) {
    event.preventDefault();

    const data = {
        date: document.getElementById('reportDate')?.value || new Date().toISOString().split('T')[0],
        creator: document.getElementById('creatorAccount')?.value || '',
        shift: document.getElementById('reportShift')?.value || 'morning',
        fansChatted: parseInt(document.getElementById('fansChatted')?.value || 0),
        avgResponseTime: parseFloat(document.getElementById('avgResponseTimeInput')?.value || 0),
        notes: document.getElementById('reportNotes')?.value || '',
        ppvSales: [],
        tips: []
    };

    // Collect PPV sales with spender tracking
    const ppvContainer = document.getElementById('ppvSalesContainer');
    const ppvEntries = ppvContainer?.querySelectorAll('.ppv-sale-entry') || [];
    ppvEntries.forEach(entry => {
        const amount = entry.querySelector('input[name="ppvAmount"]')?.value;
        const fanUsername = entry.querySelector('input[name="ppvSpender"]')?.value;
        const source = entry.querySelector('select[name="ppvSource"]')?.value;
        const isVIP = entry.querySelector('select[name="ppvIsVIP"]')?.value;
        
        if (amount) {
            const saleData = {
                amount: parseFloat(amount)
            };
            if (fanUsername) saleData.fanUsername = fanUsername.trim();
            if (source) saleData.trafficSource = source;
            if (isVIP === 'yes') saleData.isVIP = true;
            else if (isVIP === 'no') saleData.isVIP = false;
            
            data.ppvSales.push(saleData);
        }
    });

    // Collect tips with spender tracking
    const tipsContainer = document.getElementById('tipsContainer');
    const tipEntries = tipsContainer?.querySelectorAll('.tip-entry') || [];
    tipEntries.forEach(entry => {
        const amount = entry.querySelector('input[name="tipAmount"]')?.value;
        const fanUsername = entry.querySelector('input[name="tipSpender"]')?.value;
        const source = entry.querySelector('select[name="tipSource"]')?.value;
        const isVIP = entry.querySelector('select[name="tipIsVIP"]')?.value;
        
        if (amount) {
            const tipData = {
                amount: parseFloat(amount)
            };
            if (fanUsername) tipData.fanUsername = fanUsername.trim();
            if (source) tipData.trafficSource = source;
            if (isVIP === 'yes') tipData.isVIP = true;
            else if (isVIP === 'no') tipData.isVIP = false;
            
            data.tips.push(tipData);
        }
    });

    console.log('📊 Submitting daily report:', data);

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
            document.getElementById('dailyReportForm')?.reset();
            if (ppvContainer) ppvContainer.innerHTML = '';
            if (tipsContainer) tipsContainer.innerHTML = '';
            console.log('✅ Daily report saved:', result);
        } else {
            showNotification(result.error || 'Failed to save report', 'error');
        }
    } catch (error) {
        console.error('Error submitting daily report:', error);
        showNotification('Connection error. Please try again.', 'error');
    }
}

// My Performance functions
let currentMyPerformanceInterval = '24h';  // FIXED: Default to 24h to match button UI
let myPerformanceCustomDates = null;

function setMyPerformanceInterval(interval) {
    currentMyPerformanceInterval = interval;
    
    // Update button styles
    document.querySelectorAll('.interval-btn').forEach(btn => {
        btn.className = 'interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm';
    });
    
    // Highlight selected button
    event.target.className = 'interval-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm';
    
    // If custom interval, show date picker
    if (interval === 'custom') {
        showMyPerformanceDatePicker();
    } else {
        myPerformanceCustomDates = null;
        loadMyPerformanceData();
    }
}

function showMyPerformanceDatePicker() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl p-6 w-96">
            <h3 class="text-xl font-bold mb-4">Select Date Range</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-300 mb-2">Start Date</label>
                    <input type="date" id="myPerfStartDate" class="w-full bg-gray-700 text-white rounded-lg px-4 py-2">
                </div>
                <div>
                    <label class="block text-sm text-gray-300 mb-2">End Date</label>
                    <input type="date" id="myPerfEndDate" class="w-full bg-gray-700 text-white rounded-lg px-4 py-2">
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="applyMyPerformanceDateFilter()" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg">Apply</button>
                <button onclick="closeMyPerformanceDatePicker()" class="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.id = 'myPerfDatePickerModal';
}

function closeMyPerformanceDatePicker() {
    const modal = document.getElementById('myPerfDatePickerModal');
    if (modal) modal.remove();
}

function applyMyPerformanceDateFilter() {
    const startDate = document.getElementById('myPerfStartDate').value;
    const endDate = document.getElementById('myPerfEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    myPerformanceCustomDates = { start: startDate, end: endDate };
    closeMyPerformanceDatePicker();
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

        // Build API URL based on interval
        let apiUrl;
        if (currentMyPerformanceInterval === 'custom' && myPerformanceCustomDates) {
            apiUrl = `/api/analytics/dashboard?filterType=custom&customStart=${myPerformanceCustomDates.start}&customEnd=${myPerformanceCustomDates.end}`;
            console.log('🗓️ My Performance using custom dates:', myPerformanceCustomDates);
        } else {
            // Calculate date range for 24h/7d/30d
            const days = currentMyPerformanceInterval === '24h' ? 1 : currentMyPerformanceInterval === '7d' ? 7 : 30;
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - days);
            
            const formatDate = (d) => d.toISOString().split('T')[0];
            apiUrl = `/api/analytics/dashboard?filterType=custom&customStart=${formatDate(start)}&customEnd=${formatDate(end)}`;
            console.log(`🗓️ My Performance using ${currentMyPerformanceInterval}: ${formatDate(start)} to ${formatDate(end)}`);
        }

        // Get performance data
        const response = await fetch(apiUrl, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();

        // Update main metrics
        document.getElementById('myTotalRevenue').textContent = `$${data.totalRevenue.toLocaleString()}`;
        document.getElementById('myPPVSent').textContent = data.ppvsSent || 0;
        document.getElementById('myAvgPPVPrice').textContent = `$${data.avgPPVPrice || 0}`;
        document.getElementById('myResponseTime').textContent = `${data.avgResponseTime || 0}m`;

        // Update Conversion Metrics
        const revenuePerPPV = data.ppvsSent > 0 ? (data.totalRevenue / data.ppvsSent) : 0;
        const unlockRate = data.ppvsSent > 0 && data.ppvsUnlocked ? ((data.ppvsUnlocked / data.ppvsSent) * 100) : 0;
        const messagesPerPPV = data.ppvsSent > 0 && data.messagesSent ? (data.messagesSent / data.ppvsSent) : 0;
        
        document.getElementById('myRevenuePerPPV').textContent = `$${revenuePerPPV.toFixed(2)}`;
        document.getElementById('myUnlockRate').textContent = `${unlockRate.toFixed(1)}%`;
        document.getElementById('myMessagesPerPPV').textContent = messagesPerPPV.toFixed(1);

        // Update Activity Metrics
        document.getElementById('myFansChatted').textContent = data.fansChatted || 0;
        document.getElementById('myMessagesSent').textContent = data.messagesSent || 0;
        document.getElementById('myAvgResponseTime').textContent = `${data.avgResponseTime || 0}m`;

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

        // Get message analysis data for the current user
        const userResponse = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const user = await userResponse.json();
        const chatterName = user.chatterName || user.username;
        
        const response = await fetch(`/api/message-analysis/${chatterName}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const analyses = await response.json();
            // Get the most recent analysis (first in the array since they're sorted by date desc)
            const analysis = analyses && analyses.length > 0 ? analyses[0] : null;
            
            if (analysis) {
                document.getElementById('myMessageScore').textContent = analysis.overallScore || '0';
                document.getElementById('myGrammarScore').textContent = analysis.grammarScore || '0';
                document.getElementById('myGuidelinesScore').textContent = analysis.guidelinesScore || '0';
            } else {
                document.getElementById('myMessageScore').textContent = '0';
                document.getElementById('myGrammarScore').textContent = '0';
                document.getElementById('myGuidelinesScore').textContent = '0';
            }

            // Update strengths and weaknesses with SMART styling
            const strengthsDiv = document.getElementById('myMessageStrengths');
            const weaknessesDiv = document.getElementById('myMessageWeaknesses');

            if (analysis && analysis.strengths && analysis.strengths.length > 0) {
                // Group "Perfect compliance" items
                const perfectCompliance = analysis.strengths.filter(s => s.includes('Perfect compliance with:'));
                const otherStrengths = analysis.strengths.filter(s => !s.includes('Perfect compliance with:'));
                
                let html = '';
                
                // Show other strengths first (more important)
                if (otherStrengths.length > 0) {
                    html += otherStrengths.map(strength => 
                        `<div class="flex items-start p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                            <i class="fas fa-star text-green-400 mr-3 mt-0.5 text-sm"></i>
                            <span class="text-gray-300 text-sm leading-relaxed font-medium">${strength}</span>
                        </div>`
                    ).join('');
                }
                
                // Compact perfect compliance summary
                if (perfectCompliance.length > 0) {
                    const guidelineNames = perfectCompliance.map(s => {
                        const match = s.match(/Perfect compliance with: (.+)/);
                        return match ? match[1] : s;
                    });
                    
                    html += `
                        <div class="p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                            <div class="flex items-center mb-2">
                                <i class="fas fa-check-circle text-green-400 mr-2 text-xs"></i>
                                <span class="text-green-400 text-xs font-bold uppercase tracking-wide">Perfect Guidelines (${perfectCompliance.length})</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                ${guidelineNames.map(name => 
                                    `<span class="text-xs px-2 py-0.5 bg-green-500/10 text-green-300 rounded">${name}</span>`
                                ).join('')}
                            </div>
                        </div>
                    `;
                }
                
                strengthsDiv.innerHTML = html || '<div class="text-gray-400 text-sm">No strengths data</div>';
            } else {
                strengthsDiv.innerHTML = '<div class="text-gray-400 text-sm">No message analysis available yet</div>';
            }
            
            if (analysis && analysis.weaknesses && analysis.weaknesses.length > 0) {
                // Parse and enhance weaknesses with error counts and impact
                weaknessesDiv.innerHTML = analysis.weaknesses.map(weakness => {
                    // Extract error count if present
                    const countMatch = weakness.match(/Found (\d+)/);
                    const errorCount = countMatch ? parseInt(countMatch[1]) : null;
                    
                    // Extract violation count
                    const violationMatch = weakness.match(/(\d+) violations/);
                    const violationCount = violationMatch ? parseInt(violationMatch[1]) : null;
                    
                    // Determine severity
                    let severity = 'medium';
                    let icon = 'fa-exclamation-circle';
                    let color = 'orange';
                    
                    if ((errorCount && errorCount > 100) || (violationCount && violationCount > 50)) {
                        severity = 'high';
                        icon = 'fa-exclamation-triangle';
                        color = 'red';
                    } else if ((errorCount && errorCount < 10) || (violationCount && violationCount < 5)) {
                        severity = 'low';
                        icon = 'fa-info-circle';
                        color = 'yellow';
                    }
                    
                    return `<div class="flex items-start p-3 bg-${color}-500/10 rounded-lg border border-${color}-500/20 hover:bg-${color}-500/15 transition-all">
                        <i class="fas ${icon} text-${color}-400 mr-3 mt-0.5 text-sm"></i>
                        <div class="flex-1">
                            <span class="text-gray-300 text-sm leading-relaxed">${weakness}</span>
                            ${errorCount || violationCount ? `<div class="mt-1.5 text-xs text-${color}-400 font-medium">${errorCount || violationCount} issues found</div>` : ''}
                        </div>
                    </div>`;
                }).join('');
            } else {
                weaknessesDiv.innerHTML = '<div class="text-gray-400 text-sm">No issues found - great work!</div>';
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

// Download violations CSV
async function downloadViolationsCSV(chatterName, customStart, customEnd, filterType) {
    if (!chatterName) {
        showNotification('No chatter selected', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        // Build the URL
        const url = `/api/analytics/violations-export/${encodeURIComponent(chatterName)}?filterType=${filterType || 'custom'}&customStart=${customStart || ''}&customEnd=${customEnd || ''}`;
        
        // Fetch with authentication
        const response = await fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + (authToken || localStorage.getItem('authToken'))
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.statusText}`);
        }
        
        // Get the CSV blob
        const blob = await response.blob();
        
        // Create download link
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `violations_${chatterName}_${customStart || 'start'}_${customEnd || 'end'}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('Violations CSV downloaded successfully!', 'success');
    } catch (error) {
        console.error('CSV download error:', error);
        showNotification('Failed to download violations CSV: ' + error.message, 'error');
    } finally {
        showLoading(false);
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

// Helper: Get color class based on score (0-100 scale)
window.getScoreColor = function(score) {
    if (score === null || score === undefined) return 'text-gray-400';
    if (score >= 80) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-red-400';
};

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

// Helper function to format breakdown content with proper line breaks and bullet points
function formatBreakdownContent(content) {
    // v2.0 - Fixed to properly display "No violations found" messages
    
    if (!content || content === 'No significant issues found') {
        return `<span class="text-green-400">✓ No significant issues found</span>`;
    }
    
    // Handle "No violations found" messages - ALWAYS show these with green checkmark
    if (content.includes('No violations found')) {
        return `<span class="text-green-400">✓ ${content}</span>`;
    }
    
    // Check if content is structured analysis (new format with counts and issues)
    if (content.length > 50 && (content.includes('Found') || content.includes('Key issues include'))) {
      // This is structured analysis with counts, format it nicely
      return `<div class="text-gray-300 leading-relaxed text-sm">
        <div class="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
          <div class="text-gray-300 leading-relaxed">${content}</div>
        </div>
      </div>`;
    }
    
    // Check if content is detailed analysis (long text without structure)
    if (content.length > 100 && !content.includes('•')) {
      // This is detailed analysis text, format it nicely
      return `<div class="text-gray-300 leading-relaxed text-sm">
        <div class="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
          <div class="text-gray-300 leading-relaxed">${content}</div>
        </div>
      </div>`;
    }
    
    // Check if content already has bullet points (old format)
    if (content.includes('•')) {
      // Split by double line breaks to get separate bullet points
      const items = content.split('\n\n').filter(item => item.trim().length > 0);
      
      if (items.length > 1) {
        return items.map(item => {
          const trimmed = item.trim();
          if (trimmed.startsWith('•')) {
            // Remove the bullet point and format properly
            const text = trimmed.substring(1).trim();
            return `
              <div class="mb-4 flex items-start">
                <span class="text-blue-400 mr-3 mt-1 text-lg font-bold">•</span>
                <span class="text-gray-300 leading-relaxed text-sm">${text}</span>
              </div>
            `;
          }
          return `<div class="mb-4 text-gray-300 leading-relaxed text-sm">${trimmed}</div>`;
        }).join('');
      }
    }
    
    // Fallback: Split by " | " to separate different examples (old format)
    const items = content.split(' | ');
    if (items.length === 1) {
        return `<div class="text-gray-300 leading-relaxed text-sm">${content}</div>`;
    }
    
    // Format as bullet points with proper spacing
    return items.map(item => {
        const cleanItem = item.trim();
        if (cleanItem.startsWith('Message ')) {
            // Extract message number and description
            const match = cleanItem.match(/Message (\d+): (.+)/);
            if (match) {
                const messageNum = match[1];
                const description = match[2];
                return `
                    <div class="flex items-start space-x-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50 mb-3 hover:bg-gray-800/50 transition-colors">
                        <div class="flex-shrink-0 w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                            <span class="text-xs font-bold text-blue-400">${messageNum}</span>
                        </div>
                        <div class="flex-1">
                            <div class="text-sm text-gray-300 leading-relaxed">${description}</div>
                        </div>
                    </div>
                `;
            }
            return `<div class="mb-3 flex items-start"><span class="text-blue-400 mr-3 mt-1 text-lg font-bold">•</span><span class="text-gray-300 text-sm">${cleanItem}</span></div>`;
        }
        return `<div class="mb-3 flex items-start"><span class="text-blue-400 mr-3 mt-1 text-lg font-bold">•</span><span class="text-gray-300 text-sm">${cleanItem}</span></div>`;
    }).join('');
}

// LEAN DYNAMIC Million-Dollar Analysis UI - Only High-Value Insights
function renderSophisticatedChatterAnalysis(data) {
    const container = document.getElementById('chatterAnalysisResults');
    if (!container) return;
    
    console.log('Rendering LEAN DYNAMIC analysis:', data);
    console.log('🔍 Frontend received breakdown data:', {
        hasGrammarBreakdown: !!data.grammarBreakdown,
        grammarBreakdownKeys: data.grammarBreakdown ? Object.keys(data.grammarBreakdown) : [],
        hasGuidelinesBreakdown: !!data.guidelinesBreakdown,
        guidelinesBreakdownKeys: data.guidelinesBreakdown ? Object.keys(data.guidelinesBreakdown) : [],
        hasOverallBreakdown: !!data.overallBreakdown,
        overallBreakdownKeys: data.overallBreakdown ? Object.keys(data.overallBreakdown) : []
    });
    console.log('🔍 Grammar breakdown content:', JSON.stringify(data.grammarBreakdown));
    console.log('🔍 Guidelines breakdown content:', JSON.stringify(data.guidelinesBreakdown));
    console.log('🔍 Overall breakdown content:', JSON.stringify(data.overallBreakdown));
    
    // CRITICAL DEBUG: Test the exact condition used in the template
    const showAnalysisSection = data.grammarBreakdown || data.guidelinesBreakdown || data.overallBreakdown;
    console.log('🚨 WILL SHOW ANALYSIS SECTION?', showAnalysisSection);
    console.log('🚨 grammarBreakdown truthy?', !!data.grammarBreakdown);
    console.log('🚨 guidelinesBreakdown truthy?', !!data.guidelinesBreakdown);
    console.log('🚨 overallBreakdown truthy?', !!data.overallBreakdown);
    
    // Calculate derived metrics
    const ppvUnlockRate = data.ppvsSent > 0 ? ((data.ppvsUnlocked / data.ppvsSent) * 100).toFixed(1) : 0;
    const messagesPerPPV = data.ppvsSent > 0 ? (data.messagesSent / data.ppvsSent).toFixed(1) : 0;
    const responseColor = data.avgResponseTime && data.avgResponseTime <= 2 ? 'green' : data.avgResponseTime && data.avgResponseTime <= 3 ? 'blue' : data.avgResponseTime && data.avgResponseTime <= 5 ? 'yellow' : 'red';
    
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
                    <div class="text-3xl font-black text-${responseColor}-400">${data.avgResponseTime ? data.avgResponseTime + 'm' : 'N/A'}</div>
                    <div class="text-xs text-gray-400 uppercase">Response Time</div>
                </div>
                <div class="glass-card rounded-xl p-4 border border-purple-500/30 hover-lift">
                    <div class="text-3xl font-black text-purple-400">${messagesPerPPV}</div>
                    <div class="text-xs text-gray-400 uppercase">Msgs/PPV</div>
                </div>
            </div>
            
            <!-- AI-Calculated Insights (Complex Math) -->
            ${data.advancedMetrics && data.advancedMetrics.efficiencyRatios ? `
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
                    ${!data.advancedMetrics.efficiencyRatios || Object.keys(data.advancedMetrics.efficiencyRatios).length === 0 ? `
                        <div class="col-span-3 text-center py-8">
                            <i class="fas fa-calculator text-gray-400 text-2xl mb-2"></i>
                            <p class="text-gray-400">No calculable metrics available with current data</p>
                        </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            
            <!-- Message Quality Analysis -->
            ${data.grammarBreakdown || data.guidelinesBreakdown || data.overallBreakdown ? `
            <div class="glass-card rounded-xl p-6 border border-purple-500/30 slide-up-1 hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-comments text-purple-400 mr-3"></i>
                    Message Quality Analysis
                </h5>
                
                <!-- Grammar & Guidelines Scores -->
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div class="text-sm font-bold text-purple-400 mb-2">Grammar Score</div>
                        <div class="text-2xl font-bold text-white mb-2">${data.grammarScore || 'N/A'}/100</div>
                        <div class="text-xs text-gray-400">Spelling, grammar, punctuation accuracy</div>
                    </div>
                    <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div class="text-sm font-bold text-purple-400 mb-2">Guidelines Score</div>
                        <div class="text-2xl font-bold text-white mb-2">${data.guidelinesScore || 'N/A'}/100</div>
                        <div class="text-xs text-gray-400">General Chatting, Psychology, Captions, Sales</div>
                    </div>
                </div>
                
                
                <!-- PREMIUM Detailed Score Breakdown -->
                ${data.grammarBreakdown || data.guidelinesBreakdown || data.overallBreakdown ? `
                <div class="mb-8">
                    <div class="flex items-center justify-between mb-6">
                        <h6 class="text-xl font-bold text-white flex items-center">
                            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mr-3">
                                <i class="fas fa-microscope text-white text-sm"></i>
                            </div>
                            Detailed Score Breakdown
                            <span class="ml-3 px-2 py-1 bg-green-500 text-white text-xs rounded-full animate-pulse">NEW UI</span>
                        </h6>
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span class="text-xs text-gray-400">AI-Powered Analysis</span>
                        </div>
                    </div>
                    
                    <!-- Tab Navigation -->
                    <div class="flex space-x-1 mb-6 bg-gray-800/50 p-1 rounded-xl">
                        ${data.overallBreakdown ? `
                        <button onclick="switchBreakdownTab('overall')" id="tab-overall" class="breakdown-tab flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            <div class="flex items-center justify-center">
                                <i class="fas fa-star mr-2"></i>
                                Overall (${data.overallScore || 'N/A'})
                            </div>
                        </button>
                        ` : ''}
                        ${data.grammarBreakdown ? `
                        <button onclick="switchBreakdownTab('grammar')" id="tab-grammar" class="breakdown-tab flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                            <div class="flex items-center justify-center">
                                <i class="fas fa-spell-check mr-2"></i>
                                Grammar (${data.grammarScore || 'N/A'})
                            </div>
                        </button>
                        ` : ''}
                        ${data.guidelinesBreakdown ? `
                        <button onclick="switchBreakdownTab('guidelines')" id="tab-guidelines" class="breakdown-tab flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 text-gray-400 hover:text-green-400 hover:bg-green-500/10">
                            <div class="flex items-center justify-center">
                                <i class="fas fa-chart-line mr-2"></i>
                                Guidelines (${data.guidelinesScore || 'N/A'})
                            </div>
                        </button>
                        ` : ''}
                    </div>
                    
                    <!-- Tab Content -->
                    <div class="relative">
                        <!-- Overall Analysis Tab -->
                        ${data.overallBreakdown ? `
                        <div id="content-overall" class="breakdown-content">
                            <div class="group relative overflow-hidden">
                                <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl"></div>
                                <div class="relative p-8 border border-blue-500/20 rounded-2xl">
                                    <div class="flex items-center justify-between mb-6">
                                        <div class="flex items-center">
                                            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mr-4">
                                                <i class="fas fa-star text-white text-lg"></i>
                                            </div>
                                            <div>
                                                <h7 class="text-2xl font-bold text-white">Overall Analysis</h7>
                                                <div class="text-sm text-gray-400">Message Impact & Effectiveness</div>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-4xl font-black text-blue-400">${data.overallScore || 'N/A'}</div>
                                            <div class="text-sm text-gray-400">/100</div>
                                        </div>
                                    </div>
                                    
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        ${data.overallBreakdown.messageClarity ? `
                                        <div class="p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-eye text-blue-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-blue-400">Message Clarity</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.overallBreakdown.messageClarity)}</div>
                                        </div>
                                        ` : ''}
                                        
                                        ${data.overallBreakdown.emotionalImpact ? `
                                        <div class="p-4 bg-purple-500/5 rounded-xl border border-purple-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-heart text-purple-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-purple-400">Emotional Impact</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.overallBreakdown.emotionalImpact)}</div>
                                        </div>
                                        ` : ''}
                                        
                                        ${data.overallBreakdown.conversionPotential ? `
                                        <div class="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/20 md:col-span-2">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-target text-indigo-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-indigo-400">Conversion Potential</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.overallBreakdown.conversionPotential)}</div>
                                        </div>
                                        ` : ''}
                                    </div>
                                    
                                    ${data.overallBreakdown.scoreExplanation ? `
                                    <div class="mt-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                                        <div class="text-sm text-gray-400 mb-2">Analysis Summary</div>
                                        <div class="text-gray-300">${data.overallBreakdown.scoreExplanation}</div>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <!-- Grammar Analysis Tab -->
                        ${data.grammarBreakdown ? `
                        <div id="content-grammar" class="breakdown-content hidden">
                            <div class="group relative overflow-hidden">
                                <div class="absolute inset-0 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-2xl"></div>
                                <div class="relative p-8 border border-red-500/20 rounded-2xl">
                                    <div class="flex items-center justify-between mb-6">
                                        <div class="flex items-center">
                                            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center mr-4">
                                                <i class="fas fa-spell-check text-white text-lg"></i>
                                            </div>
                                            <div>
                                                <h7 class="text-2xl font-bold text-white">Grammar Analysis</h7>
                                                <div class="text-sm text-gray-400">Language Quality & Accuracy</div>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-4xl font-black text-red-400">${data.grammarScore || 'N/A'}</div>
                                            <div class="text-sm text-gray-400">/100</div>
                                        </div>
                                    </div>
                                    
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        ${data.grammarBreakdown.spellingErrors ? `
                                        <div class="p-4 bg-red-500/5 rounded-xl border border-red-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-exclamation-triangle text-red-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-red-400">Spelling Issues</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.grammarBreakdown.spellingErrors)}</div>
                                        </div>
                                        ` : ''}
                                        
                                        ${data.grammarBreakdown.grammarIssues ? `
                                        <div class="p-4 bg-orange-500/5 rounded-xl border border-orange-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-grammar text-orange-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-orange-400">Grammar Issues</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.grammarBreakdown.grammarIssues)}</div>
                                        </div>
                                        ` : ''}
                                        
                                        ${data.grammarBreakdown.punctuationProblems ? `
                                        <div class="p-4 bg-yellow-500/5 rounded-xl border border-yellow-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-question text-yellow-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-yellow-400">Punctuation</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.grammarBreakdown.punctuationProblems)}</div>
                                        </div>
                                        ` : ''}
                                        
                                        ${data.grammarBreakdown.informalLanguage ? `
                                        <div class="p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-comment-dots text-blue-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-blue-400">Informal Language</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.grammarBreakdown.informalLanguage)}</div>
                                        </div>
                                        ` : ''}
                                    </div>
                                    
                                    ${data.grammarBreakdown.scoreExplanation ? `
                                    <div class="mt-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                                        <div class="text-sm text-gray-400 mb-2">Analysis Summary</div>
                                        <div class="text-gray-300">${data.grammarBreakdown.scoreExplanation}</div>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <!-- Guidelines Analysis Tab -->
                        ${data.guidelinesBreakdown ? `
                        <div id="content-guidelines" class="breakdown-content hidden">
                            <div class="group relative overflow-hidden">
                                <div class="absolute inset-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl"></div>
                                <div class="relative p-8 border border-green-500/20 rounded-2xl">
                                    <div class="flex items-center justify-between mb-6">
                                        <div class="flex items-center">
                                            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mr-4">
                                                <i class="fas fa-chart-line text-white text-lg"></i>
                                            </div>
                                            <div>
                                                <h7 class="text-2xl font-bold text-white">Guidelines Analysis</h7>
                                                <div class="text-sm text-gray-400">Sales Performance & Strategy</div>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-4xl font-black text-green-400">${data.guidelinesScore || 'N/A'}</div>
                                            <div class="text-sm text-gray-400">/100</div>
                                        </div>
                                    </div>
                                    
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        ${data.guidelinesBreakdown && data.guidelinesBreakdown.guidelinesBreakdownV2 ? `
                                        <div class="p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-comments text-blue-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-blue-400">General Chatting</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.guidelinesBreakdownV2.generalChatting)}</div>
                                        </div>
                                        <div class="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-brain text-indigo-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-indigo-400">Psychology</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.guidelinesBreakdownV2.psychology)}</div>
                                        </div>
                                        <div class="p-4 bg-teal-500/5 rounded-xl border border-teal-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-camera text-teal-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-teal-400">Captions</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.guidelinesBreakdownV2.captions)}</div>
                                        </div>
                                        <div class="p-4 bg-green-500/5 rounded-xl border border-green-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-dollar-sign text-green-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-green-400">Sales</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.guidelinesBreakdownV2.sales)}</div>
                                        </div>
                                        ` : `
                                        ${data.guidelinesBreakdown.salesEffectiveness ? `
                                        <div class="p-4 bg-green-500/5 rounded-xl border border-green-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-dollar-sign text-green-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-green-400">Sales Effectiveness</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.salesEffectiveness)}</div>
                                        </div>
                                        ` : ''}
                                        ${data.guidelinesBreakdown.engagementQuality ? `
                                        <div class="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-heart text-emerald-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-emerald-400">Engagement Quality</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.engagementQuality)}</div>
                                        </div>
                                        ` : ''}
                                        ${data.guidelinesBreakdown.captionQuality ? `
                                        <div class="p-4 bg-teal-500/5 rounded-xl border border-teal-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-camera text-teal-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-teal-400">Caption Quality</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.captionQuality)}</div>
                                        </div>
                                        ` : ''}
                                        ${data.guidelinesBreakdown.conversationFlow ? `
                                        <div class="p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/20">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-comments text-cyan-400 mr-3 text-lg"></i>
                                                <span class="text-lg font-semibold text-cyan-400">Conversation Flow</span>
                                            </div>
                                            <div class="text-sm text-gray-300">${formatBreakdownContent(data.guidelinesBreakdown.conversationFlow)}</div>
                                        </div>
                                        ` : ''}
                                        `}
                                    </div>
                                    
                                    ${data.guidelinesBreakdown.scoreExplanation ? `
                                    <div class="mt-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                                        <div class="text-sm text-gray-400 mb-2">Analysis Summary</div>
                                        <div class="text-gray-300">${data.guidelinesBreakdown.scoreExplanation}</div>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                <!-- Chatting Style Analysis -->
                ${data.chattingStyle ? `
                <div class="mb-6">
                    <h6 class="text-md font-bold text-white mb-3 flex items-center">
                        <i class="fas fa-user-tie text-purple-400 mr-2"></i>
                        Chatting Style
                    </h6>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Directness</div>
                            <div class="text-sm text-white">${data.chattingStyle.directness || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Friendliness</div>
                            <div class="text-sm text-white">${data.chattingStyle.friendliness || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Sales Approach</div>
                            <div class="text-sm text-white">${data.chattingStyle.salesApproach || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Personality</div>
                            <div class="text-sm text-white">${data.chattingStyle.personality || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Emoji Usage</div>
                            <div class="text-sm text-white">${data.chattingStyle.emojiUsage || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Message Length</div>
                            <div class="text-sm text-white">${data.chattingStyle.messageLength || 'N/A'}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- Message Patterns -->
                ${data.messagePatterns ? `
                <div class="mb-6">
                    <h6 class="text-md font-bold text-white mb-3 flex items-center">
                        <i class="fas fa-chart-line text-purple-400 mr-2"></i>
                        Message Patterns
                    </h6>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Question Frequency</div>
                            <div class="text-sm text-white">${data.messagePatterns.questionFrequency || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Exclamation Usage</div>
                            <div class="text-sm text-white">${data.messagePatterns.exclamationUsage || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Capitalization Style</div>
                            <div class="text-sm text-white">${data.messagePatterns.capitalizationStyle || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Punctuation Style</div>
                            <div class="text-sm text-white">${data.messagePatterns.punctuationStyle || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Topic Diversity</div>
                            <div class="text-sm text-white">${data.messagePatterns.topicDiversity || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Sexual Content</div>
                            <div class="text-sm text-white">${data.messagePatterns.sexualContent || 'N/A'}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- Engagement Effectiveness -->
                ${data.engagementMetrics ? `
                <div class="mb-4">
                    <h6 class="text-md font-bold text-white mb-3 flex items-center">
                        <i class="fas fa-heart text-purple-400 mr-2"></i>
                        Engagement Effectiveness
                    </h6>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Conversation Starter</div>
                            <div class="text-sm text-white">${data.engagementMetrics.conversationStarter || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Conversation Maintainer</div>
                            <div class="text-sm text-white">${data.engagementMetrics.conversationMaintainer || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Sales Conversation</div>
                            <div class="text-sm text-white">${data.engagementMetrics.salesConversation || 'N/A'}</div>
                        </div>
                        <div class="p-3 bg-gray-800/30 rounded-lg">
                            <div class="text-xs text-purple-400 mb-1">Fan Retention</div>
                            <div class="text-sm text-white">${data.engagementMetrics.fanRetention || 'N/A'}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- Detailed Analysis -->
                ${data.strengths && data.strengths.length > 0 ? `
                <div class="mb-4">
                    <h6 class="text-md font-bold text-green-400 mb-2">Strengths</h6>
                    <ul class="text-sm text-gray-300 space-y-1">
                        ${data.strengths.map(strength => `<li class="flex items-start"><i class="fas fa-check-circle text-green-400 mr-2 mt-0.5 text-xs"></i>${strength}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${data.weaknesses && data.weaknesses.length > 0 ? `
                <div class="mb-4">
                    <h6 class="text-md font-bold text-red-400 mb-2">Areas for Improvement</h6>
                    <ul class="text-sm text-gray-300 space-y-1">
                        ${data.weaknesses.map(weakness => `<li class="flex items-start"><i class="fas fa-exclamation-triangle text-red-400 mr-2 mt-0.5 text-xs"></i>${weakness}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${data.recommendations && data.recommendations.length > 0 ? `
                <div>
                    <h6 class="text-md font-bold text-blue-400 mb-2">Recommendations</h6>
                    <ul class="text-sm text-gray-300 space-y-1">
                        ${data.recommendations.map(rec => `<li class="flex items-start"><i class="fas fa-lightbulb text-blue-400 mr-2 mt-0.5 text-xs"></i>${rec}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
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
            ${data.strategicInsights?.revenueOptimization && (
                (data.strategicInsights.revenueOptimization.leakagePoints && data.strategicInsights.revenueOptimization.leakagePoints.filter(point => point && !point.includes('not calculable')).length > 0) ||
                (data.strategicInsights.revenueOptimization.growthOpportunities && data.strategicInsights.revenueOptimization.growthOpportunities.filter(opp => opp && !opp.includes('not calculable')).length > 0)
            ) ? `
            <div class="grid grid-cols-2 gap-4 slide-up-2">
                ${data.strategicInsights.revenueOptimization.leakagePoints?.length > 0 ? `
                <div class="glass-card rounded-xl p-5 border border-red-500/30 hover-lift">
                    <h5 class="text-base font-bold text-red-400 mb-4 flex items-center">
                        <i class="fas fa-exclamation-circle text-red-400 mr-2"></i>
                        Revenue Leaks (Fix These)
                    </h5>
                    <ul class="space-y-3">
                        ${data.strategicInsights.revenueOptimization.leakagePoints.filter(point => point && !point.includes('not calculable')).slice(0, 3).map((point, idx) => `
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
                        ${data.strategicInsights.revenueOptimization.growthOpportunities.filter(opp => opp && !opp.includes('not calculable')).slice(0, 3).map((opp, idx) => `
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
            ${data.actionPlan?.immediateActions && data.actionPlan.immediateActions.filter(action => action && !action.includes('not calculable')).length > 0 ? `
            <div class="glass-card rounded-xl p-6 border border-orange-500/30 slide-up-2 hover-lift">
                <h5 class="text-lg font-bold text-white mb-4 flex items-center">
                    <i class="fas fa-bolt text-orange-400 mr-3"></i>
                    Top Priority Actions
                </h5>
                <div class="space-y-3">
                    ${data.actionPlan.immediateActions.filter(action => action && !action.includes('not calculable')).slice(0, 3).map((action, idx) => `
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
                    ${data.insights.filter(insight => insight && !insight.includes('not calculable')).slice(0, 4).map((insight, idx) => `
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
                    ${data.opportunities.filter(opp => opp && !opp.includes('not calculable')).slice(0, 4).map((opp, idx) => `
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
                    ${data.recommendations.filter(rec => rec && !rec.includes('not calculable')).slice(0, 4).map((rec, idx) => `
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

// ==================== TEAM COMPARISON SECTION ====================

function createTeamComparisonSection() {
    return `
        <div class="mb-8">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 class="text-4xl font-bold mb-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
                        <i class="fas fa-trophy mr-3"></i>Team Leaderboard
                    </h2>
                    <p class="text-gray-400 text-lg">See how you stack up against the team</p>
                </div>
                <!-- Time Period Selector -->
                <div class="flex flex-wrap gap-2 items-center">
                    <span class="text-sm font-medium text-gray-400 mr-2">Time Period:</span>
                    <button onclick="setTeamComparisonInterval('24h')" class="team-comparison-interval-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="24h">24h</button>
                    <button onclick="setTeamComparisonInterval('7d')" class="team-comparison-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="7d">7d</button>
                    <button onclick="setTeamComparisonInterval('30d')" class="team-comparison-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="30d">30d</button>
                    <button onclick="setTeamComparisonInterval('custom')" class="team-comparison-interval-btn bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-all" data-interval="custom">
                        <i class="fas fa-calendar mr-1 text-xs"></i>Custom
                    </button>
                </div>
            </div>
        </div>

        <!-- Your Position Card -->
        <div id="yourPositionCard" class="mb-8">
            <!-- Will be populated dynamically -->
        </div>

        <!-- Team Leaderboard Table -->
        <div class="glass-card rounded-2xl p-8 border-2 border-yellow-500/30">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-2xl font-bold text-white flex items-center">
                    <i class="fas fa-users text-yellow-400 mr-3"></i>
                    Full Team Rankings
                </h3>
                <div class="text-sm text-gray-400">
                    Click any column header to sort
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead>
                        <tr class="border-b-2 border-gray-700">
                            <th class="px-4 py-4 text-left text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('rank')">
                                <i class="fas fa-hashtag mr-2"></i>Rank
                            </th>
                            <th class="px-4 py-4 text-left text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('name')">
                                <i class="fas fa-user mr-2"></i>Chatter
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('revenue')">
                                <i class="fas fa-dollar-sign mr-2"></i>Revenue
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('unlockRate')">
                                <i class="fas fa-unlock mr-2"></i>Unlock %
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('responseTime')">
                                <i class="fas fa-clock mr-2"></i>Avg Response
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('messagesPerPPV')">
                                <i class="fas fa-comments mr-2"></i>Msgs/PPV
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('overallScore')">
                                <i class="fas fa-star mr-2"></i>Overall
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('grammarScore')">
                                <i class="fas fa-spell-check mr-2"></i>Grammar
                            </th>
                            <th class="px-4 py-4 text-right text-sm font-bold text-gray-300 cursor-pointer hover:text-white transition-colors" onclick="sortTeamBy('guidelinesScore')">
                                <i class="fas fa-clipboard-check mr-2"></i>Guidelines
                            </th>
                        </tr>
                    </thead>
                    <tbody id="teamComparisonTableBody" class="divide-y divide-gray-700">
                        <!-- Will be populated dynamically -->
                    </tbody>
                </table>
            </div>

            <!-- Team Average Row -->
            <div id="teamAverageRow" class="mt-6 pt-6 border-t-2 border-gray-700">
                <!-- Will be populated dynamically -->
            </div>
        </div>
    `;
}


