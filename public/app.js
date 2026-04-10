const form = document.getElementById('resource-form');
const messageEl = document.getElementById('form-message');
const typeEl = document.getElementById('type');
const urlField = document.getElementById('url-field');
const fileField = document.getElementById('file-field');
const urlInput = document.getElementById('url');
const fileInput = document.getElementById('file');
const dropZone = document.getElementById('drop-zone');
const filePickedLabel = document.getElementById('file-picked-label');
const addedBySelect = document.getElementById('added-by');
const searchInput = document.getElementById('search');
const folderTabs = document.getElementById('folder-tabs');
const resourcesList = document.getElementById('resources-list');
const template = document.getElementById('resource-row-template');
const folderOptions = document.getElementById('folder-options');
const emptyState = document.getElementById('empty-state');
const formTitleText = document.getElementById('form-title-text');
const editIdInput = document.getElementById('edit-id');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Login Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');

let teamMembers = [];
let activeFolderFilter = '';

function getToken() {
  return localStorage.getItem('buildify_token');
}

function showLogin() {
  loginOverlay.classList.remove('hidden');
}

function hideLogin() {
  loginOverlay.classList.add('hidden');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMessage.textContent = 'Authenticating...';
  
  const payload = {
    username: loginForm.username.value.trim(),
    password: loginForm.password.value.trim()
  };

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    if (data.success) {
      localStorage.setItem('buildify_token', data.token);
      hideLogin();
      initializeApp();
    } else {
      loginMessage.textContent = 'Invalid username or password';
      loginMessage.style.color = '#ef4444';
    }
  } catch (err) {
    loginMessage.textContent = 'Failed to connect to server';
    loginMessage.style.color = '#ef4444';
  }
});

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#b91c1c' : '#047857';
}

function humanFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setTypeUi() {
  const type = typeEl.value;
  const isLink = type === 'link';

  urlField.classList.toggle('hidden', !isLink);
  fileField.classList.toggle('hidden', isLink);

  urlInput.required = isLink;
  fileInput.required = !isLink;
}

function updatePickedFileLabel() {
  if (fileInput.files && fileInput.files.length > 0) {
    filePickedLabel.textContent = fileInput.files[0].name;
    return;
  }

  filePickedLabel.textContent = 'No file selected';
}

async function requestJson(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    showLogin();
    return { response, payload: null };
  }

  const payload = await response.json();
  return { response, payload };
}

function syncTeamMemberOptions(members) {
  const currentValue = addedBySelect.value;
  addedBySelect.innerHTML = '<option value="">Select team member</option>';

  members.forEach((member) => {
    const option = document.createElement('option');
    option.value = member;
    option.textContent = member;
    addedBySelect.appendChild(option);
  });

  if (currentValue && members.includes(currentValue)) {
    addedBySelect.value = currentValue;
  }
}

async function loadTeamMembers() {
  const { response, payload } = await requestJson('/api/team-members');
  if (!response.ok || !payload.success) {
    setMessage('Could not load team members.', true);
    return;
  }

  teamMembers = Array.isArray(payload.members) ? payload.members : [];
  syncTeamMemberOptions(teamMembers);
}

async function editItem(item) {
  editIdInput.value = item.id;
  typeEl.value = item.type;
  document.getElementById('title').value = item.title;
  document.getElementById('description').value = item.description;
  document.getElementById('folder').value = item.folder;
  
  if (item.addedBy && teamMembers.includes(item.addedBy)) {
    addedBySelect.value = item.addedBy;
  }
  
  if (item.type === 'link') {
    urlInput.value = item.url || '';
  }

  setTypeUi();
  formTitleText.textContent = 'Edit Resource';
  submitBtn.textContent = 'Update Resource';
  cancelEditBtn.classList.remove('hidden');

  // Scroll to top so user sees the form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

cancelEditBtn.addEventListener('click', () => {
  form.reset();
  editIdInput.value = '';
  typeEl.value = 'file';
  addedBySelect.value = '';
  setTypeUi();
  updatePickedFileLabel();
  
  formTitleText.textContent = 'Add Resource';
  submitBtn.textContent = 'Save Resource';
  cancelEditBtn.classList.add('hidden');
  setMessage('');
});

async function deleteItemById(item) {
  const shouldDelete = window.confirm(`Delete \"${item.title}\" from BUILDIFY Dashboard?`);
  if (!shouldDelete) {
    return;
  }

  const { response, payload } = await requestJson(`/api/items/${item.id}`, {
    method: 'DELETE'
  });

  if (!response.ok || !payload.success) {
    setMessage(payload.message || 'Could not delete resource.', true);
    return;
  }

  setMessage('Resource deleted successfully 🗑️');
  await Promise.all([loadFolders(), loadResources()]);
}

function updateFolderInputs(folders) {
  // Rebuild category tabs
  folderTabs.innerHTML = '';

  const allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = `folder-tab ${activeFolderFilter === '' ? 'active' : ''}`;
  allTab.dataset.folder = '';
  allTab.textContent = 'All Folders';
  folderTabs.appendChild(allTab);

  folders.forEach((folder) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `folder-tab ${activeFolderFilter === folder ? 'active' : ''}`;
    tab.dataset.folder = folder;
    tab.textContent = folder;
    folderTabs.appendChild(tab);
  });

  // Rebuild the <datalist> for the folder input
  folderOptions.innerHTML = '';
  folders.forEach((folder) => {
    const dataOption = document.createElement('option');
    dataOption.value = folder;
    folderOptions.appendChild(dataOption);
  });
}

