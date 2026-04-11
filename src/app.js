const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const cors = require('cors');
const morgan = require('morgan');

const driveService = require('./drive');

const {
  addFolder,
  addItem,
  deleteItem,
  getFolders,
  getItemById,
  getItems,
  getTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  updateItem
} = require('./storage');
const { TEAM_MEMBERS, normalizeMemberName } = require('./teamMembers');

const app = express();
const uploadsDir = path.join(__dirname, '..', 'uploads');
const resumableUploadSessions = new Map();
const RESUMABLE_UPLOAD_SESSION_TTL_MS = 1000 * 60 * 60;

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

function toSafeFileSize(input) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function getResumableUploadSession(sessionId) {
  const entry = resumableUploadSessions.get(sessionId);
  if (!entry) {
    return null;
  }

  if ((Date.now() - entry.createdAt) > RESUMABLE_UPLOAD_SESSION_TTL_MS) {
    resumableUploadSessions.delete(sessionId);
    return null;
  }

  return entry;
}

function extractDriveFileIdFromLocation(locationHeader) {
  if (!locationHeader || typeof locationHeader !== 'string') {
    return '';
  }

  const fromPathMatch = /\/files\/([^/?#]+)/i.exec(locationHeader);
  if (fromPathMatch && fromPathMatch[1]) {
    try {
      return decodeURIComponent(fromPathMatch[1]);
    } catch {
      return fromPathMatch[1];
    }
  }

  return '';
}

function parseDriveUploadMetadata(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(responseText);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

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

// TODOS API
app.get('/api/todos', requireAuth, (_req, res) => {
  res.status(200).json({ success: true, todos: getTodos() });
});

app.post('/api/todos', requireAuth, (req, res) => {
  const task = (req.body.task || '').trim();
  const date = (req.body.date || '').trim();
  const points = Array.isArray(req.body.points) ? req.body.points : [];

  if (!task) return res.status(400).json({ success: false, message: 'Task is required' });

  const formattedPoints = points.filter(p => typeof p.text === 'string' && p.text.trim()).map(p => ({
    id: crypto.randomUUID(),
    text: p.text.trim(),
    startTime: p.startTime || '',
    endTime: p.endTime || '',
    assignedTo: normalizeMemberName(p.assignedTo) || [],
    completed: false
  }));

  const newItem = addTodo({
    id: crypto.randomUUID(),
    task,
    date,
    points: formattedPoints,
    completed: false,
    createdAt: new Date().toISOString()
  });

  res.status(201).json({ success: true, todo: newItem });
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const { pointId, updateAll, task, date, points } = req.body;
  const updated = updateTodo(req.params.id, (t) => {
    if (updateAll) {
      // Full object replacement (edit objective)
      const formattedPoints = (points || []).map((p, idx) => {
        // Keep completion status if it already exists, or match by index
        const existingPoint = t.points ? t.points[idx] : null;
        return {
          id: existingPoint ? existingPoint.id : Math.random().toString(36).substr(2, 9),
          text: p.text.trim(),
          startTime: p.startTime || '',
          endTime: p.endTime || '',
          assignedTo: normalizeMemberName(p.assignedTo) || [],
          completed: existingPoint ? existingPoint.completed : false
        };
      });
      // Check if all points are completed to determine global completion
      const allCompleted = formattedPoints.length > 0 && formattedPoints.every(p => p.completed);
      return { ...t, task, date, points: formattedPoints, completed: allCompleted };
    }

    // Toggle specific point logic
    if (pointId && Array.isArray(t.points)) {
      const newPoints = t.points.map(p => p.id === pointId ? { ...p, completed: !p.completed } : p);
      const allCompleted = newPoints.length > 0 && newPoints.every(p => p.completed);
      return { ...t, points: newPoints, completed: allCompleted };
    }
    // Toggle entire task
    const globalComplete = !t.completed;
    const syncedPoints = (t.points || []).map(p => ({...p, completed: globalComplete}));
    return { ...t, completed: globalComplete, points: syncedPoints };
  });
  if (!updated) return res.status(404).json({ success: false, message: 'Todo not found' });
  res.status(200).json({ success: true, todo: updated });
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const removed = deleteTodo(req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Todo not found' });
  res.status(200).json({ success: true });
});

app.post('/api/items/upload-session', requireAuth, async (req, res) => {
  const fileName = (req.body.fileName || '').trim();
  const mimeType = (req.body.mimeType || '').trim() || 'application/octet-stream';
  const size = toSafeFileSize(req.body.size);

  if (!fileName) {
    return res.status(400).json({
      success: false,
      message: 'fileName is required.'
    });
  }

  try {
    const { uploadUrl } = await driveService.createResumableUploadSession({
      fileName,
      mimeType,
      size
    });

    const sessionId = crypto.randomUUID();
    resumableUploadSessions.set(sessionId, {
      uploadUrl,
      fileId: '',
      createdAt: Date.now()
    });

    return res.status(200).json({
      success: true,
      sessionId,
      uploadUrl: `/api/items/upload-session/${sessionId}/chunk`
    });
  } catch (error) {
    console.error('Drive upload session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create Google Drive upload session.'
    });
  }
});

app.put(
  '/api/items/upload-session/:sessionId/chunk',
  requireAuth,
  express.raw({ type: '*/*', limit: '200mb' }),
  async (req, res) => {
    const sessionId = (req.params.sessionId || '').trim();
    const session = getResumableUploadSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Upload session not found or expired.'
      });
    }

    const contentType = (req.headers['content-type'] || '').trim() || 'application/octet-stream';
    const contentRange = typeof req.headers['content-range'] === 'string'
      ? req.headers['content-range']
      : '';
    const requestBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.alloc(0);

    const upstreamHeaders = {
      'Content-Type': contentType
    };

    if (contentRange) {
      upstreamHeaders['Content-Range'] = contentRange;
    }

    try {
      const driveResponse = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: upstreamHeaders,
        body: requestBody
      });

      const responseText = await driveResponse.text();
      const rangeHeader = driveResponse.headers.get('range');
      const locationHeader = driveResponse.headers.get('location');
      const upstreamContentType = driveResponse.headers.get('content-type');
      const metadata = parseDriveUploadMetadata(responseText) || {};
      const responseFileId = (metadata.id || '').trim() || extractDriveFileIdFromLocation(locationHeader);

      if (rangeHeader) {
        res.set('Range', rangeHeader);
      }

      if (locationHeader) {
        res.set('Location', locationHeader);
      }

      if (upstreamContentType) {
        res.set('Content-Type', upstreamContentType);
      }

      if (driveResponse.status === 200 || driveResponse.status === 201) {
        session.fileId = responseFileId;
        session.completedAt = Date.now();
        resumableUploadSessions.set(sessionId, session);

        const finalPayload = {
          ...metadata
        };

        if (responseFileId && !finalPayload.id) {
          finalPayload.id = responseFileId;
        }

        return res.status(driveResponse.status).json(finalPayload);
      }

      return res.status(driveResponse.status).send(responseText);
    } catch (error) {
      console.error('Drive chunk upload proxy error:', error);
      return res.status(502).json({
        success: false,
        message: 'Failed to upload chunk to Google Drive.'
      });
    }
  }
);

