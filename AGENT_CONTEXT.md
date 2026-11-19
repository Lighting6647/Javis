# บริบทสำหรับการพัฒนา Agent — เดลลูน่า (DelLuna / `javis-thai-voice-agent`)

> เอกสารนี้ออกแบบให้ใช้เป็น **System Context / Handoff Blueprint** สำหรับ Agent ทีมพัฒนา (เช่น จาวิส, Subagents, หรือ Coding Agents อื่น) เพื่อเข้าใจโครงสร้างสถาปัตยกรรม API Contracts, Client State, กลไกความปลอดภัย และเกณฑ์ตรวจสอบคุณภาพของระบบ **เดลลูน่า (DelLuna)** ได้ครบถ้วนทันทีโดยไม่ต้องไล่อ่านทั้งคลังโค้ดซ้ำ

---

## 1. ตัวตนและเป้าหมายระบบ (Agent Persona & Product Scope)

- **ชื่อผู้ช่วยฝั่งผู้ใช้ (Product / Voice Persona):** **เดลลูน่า (DelLuna)** — แสดงผลบนหน้าเว็บ, PWA, และ System Prompt (`DL · CENTRAL VOICE STUDIO`)
- **รหัสโปรเจกต์ & เทคโนโลยีหลัก (`package.json`):** `javis-thai-voice-agent` (`TypeScript ~5.9`, `React 19`, `Vite 7`, `Express 5`, `Zod 4`, `Vitest 5`, `Playwright`, `Electron 45`, `Capacitor 8`)
- **บุคลิกคำตอบในแอป (`server/chat.ts` `CORE_INSTRUCTIONS`):**
  - แทนตัวเป็น **เดลลูน่า (DelLuna)** ใช้สรรพนามและคำลงท้ายสุภาพแบบผู้หญิง (`ค่ะ`, `นะคะ`)
  - ตอบสั้น กระชับ เป็นภาษาพูดธรรมชาติ (3–4 ประโยค เว้นวรรคระหว่างประโยค) **ห้ามใช้ Markdown, หัวข้อ, ตาราง, อีโมจิ** ในข้อความคำตอบปกติเพราะระบบจะอ่านออกเสียงทันที
  - ตอบภาษาไทยเป็นหลัก ยกเว้นผู้ใช้ขอภาษาอื่น

---

## 2. แผนผังไฟล์และสถาปัตยกรรมหลัก (Architecture Map)

