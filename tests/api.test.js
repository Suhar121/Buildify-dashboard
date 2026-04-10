const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { beforeEach } = require('node:test');

const app = require('../src/app');
const { clearItems } = require('../src/storage');

const MEMBER_SUHAR = 'Suhar Yasee';
const MEMBER_ANAS = 'Anas Shiraz';

beforeEach(() => {
  clearItems();
});

test('POST /api/items creates link item with title, description, and folder', async () => {
  const payload = {
    type: 'link',
    title: 'Hackathon Rules',
    description: 'Official guideline document for participants',
    folder: 'Rules',
    url: 'https://example.com/rules',
    addedBy: MEMBER_SUHAR
  };

  const response = await request(app)
    .post('/api/items')
    .send(payload)
    .expect(201);

  assert.equal(response.body.success, true);
  assert.equal(response.body.item.type, 'link');
  assert.equal(response.body.item.title, payload.title);
  assert.equal(response.body.item.folder, payload.folder);
  assert.equal(response.body.item.url, payload.url);
  assert.equal(response.body.item.addedBy, MEMBER_SUHAR);
});

test('POST /api/items rejects unknown addedBy value', async () => {
  const payload = {
    type: 'link',
    title: 'Sponsor Deck',
    description: 'Deck for sponsor partners',
    folder: 'Sponsorship',
    url: 'https://example.com/sponsor',
    addedBy: 'Unknown Member'
  };

  const response = await request(app)
    .post('/api/items')
    .send(payload)
    .expect(400);

  assert.equal(response.body.success, false);
});

test('GET /api/items supports search and folder filters', async () => {
  const first = {
    type: 'link',
    title: 'Venue Map',
    description: 'Map for navigation',
    folder: 'Logistics',
    url: 'https://example.com/map',
    addedBy: MEMBER_SUHAR
  };

  const second = {
    type: 'link',
    title: 'Pitch Template',
    description: 'Deck starter template',
    folder: 'Templates',
    url: 'https://example.com/pitch',
    addedBy: MEMBER_ANAS
  };

  await request(app).post('/api/items').send(first).expect(201);
  await request(app).post('/api/items').send(second).expect(201);

  const filtered = await request(app)
    .get('/api/items')
    .query({ folder: 'Templates', search: 'pitch' })
    .expect(200);

  assert.equal(filtered.body.success, true);
  assert.ok(Array.isArray(filtered.body.items));
  assert.equal(filtered.body.items.length, 1);
  assert.equal(filtered.body.items[0].title, 'Pitch Template');
});

test('GET /api/folders returns unique folder names', async () => {
  const response = await request(app).get('/api/folders').expect(200);

  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.folders));
});

test('PUT /api/items/:id updates an existing link item', async () => {
  const created = await request(app)
    .post('/api/items')
    .send({
      type: 'link',
      title: 'Old Title',
      description: 'Old Description',
      folder: 'Docs',
      url: 'https://example.com/old',
      addedBy: MEMBER_SUHAR
    })
    .expect(201);

  const itemId = created.body.item.id;

  const updated = await request(app)
    .put(`/api/items/${itemId}`)
    .send({
      title: 'Updated Title',
      description: 'Updated Description',
      folder: 'Announcements',
      url: 'https://example.com/new',
      addedBy: MEMBER_ANAS
    })
    .expect(200);

  assert.equal(updated.body.success, true);
  assert.equal(updated.body.item.id, itemId);
  assert.equal(updated.body.item.title, 'Updated Title');
  assert.equal(updated.body.item.description, 'Updated Description');
  assert.equal(updated.body.item.folder, 'Announcements');
  assert.equal(updated.body.item.url, 'https://example.com/new');
  assert.equal(updated.body.item.addedBy, MEMBER_ANAS);
});

test('DELETE /api/items/:id removes an item', async () => {
  const created = await request(app)
    .post('/api/items')
    .send({
      type: 'link',
      title: 'Delete Me',
      description: 'Will be removed',
      folder: 'Cleanup',
      url: 'https://example.com/delete',
      addedBy: MEMBER_SUHAR
    })
    .expect(201);

  const itemId = created.body.item.id;

  const removeResponse = await request(app)
    .delete(`/api/items/${itemId}`)
    .expect(200);

  assert.equal(removeResponse.body.success, true);
  assert.equal(removeResponse.body.item.id, itemId);

  const afterDelete = await request(app).get('/api/items').expect(200);
  assert.equal(afterDelete.body.items.length, 0);
});
