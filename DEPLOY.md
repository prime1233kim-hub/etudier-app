# Putting ÉTUDIER online (Render)

These steps publish the new site **as a separate Render service**, so your current site at etudier-v1vp.onrender.com keeps working until you decide to switch over.

Git is already set up in this folder with everything committed. Your `.env` file (with your secret key) is excluded, so it will never be uploaded.

## 1. Put the code on GitHub

1. On github.com, click **New repository**, name it `etudier-app`, and leave it **empty**: no README and no .gitignore.
2. In a terminal inside this `etudier-app` folder, run these two commands. Replace `YOUR-NAME` with your GitHub username.

   ```bash
   git remote add origin https://github.com/YOUR-NAME/etudier-app.git
   ```

   ```bash
   git push -u origin main
   ```

## 2. Create the Render service

The folder includes a `render.yaml` file, so Render can fill in the settings for you.

1. Go to **render.com** → **New** → **Blueprint**, and pick your `etudier-app` repository.
2. When Render asks for `ANTHROPIC_API_KEY`, paste your key from console.anthropic.com.
3. Click **Apply**. After a few minutes you'll get a new `.onrender.com` address.

**Prefer to set it up by hand?** Choose **New** → **Web Service** instead, with these settings:

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment variable:** `ANTHROPIC_API_KEY`

**Check it worked:** open `your-address.onrender.com/api/status`. It should say `"ai":true`.

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
