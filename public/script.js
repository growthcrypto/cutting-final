// Global variables
let chatters = [];
let currentAnalytics = [];
let revenueChart = null;
let performanceChart = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadChatters();
});

function initializeApp() {
    // Set default dates (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
}

function setupEventListeners() {
    // Tab navigation
    document.getElementById('uploadTab').addEventListener('click', () => showTab('upload'));
    document.getElementById('dashboardTab').addEventListener('click', () => showTab('dashboard'));
    document.getElementById('analysisTab').addEventListener('click', () => showTab('analysis'));

    // Form submissions
    document.getElementById('analyticsForm').addEventListener('submit', handleAnalyticsUpload);
    document.getElementById('messagesForm').addEventListener('submit', handleMessagesUpload);

    // Analysis buttons
    document.getElementById('analyzeChatter').addEventListener('click', analyzeIndividualChatter);
    document.getElementById('analyzeTeam').addEventListener('click', analyzeTeam);
}

function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active class from all tabs
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('bg-white', 'bg-opacity-30');
        btn.classList.add('bg-white', 'bg-opacity-20');
    });

    // Show selected tab
    document.getElementById(tabName + 'Section').classList.remove('hidden');
    
    // Add active class to selected tab
    const activeTab = document.getElementById(tabName + 'Tab');
    activeTab.classList.remove('bg-white', 'bg-opacity-20');
    activeTab.classList.add('bg-white', 'bg-opacity-30');

    // Load data for dashboard
    if (tabName === 'dashboard') {
        loadDashboardData();
    }
}

