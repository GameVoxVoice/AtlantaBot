# Single-stage build for AtlantaBot. We tried a multi-stage builder/runner
# split (smaller image) but the upstream package.json has no lockfile and
# tsx's esbuild postinstall fails non-deterministically when reinstalling
# without the lockfile in the runner stage. One stage = one resolved
# dependency set = no version drift.

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY emojis.json ./
COPY languages/ ./languages/
COPY assets/ ./assets/
COPY dashboard/ ./dashboard/
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
