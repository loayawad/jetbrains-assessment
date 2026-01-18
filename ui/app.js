const API_BASE = '/api';

let currentScheduleId = null;

// DOM Elements
const modal = document.getElementById('modal');
const executionsModal = document.getElementById('executionsModal');
const scheduleForm = document.getElementById('scheduleForm');
const schedulesGrid = document.getElementById('schedulesGrid');
const modalTitle = document.getElementById('modalTitle');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSchedules();
    setupEventListeners();
});

function setupEventListeners() {
    // Create button
    document.getElementById('createBtn').addEventListener('click', () => {
        openModal();
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadSchedules();
    });

    // Close modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Form submit
    scheduleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSchedule();
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
        if (e.target === executionsModal) {
            executionsModal.style.display = 'none';
        }
    });
}

async function loadSchedules() {
    try {
        schedulesGrid.innerHTML = '<div class="loading">Loading schedules...</div>';
        const response = await fetch(`${API_BASE}/schedules`);
        const result = await response.json();

        if (result.success) {
            displaySchedules(result.data);
        } else {
            showError('Failed to load schedules');
        }
    } catch (error) {
        console.error('Error loading schedules:', error);
        showError('Failed to load schedules');
    }
}

function displaySchedules(schedules) {
    if (schedules.length === 0) {
        schedulesGrid.innerHTML = '<div class="no-data">No schedules yet. Create one to get started!</div>';
        return;
    }

    schedulesGrid.innerHTML = schedules.map(schedule => `
        <div class="schedule-card">
            <div class="schedule-header">
                <div class="schedule-name">${escapeHtml(schedule.name)}</div>
                <span class="schedule-status ${schedule.enabled ? 'status-enabled' : 'status-disabled'}">
                    ${schedule.enabled ? 'Enabled' : 'Disabled'}
                </span>
            </div>
            <div class="schedule-info">
                <div class="info-row">
                    <span class="info-label">Cron:</span>
                    <span class="info-value">${escapeHtml(schedule.cronExpression)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Agent ID:</span>
                    <span class="info-value">${escapeHtml(schedule.agentId)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Method:</span>
                    <span class="info-value">${schedule.httpMethod}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Max Retries:</span>
                    <span class="info-value">${schedule.retryPolicy.maxAttempts}</span>
                </div>
            </div>
            <div class="schedule-actions">
                <button class="btn btn-secondary" onclick="viewExecutions('${schedule.id}', '${escapeHtml(schedule.name)}')">
                    📊 History
                </button>
                <button class="btn btn-secondary" onclick="editSchedule('${schedule.id}')">
                    ✏️ Edit
                </button>
                <button class="btn btn-danger" onclick="deleteSchedule('${schedule.id}', '${escapeHtml(schedule.name)}')">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `).join('');
}

function openModal(schedule = null) {
    currentScheduleId = schedule ? schedule.id : null;
    modalTitle.textContent = schedule ? 'Edit Schedule' : 'Create Schedule';

    if (schedule) {
        // Populate form with existing data
        document.getElementById('name').value = schedule.name;
        document.getElementById('cronExpression').value = schedule.cronExpression;
        document.getElementById('agentId').value = schedule.agentId;
        document.getElementById('agentUrl').value = schedule.agentUrl;
        document.getElementById('httpMethod').value = schedule.httpMethod;
        document.getElementById('headers').value = JSON.stringify(schedule.headers || {}, null, 2);
        document.getElementById('payload').value = JSON.stringify(schedule.payload || {}, null, 2);
        document.getElementById('maxAttempts').value = schedule.retryPolicy.maxAttempts;
        document.getElementById('backoffMultiplier').value = schedule.retryPolicy.backoffMultiplier;
        document.getElementById('enabled').checked = schedule.enabled;
    } else {
        // Reset form
        scheduleForm.reset();
        document.getElementById('headers').value = '{}';
        document.getElementById('payload').value = '{}';
    }

    modal.style.display = 'block';
}

