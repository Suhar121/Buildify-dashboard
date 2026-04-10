const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const stream = require('stream');

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

module.exports = {
  uploadToDrive
};
