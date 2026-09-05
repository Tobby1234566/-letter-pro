// Check authentication and admin role
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.user) {
      window.location.href = 'login.html';
      return null;
    }
    if (data.user.role !== 'admin') {
      window.location.href = 'dashboard.html';
      return null;
    }
    return data.user;
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

let currentUser = null;
let currentRequest = null;

async function init() {
  currentUser = await checkAuth();
  if (!currentUser) return;

  lucide.createIcons();
  loadStats();
  loadRequests();
  setupEventListeners();
}

function setupEventListeners() {
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  // Filters
  document.getElementById('filterStatus').addEventListener('change', loadRequests);
  document.getElementById('filterPriority').addEventListener('change', loadRequests);
  document.getElementById('searchInput').addEventListener('input', debounce(loadRequests, 300));

  // Modal close
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('detailModal').classList.remove('show');
  });

  // Mark as Paid
  document.getElementById('markPaidBtn').addEventListener('click', async () => {
    if (!currentRequest) return;
    await markAsPaid(currentRequest.id);
  });

  // Send Letter
  document.getElementById('sendLetterBtn').addEventListener('click', async () => {
    if (!currentRequest) return;
    await sendLetter(currentRequest.id);
  });

  // Letter form submit
  document.getElementById('letterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentRequest) return;
    await saveLetter(currentRequest.id);
  });
}

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();

    document.getElementById('statTotal').textContent = data.stats.total;
    document.getElementById('statPending').textContent = data.stats.pending;
    document.getElementById('statInProgress').textContent = data.stats.in_progress;
    document.getElementById('statCompleted').textContent = data.stats.completed;
    document.getElementById('statRevenue').textContent = '₦' + data.stats.revenue.toLocaleString();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadRequests() {
  const status = document.getElementById('filterStatus').value;
  const priority = document.getElementById('filterPriority').value;
  const search = document.getElementById('searchInput').value;

  let url = '/api/admin/requests?';
  const params = [];
  if (status) params.push(`status=${status}`);
  if (priority) params.push(`priority=${priority}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  url += params.join('&');

  try {
    const res = await fetch(url);
    const data = await res.json();
    renderRequests(data.requests);
  } catch (err) {
    console.error('Failed to load requests:', err);
  }
}

function renderRequests(requests) {
  const tbody = document.getElementById('requestsBody');

  if (!requests.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">No requests found</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(r => `
    <tr>
      <td>#${r.id}</td>
      <td>
        <div><strong>${escapeHtml(r.user_name)}</strong></div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(r.user_email)}</div>
      </td>
      <td>${r.letter_type || 'Picture'}</td>
      <td><span class="priority-badge ${r.priority}">${r.priority.charAt(0).toUpperCase() + r.priority.slice(1)}</span></td>
      <td><span class="badge ${r.status}">${formatStatus(r.status)}</span></td>
      <td><span class="price">${r.price === 0 ? 'FREE' : '₦' + r.price.toLocaleString()}</span></td>
      <td>${formatDate(r.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewRequest(${r.id})">View</button>
          ${r.status === 'pending' || r.status === 'pending_payment' ? `<button class="action-btn primary" onclick="markAsPaid(${r.id})">Mark Paid</button>` : ''}
          ${r.status === 'payment_submitted' ? `<button class="action-btn" onclick="viewRequest(${r.id})">View Receipt</button><button class="action-btn success" onclick="approvePayment(${r.id})">Approve</button>` : ''}
          ${r.status === 'paid' || r.status === 'in_progress' ? `<button class="action-btn primary" onclick="viewRequest(${r.id})">Write</button>` : ''}
          ${r.status !== 'completed' ? `<button class="action-btn success" onclick="sendLetter(${r.id})">Send</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function formatStatus(status) {
  const map = {
    'pending_payment': 'Awaiting Payment',
    'payment_submitted': 'Receipt Submitted',
    'pending': 'Pending',
    'paid': 'Paid',
    'in_progress': 'In Progress',
    'completed': 'Completed'
  };
  return map[status] || status;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

async function viewRequest(id) {
  try {
    const res = await fetch(`/api/admin/requests/${id}`);
    const data = await res.json();
    if (data.request) {
      openModal(data.request);
    }
  } catch (err) {
    console.error('Failed to load request:', err);
    showAlert('Failed to load request details', 'error');
  }
}

function openModal(request) {
  currentRequest = request;

  document.getElementById('modalRequestId').textContent = request.id;
  document.getElementById('detailCustomer').textContent = request.user_name;
  document.getElementById('detailEmail').textContent = request.user_email;
  document.getElementById('detailLetterType').textContent = request.letter_type || request.type;
  document.getElementById('detailPriority').innerHTML = `<span class="priority-badge ${request.priority}">${request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}</span>`;
  document.getElementById('detailPrice').textContent = request.price === 0 ? 'FREE' : '₦' + request.price.toLocaleString();
  document.getElementById('detailStatus').innerHTML = `<span class="badge ${request.status}">${formatStatus(request.status)}</span>`;
  document.getElementById('letterContent').value = request.letter_content || '';
  document.getElementById('letterRequestId').value = request.id;

  // Show description or image
  const descSection = document.getElementById('descriptionSection');
  const imageSection = document.getElementById('imageSection');
  const receiptSection = document.getElementById('receiptSection');

  if (request.type === 'description' && request.description) {
    descSection.style.display = 'block';
    document.getElementById('detailDescription').textContent = request.description;
    imageSection.style.display = 'none';
  } else if (request.type === 'picture' && request.file_path) {
    descSection.style.display = 'none';
    imageSection.style.display = 'block';
    document.getElementById('detailImage').src = `/uploads/${request.file_path}`;
  } else {
    descSection.style.display = 'none';
    imageSection.style.display = 'none';
  }

  // Show receipt if available
  if (request.payment_receipt_path) {
    receiptSection.style.display = 'block';
    document.getElementById('detailReceipt').src = `/uploads/${request.payment_receipt_path}`;
  } else {
    receiptSection.style.display = 'none';
  }

  // Show/hide buttons based on status
  document.getElementById('markPaidBtn').style.display =
    (request.status === 'pending') ? 'inline-flex' : 'none';

  document.getElementById('sendLetterBtn').style.display =
    (request.status === 'paid' || request.status === 'in_progress') ? 'inline-flex' : 'none';

  document.getElementById('detailModal').classList.add('show');
}

async function markAsPaid(id) {
  try {
    const res = await fetch(`/api/admin/requests/${id}/mark-paid`, { method: 'PUT' });
    if (res.ok) {
      showAlert('Marked as paid!', 'success');
      if (currentRequest && currentRequest.id === id) {
        currentRequest.status = 'paid';
        document.getElementById('detailStatus').innerHTML = '<span class="badge paid">Paid</span>';
        document.getElementById('markPaidBtn').style.display = 'none';
        document.getElementById('sendLetterBtn').style.display = 'inline-flex';
      }
      loadStats();
      loadRequests();
    }
  } catch (err) {
    showAlert('Failed to mark as paid', 'error');
  }
}

async function saveLetter(id) {
  const letterContent = document.getElementById('letterContent').value;

  try {
    const res = await fetch(`/api/admin/requests/${id}/letter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter_content: letterContent })
    });

    if (res.ok) {
      showAlert('Letter saved!', 'success');
      if (currentRequest && currentRequest.id === id) {
        currentRequest.letter_content = letterContent;
        currentRequest.status = 'in_progress';
        document.getElementById('detailStatus').innerHTML = '<span class="badge in_progress">In Progress</span>';
        document.getElementById('sendLetterBtn').style.display = 'inline-flex';
      }
      loadStats();
      loadRequests();
    }
  } catch (err) {
    showAlert('Failed to save letter', 'error');
  }
}

