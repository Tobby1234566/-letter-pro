// Check authentication
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.user) {
      window.location.href = 'login.html';
      return null;
    }
    return data.user;
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

// CSRF Token management
let csrfToken = null;

async function fetchCsrfToken() {
  try {
    const res = await fetch('/api/auth/csrf-token');
    const data = await res.json();
    csrfToken = data.csrfToken;
  } catch (err) {
    console.error('Failed to fetch CSRF token');
  }
}

function getCsrfHeaders() {
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
}

// Initialize
let currentUser = null;
let selectedPriority = 'medium';

async function init() {
  currentUser = await checkAuth();
  if (!currentUser) return;

  await fetchCsrfToken();
  document.getElementById('userName').textContent = currentUser.name;
  lucide.createIcons();

  // Check if trial is still available
  if (currentUser.trial_used === 0) {
    // First request is free
  }

  loadRequests();
  setupEventListeners();
}

function setupEventListeners() {
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: getCsrfHeaders() });
    window.location.href = 'login.html';
  });

  // New Request Modal
  document.getElementById('newRequestBtn').addEventListener('click', () => {
    document.getElementById('requestModal').classList.add('show');
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  // Done button - show after payment details
  if (document.getElementById('doneBtn')) {
    document.getElementById('doneBtn').addEventListener('click', closeModal);
  }

  // Type toggle
  document.querySelectorAll('.type-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const type = btn.dataset.type;
      document.getElementById('descriptionSection').classList.toggle('active', type === 'description');
      document.getElementById('pictureSection').classList.toggle('active', type === 'picture');
    });
  });

  // Priority selection
  document.querySelectorAll('.priority-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedPriority = opt.dataset.priority;
    });
  });

  // File upload
  const fileUpload = document.getElementById('fileUpload');
  const fileInput = document.getElementById('fileInput');

  fileUpload.addEventListener('click', () => fileInput.click());
  fileUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUpload.style.borderColor = 'var(--accent)';
  });
  fileUpload.addEventListener('dragleave', () => {
    fileUpload.style.borderColor = 'var(--border)';
  });
  fileUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUpload.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelect();
    }
  });

  fileInput.addEventListener('change', handleFileSelect);

  // Form submit
  document.getElementById('requestForm').addEventListener('submit', handleSubmit);

  // Inline receipt upload handlers
  const inlineReceiptInput = document.getElementById('inlineReceiptInput');
  const inlineReceiptPreview = document.getElementById('inlineReceiptPreview');
  const inlineUploadBtn = document.getElementById('inlineUploadBtn');
  const inlineReceiptUpload = document.getElementById('inlineReceiptUpload');

  if (inlineReceiptInput) {
    inlineReceiptInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          showAlert('File too large. Max 5MB.', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          inlineReceiptPreview.src = e.target.result;
          inlineReceiptPreview.style.display = 'block';
          inlineUploadBtn.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    inlineReceiptUpload.addEventListener('click', () => inlineReceiptInput.click());

    inlineReceiptUpload.addEventListener('dragover', (e) => {
      e.preventDefault();
      inlineReceiptUpload.style.borderColor = 'var(--accent)';
    });

    inlineReceiptUpload.addEventListener('dragleave', () => {
      inlineReceiptUpload.style.borderColor = '#22c55e';
    });

    inlineReceiptUpload.addEventListener('drop', (e) => {
      e.preventDefault();
      inlineReceiptUpload.style.borderColor = '#22c55e';
      if (e.dataTransfer.files.length) {
        inlineReceiptInput.files = e.dataTransfer.files;
        inlineReceiptInput.dispatchEvent(new Event('change'));
      }
    });

    inlineUploadBtn.addEventListener('click', async () => {
      if (!inlineReceiptInput.files.length || !window.currentSubmittedRequestId) return;

      inlineUploadBtn.disabled = true;
      inlineUploadBtn.textContent = 'Uploading...';

      const formData = new FormData();
      formData.append('receipt', inlineReceiptInput.files[0]);

      try {
        const res = await fetch(`/api/requests/${window.currentSubmittedRequestId}/receipt`, {
          method: 'POST',
          headers: getCsrfHeaders(),
          body: formData
        });

        if (res.ok) {
          inlineUploadBtn.style.display = 'none';
          inlineReceiptUpload.style.display = 'none';
          document.getElementById('receiptUploadSuccess').style.display = 'block';
          loadRequests();
        } else {
          const data = await res.json();
          showAlert(data.error || 'Failed to upload receipt', 'error');
        }
      } catch (err) {
        showAlert('Failed to upload receipt', 'error');
      } finally {
        inlineUploadBtn.disabled = false;
        inlineUploadBtn.textContent = 'Upload Receipt';
      }
    });
  }

  // View All
  document.getElementById('viewAllBtn').addEventListener('click', (e) => {
    e.preventDefault();
    // Switch to my-requests page view - just highlight the table
    document.querySelector('.requests-table').scrollIntoView({ behavior: 'smooth' });
  });

  // Nav links
  document.querySelectorAll('.nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === 'new-request') {
        document.getElementById('requestModal').classList.add('show');
      }
    });
  });
}

