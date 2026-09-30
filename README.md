# Engineering at Centre

Centre College's student guides for the engineering program:

- **`index.html`**: the home page, linking to both guides
- **`degree-plan.html`**: *What it's like*, the major's course requirements and prerequisite flowchart
- **`computer-requirements.html`**: *Get ready*, for checking whether a student's computer, or one they plan to buy, can run the software used in engineering courses
- **`admin.html`**: the maintenance page for the computer requirements (edit, preview, publish)
- **`assets/`**: Centre logos used by every page
- **`data/requirements.json`**: software requirements (MATLAB, Autodesk Fusion, Bambu Studio)
- **`data/courses.json`**: courses and the software each one uses
- **`data/sources.json`**: vendor pages the monthly check watches
- **`scripts/check-vendors.mjs`** and **`.github/workflows/vendor-check.yml`**: the monthly vendor check

No API keys or paid services are needed.

---

## One-time setup (about 15 minutes)

### 1. Create the repository
1. On GitHub, choose **New repository**. Name it, for example, `engineering`. Public repositories get GitHub Pages and Actions for free.
2. Upload every file and folder in this package, keeping the folder structure.
   - **Watch for the hidden `.github` folder.** Mac Finder and Windows Explorer hide folders starting with a dot, so a drag-and-drop upload can miss it. Easiest fix: [GitHub Desktop](https://desktop.github.com/) uploads everything. Or on GitHub choose **Add file → Create new file**, type the name `.github/workflows/vendor-check.yml`, and paste in that file's contents.

### 2. Turn on the website
**Settings → Pages →** Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → **Save**.
After a minute or two the site is live at `https://YOUR-USERNAME.github.io/engineering/`. The computer requirements page is at `.../engineering/computer-requirements.html`.

### 3. Let the vendor check save its results
**Settings → Actions → General → Workflow permissions →** choose **Read and write permissions** → **Save**.

### 4. Run the vendor check once
**Actions → Vendor check → Run workflow.** The first run saves a copy of each vendor page to compare against next time. After that it runs by itself on the 1st of every month.

### 5. Create a token for the admin page (optional)
You only need this to save from `admin.html`. You can also download the files from the admin page and upload them yourself.
1. GitHub → your profile picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** Only select repositories → this repository.
3. **Permissions → Repository permissions → Contents: Read and write.** Leave everything else at No access.
4. Pick an expiration (for example, 1 year), generate it, and paste it into the admin page's **Save & publish** tab.

The token stays in your browser only. It is never saved in the repository. Anyone can open `admin.html`, but nobody can save without a token.

---

## Keeping it up to date

### What happens automatically
On the 1st of each month the vendor check reads every page in `data/sources.json` and compares it with last month's copy.

| Result | What it does |
|---|---|
| Page unchanged | Sets **Last checked** to today for that software. Nothing for you to do. |
| Page changed | Opens a GitHub issue labeled **vendor-check** showing exactly which lines changed. |
| Page couldn't be read | Opens an issue asking you to check the page by hand. |

GitHub emails you when an issue opens. You can also run the check any time from the **Actions** tab.

### When a "requirements changed" issue arrives
1. Read the change in the issue, then confirm it on the vendor page (linked in the issue).
2. Open `admin.html` on the live site → **Software** → pick the program → edit the values. Change **Version** too if there's a new release.
3. **Preview on site** to check it, then **Save & publish.** "Last updated" and "Last checked" are set to today automatically.
4. Close the issue.

If the change is only wording or layout, just close the issue.

### Checking by hand
Open the vendor page. If nothing needs to change, use **Status → Mark checked today** in the admin page and then **Save & publish**.

### Adding a course or software
- **Course:** admin page → **Courses** → **Add course**, then tick the software it uses.
- **Software:** admin page → **Software** → **Add software**. It starts with typical requirement rows for each operating system; adjust them. To have the monthly check watch its vendor page, add an entry to `data/sources.json` (see below).

---

## Watching a new vendor page
Add an entry to `data/sources.json`:

```json
{
  "id": "solidworks",
  "software": "solidworks",
  "label": "SolidWorks",
  "url": "https://example.com/system-requirements",
  "render": "fetch",
  "start": "System Requirements",
  "end": "Related articles"
}
```

- `software` must match the software's id in `requirements.json`.
- `start` and `end` are text (regular expressions) that mark where the requirements section begins and ends. The check compares only that section, so ads and news elsewhere on the page don't cause false alarms.
- `render`: use `"fetch"` for ordinary pages. Use `"browser"` for pages that build their content with JavaScript.
- `fallbackUrls` (optional) lists alternate readers to try when the vendor blocks GitHub-hosted runners. Set `"preferFallback": true` when the fallback should be used consistently, so switching extraction formats does not create a false change. The checked-in MathWorks and Autodesk entries use Jina Reader to read their public official pages; no API key is required.
- `maxChars` (optional) stops after that many characters when there's no good `end` marker.

---

## Editing the data files by hand
You can edit the JSON files directly on GitHub (the pencil icon); the admin page does the same thing with a form. Each requirement row has a `type`:

| type | Checks | Main fields |
|---|---|---|
| `os` | OS version | `basic`, `rec`: lists of version ids; `notes`: message per version |
| `arch` | Processor type | `basic`, `rec`: `x86-64`, `arm`, `apple` |
| `number` | Cores or RAM | `field` (`cores` or `ram`), `basic`, `rec` numbers |
| `avx2` | AVX2 support | `note` |
| `storage` | Free disk space (GB) | `basic`, `rec` |
| `internet` | Download speed (Mbps) | `basic`, `rec` |
| `display` | Screen width in pixels | `basic`, `rec` (e.g. 1366, 3840) |
| `gpu-any` | Any graphics passes | none |
| `gpu-optional` | Any graphics; VRAM for recommended | `rec` (GB) |
| `gpu-vram` | Minimum and recommended VRAM | `basic`, `rec` (GB) |
| `gpu-mac` | Built-in Mac graphics | none |
| `mac-chip` | Apple chip tier (Max/Ultra = recommended) | `label` |

Every row also has `basicText` and `recText`, the wording students see. `"Same"` in `recText` repeats the basic text.

Version ids: Windows `win11-25h2`, `win11-24h2`, `win11-23h2`, `win11-old`, `win10-22h2`, `win10-old`, `win-old`; Mac `mac27`, `mac26`, `mac15`, `mac14`, `mac13`; Linux `ubuntu2404`, `ubuntu2204`, `debian13`, `debian12`, `rhel10`, `rhel9`, `rhel8`, `sled15`, `linux-other`.

Dates use the format `YYYY-MM-DD`.

---

## Previewing on your own computer
The computer requirements page loads its data files from the web server, so double-clicking `computer-requirements.html` shows a built-in copy of the data that may be out of date. To preview properly, run this in the folder and open http://localhost:8000:

```
python3 -m http.server 8000
```

To test the vendor check locally: `npm install`, `npx playwright install chromium`, `npm test`, then `npm run check`. Without GitHub credentials it prints the issues it would open instead of opening them.

## Notes
- The built-in copy of the data inside `computer-requirements.html` is only a backup for when the data files can't load. The data files are what the live site uses.
- MathWorks and Autodesk may block GitHub-hosted runners, so their source entries use a public text-reader fallback. If both the official page and its fallback fail, the Action fails visibly and opens one deduplicated "couldn't read" issue for that page.
- Each guide has a **Home** button in its menu and footer that returns to `index.html`.
- The degree plan page is self-contained: its courses and prerequisites are written into `degree-plan.html` itself, not the data files. Edit that file to change the degree plan.
