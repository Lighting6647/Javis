# syntax=docker/dockerfile:1

# ---- ขั้นที่ 1: build หน้าเว็บ ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# เว็บที่เสิร์ฟจาก backend เดียวกันไม่ต้องตั้งค่านี้ ตั้งเฉพาะเมื่อ backend อยู่คนละโดเมน
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- ขั้นที่ 2: image สำหรับรันจริง มีเฉพาะ dependencies ที่ใช้ตอนรัน ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8787
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

# ไม่รันด้วยสิทธิ์ root
USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

# ค่าลับทั้งหมด (OPENAI_API_KEY, ACCESS_CODES, SESSION_SECRET) ส่งเข้ามาเป็น environment ตอนรัน ไม่ฝังใน image
CMD ["node", "--import", "tsx", "server/index.ts"]