function handleFileSelect() {
  const fileInput = document.getElementById('fileInput');
  const fileUpload = document.getElementById('fileUpload');

  if (fileInput.files.length) {
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showAlert('File too large. Max 5MB.', 'error');
      return;
    }

    fileUpload.innerHTML = `
      <i data-lucide="check-circle" width="32" height="32" style="color: var(--success);"></i>
      <p class="filename">${file.name}</p>
      <p style="font-size: 0.75rem; color: var(--text-secondary);">Click to change</p>
    `;
    fileUpload.classList.add('has-file');
    lucide.createIcons();
  }
}

async function loadRequests() {
  try {
    const res = await fetch('/api/requests/mine');
    const data = await res.json();

    updateStats(data.requests);
    renderRequests(data.requests);
  } catch (err) {
    console.error('Failed to load requests:', err);
  }
}

function updateStats(requests) {
  const total = requests.length;
  const pending = requests.filter(r => r.status === 'pending' || r.status === 'paid').length;
  const completed = requests.filter(r => r.status === 'completed').length;
  const spent = requests.reduce((sum, r) => sum + (r.price || 0), 0);

  document.getElementById('totalRequests').textContent = total;
  document.getElementById('pendingRequests').textContent = pending;
  document.getElementById('completedRequests').textContent = completed;
  document.getElementById('totalSpent').textContent = `₦${spent.toLocaleString()}`;
}

