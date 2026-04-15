# ── Stage 1: builder ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
# Rename package to avoid npm treating "thepopebot" as a self-install
RUN TPB_VERSION=$(node -p "require('./package.json').version") && \
    echo "{\"private\":true}" > package.json && \
    npm install --no-save "thepopebot@${TPB_VERSION}" tailwindcss @tailwindcss/postcss

# OVERRIDE: bake in local source changes from the feature branch.
# Overlays our custom lib/ and drizzle/ on top of the npm-installed thepopebot
# package so bucket/summary patches apply to both server-side code and the
# Next.js build (since web/ imports from 'thepopebot/*' which resolves to node_modules).
#
# Gotcha: the published npm package ships BOTH pre-compiled .js and source .jsx.
# Webpack/Next resolves imports like './sidebar-history.js' literally, so after
# overlaying .jsx we must also regenerate the matching .js via esbuild (same
# command the repo's own `npm run build` uses). Otherwise our .jsx changes
# would be ignored at build time.
COPY lib/ ./node_modules/thepopebot/lib/
COPY drizzle/ ./node_modules/thepopebot/drizzle/
RUN cd ./node_modules/thepopebot && \
    npx --yes esbuild lib/chat/components/*.jsx lib/chat/components/**/*.jsx --outdir=lib/chat/components --format=esm --jsx=automatic --outbase=lib/chat/components --log-level=warning && \
    npx --yes esbuild lib/auth/components/*.jsx lib/auth/components/**/*.jsx --outdir=lib/auth/components --format=esm --jsx=automatic --outbase=lib/auth/components --log-level=warning && \
    npx --yes esbuild lib/code/*.jsx --outdir=lib/code --format=esm --jsx=automatic --log-level=warning && \
    npx --yes esbuild lib/cluster/components/*.jsx --outdir=lib/cluster/components --format=esm --jsx=automatic --log-level=warning

# ── Stage 2: Next.js build ───────────────────────────────────────
FROM node:22-bookworm-slim AS nextjs
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
# Use a minimal package.json to avoid self-referencing exports
# (the repo package.json has name "thepopebot", which makes Node resolve
# imports like 'thepopebot/config' to ./config/ instead of node_modules)
RUN echo '{"private":true}' > package.json
COPY web/ ./
RUN ./node_modules/.bin/next build

# ── Stage 3: runtime ─────────────────────────────────────────────
FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl git ca-certificates && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pm2

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
RUN echo '{"private":true}' > package.json
COPY --from=nextjs /app/.next ./.next
COPY web/server.js web/next.config.mjs web/instrumentation.js web/middleware.js web/postcss.config.mjs ./

EXPOSE 80
CMD ["pm2-runtime", "--kill-timeout", "120000", "server.js"]
