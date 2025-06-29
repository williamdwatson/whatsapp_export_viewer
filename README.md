# WhatsApp Export Viewer

This standalone app is built for viewing WhatsApp exports (not backups). This app is not associated with [WhatsApp](https://www.whatsapp.com/) in any way.

## Usage

Windows installers are available under "Releases". After installation, load the WhatsApp export file using the "Add chat" button. A directory containing the exported media files can also optionally be linked; this is necessary to view photo and video messages.

After loading, chats can searched and messages starred. Additionally, basic chat statistics are available.

## Development

The app is built using Rust/Tauri, with the frontend in TypeScript/React. The core frontend functionality is in the `src` folder, and the backend functionality is in `src-tauri/src/lib.rs`.

Development can be done with hot-reloading enabled using `npm run tauri dev`. A production build can be done using `npm run tauri build`.

`combine_chats.py` holds a Python script used to parse exported WhatsApp chats and perform a semi-manual combining of different exports of the same chat.