function renderResources(items) {
  resourcesList.innerHTML = '';
  emptyState.classList.add('hidden');

  if (!items.length) {
    emptyState.classList.remove('hidden');
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.col-title').textContent = item.title;
    row.querySelector('.col-description').textContent = item.description;
    row.querySelector('.col-type').textContent = item.type;
    row.querySelector('.col-folder').textContent = item.folder;
    row.querySelector('.col-added-by').textContent = item.addedBy || 'Not set';

    const meta = item.type === 'file'
      ? `${item.originalName} • ${humanFileSize(item.size)}`
      : item.url;

    row.querySelector('.resource-meta').textContent = meta;

    const link = row.querySelector('.resource-link');
    link.href = item.type === 'file' ? item.fileUrl : item.url;
    link.textContent = item.type === 'file' ? 'Open File' : 'Open Link';

    row.querySelector('.row-btn-edit').addEventListener('click', () => {
      editItem(item);
    });

    row.querySelector('.row-btn-copy').addEventListener('click', async (e) => {
      const url = item.type === 'file' ? item.fileUrl : item.url;
      try {
        await navigator.clipboard.writeText(url);
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = 'var(--success)';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = '';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    });

    row.querySelector('.row-btn-delete').addEventListener('click', () => {
      deleteItemById(item);
    });

    fragment.appendChild(row);
  });

  resourcesList.appendChild(fragment);
}

async function loadFolders() {
  const { response, payload } = await requestJson('/api/folders');
  if (payload && payload.success) {
    updateFolderInputs(payload.folders);
  }
}

async function loadResources() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) {
    params.set('search', searchInput.value.trim());
  }
  if (activeFolderFilter) {
    params.set('folder', activeFolderFilter);
  }

  const { response, payload } = await requestJson(`/api/items?${params.toString()}`);
  if (payload && payload.success) {
    renderResources(payload.items);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const editingId = editIdInput.value;
  setMessage(editingId ? 'Updating resource...' : 'Saving resource...');

  try {
    const formData = new FormData(form);
    
    const url = editingId ? `/api/items/${editingId}` : '/api/items';
    const method = editingId ? 'PUT' : 'POST';

    const { response, payload } = await requestJson(url, {
      method,
      body: formData
    });

    if (!response.ok || !payload.success) {
      setMessage(payload.message || `Could not ${editingId ? 'update' : 'save'} resource.`, true);
      return;
    }

    form.reset();
    editIdInput.value = '';
    typeEl.value = 'file';
    addedBySelect.value = '';
    setTypeUi();
    updatePickedFileLabel();
    
    // Reset edit UI
    formTitleText.textContent = 'Add Resource';
    submitBtn.textContent = 'Save Resource';
    cancelEditBtn.classList.add('hidden');

    setMessage(`Resource ${editingId ? 'updated' : 'added'} successfully ✅`);

    await Promise.all([loadFolders(), loadResources()]);
  } catch (error) {
    console.error(error);
    setMessage('Something went wrong while saving. Please retry.', true);
  }
});

typeEl.addEventListener('change', setTypeUi);
fileInput.addEventListener('change', updatePickedFileLabel);
searchInput.addEventListener('input', () => {
  loadResources();
});

folderTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.folder-tab');
  if (tab) {
    activeFolderFilter = tab.dataset.folder || '';
    document.querySelectorAll('.folder-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadResources();
  }
});

dropZone.addEventListener('click', () => {
  if (typeEl.value === 'file') {
    fileInput.click();
  }
});

dropZone.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && typeEl.value === 'file') {
    event.preventDefault();
    fileInput.click();
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (typeEl.value === 'file') {
      dropZone.classList.add('drag-active');
    }
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-active');
  });
});

dropZone.addEventListener('drop', (event) => {
  if (typeEl.value !== 'file') {
    return;
  }

  const droppedFiles = event.dataTransfer?.files;
  if (!droppedFiles || droppedFiles.length === 0) {
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(droppedFiles[0]);
  fileInput.files = transfer.files;
  updatePickedFileLabel();
});

function initializeApp() {
  const token = getToken();
  if (token) {
    hideLogin();
    setTypeUi();
    updatePickedFileLabel();
    loadTeamMembers();
    loadFolders();
    loadResources();
  } else {
    showLogin();
  }
}

// Start the app correctly on first load
initializeApp();
