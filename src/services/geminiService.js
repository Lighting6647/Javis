// Google Gemini Real-Time Conversational AI Service
// Dual-Tier Architecture: Cloud/Serverless Bridge with Direct Browser Fallback

const DEFAULT_API_KEY = '';

export function getStoredGeminiKey() {
  if (typeof window === 'undefined') return DEFAULT_API_KEY;
  return (
    localStorage.getItem('jarvis_gemini_api_key') ||
    import.meta.env?.VITE_GEMINI_API_KEY ||
    DEFAULT_API_KEY
  ).trim();
}

export function setStoredGeminiKey(key) {
  if (typeof window !== 'undefined' && key) {
    localStorage.setItem('jarvis_gemini_api_key', key.trim());
  }
}

/**
 * Ask Google Gemini a question and get natural conversational reply + speech text
 */
export async function askGemini(prompt, userTitle = 'sir ไลท์') {
  const apiKey = getStoredGeminiKey();
  const systemInstruction = `คุณคือ J.A.R.V.I.S. (Just A Rather Very Intelligent System) ผู้ช่วย AI อัจฉริยะส่วนตัวของ "${userTitle}"
บุคลิกภาพและการโต้ตอบ:
- เรียกผู้ใช้ว่า "${userTitle}" เสมอ ด้วยน้ำเสียงสุภาพ นุ่มลึก มีชั้นเชิง เฉลียวฉลาดแบบ Paul Bettany ในภาพยนตร์ Iron Man
- รับฟังคำถาม/คำสั่งของ ${userTitle} อย่างตั้งใจ และตอบกลับอย่างเป็นธรรมชาติ ลื่นไหล มีชีวิตชีวา
- สามารถคุยได้ทุกเรื่อง ทั้งเรื่องงาน โค้ดและระบบใน D:\\Light (18 โปรเจกต์), เรื่องธุรกิจ หรือพูดคุยสนทนาทั่วไป
- ห้ามตอบเป็นประโยคซ้ำซากจำเจแบบหุ่นยนต์เด็ดขาด ให้ตอบตามเนื้อหาที่ ${userTitle} ถามจริงๆ อย่างมีสาระและน่าฟัง
- สำหรับเสียงตอบรับ ให้สรุปประโยคพูดหลักให้กระชับ ชัดเจน ตรงประเด็น`;

  // 1. Try Local/Cloud Serverless Bridge first
  try {
    const res = await fetch('/api/gemini/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, apiKey, context: `User: ${userTitle}` }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.reply) {
        return formatGeminiResponse(data.reply, data.model || 'Gemini Cloud', userTitle);
      }
    }
  } catch {
    // If bridge fails (e.g. offline or running purely client-side), proceed to Direct Browser Fallback
  }

  // 2. Direct Browser-to-Gemini Fallback (Zero Server Dependency)
  const candidateModels = ['gemini-flash-lite-latest', 'gemini-3.8-flash-lite', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [{ text: `คำสั่งหรือคำถามจาก ${userTitle}: ${prompt}` }],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`Gemini ${model} ${response.status}: ${errText}`);
        continue;
      }

      const data = await response.json();
      const reply =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        `รับทราบครับ ${userTitle} ระบบประมวลผลคำตอบเรียบร้อยครับ`;

      return formatGeminiResponse(reply, model, userTitle);
    } catch (err) {
      lastError = err;
    }
  }

  // 3. Fallback only if all networks fail completely
  return {
    success: false,
    reply: `ขออภัยครับ ${userTitle} สัญญาณการเชื่อมต่อ Google Gemini ขัดข้องชั่วคราว: ${lastError?.message || 'Network Timeout'}`,
    speech: `ขออภัยครับ ${userTitle} สัญญาณระบบ AI ขัดข้องชั่วคราวครับ`,
    model: 'Offline Safe Mode',
  };
}

function formatGeminiResponse(rawReply, model, userTitle) {
  // Extract natural conversational speech (clean markdown syntax, code fences, bullets)
  const cleanText = rawReply
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#_~`[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  // Find natural sentence break around 120-180 chars
  let speech = cleanText;
  if (cleanText.length > 180) {
    const cut = cleanText.slice(0, 180);
    const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(' '), cut.lastIndexOf('ครับ'));
    speech = (lastPunct > 60 ? cut.slice(0, lastPunct) : cut).trim();
    if (!speech.endsWith('ครับ') && !speech.endsWith('.')) {
      speech += ' ครับ';
    }
  }

  return {
    success: true,
    reply: rawReply,
    speech: speech || `รับทราบครับ ${userTitle}`,
    model,
  };
}
