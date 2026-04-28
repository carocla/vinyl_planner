# Vinyl Side Planner

A browser-based tool to help you curate the perfect tracklist for custom vinyl records. It helps manage Side A and Side B time constraints, track total runtimes, and allows for JSON/raw text import and export.

**[Check out the Live App Here](https://vinyl-planner.neocities.org)**


## Why?
Custom vinyl records have strict physical audio limitations: if a side is too long, audio quality drops. I built this app to avoid the agony of manually calculating track times and reshuffling songs to fit within vinyl standards. 

After using it to plan my own record, I shared it with the seller who pressed my vinyl. Since then, it has been used over 100 times by their customers to easily manage and submit their tracklists!

## Features

* **Drag-and-Drop Interface:** Easily move tracks between Side A, Side B, and an "Unassigned" pool.
* **Smart Time Tracking:** Real-time calculation of total side length with capacity warnings based on your selected vinyl size.
* **Auto-Shuffle Fit:** An algorithm that randomizes your pool of unassigned songs in a distribution that perfectly fits into Side A and Side B.
* **Bulk Import:** Paste tracklists from anywhere using customizable separators (e.g., `Title / Artist - Time`).
* **Shareable URLs:** The entire tracklist state is Base64 encoded into the URL hash. Copy the link and share it!
* **History:** Undo (`Ctrl+Z`) and Redo (`Ctrl+Shift+Z`) support.
* **JSON Export/Import:** Save your layout as a JSON to keep for later, or drag-and-drop a `.json` file straight into the browser to load a previous tracklist.

## Technical Details

This is a **zero-dependency** frontend project. Real simple.

* **HTML5 & CSS3:** Modern, responsive UI.
* **JavaScript:** Utilizes native Drag & Drop APIs, `localStorage`, and custom history stacks.
* **Client-Side:** User data never leaves their browser. State is persisted locally and packed directly into the URL fragment for easy sharing.

### Running Locally

Running this vinyl planner locally is as simple as the app itself:

```bash
git clone https://github.com/carocla/vinyl-side-planner.git
cd vinyl-side-planner
# Open index.html in your web browser
```

## License
This project is open-source and free to use.

***

💿 *Built for love of analog media*