| แกนระบบ | ไฟล์สำคัญ | หน้าที่และจุดเชื่อมต่อ |
| :--- | :--- | :--- |
| **Core Backend App** | `server/app.ts`, `server/index.ts`, `server/config.ts`, `api/index.ts`, `server/rateLimitStore.ts` | Express 5 API Server (พอร์ต `8787` ในเครื่อง / Serverless บน Vercel), Security (`helmet`, `originGuard`, `corsMiddleware`, rate limiters ที่นับใน Postgres เมื่อมี `DATABASE_URL` และถอยไปนับในหน่วยความจำเมื่อฐานข้อมูลล่ม), Auth Session |
| **Multi-Provider AI & Auto-Failover** | `server/aiProvider.ts`, `server/accountMonitor.ts`, `server/aiAccount.ts`, `server/chat.ts`, `server/claudeClient.ts` | รองรับ **Google Gemini** (`gemini-3.5-flash-lite`), **OpenAI** (`gpt-6-luna`), **Anthropic Claude** (`claude-haiku-5-5`) พร้อม `resolveFallbackAiProviders` สลับผู้ให้บริการสำรองอัตโนมัติเมื่อบัญชีหลักติด `quota` / `auth` / `model` |
| **JEV System-One Pre-Flight Router** | `server/router/index.ts`, `server/router/systemOne.ts`, `server/router/queueAndTelemetry.ts`, `server/router/persistence.ts`, `server/router/stateBus.ts`, `src/components/RouterPanel.tsx` | คัดกรองทุกเทิร์นก่อนออกเครือข่าย (`Choice` → `Score` → `Noul Safety Gate` → `Tier Routing` `flash-lite` / `pro` / `halt`) และส่งรายการที่ความมั่นใจ `< 0.85` เข้าคิว Human Review; คิวและ telemetry เก็บในตาราง `app_state` เมื่อมี `DATABASE_URL` |
| **Voice Persona, Cloud TTS & Voice Replication** | `server/speech.ts`, `server/voiceReplication.ts`, `src/speech/cloudVoices.ts`, `src/speech/voiceRecorder.ts`, `src/components/VoiceRecorderDialog.tsx`, `src/components/VoiceSettingsDialog.tsx` | สังเคราะห์เสียงผ่าน `gemini-3.8-flash-tts` → `gemini-3.8-flash-lite-tts` → สำรอง OpenAI `gpt-4o-mini-tts` → เสียงในเครื่อง; รองรับบันทึก/อัปโหลด 24kHz mono WAV + `trimSilenceSamples` เพื่อสร้างเสียงจำลอง 2 ขั้นตอน |
| **On-Device Speaker ID & Meeting Mode** | `src/meeting/speakerProfile.ts`, `src/meeting/liveSpeakerMonitor.ts`, `src/meeting/meetingRecorder.ts`, `src/meeting/export.ts`, `src/meeting/meetingHistory.ts`, `src/hooks/useMeeting.ts`, `src/components/MeetingPanel.tsx`, `src/components/MeetingExport.tsx` | สกัดเวกเตอร์ความถี่เสียงพูด 10 มิติบนเครื่อง (8 ย่าน `85–4,000 Hz` + ZCR + Spectral Centroid), รองรับผู้พูดหลายคน (สูงสุด 12 คน), Threshold Slider `0.72–0.95`, Live Calibration, JSON Export/Import, แก้ชื่อผู้พูดรายบรรทัด/ทั้งกลุ่ม, กรองตามผู้พูด, Export `.txt`/`.md`/`.csv`, เก็บประวัติย้อนหลัง 15 การประชุม, และค้นประวัติด้วย Tool `search_meeting_history` |
| **Server Storage, Memory Sync & Feedback** | `server/memoryRelevance.ts`, `server/db.ts`, `server/userStore.ts`, `server/userRoutes.ts`, `src/memory/memorySync.ts`, `src/meeting/meetingSync.ts`, `src/services/serverSync.ts`, `src/services/userDataApi.ts`, `src/components/FeedbackButtons.tsx` | เก็บความจำ/คำติชมบน Postgres (`@neondatabase/serverless`) เมื่อมี `DATABASE_URL` ไม่อย่างนั้นเก็บในหน่วยความจำ แยกตามชื่อผู้ใช้ที่ล็อกอิน (`_` เมื่อไม่บังคับล็อกอิน); หน้าแอปรวมความจำสองฝั่งและบันทึกกลับทุกครั้งที่จำ/ลืม; ปุ่ม 👍/👎 ใต้ทุกคำตอบ; ความจำเกิน 20 เรื่องส่งให้ AI เฉพาะเรื่องที่เกี่ยวกับคำถาม (≤15 เรื่อง ตัดคำไทยในเครื่อง) |
| **Web, Browser Bridge & Projects Control** | `src/App.tsx`, `src/components/BrowserView.tsx`, `src/components/FrameView.tsx`, `src/components/FillCard.tsx`, `src/components/ProjectsPanel.tsx`, `src/services/screenCapture.ts` | เบราว์เซอร์ในตัว Electron / Iframe, กรอกฟอร์มแบบต้องยืนยันทุกครั้ง (ห้ามแตะรหัสผ่าน/บัตร/OTP), วิเคราะห์ภาพหน้าจอ, และจัดการสถานะ GitHub/Vercel ของโปรเจกต์ |

---

## 3. สัญญาการสื่อสารและ API Endpoints (`server/app.ts`)

