# Watch Later Home

A browser extension that makes your YouTube **Watch Later** list the homepage, shown as a clean
thumbnail grid. Recommendations are one click away.

- Opening youtube.com, clicking the logo or "Home" takes you to Watch Later instead of the feed.
- Watch Later is shown as a full-width grid. The playlist panel and banners are hidden.
- A **Recommendations** button in the top bar opens the normal homepage. There it reads
  **Watch Later** and takes you back.
- Clicking a video plays it in the Watch Later queue. The ⋮ on a card opens YouTube's own menu,
  including "Remove from Watch later".

Works in Chrome, Edge and other Chromium browsers (Manifest V3). No permissions, no data leaves the page.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder.
4. Reload any open YouTube tabs.

## How it works

YouTube's API doesn't expose Watch Later, so the extension works with the page itself.
`content.js` reads each video from YouTube's own playlist rows, hides them, and draws its own grid
in their place. The hidden rows stay in the page, so infinite scroll, sorting and menus keep working.

To try it signed out, open any public playlist with `&wlh=grid` added to the URL.

## If it breaks

YouTube changes its markup from time to time. The row selectors are in `readRow()` in `content.js`
and in `grid.css`; inspect a row on the Watch Later page and update them.
