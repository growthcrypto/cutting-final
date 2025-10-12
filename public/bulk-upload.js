// ========================================
// BULK DATA UPLOAD SYSTEM
// ========================================

let uploadedFile = null;
let parsedData = null;

// Initialize upload interface
function initBulkUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('bulkFileInput');

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-purple-500', 'bg-purple-900/20');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-purple-500', 'bg-purple-900/20');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-purple-500', 'bg-purple-900/20');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // File input handler
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

// Handle file upload
async function handleFileUpload(file) {
    if (!file) return;

    // Validate file type
    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv'
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        showNotification('Please upload a valid Excel (.xlsx, .xls) or CSV file', 'error');
        return;
    }

    uploadedFile = file;

    // Show file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').classList.remove('hidden');

    // Parse the file
    showNotification('Parsing file...', 'info');
    
    try {
        const data = await readFile(file);
        parsedData = parseExcelData(data);
        
        if (!parsedData || Object.keys(parsedData).length === 0) {
            showNotification('No valid data found in file', 'error');
            return;
        }

        renderPreview(parsedData);
        showNotification(`Found ${Object.keys(parsedData).length} data type(s) in file`, 'success');
    } catch (error) {
        console.error('Error parsing file:', error);
        showNotification('Error parsing file: ' + error.message, 'error');
    }
}

// Read file as array buffer
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Parse Excel data
function parseExcelData(arrayBuffer) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const detectedData = {};

    // Process each sheet
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (jsonData.length === 0) return;

        const headers = jsonData[0];
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));

        if (rows.length === 0) return;

        // Detect data type
        const dataType = detectDataType(headers);
        
        if (dataType) {
            if (!detectedData[dataType]) {
                detectedData[dataType] = [];
            }

            // Convert rows to objects
            rows.forEach(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    if (header) {
                        obj[header] = row[index];
                    }
                });
                detectedData[dataType].push(obj);
            });
        }
    });

    return detectedData;
}

// Detect data type from headers
function detectDataType(headers) {
    if (!headers || headers.length === 0) return null;

    const headerStr = headers.join('|').toLowerCase();

    // Daily Sales
    if (headerStr.includes('chatter') && headerStr.includes('revenue') && headerStr.includes('date')) {
        return 'dailySales';
    }

    // Chatter Performance
    if (headerStr.includes('chatter') && headerStr.includes('ppv') && (headerStr.includes('sent') || headerStr.includes('unlock'))) {
        return 'chatterPerformance';
    }

    // Account Snapshots
    if (headerStr.includes('creator') && headerStr.includes('subs') && headerStr.includes('active')) {
        return 'accountSnapshot';
    }

    // Messages
    if (headerStr.includes('message') && (headerStr.includes('text') || headerStr.includes('content'))) {
        return 'messages';
    }

    // VIP Fans
    if (headerStr.includes('fan') && headerStr.includes('spent') && headerStr.includes('total')) {
        return 'vipFans';
    }

    // Traffic Sources / Link Tracking
    if (headerStr.includes('source') && headerStr.includes('clicks')) {
        return 'trafficSources';
    }

    // Link Tracking Data
    if ((headerStr.includes('link') || headerStr.includes('landing')) && 
        (headerStr.includes('clicks') || headerStr.includes('views'))) {
        return 'linkTracking';
    }

    return null;
}

