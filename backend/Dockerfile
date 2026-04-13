# syntax=docker/dockerfile:1

FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV SOCKET_CORS_ORIGIN=*
ENV JWT_EXPIRES_IN=7d
ENV JWT_REFRESH_EXPIRES_IN=30d

COPY package*.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000
CMD ["npm", "start"]