app.post('/api/items/direct-upload/complete', requireAuth, async (req, res) => {
  const fileId = (req.body.fileId || '').trim();
  const sessionId = (req.body.sessionId || '').trim();
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim() || 'Uploaded via Direct Upload';
  const folder = (req.body.folder || 'General').trim() || 'General';
  const addedBy = normalizeMemberName(req.body.addedBy);
  const providedFileName = (req.body.fileName || '').trim();
  const providedMimeType = (req.body.mimeType || '').trim();
  const providedSize = toSafeFileSize(req.body.size);

  let resolvedFileId = fileId;
  if (!resolvedFileId && sessionId) {
    const session = getResumableUploadSession(sessionId);
    resolvedFileId = (session?.fileId || '').trim();
  }

  if (!resolvedFileId) {
    return res.status(400).json({
      success: false,
      message: 'Upload session or fileId is missing. Please retry the upload.'
    });
  }

  if (!title) {
    return res.status(400).json({
      success: false,
      message: 'Title is required to save the resource.'
    });
  }

  if (!addedBy) {
    return res.status(400).json({
      success: false,
      message: 'Please select a valid team member in Added by.'
    });
  }

  try {
    const driveFile = await driveService.finalizeDriveUpload(resolvedFileId);
    const resolvedSize = providedSize || toSafeFileSize(driveFile.size);
    const fileUrl = driveFile.webViewLink || driveFile.webContentLink || `https://drive.google.com/file/d/${resolvedFileId}/view`;
    const resolvedFileName = providedFileName || driveFile.name || 'Uploaded file';

    const fileItem = {
      id: crypto.randomUUID(),
      type: 'file',
      title,
      description,
      folder,
      addedBy,
      fileName: resolvedFileName,
      originalName: resolvedFileName,
      mimeType: providedMimeType || driveFile.mimeType || 'application/octet-stream',
      size: resolvedSize,
      fileUrl,
      createdAt: new Date().toISOString()
    };

    addItem(fileItem);

    if (sessionId) {
      resumableUploadSessions.delete(sessionId);
    }

    return res.status(201).json({ success: true, item: fileItem });
  } catch (error) {
    console.error('Drive upload finalize error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to finalize Google Drive upload.'
    });
  }
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
    const driveLink = await driveService.uploadToDrive(req.file.originalname, req.file.mimetype, req.file.buffer);

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
      const driveLink = await driveService.uploadToDrive(req.file.originalname, req.file.mimetype, req.file.buffer);
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