// Render preview with confirmation summary
function renderPreview(data) {
    const previewContent = document.getElementById('previewContent');
    document.getElementById('previewSection').classList.remove('hidden');

    const dataTypeNames = {
        dailySales: { name: 'Daily Sales', icon: 'dollar-sign', color: 'green' },
        chatterPerformance: { name: 'Chatter Performance', icon: 'chart-line', color: 'blue' },
        accountSnapshot: { name: 'Account Snapshots', icon: 'camera', color: 'purple' },
        messages: { name: 'Messages', icon: 'comments', color: 'cyan' },
        vipFans: { name: 'VIP Fans', icon: 'star', color: 'yellow' },
        trafficSources: { name: 'Traffic Sources', icon: 'link', color: 'orange' },
        linkTracking: { name: 'Link Tracking', icon: 'external-link-alt', color: 'pink' }
    };

    // Calculate totals for confirmation summary
    const summary = calculateDataSummary(data);
    
    // Build confirmation summary at the top
    let html = `
        <div class="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-xl p-8 border-2 border-purple-500/50 mb-6">
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center">
                    <i class="fas fa-check-circle text-green-400 text-4xl mr-4"></i>
                    <div>
                        <h3 class="text-2xl font-bold text-white">Data Ready to Import</h3>
                        <p class="text-gray-300">Review the summary below and confirm to import</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-4xl font-bold text-purple-400">${Object.keys(data).length}</div>
                    <div class="text-sm text-gray-400">Data Types</div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                ${summary.map(item => `
                    <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-${item.color}-500/50 transition-all">
                        <div class="text-${item.color}-400 text-2xl mb-2">
                            <i class="fas fa-${item.icon}"></i>
                        </div>
                        <div class="text-3xl font-bold text-white mb-1">${typeof item.value === 'string' ? item.value : item.value.toLocaleString()}</div>
                        <div class="text-sm text-gray-400">${item.label}</div>
                    </div>
                `).join('')}
            </div>

            ${generateChatterBreakdown(data)}
            ${generateCreatorBreakdown(data)}
            ${generateRevenueBreakdown(data)}

            <div class="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4 mt-4">
                <div class="flex items-start">
                    <i class="fas fa-info-circle text-blue-400 mr-3 mt-1"></i>
                    <div>
                        <p class="text-white font-semibold mb-1">What will happen:</p>
                        <ul class="text-gray-300 text-sm space-y-1">
                            <li>• Existing records will be <strong>updated</strong> with new data</li>
                            <li>• New records will be <strong>created</strong></li>
                            <li>• Your dashboard will <strong>refresh automatically</strong></li>
                            <li>• This usually takes <strong>5-10 seconds</strong></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add detailed preview sections
    Object.entries(data).forEach(([type, rows]) => {
        const info = dataTypeNames[type] || { name: type, icon: 'table', color: 'gray' };
        
        html += `
            <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700 mb-4">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="text-xl font-bold text-white flex items-center">
                        <i class="fas fa-${info.icon} text-${info.color}-400 mr-3"></i>
                        ${info.name}
                    </h4>
                    <span class="bg-${info.color}-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                        ${rows.length} rows
                    </span>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b border-gray-700">
                                ${Object.keys(rows[0] || {}).map(key => 
                                    `<th class="text-left py-2 px-3 text-gray-400 font-semibold">${key}</th>`
                                ).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.slice(0, 5).map(row => `
                                <tr class="border-b border-gray-800">
                                    ${Object.values(row).map(val => 
                                        `<td class="py-2 px-3 text-gray-300">${val || '-'}</td>`
                                    ).join('')}
                                </tr>
                            `).join('')}
                            ${rows.length > 5 ? `
                                <tr>
                                    <td colspan="${Object.keys(rows[0]).length}" class="py-2 px-3 text-gray-500 text-center italic">
                                        ... and ${rows.length - 5} more rows
                                    </td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    previewContent.innerHTML = html;
}

// Calculate summary statistics from parsed data
function calculateDataSummary(data) {
    const summary = [];

    // Total rows
    const totalRows = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
    summary.push({
        icon: 'table',
        color: 'purple',
        value: totalRows,
        label: 'Total Rows'
    });

    // Chatter Performance metrics
    if (data.chatterPerformance) {
        const totalMessages = data.chatterPerformance.reduce((sum, row) => {
            const messages = parseInt(row['Messages Sent'] || row['messagesSent'] || row['Messages'] || 0);
            return sum + messages;
        }, 0);
        
        const totalPPVsSent = data.chatterPerformance.reduce((sum, row) => {
            const ppvs = parseInt(row['PPVs Sent'] || row['ppvsSent'] || row['PPV Sent'] || 0);
            return sum + ppvs;
        }, 0);

        const totalPPVsUnlocked = data.chatterPerformance.reduce((sum, row) => {
            const unlocked = parseInt(row['PPVs Unlocked'] || row['ppvsUnlocked'] || row['PPV Unlocked'] || 0);
            return sum + unlocked;
        }, 0);

        const totalFans = data.chatterPerformance.reduce((sum, row) => {
            const fans = parseInt(row['Fans Chatted'] || row['fansChatted'] || row['Fans'] || 0);
            return sum + fans;
        }, 0);

        // Calculate avg response time
        const responseTimeRows = data.chatterPerformance.filter(row => {
            const rt = parseFloat(row['Avg Response Time'] || row['avgResponseTime'] || row['Response Time'] || 0);
            return rt > 0;
        });
        const avgResponseTime = responseTimeRows.length > 0
            ? responseTimeRows.reduce((sum, row) => {
                return sum + parseFloat(row['Avg Response Time'] || row['avgResponseTime'] || row['Response Time'] || 0);
            }, 0) / responseTimeRows.length
            : 0;

        if (totalMessages > 0) {
            summary.push({
                icon: 'comments',
                color: 'cyan',
                value: totalMessages,
                label: 'Messages Sent'
            });
        }

        if (totalPPVsSent > 0) {
            summary.push({
                icon: 'paper-plane',
                color: 'blue',
                value: totalPPVsSent,
                label: 'PPVs Sent'
            });
        }

        if (totalPPVsUnlocked > 0) {
            summary.push({
                icon: 'unlock',
                color: 'green',
                value: totalPPVsUnlocked,
                label: 'PPVs Unlocked'
            });
        }

        if (totalFans > 0) {
            summary.push({
                icon: 'user-friends',
                color: 'purple',
                value: totalFans,
                label: 'Fans Chatted'
            });
        }

        // Calculate unlock rate
        if (totalPPVsSent > 0) {
            const unlockRate = ((totalPPVsUnlocked / totalPPVsSent) * 100).toFixed(1);
            summary.push({
                icon: 'percent',
                color: 'yellow',
                value: unlockRate + '%',
                label: 'Unlock Rate'
            });
        }

        // Show avg response time
        if (avgResponseTime > 0) {
            summary.push({
                icon: 'clock',
                color: 'orange',
                value: avgResponseTime.toFixed(1) + 'm',
                label: 'Avg Response Time'
            });
        }

        // Calculate messages per PPV
        if (totalPPVsSent > 0) {
            const messagesPerPPV = (totalMessages / totalPPVsSent).toFixed(1);
            summary.push({
                icon: 'chart-line',
                color: 'indigo',
                value: messagesPerPPV,
                label: 'Messages per PPV'
            });
        }
    }

    // Daily Sales metrics
    if (data.dailySales) {
        const totalRevenue = data.dailySales.reduce((sum, row) => {
            const revenue = parseFloat(row['Revenue'] || row['revenue'] || row['Total Revenue'] || 0);
            return sum + revenue;
        }, 0);

        if (totalRevenue > 0) {
            summary.push({
                icon: 'dollar-sign',
                color: 'green',
                value: '$' + totalRevenue.toFixed(0),
                label: 'Total Revenue'
            });
        }
    }

    // Account Snapshot metrics
    if (data.accountSnapshot) {
        const uniqueCreators = new Set(data.accountSnapshot.map(row => 
            row['Creator Name'] || row['creatorName'] || row['Creator'] || row['Model']
        )).size;

        // Calculate averages across all snapshots
        const totalSubs = data.accountSnapshot.reduce((sum, row) => {
            return sum + parseInt(row['Total Subs'] || row['totalSubs'] || row['Subscribers'] || 0);
        }, 0);

        const totalActive = data.accountSnapshot.reduce((sum, row) => {
            return sum + parseInt(row['Active Fans'] || row['activeFans'] || row['Active'] || 0);
        }, 0);

        const totalWithRenew = data.accountSnapshot.reduce((sum, row) => {
            return sum + parseInt(row['With Renew'] || row['withRenew'] || row['Renew On'] || 0);
        }, 0);

        const avgSubs = data.accountSnapshot.length > 0 ? Math.round(totalSubs / data.accountSnapshot.length) : 0;
        const avgActive = data.accountSnapshot.length > 0 ? Math.round(totalActive / data.accountSnapshot.length) : 0;
        const renewRate = avgSubs > 0 ? ((totalWithRenew / totalSubs) * 100).toFixed(1) : 0;

        summary.push({
            icon: 'users',
            color: 'purple',
            value: uniqueCreators,
            label: 'Creators'
        });

        if (avgSubs > 0) {
            summary.push({
                icon: 'user-plus',
                color: 'blue',
                value: avgSubs,
                label: 'Avg Subscribers'
            });
        }

        if (avgActive > 0) {
            summary.push({
                icon: 'user-check',
                color: 'green',
                value: avgActive,
                label: 'Avg Active Fans'
            });
        }

        if (totalWithRenew > 0) {
            summary.push({
                icon: 'sync',
                color: 'cyan',
                value: renewRate + '%',
                label: 'Renewal Rate'
            });
        }
    }

    // Messages
    if (data.messages) {
        const uniqueChatters = new Set(data.messages.map(row => 
            row['Chatter Name'] || row['chatterName'] || row['Chatter']
        )).size;

        summary.push({
            icon: 'users',
            color: 'cyan',
            value: uniqueChatters,
            label: 'Chatters'
        });

        summary.push({
            icon: 'comment-dots',
            color: 'blue',
            value: data.messages.length,
            label: 'Message Records'
        });
    }

    // VIP Fans
    if (data.vipFans) {
        const totalVIPSpend = data.vipFans.reduce((sum, row) => {
            const spent = parseFloat(row['Total Spent'] || row['totalSpent'] || row['LTV'] || 0);
            return sum + spent;
        }, 0);

        summary.push({
            icon: 'star',
            color: 'yellow',
            value: data.vipFans.length,
            label: 'VIP Fans'
        });

        if (totalVIPSpend > 0) {
            summary.push({
                icon: 'gem',
                color: 'purple',
                value: '$' + totalVIPSpend.toFixed(0),
                label: 'VIP Revenue'
            });
        }
    }

    // Link Tracking / Traffic Data
    if (data.linkTracking) {
        const totalViews = data.linkTracking.reduce((sum, row) => {
            return sum + parseInt(row['Landing Page Views'] || row['landingPageViews'] || row['Views'] || 0);
        }, 0);

        const totalClicks = data.linkTracking.reduce((sum, row) => {
            return sum + parseInt(row['OnlyFans Clicks'] || row['onlyFansClicks'] || row['Clicks'] || row['OF Clicks'] || 0);
        }, 0);

        const clickThroughRate = totalViews > 0 
            ? ((totalClicks / totalViews) * 100).toFixed(1)
            : 0;

        if (totalViews > 0) {
            summary.push({
                icon: 'eye',
                color: 'blue',
                value: totalViews,
                label: 'Landing Views'
            });
        }

        if (totalClicks > 0) {
            summary.push({
                icon: 'mouse-pointer',
                color: 'pink',
                value: totalClicks,
                label: 'OF Link Clicks'
            });
        }

        if (totalViews > 0 && totalClicks > 0) {
            summary.push({
                icon: 'percentage',
                color: 'cyan',
                value: clickThroughRate + '%',
                label: 'Click-Through Rate'
            });
        }
    }

    // Traffic Sources (if separate)
    if (data.trafficSources) {
        const totalTrafficClicks = data.trafficSources.reduce((sum, row) => {
            return sum + parseInt(row['Clicks'] || row['clicks'] || 0);
        }, 0);

        if (totalTrafficClicks > 0) {
            summary.push({
                icon: 'link',
                color: 'orange',
                value: totalTrafficClicks,
                label: 'Traffic Clicks'
            });
        }
    }

    return summary;
}

// Generate chatter-by-chatter breakdown
function generateChatterBreakdown(data) {
    if (!data.chatterPerformance) return '';

    // Group by chatter
    const byChatter = {};
    data.chatterPerformance.forEach(row => {
        const chatter = row['Chatter Name'] || row['chatterName'] || row['Chatter'];
        if (!chatter) return;

        if (!byChatter[chatter]) {
            byChatter[chatter] = {
                messages: 0,
                ppvsSent: 0,
                ppvsUnlocked: 0,
                fans: 0,
                records: 0,
                responseTimes: []
            };
        }

        byChatter[chatter].messages += parseInt(row['Messages Sent'] || row['messagesSent'] || row['Messages'] || 0);
        byChatter[chatter].ppvsSent += parseInt(row['PPVs Sent'] || row['ppvsSent'] || row['PPV Sent'] || 0);
        byChatter[chatter].ppvsUnlocked += parseInt(row['PPVs Unlocked'] || row['ppvsUnlocked'] || row['PPV Unlocked'] || 0);
        byChatter[chatter].fans += parseInt(row['Fans Chatted'] || row['fansChatted'] || row['Fans'] || 0);
        
        const rt = parseFloat(row['Avg Response Time'] || row['avgResponseTime'] || row['Response Time'] || 0);
        if (rt > 0) {
            byChatter[chatter].responseTimes.push(rt);
        }
        
        byChatter[chatter].records++;
    });

    if (Object.keys(byChatter).length === 0) return '';

    return `
        <div class="bg-gray-800/40 rounded-lg p-6 border border-gray-700 mb-4">
            <h4 class="text-lg font-bold text-white mb-4 flex items-center">
                <i class="fas fa-users text-cyan-400 mr-2"></i>
                Performance by Chatter
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${Object.entries(byChatter).map(([name, stats]) => {
                    const unlockRate = stats.ppvsSent > 0 
                        ? ((stats.ppvsUnlocked / stats.ppvsSent) * 100).toFixed(1)
                        : 0;
                    const avgResponseTime = stats.responseTimes.length > 0
                        ? (stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length).toFixed(1)
                        : null;
                    const messagesPerPPV = stats.ppvsSent > 0 
                        ? (stats.messages / stats.ppvsSent).toFixed(1)
                        : 0;
                    
                    return `
                        <div class="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-white font-bold text-lg">${name}</span>
                                <span class="text-xs text-gray-500">${stats.records} record${stats.records > 1 ? 's' : ''}</span>
                            </div>
                            <div class="space-y-1.5 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Messages:</span>
                                    <span class="text-cyan-400 font-semibold">${stats.messages.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Fans Chatted:</span>
                                    <span class="text-purple-400 font-semibold">${stats.fans.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">PPVs Sent:</span>
                                    <span class="text-blue-400 font-semibold">${stats.ppvsSent}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">PPVs Unlocked:</span>
                                    <span class="text-green-400 font-semibold">${stats.ppvsUnlocked}</span>
                                </div>
                                <div class="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
                                    <span class="text-gray-400">Unlock Rate:</span>
                                    <span class="text-yellow-400 font-bold">${unlockRate}%</span>
                                </div>
                                ${avgResponseTime ? `
                                    <div class="flex justify-between">
                                        <span class="text-gray-400">Avg Response:</span>
                                        <span class="text-orange-400 font-semibold">${avgResponseTime}m</span>
                                    </div>
                                ` : ''}
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Msgs per PPV:</span>
                                    <span class="text-indigo-400 font-semibold">${messagesPerPPV}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Generate creator/account breakdown
function generateCreatorBreakdown(data) {
    if (!data.accountSnapshot) return '';

    // Group by creator
    const byCreator = {};
    data.accountSnapshot.forEach(row => {
        const creator = row['Creator Name'] || row['creatorName'] || row['Creator'] || row['Model'];
        if (!creator) return;

        if (!byCreator[creator]) {
            byCreator[creator] = {
                subs: [],
                active: [],
                withRenew: [],
                records: 0
            };
        }

        const subs = parseInt(row['Total Subs'] || row['totalSubs'] || row['Subscribers'] || 0);
        const active = parseInt(row['Active Fans'] || row['activeFans'] || row['Active'] || 0);
        const renew = parseInt(row['With Renew'] || row['withRenew'] || row['Renew On'] || 0);

        if (subs > 0) byCreator[creator].subs.push(subs);
        if (active > 0) byCreator[creator].active.push(active);
        if (renew > 0) byCreator[creator].withRenew.push(renew);
        
        byCreator[creator].records++;
    });

    if (Object.keys(byCreator).length === 0) return '';

    return `
        <div class="bg-gray-800/40 rounded-lg p-6 border border-gray-700 mb-4">
            <h4 class="text-lg font-bold text-white mb-4 flex items-center">
                <i class="fas fa-camera text-purple-400 mr-2"></i>
                Account Snapshots by Creator
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${Object.entries(byCreator).map(([name, stats]) => {
                    const avgSubs = stats.subs.length > 0
                        ? Math.round(stats.subs.reduce((a, b) => a + b, 0) / stats.subs.length)
                        : 0;
                    const avgActive = stats.active.length > 0
                        ? Math.round(stats.active.reduce((a, b) => a + b, 0) / stats.active.length)
                        : 0;
                    const totalWithRenew = stats.withRenew.reduce((a, b) => a + b, 0);
                    const totalSubs = stats.subs.reduce((a, b) => a + b, 0);
                    const renewRate = totalSubs > 0
                        ? ((totalWithRenew / totalSubs) * 100).toFixed(1)
                        : 0;
                    
                    return `
                        <div class="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-white font-bold text-lg">${name}</span>
                                <span class="text-xs text-gray-500">${stats.records} snapshot${stats.records > 1 ? 's' : ''}</span>
                            </div>
                            <div class="space-y-1.5 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Avg Subscribers:</span>
                                    <span class="text-blue-400 font-bold text-lg">${avgSubs.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Avg Active:</span>
                                    <span class="text-green-400 font-semibold">${avgActive.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Total w/ Renew:</span>
                                    <span class="text-purple-400 font-semibold">${totalWithRenew.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
                                    <span class="text-gray-400">Renewal Rate:</span>
                                    <span class="text-cyan-400 font-bold">${renewRate}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Generate revenue breakdown
function generateRevenueBreakdown(data) {
    if (!data.dailySales) return '';

    // Group by chatter
    const byChatter = {};
    data.dailySales.forEach(row => {
        const chatter = row['Chatter Name'] || row['chatterName'] || row['Chatter'];
        const revenue = parseFloat(row['Revenue'] || row['revenue'] || row['Total Revenue'] || 0);
        
        if (!chatter) return;

        if (!byChatter[chatter]) {
            byChatter[chatter] = {
                revenue: 0,
                records: 0
            };
        }

        byChatter[chatter].revenue += revenue;
        byChatter[chatter].records++;
    });

    if (Object.keys(byChatter).length === 0) return '';

    // Sort by revenue descending
    const sorted = Object.entries(byChatter).sort((a, b) => b[1].revenue - a[1].revenue);
    const totalRevenue = Object.values(byChatter).reduce((sum, c) => sum + c.revenue, 0);

    return `
        <div class="bg-gray-800/40 rounded-lg p-6 border border-gray-700 mb-4">
            <h4 class="text-lg font-bold text-white mb-4 flex items-center">
                <i class="fas fa-dollar-sign text-green-400 mr-2"></i>
                Revenue Breakdown
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                ${sorted.map(([name, stats]) => {
                    const percentage = totalRevenue > 0 ? ((stats.revenue / totalRevenue) * 100).toFixed(1) : 0;
                    return `
                        <div class="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-white font-bold">${name}</span>
                                <span class="text-xs text-gray-500">${stats.records} day${stats.records > 1 ? 's' : ''}</span>
                            </div>
                            <div class="text-2xl font-bold text-green-400 mb-1">$${stats.revenue.toFixed(2)}</div>
                            <div class="text-xs text-gray-400">${percentage}% of total</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Import bulk data
async function importBulkData() {
    if (!parsedData) {
        showNotification('No data to import', 'error');
        return;
    }

    const importBtn = document.getElementById('importDataBtn');
    importBtn.disabled = true;
    importBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Importing...';

    try {
        const results = {};
        
        for (const [type, rows] of Object.entries(parsedData)) {
            showNotification(`Importing ${type}...`, 'info');
            
            const endpoint = getBulkImportEndpoint(type);
            if (!endpoint) {
                console.warn(`No endpoint for ${type}`);
                continue;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: rows })
            });

            const result = await response.json();
            results[type] = result;
        }

        showNotification('All data imported successfully!', 'success');
        
        // Clear and reset
        setTimeout(() => {
            clearFile();
            // Optionally refresh dashboard
            if (typeof loadDashboardData === 'function') {
                loadDashboardData();
            }
        }, 1500);

    } catch (error) {
        console.error('Import error:', error);
        showNotification('Error importing data: ' + error.message, 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Import Data';
    }
}

// Get bulk import endpoint
function getBulkImportEndpoint(dataType) {
    const endpoints = {
        dailySales: '/api/bulk/daily-sales',
        chatterPerformance: '/api/bulk/chatter-performance',
        accountSnapshot: '/api/bulk/account-snapshots',
        messages: '/api/bulk/messages',
        vipFans: '/api/bulk/vip-fans',
        trafficSources: '/api/bulk/traffic-sources',
        linkTracking: '/api/bulk/link-tracking'
    };
    return endpoints[dataType];
}

// Clear file
function clearFile() {
    uploadedFile = null;
    parsedData = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('previewSection').classList.add('hidden');
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBulkUpload);
} else {
    initBulkUpload();
}

