const passwordInput = document.getElementById('vault-password');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const vaultLoginOverlay = document.getElementById('vault-login-overlay');
const vaultLoginForm = document.getElementById('vault-login-form');
const vaultLoginMessage = document.getElementById('vault-login-message');
const vaultAccessPasswordInput = document.getElementById('vault-access-password');
const vaultContent = document.getElementById('vault-content');

const SECRET_VAULT_ACCESS_PASSWORD = 'mango@123';

let authToken = '';
try {
  authToken = window.sessionStorage.getItem('buildify_token') || '';
} catch {
  authToken = '';
}

if (authToken !== 'buildify-hackathon-token' && typeof window !== 'undefined' && window.location) {
  window.location.replace('/');
}

function lockVault() {
  if (vaultLoginOverlay) {
    vaultLoginOverlay.classList.remove('hidden');
  }
  if (vaultContent) {
    vaultContent.classList.add('hidden');
  }
}

function unlockVault() {
  if (vaultLoginOverlay) {
    vaultLoginOverlay.classList.add('hidden');
  }
  if (vaultContent) {
    vaultContent.classList.remove('hidden');
  }
}

if (vaultLoginForm && vaultAccessPasswordInput) {
  lockVault();

  vaultLoginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const enteredPassword = (vaultAccessPasswordInput.value || '').trim();

    if (enteredPassword === SECRET_VAULT_ACCESS_PASSWORD) {
      vaultLoginMessage.textContent = '';
      vaultLoginForm.reset();
      unlockVault();
      return;
    }

    vaultLoginMessage.textContent = 'Invalid vault password';
    vaultLoginMessage.style.color = '#ef4444';
    vaultAccessPasswordInput.select();
  });
}

if (passwordInput && togglePasswordBtn) {
  let isVisible = false;

  togglePasswordBtn.addEventListener('click', () => {
    isVisible = !isVisible;
    passwordInput.type = isVisible ? 'text' : 'password';
    togglePasswordBtn.textContent = isVisible ? 'Hide Password' : 'Show Password';
  });
}

const vaultForm = document.getElementById('vault-form');
const vaultEntriesList = document.getElementById('vault-entries-list');

let vaultEntries = [];
try {
  vaultEntries = JSON.parse((typeof window !== 'undefined' ? window.localStorage.getItem('buildify_vault_entries') : '[]') || '[]');
} catch (err) {
  vaultEntries = [];
}

function renderVaultEntries() {
  if (!vaultEntriesList) return;
  
  if (vaultEntries.length === 0) {
    vaultEntriesList.innerHTML = '<p style="color: var(--text-muted, #64748b); text-align: center; margin: 0;">No links added yet.</p>';
    return;
  }

  vaultEntriesList.innerHTML = vaultEntries.map((entry, index) => `
    <div style="border: 1px solid var(--border-subtle); padding: 15px; border-radius: 8px; background: var(--bg-base);">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: var(--text-primary); display: flex; justify-content: space-between;">
        ${entry.title}
        <button type="button" class="row-btn" onclick="deleteVaultEntry(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </h3>
      <p style="margin: 4px 0; font-size: 14px; word-break: break-all;"><strong>Link:</strong> <a href="${entry.link}" target="_blank" style="color: var(--accent-color); text-decoration: none;">${entry.link}</a></p>
      <p style="margin: 4px 0; font-size: 14px; word-break: break-all;"><strong>Username:</strong> <span style="font-family: monospace;">${entry.username}</span></p>
      <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;">
        <input type="password" value="${entry.password}" readonly style="padding: 6px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); font-family: monospace;" id="saved-pw-${index}">
        <button type="button" onclick="toggleSavedPassword(${index})" style="padding: 6px 12px; font-size: 14px; min-width: 0;" id="toggle-saved-btn-${index}">Show</button>
      </div>
    </div>
  `).join('');
}

window.toggleSavedPassword = function(index) {
  const pwInput = document.getElementById(`saved-pw-${index}`);
  const toggleBtn = document.getElementById(`toggle-saved-btn-${index}`);
  if (pwInput.type === 'password') {
    pwInput.type = 'text';
    toggleBtn.textContent = 'Hide';
  } else {
    pwInput.type = 'password';
    toggleBtn.textContent = 'Show';
  }
};

window.deleteVaultEntry = function(index) {
  if (confirm('Are you sure you want to remove this vault entry?')) {
    vaultEntries.splice(index, 1);
    safeSetLocalStorage('buildify_vault_entries', JSON.stringify(vaultEntries));
    renderVaultEntries();
  }
};

function safeSetLocalStorage(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {}
}

if (vaultForm) {
  vaultForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('vault-title').value;
    const link = document.getElementById('vault-link').value;
    const username = document.getElementById('vault-username').value;
    const password = document.getElementById('vault-password').value;

    vaultEntries.unshift({ title, link, username, password }); // Add to top
    safeSetLocalStorage('buildify_vault_entries', JSON.stringify(vaultEntries));
    
    vaultForm.reset();
    renderVaultEntries();
  });
}

renderVaultEntries();
