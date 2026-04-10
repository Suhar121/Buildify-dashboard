const fs = require('fs');
const path = require('path');
const express = require('express');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'uploads', 'client_secret_313504864661-q5smsgskdobi1e07q7ie6lp8mq022m2u.apps.googleusercontent.com.json');
const TOKEN_PATH = path.join(__dirname, 'uploads', 'token.json');

const credentials = require(CREDENTIALS_PATH);
const { client_secret, client_id } = credentials.web;

// Must match the exact URL you added to the Google Cloud Console
const REDIRECT_URI = 'http://localhost:4000/oauth2callback';

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  REDIRECT_URI
);

const app = express();

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send('Failed: No code provided');
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    
    // Save the token so our dashboard can use it later without logging in again
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    
    console.log('✅ Token successfully saved to uploads/token.json');
    res.send('<h1>Authentication successful!</h1><p>You can close this window and return to VS Code.</p>');
    
    // Shut down the temp server
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (err) {
    console.error('Error retrieving access token', err);
    res.status(500).send('Authentication failed check console log.');
  }
});

const SCOPES = ['https://www.googleapis.com/auth/drive'];

app.listen(4000, () => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh token
    scope: SCOPES,
  });

  console.log('====================================================');
  console.log('🚀 ACTION REQUIRED: Link your personal Google Drive');
  console.log('====================================================');
  console.log('Open this link in your browser:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('Waiting for you to log in...');
}).on('error', (err) => {
  console.error("Failed to start server on port 4000:", err.message);
  process.exit(1);
});