async function loadChatters() {
    try {
        const response = await fetch('/api/chatters');
        chatters = await response.json();
        
        // Populate chatter select dropdown
        const chatterSelect = document.getElementById('chatterSelect');
        chatterSelect.innerHTML = '<option value="">Select a chatter...</option>';
        
        chatters.forEach(chatter => {
            const option = document.createElement('option');
            option.value = chatter._id;
            option.textContent = chatter.name;
            chatterSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading chatters:', error);
        showNotification('Error loading chatters', 'error');
    }
}

async function handleAnalyticsUpload(event) {
    event.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('analyticsFile');
    
    if (!fileInput.files[0]) {
        showNotification('Please select a file to upload', 'error');
        return;
    }
    
    formData.append('file', fileInput.files[0]);
    
    try {
        showLoading(true);
        const response = await fetch('/api/upload/analytics', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(`Analytics data uploaded successfully! ${result.count} records processed.`, 'success');
            fileInput.value = '';
        } else {
            showNotification(result.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Upload failed', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleMessagesUpload(event) {
    event.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('messagesFile');
    
    if (!fileInput.files[0]) {
        showNotification('Please select a file to upload', 'error');
        return;
    }
    
    formData.append('file', fileInput.files[0]);
    
    try {
        showLoading(true);
        const response = await fetch('/api/upload/messages', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(`Messages data uploaded successfully! ${result.count} records processed.`, 'success');
            fileInput.value = '';
        } else {
            showNotification(result.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Upload failed', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadDashboardData() {
    try {
        showLoading(true);
        
        // Load team analytics (assuming team name is 'sales' - you can modify this)
        const response = await fetch('/api/analytics/team/sales');
        currentAnalytics = await response.json();
        
        updateDashboardMetrics();
        updateCharts();
        updateChatterTable();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Error loading dashboard data', 'error');
    } finally {
        showLoading(false);
    }
}

function updateDashboardMetrics() {
    if (currentAnalytics.length === 0) return;
    
    const totalRevenue = currentAnalytics.reduce((sum, a) => sum + a.revenue, 0);
    const totalConversions = currentAnalytics.reduce((sum, a) => sum + a.conversions, 0);
    const avgResponseTime = currentAnalytics.reduce((sum, a) => sum + a.responseTime, 0) / currentAnalytics.length;
    const avgSatisfaction = currentAnalytics.reduce((sum, a) => sum + a.customerSatisfaction, 0) / currentAnalytics.length;
    
    document.getElementById('totalRevenue').textContent = `$${totalRevenue.toLocaleString()}`;
    document.getElementById('totalConversions').textContent = totalConversions.toLocaleString();
    document.getElementById('avgResponseTime').textContent = `${avgResponseTime.toFixed(1)}m`;
    document.getElementById('avgSatisfaction').textContent = `${avgSatisfaction.toFixed(1)}/10`;
}

function updateCharts() {
    updateRevenueChart();
    updatePerformanceChart();
}

function updateRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    // Group analytics by date
    const dailyRevenue = {};
    currentAnalytics.forEach(analytics => {
        const date = new Date(analytics.date).toLocaleDateString();
        dailyRevenue[date] = (dailyRevenue[date] || 0) + analytics.revenue;
    });
    
    const dates = Object.keys(dailyRevenue).sort();
    const revenues = dates.map(date => dailyRevenue[date]);
    
    if (revenueChart) {
        revenueChart.destroy();
    }
    
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Daily Revenue',
                data: revenues,
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updatePerformanceChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    
    // Group analytics by chatter
    const chatterPerformance = {};
    currentAnalytics.forEach(analytics => {
        const chatterId = analytics.chatterId;
        if (!chatterPerformance[chatterId]) {
            chatterPerformance[chatterId] = {
                revenue: 0,
                conversions: 0,
                name: 'Unknown'
            };
        }
        chatterPerformance[chatterId].revenue += analytics.revenue;
        chatterPerformance[chatterId].conversions += analytics.conversions;
    });
    
    // Get chatter names
    chatters.forEach(chatter => {
        if (chatterPerformance[chatter._id]) {
            chatterPerformance[chatter._id].name = chatter.name;
        }
    });
    
    const labels = Object.values(chatterPerformance).map(p => p.name);
    const data = Object.values(chatterPerformance).map(p => p.revenue);
    
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    performanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(168, 85, 247, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(236, 72, 153, 0.8)'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateChatterTable() {
    const tbody = document.getElementById('chatterTableBody');
    tbody.innerHTML = '';
    
    // Group analytics by chatter
    const chatterStats = {};
    currentAnalytics.forEach(analytics => {
        const chatterId = analytics.chatterId;
        if (!chatterStats[chatterId]) {
            chatterStats[chatterId] = {
                revenue: 0,
                conversions: 0,
                responseTime: 0,
                satisfaction: 0,
                count: 0,
                name: 'Unknown'
            };
        }
        chatterStats[chatterId].revenue += analytics.revenue;
        chatterStats[chatterId].conversions += analytics.conversions;
        chatterStats[chatterId].responseTime += analytics.responseTime;
        chatterStats[chatterId].satisfaction += analytics.customerSatisfaction;
        chatterStats[chatterId].count += 1;
    });
    
    // Get chatter names and calculate averages
    chatters.forEach(chatter => {
        if (chatterStats[chatter._id]) {
            chatterStats[chatter._id].name = chatter.name;
            chatterStats[chatter._id].responseTime = chatterStats[chatter._id].responseTime / chatterStats[chatter._id].count;
            chatterStats[chatter._id].satisfaction = chatterStats[chatter._id].satisfaction / chatterStats[chatter._id].count;
        }
    });
    
    // Create table rows
    Object.entries(chatterStats).forEach(([chatterId, stats]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${stats.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">$${stats.revenue.toLocaleString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stats.conversions}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stats.responseTime.toFixed(1)}m</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stats.satisfaction.toFixed(1)}/10</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="analyzeChatterById('${chatterId}')" class="text-indigo-600 hover:text-indigo-900">
                    <i class="fas fa-brain mr-1"></i>Analyze
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function analyzeIndividualChatter() {
    const chatterId = document.getElementById('chatterSelect').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!chatterId) {
        showNotification('Please select a chatter to analyze', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        const response = await fetch(`/api/analyze/chatter/${chatterId}?${params}`);
        const analysis = await response.json();
        
        if (response.ok) {
            displayIndividualAnalysis(analysis);
        } else {
            showNotification(analysis.error || 'Analysis failed', 'error');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showNotification('Analysis failed', 'error');
    } finally {
        showLoading(false);
    }
}

async function analyzeChatterById(chatterId) {
    // Set the chatter in the select dropdown
    document.getElementById('chatterSelect').value = chatterId;
    
    // Switch to analysis tab
    showTab('analysis');
    
    // Run the analysis
    await analyzeIndividualChatter();
}

async function analyzeTeam() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    try {
        showLoading(true);
        
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        const response = await fetch(`/api/analyze/team/sales?${params}`);
        const analysis = await response.json();
        
        if (response.ok) {
            displayTeamAnalysis(analysis);
        } else {
            showNotification(analysis.error || 'Team analysis failed', 'error');
        }
    } catch (error) {
        console.error('Team analysis error:', error);
        showNotification('Team analysis failed', 'error');
    } finally {
        showLoading(false);
    }
}

function displayIndividualAnalysis(analysis) {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.classList.remove('hidden');
    
    const ai = analysis.aiAnalysis;
    
    resultsDiv.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-8">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
                <i class="fas fa-user text-indigo-500 mr-2"></i>AI Analysis: ${analysis.chatter.name}
            </h3>
            
            <!-- Overall Rating -->
            <div class="mb-8">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="text-lg font-semibold text-gray-700">Overall Performance Rating</h4>
                    <div class="flex items-center">
                        <div class="text-4xl font-bold text-indigo-600">${ai.overallRating}/10</div>
                        <div class="ml-4">
                            ${generateStarRating(ai.overallRating)}
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Strengths -->
                <div class="bg-green-50 rounded-lg p-6">
                    <h4 class="text-lg font-semibold text-green-800 mb-4">
                        <i class="fas fa-thumbs-up mr-2"></i>Key Strengths
                    </h4>
                    <ul class="space-y-2">
                        ${ai.strengths.map(strength => `
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                                <span class="text-green-700">${strength}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                
                <!-- Areas for Improvement -->
                <div class="bg-red-50 rounded-lg p-6">
                    <h4 class="text-lg font-semibold text-red-800 mb-4">
                        <i class="fas fa-exclamation-triangle mr-2"></i>Areas for Improvement
                    </h4>
                    <ul class="space-y-2">
                        ${ai.weaknesses.map(weakness => `
                            <li class="flex items-start">
                                <i class="fas fa-times-circle text-red-500 mt-1 mr-2"></i>
                                <span class="text-red-700">${weakness}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
            
            <!-- Recommendations -->
            <div class="mt-8 bg-blue-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-blue-800 mb-4">
                    <i class="fas fa-lightbulb mr-2"></i>AI Recommendations
                </h4>
                <ul class="space-y-3">
                    ${ai.recommendations.map(rec => `
                        <li class="flex items-start">
                            <i class="fas fa-arrow-right text-blue-500 mt-1 mr-3"></i>
                            <span class="text-blue-700">${rec}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <!-- Trends -->
            <div class="mt-8 bg-purple-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-purple-800 mb-4">
                    <i class="fas fa-chart-line mr-2"></i>Trend Analysis
                </h4>
                <p class="text-purple-700">${ai.trends}</p>
            </div>
            
            <!-- Revenue Opportunities -->
            <div class="mt-8 bg-yellow-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-yellow-800 mb-4">
                    <i class="fas fa-dollar-sign mr-2"></i>Revenue Optimization Opportunities
                </h4>
                <ul class="space-y-2">
                    ${ai.revenueOpportunities.map(opp => `
                        <li class="flex items-start">
                            <i class="fas fa-star text-yellow-500 mt-1 mr-2"></i>
                            <span class="text-yellow-700">${opp}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
    `;
}

function displayTeamAnalysis(analysis) {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.classList.remove('hidden');
    
    const ai = analysis.aiAnalysis;
    
    resultsDiv.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-8">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
                <i class="fas fa-users text-green-500 mr-2"></i>Team AI Analysis: ${analysis.team}
            </h3>
            
            <!-- Team Rating -->
            <div class="mb-8">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="text-lg font-semibold text-gray-700">Team Performance Rating</h4>
                    <div class="flex items-center">
                        <div class="text-4xl font-bold text-green-600">${ai.teamRating}/10</div>
                        <div class="ml-4">
                            ${generateStarRating(ai.teamRating)}
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Team Strengths -->
                <div class="bg-green-50 rounded-lg p-6">
                    <h4 class="text-lg font-semibold text-green-800 mb-4">
                        <i class="fas fa-thumbs-up mr-2"></i>Team Strengths
                    </h4>
                    <ul class="space-y-2">
                        ${ai.strengths.map(strength => `
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                                <span class="text-green-700">${strength}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                
                <!-- Team Weaknesses -->
                <div class="bg-red-50 rounded-lg p-6">
                    <h4 class="text-lg font-semibold text-red-800 mb-4">
                        <i class="fas fa-exclamation-triangle mr-2"></i>Team Weaknesses
                    </h4>
                    <ul class="space-y-2">
                        ${ai.weaknesses.map(weakness => `
                            <li class="flex items-start">
                                <i class="fas fa-times-circle text-red-500 mt-1 mr-2"></i>
                                <span class="text-red-700">${weakness}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
            
            <!-- Team Recommendations -->
            <div class="mt-8 bg-blue-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-blue-800 mb-4">
                    <i class="fas fa-lightbulb mr-2"></i>Team Recommendations
                </h4>
                <ul class="space-y-3">
                    ${ai.recommendations.map(rec => `
                        <li class="flex items-start">
                            <i class="fas fa-arrow-right text-blue-500 mt-1 mr-3"></i>
                            <span class="text-blue-700">${rec}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <!-- Training Needs -->
            <div class="mt-8 bg-purple-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-purple-800 mb-4">
                    <i class="fas fa-graduation-cap mr-2"></i>Training Needs
                </h4>
                <ul class="space-y-2">
                    ${ai.trainingNeeds.map(need => `
                        <li class="flex items-start">
                            <i class="fas fa-book text-purple-500 mt-1 mr-2"></i>
                            <span class="text-purple-700">${need}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <!-- Process Improvements -->
            <div class="mt-8 bg-indigo-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-indigo-800 mb-4">
                    <i class="fas fa-cogs mr-2"></i>Process Improvements
                </h4>
                <ul class="space-y-2">
                    ${ai.processImprovements.map(improvement => `
                        <li class="flex items-start">
                            <i class="fas fa-tools text-indigo-500 mt-1 mr-2"></i>
                            <span class="text-indigo-700">${improvement}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <!-- Top Performer Insights -->
            <div class="mt-8 bg-yellow-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-yellow-800 mb-4">
                    <i class="fas fa-star mr-2"></i>Top Performer Insights
                </h4>
                <p class="text-yellow-700">${ai.topPerformerInsights}</p>
            </div>
            
            <!-- Underperformer Support -->
            <div class="mt-8 bg-orange-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-orange-800 mb-4">
                    <i class="fas fa-hands-helping mr-2"></i>Underperformer Support
                </h4>
                <p class="text-orange-700">${ai.underperformerSupport}</p>
            </div>
        </div>
    `;
}

function generateStarRating(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let stars = '';
    
    // Full stars
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star text-yellow-400"></i>';
    }
    
    // Half star
    if (hasHalfStar) {
        stars += '<i class="fas fa-star-half-alt text-yellow-400"></i>';
    }
    
    // Empty stars
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star text-yellow-400"></i>';
    }
    
    return stars;
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    const statusDiv = document.getElementById('uploadStatus');
    const messageSpan = document.getElementById('uploadMessage');
    
    statusDiv.className = `mt-8 px-4 py-3 rounded ${
        type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
        type === 'error' ? 'bg-red-100 border border-red-400 text-red-700' :
        'bg-blue-100 border border-blue-400 text-blue-700'
    }`;
    
    messageSpan.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>
        ${message}
    `;
    
    statusDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusDiv.classList.add('hidden');
    }, 5000);
}