async function approvePayment(id) {
  if (!confirm('Approve this payment?')) return;

  try {
    const res = await fetch(`/api/admin/requests/${id}/approve-payment`, { method: 'POST' });

    if (res.ok) {
      showAlert('Payment approved!', 'success');
      document.getElementById('detailModal').classList.remove('show');
      loadStats();
      loadRequests();
    } else {
      const data = await res.json();
      showAlert(data.error || 'Failed to approve payment', 'error');
    }
  } catch (err) {
    showAlert('Failed to approve payment', 'error');
  }
}

async function sendLetter(id) {
  if (!confirm('Send this letter to the recipient?')) return;

  try {
    const res = await fetch(`/api/admin/requests/${id}/send`, { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      showAlert('Letter sent successfully!', 'success');
      document.getElementById('detailModal').classList.remove('show');
      loadStats();
      loadRequests();
    } else {
      showAlert(data.error || 'Failed to send letter', 'error');
    }
  } catch (err) {
    showAlert('Failed to send letter', 'error');
  }
}

function showAlert(message, type) {
  const alert = document.getElementById('modalAlert');
  alert.textContent = message;
  alert.className = `alert ${type}`;
  alert.style.display = 'block';
  setTimeout(() => { alert.style.display = 'none'; }, 5000);
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