function renderRequests(requests) {
  const tbody = document.getElementById('requestsBody');

  if (!requests.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <i data-lucide="inbox" width="48" height="48"></i>
            <p>No requests yet. Create your first request!</p>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = requests.map(r => `
    <tr>
      <td>#${r.id}</td>
      <td>${r.letter_type || 'Picture Upload'}</td>
      <td><span class="priority-badge ${r.priority}">${r.priority.charAt(0).toUpperCase() + r.priority.slice(1)}</span></td>
      <td><span class="badge ${r.status}">${formatStatus(r.status)}</span></td>
      <td><span class="price ${r.price === 0 ? 'free' : ''}">${r.price === 0 ? 'FREE' : '₦' + r.price.toLocaleString()}</span></td>
      <td>${formatDate(r.created_at)}</td>
      <td><span class="view-btn" onclick="viewRequest(${r.id})">View</span></td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function formatStatus(status) {
  const map = {
    'pending_payment': 'Awaiting Payment',
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

function showAlert(message, type) {
  const alert = document.getElementById('modalAlert');
  alert.textContent = message;
  alert.className = `alert ${type}`;
  alert.style.display = 'block';
  setTimeout(() => { alert.style.display = 'none'; }, 5000);
}

async function handleSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submitRequestBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>Submitting...</span>';

  const activeType = document.querySelector('.type-toggle button.active').dataset.type;
  const formData = new FormData();

  formData.append('priority', selectedPriority);

  if (activeType === 'description') {
    formData.append('type', 'description');
    formData.append('letter_type', document.getElementById('letterType').value);
    formData.append('subject', document.getElementById('subject').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('recipient_email', document.getElementById('recipientEmail').value);
  } else {
    formData.append('type', 'picture');
    formData.append('subject', document.getElementById('picSubject').value);
    formData.append('recipient_email', document.getElementById('picRecipientEmail').value);

    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length) {
      formData.append('file', fileInput.files[0]);
    }
  }

  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: getCsrfHeaders(),
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit request');
    }

    // Store the request ID for receipt upload
    window.currentSubmittedRequestId = data.requestId;

    // If paid request, show payment details and receipt upload on page
    if (data.price > 0) {
      document.getElementById('requestForm').style.display = 'none';
      document.getElementById('paymentDetailsSection').style.display = 'block';
      document.getElementById('paymentAmount').textContent = '₦' + data.price.toLocaleString();

      // Reset inline receipt upload
      document.getElementById('inlineReceiptPreview').style.display = 'none';
      document.getElementById('inlineReceiptPreview').src = '';
      document.getElementById('inlineUploadBtn').style.display = 'none';
      document.getElementById('receiptUploadSuccess').style.display = 'none';
      document.getElementById('inlineReceiptInput').value = '';
    } else {
      // Free trial - show success and close
      showAlert('Request submitted! Your first letter is FREE!', 'success');
      setTimeout(() => {
        closeModal();
        loadRequests();
      }, 1500);
    }
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit Request';
  }
}

function closeModal() {
  document.getElementById('requestModal').classList.remove('show');
  document.getElementById('requestForm').reset();
  document.getElementById('requestForm').style.display = 'block';
  document.getElementById('paymentDetailsSection').style.display = 'none';
  document.getElementById('fileUpload').innerHTML = `
    <i data-lucide="upload" width="32" height="32"></i>
    <p>Click or drag to upload</p>
    <p style="font-size: 0.75rem; color: var(--text-secondary);">JPG, PNG, or PDF (max 5MB)</p>
  `;
  document.getElementById('fileUpload').classList.remove('has-file');
  lucide.createIcons();
  loadRequests();
}

let currentViewRequestId = null;

async function viewRequest(id) {
  currentViewRequestId = id;
  try {
    const res = await fetch(`/api/requests/${id}`);
    const data = await res.json();
    if (data.request) {
      const req = data.request;

      document.getElementById('detailRequestId').textContent = req.id;
      document.getElementById('detailStatusBadge').textContent = formatStatus(req.status);
      document.getElementById('detailStatusBadge').className = `status-badge ${req.status}`;
      document.getElementById('detailType').textContent = req.letter_type || req.type;
      document.getElementById('detailPriority').textContent = req.priority.charAt(0).toUpperCase() + req.priority.slice(1);
      document.getElementById('detailPrice').textContent = req.price === 0 ? 'FREE' : '₦' + req.price.toLocaleString();

      // Show/hide receipt upload section based on status
      const uploadSection = document.getElementById('receiptUploadSection');
      const submittedSection = document.getElementById('receiptSubmittedSection');

      if (req.status === 'pending_payment') {
        uploadSection.style.display = 'block';
        submittedSection.style.display = 'none';
      } else if (req.status === 'payment_submitted') {
        uploadSection.style.display = 'none';
        submittedSection.style.display = 'block';
      } else {
        uploadSection.style.display = 'none';
        submittedSection.style.display = 'none';
      }

      // Reset receipt preview
      document.getElementById('receiptPreview').style.display = 'none';
      document.getElementById('uploadReceiptBtn').style.display = 'none';

      document.getElementById('viewRequestModal').classList.add('show');
    }
  } catch (err) {
    console.error('Failed to load request:', err);
  }
}

// Setup view request modal events
function setupViewRequestModal() {
  // Close button
  document.getElementById('closeRequestBtn').addEventListener('click', () => {
    document.getElementById('viewRequestModal').classList.remove('show');
  });

  document.getElementById('viewRequestModalClose').addEventListener('click', () => {
    document.getElementById('viewRequestModal').classList.remove('show');
  });

  // Receipt upload
  const receiptInput = document.getElementById('receiptInput');
  const receiptPreview = document.getElementById('receiptPreview');
  const uploadBtn = document.getElementById('uploadReceiptBtn');
  const uploadBox = document.getElementById('receiptUploadBox');

  if (receiptInput) {
    receiptInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert('File too large. Max 5MB.');
          return;
        }

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
          receiptPreview.src = e.target.result;
          receiptPreview.style.display = 'block';
          uploadBtn.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    uploadBox.addEventListener('click', () => receiptInput.click());

    uploadBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'var(--accent)';
    });

    uploadBox.addEventListener('dragleave', () => {
      uploadBox.style.borderColor = '#22c55e';
    });

    uploadBox.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = '#22c55e';
      if (e.dataTransfer.files.length) {
        receiptInput.files = e.dataTransfer.files;
        receiptInput.dispatchEvent(new Event('change'));
      }
    });

    uploadBtn.addEventListener('click', async () => {
      if (!receiptInput.files.length) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading...';

      const formData = new FormData();
      formData.append('receipt', receiptInput.files[0]);

      try {
        const res = await fetch(`/api/requests/${currentViewRequestId}/receipt`, {
          method: 'POST',
          headers: getCsrfHeaders(),
          body: formData
        });

        if (res.ok) {
          alert('Receipt uploaded successfully!');
          document.getElementById('viewRequestModal').classList.remove('show');
          loadRequests();
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to upload receipt');
        }
      } catch (err) {
        alert('Failed to upload receipt');
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Receipt';
      }
    });
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  init();
  setupViewRequestModal();
});
