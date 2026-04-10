# BUILDIFY Dashboard

A simple dashboard to organize hackathon resources in one place:
- Files (PDFs, images, docs, etc.)
- Links
- Title + description for each resource
- Folder-based organization
- Search and folder filtering

## Prerequisites

- Node.js 18+ (Node.js 22 recommended)
- npm (comes with Node.js)

## Installation

1. Open this project folder in your terminal:
   - `d:\Buildify\dashboard`
2. Install dependencies:
   - `npm install`
3. Start the app:
   - `npm start`
4. Open in browser:
   - `http://localhost:3000`

## Run tests

- `npm test`

## Project structure

- `src/` → backend server and API
- `public/` → frontend dashboard UI
- `uploads/` → uploaded files
- `data/items.json` → saved metadata (title, description, folder, links)
- `tests/` → automated API tests

## Usage notes

- Use **Resource Type = File** to upload local files.
- Use **Resource Type = Link** to save website/document URLs.
- Each resource should include:
  - Title
  - Description
  - Folder
- You can edit/delete resources from the dashboard cards.
- Drag-and-drop upload is supported for file resources.

## Troubleshooting

- If port 3000 is busy, close the app using that port and run `npm start` again.
- If uploads do not appear, check that the `uploads/` folder exists and has write access.
- If saved items look missing, verify `data/items.json` is valid JSON.