async function saveSchedule() {
    try {
        const formData = {
            name: document.getElementById('name').value,
            cronExpression: document.getElementById('cronExpression').value,
            agentId: document.getElementById('agentId').value,
            agentUrl: document.getElementById('agentUrl').value,
            httpMethod: document.getElementById('httpMethod').value,
            enabled: document.getElementById('enabled').checked,
            retryPolicy: {
                maxAttempts: parseInt(document.getElementById('maxAttempts').value),
                backoffMultiplier: parseFloat(document.getElementById('backoffMultiplier').value),
            }
        };

        // Parse JSON fields
        try {
            const headersText = document.getElementById('headers').value.trim();
            formData.headers = headersText ? JSON.parse(headersText) : {};
        } catch (e) {
            alert('Invalid JSON in headers field');
            return;
        }

        try {
            const payloadText = document.getElementById('payload').value.trim();
            formData.payload = payloadText ? JSON.parse(payloadText) : {};
        } catch (e) {
            alert('Invalid JSON in payload field');
            return;
        }

        const url = currentScheduleId 
            ? `${API_BASE}/schedules/${currentScheduleId}`
            : `${API_BASE}/schedules`;
        
        const method = currentScheduleId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            modal.style.display = 'none';
            loadSchedules();
            showSuccess(currentScheduleId ? 'Schedule updated!' : 'Schedule created!');
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error saving schedule:', error);
        alert('Failed to save schedule');
    }
}

async function editSchedule(id) {
    try {
        const response = await fetch(`${API_BASE}/schedules/${id}`);
        const result = await response.json();

        if (result.success) {
            openModal(result.data);
        } else {
            alert('Failed to load schedule');
        }
    } catch (error) {
        console.error('Error loading schedule:', error);
        alert('Failed to load schedule');
    }
}

async function deleteSchedule(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/schedules/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            loadSchedules();
            showSuccess('Schedule deleted!');
        } else {
            alert('Failed to delete schedule');
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        alert('Failed to delete schedule');
    }
}

async function viewExecutions(scheduleId, scheduleName) {
    try {
        document.getElementById('executionsTitle').textContent = `Execution History: ${scheduleName}`;
        document.getElementById('executionsList').innerHTML = '<div class="loading">Loading executions...</div>';
        executionsModal.style.display = 'block';

        const response = await fetch(`${API_BASE}/schedules/${scheduleId}/executions`);
        const result = await response.json();

        if (result.success) {
            displayExecutions(result.data);
        } else {
            document.getElementById('executionsList').innerHTML = '<div class="no-data">Failed to load executions</div>';
        }
    } catch (error) {
        console.error('Error loading executions:', error);
        document.getElementById('executionsList').innerHTML = '<div class="no-data">Failed to load executions</div>';
    }
}

function displayExecutions(executions) {
    if (executions.length === 0) {
        document.getElementById('executionsList').innerHTML = '<div class="no-data">No executions yet</div>';
        return;
    }

    document.getElementById('executionsList').innerHTML = executions.map(exec => {
        const statusClass = `execution-${exec.status.toLowerCase()}`;
        return `
            <div class="execution-item ${statusClass}">
                <div class="execution-header">
                    <span class="execution-status">${exec.status}</span>
                    <span class="execution-time">${new Date(exec.fireTime).toLocaleString()}</span>
                </div>
                <div class="execution-details">
                    Attempts: ${exec.attempts}
                    ${exec.startedAt ? ` | Started: ${new Date(exec.startedAt).toLocaleString()}` : ''}
                    ${exec.completedAt ? ` | Completed: ${new Date(exec.completedAt).toLocaleString()}` : ''}
                </div>
                ${exec.error ? `<div class="execution-details" style="color: #f44336; margin-top: 8px;">Error: ${escapeHtml(exec.error)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    // Simple alert for now - could be replaced with toast notification
    console.log('✅', message);
}

function showError(message) {
    schedulesGrid.innerHTML = `<div class="no-data" style="color: #f44336;">${message}</div>`;
}
