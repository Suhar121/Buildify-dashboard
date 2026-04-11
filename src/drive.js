const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const stream = require('stream');

const DRIVE_RESUMABLE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink';

// Use your personal OAuth JSON Key
const CREDENTIALS_PATH = path.join(__dirname, '..', 'uploads', 'client_secret_313504864661-q5smsgskdobi1e07q7ie6lp8mq022m2u.apps.googleusercontent.com.json');
const TOKEN_PATH = path.join(__dirname, '..', 'uploads', 'token.json');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_secret, client_id } = credentials.web;

// Must exactly match the redirect URI authorized in the console
const auth = new google.auth.OAuth2(
  client_id,
  client_secret,
  'http://localhost:4000/oauth2callback'
);

// If the token exists, attach it to our OAuth client automatically
if (fs.existsSync(TOKEN_PATH)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  auth.setCredentials(token);
} else {
  console.log('🚨 WARNING: missing token.json! Please run "node setup-auth.js" in the terminal.');
}

const drive = google.drive({ version: 'v3', auth });
const FOLDER_NAME = 'HackathonUploads';

let cachedFolderId = null;

async function getUploadFolderId() {
  if (cachedFolderId) return cachedFolderId;

  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
    fields: 'files(id, name)'
  });

  if (res.data.files && res.data.files.length > 0) {
    cachedFolderId = res.data.files[0].id;
    return cachedFolderId;
  }

  // Auto-create folder if it doesn't exist
  console.log(`Folder "${FOLDER_NAME}" not found. Creating a new one...`);
  const folderMetadata = {
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder',
  };
  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
  });
  cachedFolderId = folder.data.id;
  return cachedFolderId;
}

/**
 * Uploads a file buffer to Google Drive.
 * @param {string} originalName 
 * @param {string} mimeType 
 * @param {Buffer} buffer 
 * @returns {Promise<string>} The Google Drive webViewLink
 */
async function uploadToDrive(originalName, mimeType, buffer) {
  const folderId = await getUploadFolderId();

  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const fileMetadata = {
    name: originalName,
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType,
    body: bufferStream,
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  });

  // Make the file publicly reader so users can click the link and view it
  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return file.data.webViewLink; // The shareable link
}

async function getAccessToken() {
  const tokenResult = await auth.getAccessToken();
  const accessToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;

  if (!accessToken) {
    throw new Error('Google access token is unavailable. Run setup-auth.js again to refresh token.json.');
  }

  return accessToken;
}

async function createResumableUploadSession({ fileName, mimeType, size }) {
  const folderId = await getUploadFolderId();
  const accessToken = await getAccessToken();
  const effectiveMimeType = (mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const effectiveName = (fileName || 'Untitled Upload').trim() || 'Untitled Upload';

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': effectiveMimeType
  };

  if (Number.isFinite(size) && size > 0) {
    headers['X-Upload-Content-Length'] = String(size);
  }

  const response = await fetch(DRIVE_RESUMABLE_UPLOAD_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: effectiveName,
      parents: [folderId],
      mimeType: effectiveMimeType
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start resumable upload session: ${response.status} ${errorText}`);
  }

  const uploadUrl = response.headers.get('location');

  if (!uploadUrl) {
    throw new Error('Google Drive did not return a resumable upload URL.');
  }

  return { uploadUrl };
}

async function finalizeDriveUpload(fileId) {
  // Run permissions update and file metadata fetch concurrently for maximum speed
  const [fileResponse] = await Promise.all([
    drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, webViewLink, webContentLink',
      supportsAllDrives: true,
    }),
    drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    })
  ]);

  return fileResponse.data;
}

module.exports = {
  uploadToDrive,
  createResumableUploadSession,
  finalizeDriveUpload
};
