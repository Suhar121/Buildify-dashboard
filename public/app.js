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
const folderGrid = document.getElementById('folder-grid');
const resourcesList = document.getElementById('resources-list');
const template = document.getElementById('resource-row-template');
const folderOptions = document.getElementById('folder-options');
const emptyState = document.getElementById('empty-state');
const formTitleText = document.getElementById('form-title-text');
const editIdInput = document.getElementById('edit-id');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const addFolderBtn = document.getElementById('add-folder-btn');

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
  const titleInput = document.getElementById('title');
  if (fileInput.files && fileInput.files.length > 0) {
    if (fileInput.files.length === 1) {
      filePickedLabel.textContent = fileInput.files[0].name;
      if (!titleInput.value) {
        const nameParts = fileInput.files[0].name.split('.');
        if (nameParts.length > 1) nameParts.pop();
        titleInput.value = nameParts.join('.');
      }
      titleInput.disabled = false;
      titleInput.placeholder = "e.g. Problem Statement PDF";
    } else {
      filePickedLabel.textContent = `${fileInput.files.length} files selected`;
      titleInput.value = '';
      titleInput.disabled = true;
      titleInput.placeholder = "(Titles will automatically use filenames for bulk upload)";
    }
    return;
  }

  filePickedLabel.textContent = 'No file selected';
  titleInput.disabled = false;
  titleInput.placeholder = "e.g. Problem Statement PDF";
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
  // Rebuild category grid
  folderGrid.innerHTML = '';

  const allTab = document.createElement('div');
  allTab.className = `folder-card ${activeFolderFilter === '' ? 'active' : ''}`;
  allTab.dataset.folder = '';
  allTab.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
    </svg>
    <div class="folder-card-name">All Folders</div>
    <div class="folder-card-meta">Dashboard</div>
  `;
  folderGrid.appendChild(allTab);

  folders.forEach((folder) => {
    const tab = document.createElement('div');
    tab.className = `folder-card ${activeFolderFilter === folder ? 'active' : ''}`;
    tab.dataset.folder = folder;
    tab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
      </svg>
      <div class="folder-card-name">${folder}</div>
      <div class="folder-card-meta">Folder</div>
    `;
    folderGrid.appendChild(tab);
  });

  // Rebuild the <datalist> for the folder input
  folderOptions.innerHTML = '';
  folders.forEach((folder) => {
    const dataOption = document.createElement('option');
    dataOption.value = folder;
    folderOptions.appendChild(dataOption);
  });
}

function getIconForFile(item) {
  if (item.type === 'link') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;
  }
  if (!item.mimeType) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;
  }
  if (item.mimeType.startsWith('image/')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
  }
  if (item.mimeType.includes('pdf') || item.mimeType.includes('text') || item.mimeType.includes('document')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;
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
    
    // Inject correct icon based on MIME type / link
    row.querySelector('.file-icon-container').innerHTML = getIconForFile(item);

    const meta = item.type === 'file'
      ? `${humanFileSize(item.size)}`
      : 'Link';

    row.querySelector('.resource-meta').textContent = meta;

    row.querySelector('.row-btn-open').addEventListener('click', () => {
      window.open(item.type === 'file' ? item.fileUrl : item.url, '_blank');
    });

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

addFolderBtn.addEventListener('click', async () => {
  const folderName = prompt('Enter a new folder name:');
  if (!folderName || !folderName.trim()) return;
  
  const { response, payload } = await requestJson('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: folderName.trim() })
  });

  if (response.ok && payload.success) {
    activeFolderFilter = payload.folder;
    document.getElementById('folder').value = payload.folder;
    await Promise.all([loadFolders(), loadResources()]);
    setMessage(`Folder "${payload.folder}" added! ✅`);
  } else {
    setMessage(payload.message || 'Could not create folder.', true);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const editingId = editIdInput.value;

  try {
    const isFileBulkUpload = !editingId && typeEl.value === 'file' && fileInput.files && fileInput.files.length > 1;

    if (isFileBulkUpload) {
      setMessage(`Saving ${fileInput.files.length} resources...`);
      let successCount = 0;
      let failedCount = 0;

      for (const file of fileInput.files) {
        const formData = new FormData();
        formData.append('type', 'file');
        
        let generatedTitle = file.name;
        const nameParts = file.name.split('.');
        if (nameParts.length > 1) {
          nameParts.pop();
          generatedTitle = nameParts.join('.');
        }

        formData.append('title', generatedTitle);
        formData.append('description', document.getElementById('description').value);
        formData.append('folder', document.getElementById('folder').value || '');
        formData.append('addedBy', document.getElementById('added-by').value);
        formData.append('file', file);

        const { response, payload } = await requestJson('/api/items', {
          method: 'POST',
          body: formData
        });

        if (response && response.ok && payload && payload.success) {
          successCount++;
        } else {
          failedCount++;
        }
      }

      if (failedCount > 0) {
        setMessage(`Saved ${successCount} resources, failed ${failedCount}.`, true);
      } else {
        setMessage(`All ${successCount} resources added successfully ✅`);
      }
    } else {
      setMessage(editingId ? 'Updating resource...' : 'Saving resource...');
      
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
      
      setMessage(`Resource ${editingId ? 'updated' : 'added'} successfully ✅`);
    }

    form.reset();
    editIdInput.value = '';
    typeEl.value = 'file';
    addedBySelect.value = '';
    
    // reset inputs UI
    setTypeUi();
    updatePickedFileLabel();
    
    // Reset edit UI
    formTitleText.textContent = 'Add Resource';
    submitBtn.textContent = 'Save Resource';
    cancelEditBtn.classList.add('hidden');

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

folderGrid.addEventListener('click', (e) => {
  const tab = e.target.closest('.folder-card');
  if (tab) {
    activeFolderFilter = tab.dataset.folder || '';
    document.querySelectorAll('.folder-card').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadResources();
  }
});

// dropZone.addEventListener('click', () => {
//   if (typeEl.value === 'file') {
//     fileInput.click();
//   }
// });

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