| Method & Path | Auth | หน้าที่หลัก |
| :--- | :--- | :--- |
| `GET /health` | Open | ตรวจสุขภาพเซิร์ฟเวอร์ (`ok`, `service: "javis-voice-agent"`, `ai: aiAccount.snapshot()`) |
| `GET /api/status` | Open | รายงาน `{ ai, voice: { cloud }, retiring, storage, provider }` (`storage` = `postgres` หรือ `memory`) ให้หน้าเว็บติดตามสถานะบริการ AI, โมเดลใกล้หมดอายุ, ผู้ให้บริการ/โมเดลที่ตอบจริง และรายการ Failover สำรอง |
| `GET /api/auth/session` / `POST /api/auth/login` | Open / Rate-limited | ตรวจสอบและเข้าสู่ระบบด้วย `ACCESS_CODES` (หากตั้งค่าไว้) |
| `POST /api/chat` | `requireAuth` | รับประวัติแชท/สรุปประชุม ผ่าน JEV Safety Gate + Auto-Failover และสตรีม NDJSON (`delta`, `sources`, `searchQueries`, `openUrl`, `fill`, `memories`, `done`) |
| `POST /api/speech` | `requireAuth` | แปลงข้อความเป็นเสียงพูด WAV ผ่าน Gemini TTS / OpenAI Backup |
| `POST /api/transcribe` | `requireAuth` | แปลงเสียงอัดจากแอปเดสก์ท็อปเป็นข้อความ (`audio/*`) |
| `GET /api/voices`, `POST /api/voices/replicate`, `DELETE /api/voices/:id` | `requireAuth` | อ่าน สร้าง และลบโปรไฟล์เสียงจำลอง (Gemini 3.8 Voice Replication) |
| `GET /api/memories`, `PUT /api/memories` | `requireAuth` | อ่าน/บันทึกความจำของผู้ใช้ (สูงสุด 50 เรื่อง เรื่องละ 200 ตัวอักษร ไม่เก็บรหัสผ่าน OTP เลข ≥13 หลัก ตอบ `rejected` = จำนวนที่ไม่เก็บ) |
| `GET /api/meetings`, `PUT /api/meetings` | `requireAuth` | อ่าน/บันทึกประวัติสรุปการประชุมของผู้ใช้ (สูงสุด 15 ครั้ง คำสรุป ≤4,000 บันทึกคำพูด ≤20,000 ตัวอักษร รับเนื้อหาได้ 2MB) |
| `POST /api/feedback`, `GET /api/feedback/summary?days=7` | `requireAuth` | เก็บคำติชม `up`/`down` + หมายเหตุ และสรุปรายวัน |
| `GET /api/search/usage` | `requireAuth` | รายงานโควตาการใช้บริการค้นเว็บ (Tavily / Grounded Search) |
| `GET /api/router/telemetry`, `POST /api/router/classify`, `GET /api/router/queue`, `POST /api/router/queue/:id/decision` | `requireAuth` | ตรวจวัดและอนุมัติคำขอจาก JEV Pre-Flight Router |
| `GET /api/projects`, `GET /api/projects/:id/status`, `POST /api/projects/:id/action` | `requireAuth` | ดูสถานะและรันคำสั่งที่อนุญาต (`cloud-status`, `build`, `test`, `lint`, `redeploy`) |

---

## 4. สถานะฝั่ง Client (`localStorage` Keys & Compatibility)

> **ข้อควรระวัง:** คงชื่อคีย์ `javis.*` ไว้เพื่อไม่ให้ข้อมูลผู้ใช้ที่บันทึกไว้เสียหาย (ไฟล์เอกสารประชุมใช้รูปแบบ `delluna-meeting-*.txt|.md|.csv`)

- `javis.voiceSettings` — โทนเสียง Persona (`genz-girl`, `assistant`, `upbeat-buddy`, `calm-soft`), เสียง Cloud (`cloud`, `cloudVoice`), ความเร็ว (`rate`)
- `javis.speakerProfile` — รายการโปรไฟล์เสียง 10 มิติ (`profiles` สูงสุด 12 คน) และค่า `threshold` (`0.72–0.95`, ค่าเริ่มต้น `0.86`) พร้อมรองรับข้อมูลโปรไฟล์เดี่ยวรุ่นเก่า
- `javis.meetingDraft` — บันทึกการประชุมที่ยังไม่สรุป (กู้คืนอัตโนมัติเมื่อเปิดแท็บใหม่หลังหลุดกลางประชุม)
- `javis.meetingHistory` — คลังประวัติสรุปการประชุมย้อนหลังในเครื่อง (สูงสุด 15 รายการ แต่ละรายการมี `owner`) ซิงก์กับ `/api/meetings` (`src/meeting/meetingSync.ts`)
- `javis.memories:<ชื่อผู้ใช้>` — ความจำถาวรเกี่ยวกับผู้ใช้ (แนบเข้าบริบทคำถาม AI) ซิงก์กับ `/api/memories` (`src/memory/memorySync.ts`)

