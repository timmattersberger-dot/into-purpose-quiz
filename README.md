d# Into Purpose — Energy Leak Audit (Quiz)

A self-contained quiz that scores five "energy leaks", gates the result behind an
email, and pushes that email into Flodesk (segment **Into Purpose Quiz**).
No confirmation email is sent (`double_optin = false`).

```
index.html                      ← the whole quiz (HTML + CSS + JS + photo, one file)
netlify/functions/subscribe.js  ← serverless function that talks to Flodesk
netlify.toml                    ← tells Netlify where things live
```

---

## Environment variables

Set these in Netlify, **not** in the code.

| Variable | Required | Purpose |
|---|---|---|
| `FLODESK_API_KEY` | **yes** | Anna's Flodesk API key. Found in Flodesk → Account → Integrations → API. |
| `FLODESK_SEGMENT_ID` | no | The id of the "Into Purpose Quiz" segment. If you leave it empty, the function looks the segment up **by name** at runtime. Set it only if you want to skip that lookup. |

The API key never appears in any file. The function reads it from the environment.

---

## Go live in 4 steps

1. **Make sure the segment exists.** In Anna's Flodesk, create a segment named exactly
   `Into Purpose Quiz` (capitalisation doesn't matter, spelling does).

2. **Upload to Netlify.**
   - Easiest: log in at app.netlify.com → **Add new site → Deploy manually** →
     drag the whole folder (the one containing `index.html`, `netlify.toml`, and the
     `netlify` folder) onto the drop zone.
   - Or connect a Git repo with these same files at the root.

3. **Add the API key.** In Netlify: **Site configuration → Environment variables → Add a variable**
   → key `FLODESK_API_KEY`, value = Anna's key. (Optional: add `FLODESK_SEGMENT_ID` too.)
   Then **Deploys → Trigger deploy → Deploy site** so the new variable is picked up.

4. **Click through it once.** Open the live URL, finish the quiz, enter a real test email,
   hit *Reveal my result*. Then check Flodesk → the contact should appear in the
   `Into Purpose Quiz` segment.

---

## Verify the Flodesk connection yourself (2 minutes)

This proves the key + segment work **before** you trust the live form. Run it in a terminal
and put the real key in place of `YOUR_KEY`. The key stays on your machine; it never goes
into any file.

**1) Confirm the key works and find the segment:**
```bash
curl -s https://api.flodesk.com/v1/segments \
  -H "User-Agent: Into Purpose Quiz (ohwonderful.com)" \
  -H "Authorization: Basic $(printf 'YOUR_KEY:' | base64)"
```
You should get JSON listing segments, including `Into Purpose Quiz` with an `id`.

**2) Create a test contact and add it to the segment** (replace `SEGMENT_ID`):
```bash
curl -s -X POST https://api.flodesk.com/v1/subscribers \
  -H "User-Agent: Into Purpose Quiz (ohwonderful.com)" \
  -H "Authorization: Basic $(printf 'YOUR_KEY:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"email":"test+quiz@example.com","double_optin":false,"segment_ids":["SEGMENT_ID"]}'
```
A `200` with the subscriber JSON = green. Delete the test contact in Flodesk afterwards.

If step 1 errors with `401`, the key is wrong. If the segment isn't in the list, the name
doesn't match `Into Purpose Quiz`.

---

## Notes

- The result screen never waits on Flodesk. If the API is slow or down, the profile still
  shows; the error is logged silently in the function. Nobody gets stuck on a spinner.
- The function does two calls: create/update the subscriber (with the segment attached),
  then an explicit add-to-segment as a safety net. Both are idempotent.
- The "Full Explanation" link points to the Drive PDF. Swap the URL in `index.html`
  (`PDF_LINK`) if the file moves.
- The intro photo is embedded directly in `index.html` as base64 — there is no separate
  image file to upload.

### One DSGVO flag (not a build issue)
This pushes the email straight into a marketing segment with no double opt-in, as specified.
For EU/DACH contacts that's a consent risk: there's no logged opt-in proof. If Anna wants to
be clean on that, the alternative is `double_optin: true` in `subscribe.js` (Flodesk then sends
its own confirmation), or routing through a native Flodesk form. Her call — flagging it, not changing it.
