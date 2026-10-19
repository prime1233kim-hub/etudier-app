# Putting ÉTUDIER online (Render)

These steps publish the new site **as a separate Render service**, so your current site at etudier-v1vp.onrender.com keeps working until you decide to switch over.

Your `.env` file (with your secret key) is excluded from Git, so it will never be uploaded.

## 1. The code on GitHub (already done)

The code is at **https://github.com/prime1233kim-hub/etudier-app**, and this folder is connected to it. Step 3 explains how to upload future changes.

## 2. Create the Render service

The folder includes a `render.yaml` file, so Render can fill in the settings for you.

1. Go to **render.com** → **New** → **Blueprint**, and pick your `etudier-app` repository.
2. When Render asks for `GEMINI_API_KEY`, paste your free key from aistudio.google.com.
3. Click **Apply**. After a few minutes you'll get a new `.onrender.com` address.

**Prefer to set it up by hand?** Choose **New** → **Web Service** instead, with these settings:

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment variable:** `GEMINI_API_KEY` (free), or `ANTHROPIC_API_KEY` for paid Claude

**Check it worked:** open `your-address.onrender.com/api/status`. It should say `"ai":true` and `"provider":"gemini"`.

**Already created the service?** Go to its **Environment** tab, add `GEMINI_API_KEY` with your key, and save. Render restarts the site automatically.

## 3. Making changes later

After editing files, save a new version and upload it. Render redeploys automatically.

```bash
git add .
```

```bash
git commit -m "Describe what you changed"
```

```bash
git push
```

## 4. (Optional) Keep archive entries between deploys

The free plan forgets files every time the site redeploys, so looks people add to the archive disappear. To keep them:

1. Switch the service to a paid plan that supports **Disks**, and add a Disk mounted at `/var/data`.
2. Add the environment variable `DATA_DIR` = `/var/data`.

## 5. Switching your old address over

If you want `etudier-v1vp.onrender.com` itself to show the new site, either:

- point that Render service at the new GitHub repository (**Settings** → **Repository**), or
- delete the old service and give the new one a custom domain.

Back up anything you need from the old site first. Its Discord login, Compare and Cowork features are **not** part of this new app.
