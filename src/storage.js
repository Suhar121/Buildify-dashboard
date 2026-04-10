const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  }
}

function readItems() {
  ensureStorage();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  ensureStorage();
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function addItem(item) {
  const items = readItems();
  items.unshift(item);
  writeItems(items);
  return item;
}

function getItemById(id) {
  const items = readItems();
  return items.find((item) => item.id === id) || null;
}

function updateItem(id, updater) {
  const items = readItems();
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  const existingItem = items[index];
  const nextItem = updater(existingItem);
  items[index] = nextItem;
  writeItems(items);
  return nextItem;
}

function deleteItem(id) {
  const items = readItems();
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  const [removed] = items.splice(index, 1);
  writeItems(items);
  return removed;
}

function getItems(filters = {}) {
  const items = readItems();
  const searchTerm = (filters.search || '').trim().toLowerCase();
  const folder = (filters.folder || '').trim().toLowerCase();

  return items.filter((item) => {
    const matchesFolder = !folder || item.folder.toLowerCase() === folder;

    if (!matchesFolder) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const haystack = [
      item.title,
      item.description,
      item.folder,
      item.addedBy || '',
      item.url || '',
      item.originalName || ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(searchTerm);
  });
}

function getFolders() {
  const items = readItems();
  const folders = new Set(items.map((item) => item.folder).filter(Boolean));
  return [...folders].sort((a, b) => a.localeCompare(b));
}

function clearItems() {
  writeItems([]);
}

module.exports = {
  addItem,
  clearItems,
  deleteItem,
  getFolders,
  getItemById,
  getItems,
  updateItem
};
