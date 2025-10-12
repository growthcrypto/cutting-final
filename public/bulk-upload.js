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

    // Traffic Sources
    if (headerStr.includes('source') && headerStr.includes('clicks')) {
        return 'trafficSources';
    }

    return null;
}

// Render preview
function renderPreview(data) {
    const previewContent = document.getElementById('previewContent');
    document.getElementById('previewSection').classList.remove('hidden');

    let html = '';
    const dataTypeNames = {
        dailySales: { name: 'Daily Sales', icon: 'dollar-sign', color: 'green' },
        chatterPerformance: { name: 'Chatter Performance', icon: 'chart-line', color: 'blue' },
        accountSnapshot: { name: 'Account Snapshots', icon: 'camera', color: 'purple' },
        messages: { name: 'Messages', icon: 'comments', color: 'cyan' },
        vipFans: { name: 'VIP Fans', icon: 'star', color: 'yellow' },
        trafficSources: { name: 'Traffic Sources', icon: 'link', color: 'orange' }
    };

    Object.entries(data).forEach(([type, rows]) => {
        const info = dataTypeNames[type] || { name: type, icon: 'table', color: 'gray' };
        
        html += `
            <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
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
        trafficSources: '/api/bulk/traffic-sources'
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

