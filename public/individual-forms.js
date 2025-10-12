// ========================================
// DATA UPLOAD TAB SWITCHING
// ========================================
function showUploadTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.upload-tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active state from all buttons
    document.querySelectorAll('.upload-tab-btn').forEach(btn => {
        btn.classList.remove('bg-purple-600', 'bg-blue-600', 'bg-cyan-600', 'bg-pink-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });

    // Show selected tab
    const tabs = {
        'bulk': 'bulkUploadTab',
        'chatter': 'chatterUploadTab',
        'snapshot': 'snapshotUploadTab',
        'messages': 'messagesUploadTab',
        'links': 'linksUploadTab'
    };

    const colors = {
        'bulk': 'bg-purple-600',
        'chatter': 'bg-blue-600',
        'snapshot': 'bg-purple-600',
        'messages': 'bg-cyan-600',
        'links': 'bg-pink-600'
    };

    document.getElementById(tabs[tabName])?.classList.remove('hidden');
    
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-700', 'text-gray-300');
        activeBtn.classList.add(colors[tabName], 'text-white');
    }
}

// ========================================
// INDIVIDUAL UPLOAD FORM HANDLERS
// ========================================

// Handle chatter performance form
function initIndividualForms() {
    const chatterForm = document.getElementById('chatterPerformanceForm');
    if (chatterForm) {
        chatterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = {
                chatterName: formData.get('chatterName'),
                weekStartDate: formData.get('date'),
                weekEndDate: formData.get('date'),
                messagesSent: parseInt(formData.get('messagesSent')),
                ppvsSent: parseInt(formData.get('ppvsSent')),
                ppvsUnlocked: parseInt(formData.get('ppvsUnlocked')),
                fansChatted: parseInt(formData.get('fansChatted')) || 0,
                avgResponseTime: parseFloat(formData.get('avgResponseTime')) || 0
            };

            try {
                const response = await fetch('/api/analytics/chatter', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    showNotification('Chatter performance uploaded successfully!', 'success');
                    e.target.reset();
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                showNotification('Error uploading chatter performance', 'error');
            }
        });
    }

    // Handle account snapshot form
    const snapshotForm = document.getElementById('accountSnapshotForm');
    if (snapshotForm) {
        snapshotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = {
                creatorName: formData.get('creatorName'),
                date: formData.get('date'),
                totalSubs: parseInt(formData.get('totalSubs')),
                activeFans: parseInt(formData.get('activeFans')),
                fansWithRenewOn: parseInt(formData.get('withRenew')) || 0
            };

            try {
                const response = await fetch('/api/analytics/daily-snapshot', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    showNotification('Account snapshot uploaded successfully!', 'success');
                    e.target.reset();
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                showNotification('Error uploading account snapshot', 'error');
            }
        });
    }

    // Handle messages upload form
    const messagesForm = document.getElementById('messagesUploadForm');
    if (messagesForm) {
        messagesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);

            try {
                const response = await fetch('/api/upload/messages', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: formData
                });

                if (response.ok) {
                    showNotification('Messages uploaded successfully!', 'success');
                    e.target.reset();
                    const fileInfo = document.getElementById('messagesFileInfo');
                    if (fileInfo) fileInfo.classList.add('hidden');
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                showNotification('Error uploading messages', 'error');
            }
        });

        // Show file name when selected
        const messagesFile = document.getElementById('messagesFile');
        if (messagesFile) {
            messagesFile.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const fileNameSpan = document.getElementById('messagesFileName');
                    const fileInfo = document.getElementById('messagesFileInfo');
                    if (fileNameSpan && fileInfo) {
                        fileNameSpan.textContent = e.target.files[0].name;
                        fileInfo.classList.remove('hidden');
                    }
                }
            });
        }
    }

    // Handle link tracking form
    const linkForm = document.getElementById('linkTrackingForm');
    if (linkForm) {
        linkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = {
                category: formData.get('category'),
                creatorName: formData.get('creatorName'),
                weekStartDate: formData.get('date'),
                weekEndDate: formData.get('date'),
                landingPageViews: parseInt(formData.get('views')),
                onlyFansClicks: parseInt(formData.get('clicks'))
            };

            try {
                const response = await fetch('/api/marketing/link-tracking', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    showNotification('Link tracking data uploaded successfully!', 'success');
                    e.target.reset();
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                showNotification('Error uploading link tracking data', 'error');
            }
        });
    }
}

// Initialize forms
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIndividualForms);
} else {
    initIndividualForms();
}

