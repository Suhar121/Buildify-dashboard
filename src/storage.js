const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');
const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');
const TODOS_FILE = path.join(DATA_DIR, 'todos.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  }

  if (!fs.existsSync(FOLDERS_FILE)) {
    fs.writeFileSync(FOLDERS_FILE, '[]', 'utf-8');
  }

  if (!fs.existsSync(TODOS_FILE)) {
    fs.writeFileSync(TODOS_FILE, '[]', 'utf-8');
  }
}

function readTodos() {
  ensureStorage();
  const raw = fs.readFileSync(TODOS_FILE, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTodos(todos) {
  ensureStorage();
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf-8');
}

function getTodos() {
  return readTodos();
}

function addTodo(todo) {
  const todos = readTodos();
  todos.unshift(todo);
  writeTodos(todos);
  return todo;
}

function updateTodo(id, updater) {
  const todos = readTodos();
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return null;
  const nextItem = updater(todos[index]);
  todos[index] = nextItem;
  writeTodos(todos);
  return nextItem;
}

function deleteTodo(id) {
  const todos = readTodos();
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return null;
  const [removed] = todos.splice(index, 1);
  writeTodos(todos);
  return removed;
}

function readFolders() {
  ensureStorage();
  const raw = fs.readFileSync(FOLDERS_FILE, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFolders(folders) {
  ensureStorage();
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify(folders, null, 2), 'utf-8');
}

function addFolder(folder) {
  if (!folder) return;
  const folders = readFolders();
  if (!folders.includes(folder)) {
    folders.push(folder);
    writeFolders(folders);
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
  if (item.folder) addFolder(item.folder);
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
  const dynamicFolders = items.map((item) => item.folder).filter(Boolean);
  const staticFolders = readFolders();
  const folders = new Set([...dynamicFolders, ...staticFolders]);
  return [...folders].sort((a, b) => a.localeCompare(b));
}

function clearItems() {
  writeItems([]);
}

module.exports = {
  addFolder,
  addItem,
  clearItems,
  deleteItem,
  getFolders,
  getItemById,
  getItems,
  getTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  updateItem
};
