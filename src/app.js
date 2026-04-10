const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const cors = require('cors');
const morgan = require('morgan');

const { uploadToDrive } = require('./drive');

const {
  addFolder,
  addItem,
  deleteItem,
  getFolders,
  getItemById,
  getItems,
  updateItem
} = require('./storage');
const { TEAM_MEMBERS, normalizeMemberName } = require('./teamMembers');

const app = express();
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = multer.memoryStorage();

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'Buildify' && password === 'suhar123') {
    return res.json({ success: true, token: 'buildify-hackathon-token' });
  }
  return res.status(401).json({ success: false, message: 'Invalid username or password' });
});

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader === 'Bearer buildify-hackathon-token') {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized' });
};

app.get('/api/items', requireAuth, (req, res) => {
  const items = getItems({
    search: req.query.search,
    folder: req.query.folder
  });

  res.status(200).json({ success: true, items });
});

app.get('/api/folders', requireAuth, (_req, res) => {
  const folders = getFolders();
  res.status(200).json({ success: true, folders });
});

app.post('/api/folders', requireAuth, (req, res) => {
  const folder = (req.body.folder || '').trim();
  if (!folder) {
    return res.status(400).json({ success: false, message: 'Folder name is required.' });
  }
  addFolder(folder);
  res.status(201).json({ success: true, folder });
});

app.get('/api/team-members', requireAuth, (_req, res) => {
  res.status(200).json({ success: true, members: TEAM_MEMBERS });
});

app.post('/api/items', requireAuth, upload.single('file'), async (req, res) => {
  const type = (req.body.type || '').trim().toLowerCase();
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const folder = (req.body.folder || 'General').trim() || 'General';
  const url = (req.body.url || '').trim();
  const addedBy = normalizeMemberName(req.body.addedBy);

  if (!title || !description) {
    return res.status(400).json({
      success: false,
      message: 'Title and description are required.'
    });
  }

  if (!['link', 'file'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Type must be either link or file.'
    });
  }

  if (!addedBy) {
    return res.status(400).json({
      success: false,
      message: 'Please select a valid team member in Added by.'
    });
  }

  if (type === 'link') {
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({
        success: false,
        message: 'A valid URL is required for link items.'
      });
    }

    const linkItem = {
      id: crypto.randomUUID(),
      type: 'link',
      title,
      description,
      folder,
      addedBy,
      url,
      createdAt: new Date().toISOString()
    };

    addItem(linkItem);
    return res.status(201).json({ success: true, item: linkItem });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please attach a file for file items.'
    });
  }

  try {
    const driveLink = await uploadToDrive(req.file.originalname, req.file.mimetype, req.file.buffer);

    const fileItem = {
      id: crypto.randomUUID(),
      type: 'file', // Keep it as file for frontend icons
      title,
      description,
      folder,
      addedBy,
      fileName: req.file.originalname,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      fileUrl: driveLink,
      createdAt: new Date().toISOString()
    };

    addItem(fileItem);
    return res.status(201).json({ success: true, item: fileItem });
  } catch (error) {
    console.error('Google Drive Upload Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload file to Google Drive.'
    });
  }
});

app.put('/api/items/:id', requireAuth, upload.single('file'), async (req, res) => {
  const itemId = req.params.id;
  const existingItem = getItemById(itemId);

  if (!existingItem) {
    return res.status(404).json({
      success: false,
      message: 'Item not found.'
    });
  }

  const title = typeof req.body.title === 'string' ? req.body.title.trim() : existingItem.title;
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : existingItem.description;
  const folder = typeof req.body.folder === 'string'
    ? (req.body.folder.trim() || 'General')
    : existingItem.folder;
  const addedBy = typeof req.body.addedBy === 'string'
    ? normalizeMemberName(req.body.addedBy)
    : existingItem.addedBy;

  if (!title || !description) {
    return res.status(400).json({
      success: false,
      message: 'Title and description are required.'
    });
  }

  if (!addedBy) {
    return res.status(400).json({
      success: false,
      message: 'Please select a valid team member in Added by.'
    });
  }

  // Type might be updated from file to link or link to file
  const requestedType = (req.body.type || existingItem.type).trim().toLowerCase();

  if (requestedType === 'link') {
    const requestedUrl = typeof req.body.url === 'string' ? req.body.url.trim() : existingItem.url;
    if (!requestedUrl || !/^https?:\/\//i.test(requestedUrl)) {
      return res.status(400).json({
        success: false,
        message: 'A valid URL is required for link items.'
      });
    }

    const updatedLink = updateItem(itemId, (item) => ({
      ...item,
      type: 'link',
      title,
      description,
      folder,
      addedBy,
      url: requestedUrl,
      fileUrl: requestedUrl // override to keep consistent
    }));

    return res.status(200).json({ success: true, item: updatedLink });
  }

  // if it's a file
  let newFileProps = {};
  if (req.file) {
    try {
      const driveLink = await uploadToDrive(req.file.originalname, req.file.mimetype, req.file.buffer);
      newFileProps = {
        fileName: req.file.originalname,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        fileUrl: driveLink
      };
    } catch (error) {
      console.error('Google Drive Upload Edit Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload new file to Google Drive.'
      });
    }
  }

  const updatedFile = updateItem(itemId, (item) => ({
    ...item,
    type: 'file',
    title,
    description,
    folder,
    addedBy,
    ...newFileProps
  }));

  return res.status(200).json({ success: true, item: updatedFile });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  const itemId = req.params.id;
  const removedItem = deleteItem(itemId);

  if (!removedItem) {
    return res.status(404).json({
      success: false,
      message: 'Item not found.'
    });
  }

  if (removedItem.type === 'file' && removedItem.fileName) {
    const absoluteFilePath = path.join(uploadsDir, removedItem.fileName);
    if (fs.existsSync(absoluteFilePath)) {
      fs.unlinkSync(absoluteFilePath);
    }
  }

  return res.status(200).json({ success: true, item: removedItem });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
