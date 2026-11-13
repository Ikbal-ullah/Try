# The base image is the official Node image, pulled from AWS's public mirror
# of Docker Hub: same image, but without Docker Hub's anonymous pull limits.

# Stage 1: build the React app (needs dev dependencies such as Vite).
FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: the image that actually runs. Production dependencies only,
# no source for the frontend, and not running as root.
FROM public.ecr.aws/docker/library/node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
