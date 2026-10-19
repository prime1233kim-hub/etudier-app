# ÉTUDIER

A fashion research and learning website. Upload a runway photograph and ÉTUDIER explains:

- the **silhouette**, proportions and styling
- the **colour palette**, with swatches and hex values
- each **garment**: what it is, how it fits, and visible details
- **design details** such as lapels, drapes, pleats and closures, each marked as *observation* or *inference*
- the **fashion vocabulary**, with simple definitions
- **brand and source links**, which are checked before they are shown

You can also browse a **Fashion Archive**, and keep your own **saved looks, collections and glossary**.

---

## Run it on your computer

You need **Node.js 20 or newer** (download it from nodejs.org).

1. Open a terminal in this `etudier-app` folder.
2. Install everything (only needed the first time):

   ```bash
   npm install
   ```

3. Start the site:

   ```bash
   npm start
   ```

4. Open **http://localhost:3400** in your browser.

The site works straight away, but without an AI key the Analyze page shows a **demo** (clearly labelled sample data) instead of real analysis.

## Turn on the real AI

There are two options. You only need one.

### Option A: free (Google Gemini)

1. Go to **aistudio.google.com**, sign in with a Google account, and click **Get API key**, then **Create API key**. No credit card is needed.
2. In this folder, copy `.env.example` to a new file called `.env`.
3. Paste your key after `GEMINI_API_KEY=`.
4. Stop the server (Ctrl + C) and run `npm start` again.

Things to know about the free plan:

- **Daily limits.** When they run out, the site says "try again later" until the limit resets.
- **Privacy.** Google says it may use content sent on its free plan to improve its products. The Analyze page tells visitors this.
- **Models.** Analysis uses `gemini-3.8-flash`. Source research uses `gemini-2.5-flash`, because Google Search is only free with the 2.5 models. You can change either in `.env` if Google's free models change.

### Option B: paid (Anthropic Claude)

1. Create an account at **console.anthropic.com** and make an **API key**. It costs roughly 25–50 cents per analysed look, so set a monthly spending limit in the console.
2. Put the key after `ANTHROPIC_API_KEY=` in `.env`, then restart.

If both keys are set, Claude is used. Add `AI_PROVIDER=gemini` to force the free option. Keep `.env` private; it is already excluded from Git.

## Check that everything works

```bash
npm test
```

This runs 37 automatic checks. They cover uploads, the analysis pipeline for both Claude and Gemini (using pretend AI services, so no key or money is needed), link checking, the archive, and security headers.

---

## What works, what needs a key, what is limited

| Feature | Status |
|---|---|
| Homepage, archive, look pages, About, My Research | ✅ Works with no setup |
| Upload: drag and drop, file picker, mobile camera roll, crop, replace, remove | ✅ Works with no setup |
| File checks: JPEG/PNG/WebP only, 10 MB max, fake files rejected | ✅ Works with no setup |
| Demo analysis, clearly labelled as sample data | ✅ Works with no setup |
| Real AI analysis of your uploaded photo | 🔑 Needs `GEMINI_API_KEY` (free) or `ANTHROPIC_API_KEY` |
| Brand & source research, with link checking | 🔑 Needs `GEMINI_API_KEY` (free) or `ANTHROPIC_API_KEY` |
| Saved looks, collections, glossary, copy/download notes | ✅ Works, but stored **in your browser only** |
| Adding looks to the public archive | ✅ Works. See the storage note below |

### How source links are kept honest

1. The AI may only suggest links that actually came back from a web search. Made-up URLs are thrown away. With Gemini, the AI picks pages by number from the list Google Search returned, so it can't type in a URL at all.
2. The server opens every link itself. Broken links are removed, and links to private or local addresses are blocked.
3. Each link gets a label based on what the server actually found on the page, never on the AI's opinion:
   - **Verified match**: the page is on the brand's official website, and it names the brand and the exact product.
   - **Related reference**: an official or runway page for the brand or collection.
   - **Unverified candidate**: the link works, but the claim couldn't be confirmed. Instagram links always get this label, because Instagram can't be read without logging in.
4. If nothing can be confirmed, the page says **"Original source not identified"**, which is a normal, honest result.

### Known limitations

- **Saved research is per-browser.** There are no user accounts yet, so saved looks, collections and the glossary live in your browser's storage. Clearing browser data deletes them, and they don't sync between devices. Real accounts would need a database and a login system.
- **Archive storage on free hosting.** Looks that visitors add are saved in `data/archive.json` and `data/archive-images/`. Render's free plan wipes these files whenever the site redeploys. To keep them, add a Render **Disk** and set `DATA_DIR` to its path (see DEPLOY.md), or move to a database later.
- **Uploaded photos are not stored** unless you choose "Add to public archive" and tick the consent box. Only a small copy is kept then. Whoever added a look can remove it from the same browser.
- **AI can be wrong.** Colours are estimates, and fabrics are often guesses (each is labelled). Treat results as a starting point.
- **Brand websites often block automated checks.** Those links are kept, but marked unverified.
- **Rate limits** are kept in memory, so they reset when the server restarts.
- The live AI path was tested against simulated Claude and Gemini services, not the real ones. Run one real analysis after adding your key.

## Example images

All photographs come from **Wikimedia Commons** and are used under their Creative Commons licences. Each one is credited on the page where it appears.

- **Homepage hero:** garments by Tom Ford, Rick Owens and Dior, photographed in museum exhibitions. Freely licensed runway photos of these designers aren’t available, so the hero uses exhibition photos instead.
- **Archive examples:** runway and backstage photos from Basil Soda and Georges Hobeika, Spring/Summer 2011.

The designer and season come from each photo's Commons record. The written analyses for these examples are **illustrative samples** and are labelled that way. They are not AI output.

## Project layout

```
server.js                  web server and API routes
server/ai/                 AI analysis (Claude or Gemini) and the result schema
server/research/           source research and link verification
server/upload.js           upload checks (type, size, real image bytes)
server/archive.js          public archive storage
data/examples.json         example looks (labelled)
public/                    the website pages, styles and browser scripts
test/                      automatic checks (npm test)
```