---

## 5. แนวทางการพัฒนา Agent เพิ่มเติม (Agent Extension Playbook)

1. **การเพิ่มคำสั่งทำงานทันทีในเครื่อง (Zero-Quota Voice Commands):**
   - ตัวอย่าง: `src/meeting/commands.ts` (`isMeetingStartCommand`), `src/conversation/voiceCommands.ts` (`matchVoiceSwitchCommand`), `src/services/screenCapture.ts` (`isScreenCaptureVoiceCommand`)
   - รูปแบบชื่อเรียก (`NAME`): รองรับทั้ง **"เดลลูน่า / เดลูนา / DelLuna"** และชื่อเดิม (`นีน่า`, `Nina`, `จาวิส`, `Javis`)
2. **การเพิ่ม Tool ให้ AI ฝั่ง Backend (`server/chat.ts`):**
   - นิยาม Schema ด้วยเครื่องมือฟังก์ชันใน `buildTools(...)`, ส่งคำแนะนำวิธีเรียกใช้ใน `CORE_INSTRUCTIONS` / `buildInstructionParts`, จัดการผลลัพธ์ใน Stream Reducer และอย่าให้รันคำสั่งที่เปลี่ยนแปลงข้อมูลผู้ใช้หรือระบบภายนอกโดยไม่ผ่านการยืนยัน (`FillCard` / `ProjectActionCard`)
   - ห้ามบันทึกข้อความดิบของผู้ใช้ ข้อมูลลับ หรือกุญแจ API ลงใน Log หรือ Telemetry (`redactGoalSummary` ใน `server/router/queueAndTelemetry.ts`)
3. **การปรับแต่ง UI & Responsive Layout (`src/styles.css`):**
   - รองรับทั้งธีม **`holo`** (Obsidian Studio HUD) และ **`plain`** (Light/Minimal)
   - ห้ามทำให้เกิด Horizontal Overflow (`scrollWidth > clientWidth`) บนจอมือถือ (`375px`), แท็บเล็ต (`768px`), และเดสก์ท็อป (`1280px`) โดยเฉพาะ `.app-header` และ `.meeting-export`

---

## 6. ประตูตรวจสอบก่อนส่งมอบงานทุกครั้ง (Verification & Build Gates)

รันคำสั่งต่อไปนี้จากโฟลเดอร์ `d:\AI\Light\Javis` หลังแก้ไขโค้ดทุกครั้ง:

```powershell
# 1. ตรวจ TypeScript + Production Bundle
npm.cmd run build

# 2. ตรวจ ESLint (ต้องได้ 0 errors, 0 warnings)
npm.cmd run lint

# 3. ตรวจ Unit & Integration Tests (Vitest)
npm.cmd test

# 4. ตรวจ End-to-End ในเบราว์เซอร์จริง (Chromium, 375/768/1280px, holo & plain, 0 console errors)
node e2e/meeting.e2e.mjs
```

---

## 7. บล็อก Prompt พร้อมคัดลอกสำหรับส่งต่อให้ Agent ใหม่

```markdown
คุณกำลังพัฒนาต่อในโปรเจกต์ `javis-thai-voice-agent` (ชื่อผู้ช่วยในแอป: **เดลลูน่า / DelLuna**)
- อ่านกติกาหลักใน `AGENTS.md` และบริบทสถาปัตยกรรมใน `AGENT_CONTEXT.md` ก่อนเริ่มแก้ไขโค้ด
- Stack: TypeScript + React 19 + Vite 7 (Frontend `src/`) และ Express 5 + Zod 4 (Backend `server/`) รองรับ Multi-Provider Failover (Gemini / OpenAI / Claude) + JEV System-One Pre-Flight Router + On-Device Speaker Recognition & Meeting Mode
- ห้ามเปลี่ยนคีย์ `localStorage` (`javis.*`) หรืออ่าน/เปิดเผยไฟล์ `.env*`
- หลังแก้ไขต้องผ่าน `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`, และ `node e2e/meeting.e2e.mjs` (0 overflow บน 375/768/1280px และ 0 console errors) ทั้งหมดก่อนส่งมอบ
```
