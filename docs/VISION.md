# Art style matching (computer vision)

Drawsicle can pair artists by art style: people whose work looks alike, or deliberately different.
It looks at pictures of each artist's work. These are the style samples they add under **Your profile → Your art style**, plus gifts they made in finished public exchanges.

The look-up happens in two layers:

| Layer | Where it runs | What it gives |
| --- | --- | --- |
| Colour and texture | On the server, with `sharp` | Hue mix, saturation, brightness, contrast, warmth and detail, plus words like *pastel*, *vivid*, *soft* or *detailed*. Always on, with no set-up. |
| Vision model | Your own computer, through Ollama | Style and subject tags (*soft shading*, *lineart*, *dragons*), a one-line description, and a text embedding for comparing meaning. |

The organiser picks a rule on the event's **Matching** tab: don't consider styles, pair similar ones, or pair contrasting ones. Then they press **Scan art styles**.

People can also choose for their own gift when they sign up, and that choice wins over the event's rule. Each matched pair shows why it was chosen, for example *Similar art styles: pastel, soft shading*.

Only the descriptions are shared with organisers, never the pictures. Deleting an account deletes its style profile.

## Running Ollama

`run-ollama.sh` (macOS, Linux and Git Bash) and `run-ollama.bat` (Windows) do the following:

- start Ollama on `127.0.0.1:11434`, so only this computer can reach it;
- download the models if they're missing;
- start the Cloudflare Tunnel when a token is set.

`Start-all` runs it for you when Ollama is installed; use `--no-ollama` to skip it. `Stop-all` stops it.

1. Install Ollama: https://ollama.com/download
2. Copy `ollama.env.example` to `ollama.env`. The defaults are `qwen2.5vl:3b` for vision and `nomic-embed-text` for embeddings.
3. Run `./run-ollama.sh` (or `run-ollama.bat`). The first download is a few GB.
4. For local development, add this line to `server/.env` and restart the API:

   ```
   OLLAMA_URL=http://127.0.0.1:11434
   ```

The organiser's **Scan art styles** card says whether the vision model is being used.

## Letting the deployed site use it (Cloudflare Zero Trust)

The site on Vercel can't reach your computer directly. A Cloudflare Tunnel publishes Ollama on a hostname, and Cloudflare Access stops anyone without your service token from using it.

1. **Create the tunnel:**
   1. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and name it (e.g. `drawsicle-ollama`).
   2. Copy the token from the install command into `ollama.env` as `CLOUDFLARE_TUNNEL_TOKEN=`. You don't need to run the install command: `run-ollama` starts `cloudflared` with the token.
2. **Add a public hostname** to the tunnel, e.g. `ollama.example.com`:
   - **Service:** `HTTP`, `localhost:11434`.
   - **Additional application settings → HTTP Settings → HTTP Host Header:** `localhost:11434`. Ollama only answers requests addressed to itself.
3. **Create a service token:** go to **Zero Trust → Access → Service credentials → Service Tokens → Create Service Token** (e.g. `drawsicle-server`), and copy the Client ID and Client Secret.
4. **Protect the hostname:**
   1. Go to **Zero Trust → Access → Applications → Add an application → Self-hosted**, for `ollama.example.com`.
   2. Add a policy with the action **Service Auth** that includes **Service Token: drawsicle-server**. Requests without the token are turned away before they reach your computer.
5. **Tell the server about it:** in Vercel, go to **Project → Settings → Environment Variables** and add:

   ```
   OLLAMA_URL=https://ollama.example.com
   CF_ACCESS_CLIENT_ID=<the service token's Client ID>
   CF_ACCESS_CLIENT_SECRET=<the service token's Client Secret>
   ```

   Also add `OLLAMA_VISION_MODEL` / `OLLAMA_EMBED_MODEL` if you changed the models.
6. **Start it:** install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/, then run `./run-ollama.sh`. Check that it worked in `.run/cloudflared.log` and on the tunnel's page in the dashboard.

When your computer is off, the site carries on with colours and texture only. Scans pick up the vision model again the next time it's reachable.

## How it fits together

- `server/services/vision.js`:
  - measures colours and texture;
  - talks to Ollama, sending the Access token headers;
  - builds and saves each `StyleProfile`.
- `shared/style.mjs`:
  - compares two profiles: colours always; tags and embeddings when both people have them;
  - turns the result into points for a pair (up to 20) and the reason organisers see.
- `shared/matching.mjs` adds those points when the recipient, or the event, asked for similar or contrasting styles.
- Routes:
  - `GET /api/profile/style`;
  - `POST /api/profile/style-samples` (form field `image`);
  - `DELETE /api/profile/style-samples`;
  - `POST /api/profile/style/analyse`;
  - `GET|POST /api/events/:id/matches/style-scan` (organisers; the scan runs in the background);
  - `PUT /api/events/:id/matching-rules { style }`.
