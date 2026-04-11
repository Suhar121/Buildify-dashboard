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

const todoForm = document.getElementById('todo-form');
const todoList = document.getElementById('todo-list');

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

function normalizeTomSelectValues(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

function syncTeamMemberOptions(members = teamMembers) {
  const currentValue = addedBySelect.value;
  addedBySelect.innerHTML = '<option value="">Select team member</option>';
  
  // Also update all existing point assigns
  const allAssigns = document.querySelectorAll('select.todo-point-assign');

  members.forEach((member) => {
    const option = document.createElement('option');
    option.value = member;
    option.textContent = member;
    addedBySelect.appendChild(option);
  });

  allAssigns.forEach(selectEl => {
    if (!(selectEl instanceof HTMLSelectElement)) {
      return;
    }

    let currVals = [];
    if (selectEl.tomselect) {
      currVals = normalizeTomSelectValues(selectEl.tomselect.getValue());
      selectEl.tomselect.destroy();
    } else {
      currVals = Array.from(selectEl.selectedOptions || []).map(o => o.value).filter(Boolean);
    }

    selectEl.innerHTML = '<option value="" disabled>Assign To...</option>';
    members.forEach((member) => {
      const opt = document.createElement('option');
      opt.value = member;
      opt.textContent = member;
      selectEl.appendChild(opt);
    });
    Array.from(selectEl.options).forEach(o => {
      if (currVals.includes(o.value) && members.includes(o.value)) {
        o.selected = true;
      }
    });

    if (window.TomSelect) {
      new TomSelect(selectEl, {
        plugins: ['remove_button'],
        hidePlaceholder: true,
        maxOptions: null,
        closeAfterSelect: false
      });
    }
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

    const assignee = typeof item.addedBy === 'string' && item.addedBy.trim()
      ? item.addedBy.trim()
      : 'Unassigned';

    const metaEl = row.querySelector('.resource-meta');
    const primaryMeta = document.createElement('span');
    primaryMeta.textContent = meta;

    const assigneeMeta = document.createElement('span');
    assigneeMeta.className = 'resource-assignee';
    assigneeMeta.textContent = `Assignee: ${assignee}`;

    metaEl.innerHTML = '';
    metaEl.appendChild(primaryMeta);
    metaEl.appendChild(assigneeMeta);

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

async function loadTodos() {
  const { response, payload } = await requestJson('/api/todos');
  if (payload && payload.success) {
    renderTodos(payload.todos);
  }
}

function renderTodos(todos) {
  todoList.innerHTML = '';
  if (todos.length === 0) {
    todoList.innerHTML = '<p class="empty-state" style="margin:0; padding:20px 10px;">No upcoming objectives left! 🎉</p>';
    return;
  }
  
  // Group todos by date
  const groupedTodos = {};
  todos.forEach(todo => {
    const dateKey = todo.date || 'No Date';
    if (!groupedTodos[dateKey]) groupedTodos[dateKey] = [];
    groupedTodos[dateKey].push(todo);
  });

  // Sort dates (No Date comes last if needed, simplest is string sort)
  const sortedDates = Object.keys(groupedTodos).sort((a, b) => {
    if (a === 'No Date') return 1;
    if (b === 'No Date') return -1;
    return new Date(a) - new Date(b);
  });

  sortedDates.forEach(date => {
    // Add Date Header
    const dateHeader = document.createElement('h3');
    dateHeader.style.margin = '24px 0 12px 0';
    dateHeader.style.fontSize = '1.1em';
    dateHeader.style.color = 'var(--text-secondary)';
    dateHeader.style.cursor = 'pointer';
    dateHeader.style.display = 'flex';
    dateHeader.style.alignItems = 'center';
    dateHeader.style.gap = '8px';
    
    let dateLabel = '';
    if (date !== 'No Date') {
      const parsedDate = new Date(date);
      dateLabel = parsedDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      dateLabel = 'Unscheduled';
    }
    
    // Up chevron SVG
    const expandIcon = `<svg class="date-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    
    dateHeader.innerHTML = `${dateLabel} ${expandIcon}`;
    todoList.appendChild(dateHeader);

    const dateCardsContainer = document.createElement('div');
    dateCardsContainer.className = 'date-cards-container';
    dateCardsContainer.style.display = 'block'; // defaults to open

    dateHeader.addEventListener('click', () => {
      if (dateCardsContainer.style.display === 'none') {
        dateCardsContainer.style.display = 'block';
        dateHeader.querySelector('.date-toggle-icon').innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
      } else {
        dateCardsContainer.style.display = 'none';
        dateHeader.querySelector('.date-toggle-icon').innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
      }
    });

    // Render Cards for this date
    groupedTodos[date].forEach((todo) => {
      const card = document.createElement('div');
      card.className = `todo-card ${todo.completed ? 'completed' : ''}`;
      
      // Checkbox mapping
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.completed;
      checkbox.addEventListener('change', async () => {
        await requestJson(`/api/todos/${todo.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        loadTodos();
      });

      const info = document.createElement('div');
      info.className = 'todo-details';
      
      const title = document.createElement('div');
      title.className = 'todo-text';
      title.style.display = 'flex';
      title.style.flexDirection = 'column';
      title.style.gap = '8px';

      const mainTextRow = document.createElement('div');
      mainTextRow.style.display = 'flex';
      mainTextRow.style.alignItems = 'center';
      mainTextRow.style.gap = '8px';

      const mainText = document.createElement('span');
      mainText.textContent = todo.task;
      mainText.style.fontWeight = 'bold';
      mainText.style.fontSize = '1.05em';
      
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.style.background = 'transparent';
      toggleBtn.style.border = 'none';
      toggleBtn.style.color = 'var(--text-secondary)';
      toggleBtn.style.cursor = 'pointer';
      toggleBtn.style.padding = '0';
      toggleBtn.style.display = 'flex';
      toggleBtn.style.alignItems = 'center';
      // Down chevron SVG as default (expanded)
      toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-btn';
      editBtn.style.marginLeft = 'auto';
      editBtn.style.padding = '4px 8px';
      editBtn.style.fontSize = '0.85em';
      editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>Edit';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTodo(todo);
      });

      mainTextRow.appendChild(mainText);
      
      if (todo.points && todo.points.length > 0) {
        mainTextRow.appendChild(toggleBtn);
        // Make the whole row clickable for toggling
        mainTextRow.style.cursor = 'pointer';
      }
      mainTextRow.appendChild(editBtn);
      title.appendChild(mainTextRow);

      // Icon SVG for person
      const personSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

      // Render points if they exist
      if (todo.points && todo.points.length > 0) {
        const pointsList = document.createElement('div');
        pointsList.style.display = 'flex';
        pointsList.style.flexDirection = 'column';
        pointsList.style.gap = '6px';
        pointsList.style.marginLeft = '8px';
        pointsList.style.fontSize = '0.9em';
        
        mainTextRow.addEventListener('click', () => {
          if (pointsList.style.display === 'none') {
            pointsList.style.display = 'flex';
            toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
          } else {
            pointsList.style.display = 'none';
            toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'; // Right chevron
          }
        });

        todo.points.forEach(point => {
          const pRow = document.createElement('div');
          pRow.style.display = 'flex';
          pRow.style.alignItems = 'center';
          pRow.style.gap = '8px';
          pRow.style.opacity = point.completed ? '0.5' : '1';

          const pCheck = document.createElement('input');
          pCheck.type = 'checkbox';
          pCheck.style.width = '14px';
          pCheck.style.height = '14px';
          pCheck.checked = point.completed || false;
          pCheck.addEventListener('change', async () => {
            await requestJson(`/api/todos/${todo.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pointId: point.id })
            });
            loadTodos();
          });

          const pLabel = document.createElement('span');
          pLabel.style.flex = "1";
          pLabel.textContent = point.text;
          if (point.completed) pLabel.style.textDecoration = 'line-through';
          
          const timePill = document.createElement('span');
          if (point.startTime || point.endTime) {
            timePill.style.fontSize = '0.85em';
            timePill.style.color = 'var(--text-secondary)';
            timePill.style.background = 'rgba(255,255,255,0.05)';
            timePill.style.padding = '2px 6px';
            timePill.style.borderRadius = '4px';
            timePill.style.display = 'flex';
            timePill.style.alignItems = 'center';
            timePill.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${point.startTime || '?'} - ${point.endTime || '?'}`;
          }

          let pointAssigneeStr = 'Unassigned';
          if (Array.isArray(point.assignedTo) && point.assignedTo.length > 0) {
            pointAssigneeStr = point.assignedTo.join(', ');
          } else if (typeof point.assignedTo === 'string' && point.assignedTo) {
            pointAssigneeStr = point.assignedTo;
          }

          const pAssign = document.createElement('span');
          pAssign.style.fontSize = '0.85em';
          pAssign.style.color = 'var(--text-secondary)';
          pAssign.style.background = 'rgba(255,255,255,0.05)';
          pAssign.style.padding = '2px 6px';
          pAssign.style.borderRadius = '4px';
          pAssign.style.display = 'flex';
          pAssign.style.alignItems = 'center';
          pAssign.innerHTML = `${personSvg} ${pointAssigneeStr}`;

          pRow.appendChild(pCheck);
          pRow.appendChild(pLabel);
          if (point.startTime || point.endTime) pRow.appendChild(timePill);
          pRow.appendChild(pAssign);
          pointsList.appendChild(pRow);
        });
        title.appendChild(pointsList);
      }
      
      info.appendChild(title);
      
      const delBtn = document.createElement('button');
      delBtn.className = 'row-btn todo-delete';
      delBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      delBtn.addEventListener('click', async () => {
        await requestJson(`/api/todos/${todo.id}`, { method: 'DELETE' });
        loadTodos();
      });

      card.appendChild(checkbox);
      card.appendChild(info);
      card.appendChild(delBtn);
      dateCardsContainer.appendChild(card);
    });

    todoList.appendChild(dateCardsContainer);
  });
}

const toggleTodoFormBtn = document.getElementById('toggle-todo-form-btn');
const toggleAllDatesBtn = document.getElementById('toggle-dates-btn');
const cancelTodoBtn = document.getElementById('cancel-todo-btn');
const addTodoPointBtn = document.getElementById('add-todo-point-btn');
const todoPointsContainer = document.getElementById('todo-points-container');
const editTodoIdInput = document.getElementById('edit-todo-id');
const todoSubmitBtn = document.getElementById('todo-submit-btn');

function resetTodoForm() {
  todoForm.reset();
  editTodoIdInput.value = '';
  todoSubmitBtn.textContent = 'Save Objective';
  todoForm.classList.add('hidden');
  todoPointsContainer.innerHTML = '<div class="todo-point-input" style="display: flex; gap: 8px; align-items: center;"><input type="text" class="todo-point-val" placeholder="Point 1 (e.g. Setup Database)" style="flex: 1;" required /><input type="time" class="todo-point-start" title="Start Time" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); color-scheme: dark;" /><span style="color: var(--text-secondary); font-size: 0.85em;">to</span><input type="time" class="todo-point-end" title="End Time" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); color-scheme: dark;" /><select class="todo-point-assign" style="width: 140px; height: auto;" multiple required><option value="" disabled>Assign To...</option></select></div>';
  syncTeamMemberOptions();
}

function editTodo(todo) {
  editTodoIdInput.value = todo.id;
  document.getElementById('todo-date').value = todo.date || '';
  document.getElementById('todo-task').value = todo.task;
  
  todoPointsContainer.innerHTML = '';
  if (todo.points && todo.points.length > 0) {
    todo.points.forEach((p, idx) => {
      const div = document.createElement('div');
      div.className = 'todo-point-input';
      div.style.display = 'flex';
      div.style.gap = '8px';
      div.style.alignItems = 'center';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'todo-point-val';
      input.value = p.text || '';
      input.style.flex = '1';
      input.required = true;

      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.className = 'todo-point-start';
      startInput.title = 'Start Time';
      startInput.value = p.startTime || '';
      startInput.style.padding = '6px';
      startInput.style.borderRadius = '4px';
      startInput.style.border = '1px solid var(--border-subtle)';
      startInput.style.background = 'var(--bg-card)';
      startInput.style.color = 'var(--text-primary)';
      startInput.style.colorScheme = 'dark';

      const toSpan = document.createElement('span');
      toSpan.textContent = 'to';
      toSpan.style.color = 'var(--text-secondary)';
      toSpan.style.fontSize = '0.85em';

      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.className = 'todo-point-end';
      endInput.title = 'End Time';
      endInput.value = p.endTime || '';
      endInput.style.padding = '6px';
      endInput.style.borderRadius = '4px';
      endInput.style.border = '1px solid var(--border-subtle)';
      endInput.style.background = 'var(--bg-card)';
      endInput.style.color = 'var(--text-primary)';
      endInput.style.colorScheme = 'dark';
      
      // Allow removing points (except first one optionally, but lets keep it simple)
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'row-btn todo-delete';
      removeBtn.style.padding = '8px';
      removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      removeBtn.addEventListener('click', () => div.remove());

      const select = document.createElement('select');
      select.className = 'todo-point-assign';
      select.style.width = '140px';
      select.style.height = 'auto';
      select.multiple = true;
      select.required = true;
      const opt = document.createElement('option');
      opt.value = "";
      opt.disabled = true;
      opt.textContent = "Assign To...";
      select.appendChild(opt);

      div.appendChild(input);
      div.appendChild(startInput);
      div.appendChild(toSpan);
      div.appendChild(endInput);
      div.appendChild(select);
      // only add remove on >1 if you want, but this is fine
      div.appendChild(removeBtn);
      
      todoPointsContainer.appendChild(div);
      
      // We will sync value after syncTeamMemberOptions runs
      select.dataset.preselect = Array.isArray(p.assignedTo) ? JSON.stringify(p.assignedTo) : JSON.stringify(p.assignedTo ? [p.assignedTo] : []);
    });
  } else {
    // Empty points fallback
    todoPointsContainer.innerHTML = '<div class="todo-point-input" style="display: flex; gap: 8px; align-items: center;"><input type="text" class="todo-point-val" placeholder="Point 1 (e.g. Setup Database)" style="flex: 1;" required /><input type="time" class="todo-point-start" title="Start Time" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); color-scheme: dark;" /><span style="color: var(--text-secondary); font-size: 0.85em;">to</span><input type="time" class="todo-point-end" title="End Time" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); color-scheme: dark;" /><select class="todo-point-assign" style="width: 140px; height: auto;" multiple required><option value="" disabled>Assign To...</option></select></div>';
  }
  
  syncTeamMemberOptions();
  
  // Set pre-selects
  const selects = todoPointsContainer.querySelectorAll('.todo-point-assign');
  selects.forEach(s => {
    if (s.dataset.preselect) {
      try {
        const pres = JSON.parse(s.dataset.preselect);
        Array.from(s.options).forEach(o => {
          if (pres.includes(o.value)) o.selected = true;
        });
        if (s.tomselect) s.tomselect.setValue(pres);
      } catch (e) {}
    }
  });

  todoSubmitBtn.textContent = 'Update Objective';
  todoForm.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (toggleAllDatesBtn) {
  let isAllExpanded = true;
  toggleAllDatesBtn.addEventListener('click', () => {
    isAllExpanded = !isAllExpanded;
    const containers = document.querySelectorAll('.date-cards-container');
    const icons = document.querySelectorAll('.date-toggle-icon');
    
    containers.forEach(container => {
      container.style.display = isAllExpanded ? 'block' : 'none';
    });
    icons.forEach(icon => {
      icon.innerHTML = isAllExpanded 
        ? '<polyline points="6 9 12 15 18 9"></polyline>' 
        : '<polyline points="9 18 15 12 9 6"></polyline>';
    });
  });
}

if (toggleTodoFormBtn) {
  toggleTodoFormBtn.addEventListener('click', () => {
    todoForm.classList.toggle('hidden');
  });
}

if (cancelTodoBtn) {
  cancelTodoBtn.addEventListener('click', () => {
    todoForm.reset();
    todoForm.classList.add('hidden');
    todoPointsContainer.innerHTML = '<div class="todo-point-input" style="display: flex; gap: 8px; align-items: center;"><input type="text" class="todo-point-val" placeholder="Point 1 (e.g. Setup Database)" style="flex: 1;" required /><input type="time" class="todo-point-start" title="Start Time" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); color-scheme: dark;" /><span style="color: var(--text-secondary); font-size: 0.85em;">to</span><input type="time" class="todo-point-end" title="End Time" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); color-scheme: dark;" /><select class="todo-point-assign" style="width: 140px; height: auto;" multiple required><option value="" disabled>Assign To...</option></select></div>';
    syncTeamMemberOptions();
  });
}

if (addTodoPointBtn) {
  addTodoPointBtn.addEventListener('click', () => {
    const pointCount = todoPointsContainer.querySelectorAll('.todo-point-input').length + 1;
    const div = document.createElement('div');
    div.className = 'todo-point-input';
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.alignItems = 'center';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-point-val';
    input.placeholder = `Point ${pointCount} (e.g. Connect API)`;
    input.style.flex = '1';
    input.required = true;

    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.className = 'todo-point-start';
    startInput.title = 'Start Time';
    startInput.style.padding = '6px';
    startInput.style.borderRadius = '4px';
    startInput.style.border = '1px solid var(--border-subtle)';
    startInput.style.background = 'var(--bg-card)';
    startInput.style.color = 'var(--text-primary)';
    startInput.style.colorScheme = 'dark';

    const toSpan = document.createElement('span');
    toSpan.textContent = 'to';
    toSpan.style.color = 'var(--text-secondary)';
    toSpan.style.fontSize = '0.85em';

    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.className = 'todo-point-end';
    endInput.title = 'End Time';
    endInput.style.padding = '6px';
    endInput.style.borderRadius = '4px';
    endInput.style.border = '1px solid var(--border-subtle)';
    endInput.style.background = 'var(--bg-card)';
    endInput.style.color = 'var(--text-primary)';
    endInput.style.colorScheme = 'dark';
    
    // Allow removing points
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'row-btn todo-delete';
    removeBtn.style.padding = '8px';
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    removeBtn.addEventListener('click', () => div.remove());

    const select = document.createElement('select');
    select.className = 'todo-point-assign';
    select.style.width = '140px';
    select.style.height = 'auto';
    select.multiple = true;
    select.required = true;
    const opt = document.createElement('option');
    opt.value = "";
    opt.disabled = true;
    opt.textContent = "Assign To...";
    select.appendChild(opt);

    div.appendChild(input);
    div.appendChild(startInput);
    div.appendChild(toSpan);
    div.appendChild(endInput);
    div.appendChild(select);
    div.appendChild(removeBtn);
    todoPointsContainer.appendChild(div);
    syncTeamMemberOptions();
  });
}

todoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateInput = document.getElementById('todo-date');
  const taskInput = document.getElementById('todo-task');
  const date = dateInput ? dateInput.value : '';
  const task = taskInput ? taskInput.value.trim() : '';

  const pointsRows = Array.from(todoPointsContainer.querySelectorAll('.todo-point-input'));
  const points = pointsRows.map(row => {
    const valInput = row.querySelector('.todo-point-val');
    const startInput = row.querySelector('.todo-point-start');
    const endInput = row.querySelector('.todo-point-end');
    const assignSelect = row.querySelector('.todo-point-assign');
    return {
      text: valInput ? valInput.value.trim() : '',
      startTime: startInput ? startInput.value : '',
      endTime: endInput ? endInput.value : '',
      assignedTo: assignSelect ? Array.from(assignSelect.selectedOptions).map(o => o.value) : []
    };
  }).filter(p => p.text.length > 0);
  
  if (!task) return;

  const isEdit = !!editTodoIdInput.value;
  const endpoint = isEdit ? `/api/todos/${editTodoIdInput.value}` : '/api/todos';
  const method = isEdit ? 'PUT' : 'POST';

  const { response, payload } = await requestJson(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isEdit ? { task, date, points, updateAll: true } : { task, date, points })
  });

  if (response.ok && payload.success) {
    resetTodoForm();
    loadTodos();
  }
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
    loadTodos();
  } else {
    showLogin();
  }
}

// Start the app correctly on first load
initializeApp();
