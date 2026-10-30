// Google Gemini Real-Time Conversational AI Service
// Dual-Tier Architecture: Cloud/Serverless Bridge with Direct Browser Fallback & Memory Context

const DEFAULT_API_KEY = '';

export function getStoredGeminiKey() {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('jarvis_gemini_api_key');
    if (local && local.trim()) return local.trim();
  }
  return (
    (typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || process.env?.VITE_GEMINI_API_KEY || '') : '') ||
    (typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_GEMINI_API_KEY || '') : '') ||
    DEFAULT_API_KEY
  ).trim();
}

export function setStoredGeminiKey(key) {
  if (typeof window !== 'undefined' && key) {
    localStorage.setItem('jarvis_gemini_api_key', key.trim());
  }
}

// Conversation History Memory (Retains last 8 exchanges for seamless follow-ups)
let conversationMemory = [];

export function clearConversationMemory() {
  conversationMemory = [];
}

export function getConversationMemory() {
  return [...conversationMemory];
}

/**
 * Ask Google Gemini a question and get natural conversational reply + speech text
 */
export async function askGemini(prompt, userTitle = 'sir ไลท์') {
  const apiKey = getStoredGeminiKey();
  const cleanPrompt = prompt.trim();
  const isNewsRequest =
    cleanPrompt.includes('ข่าว') ||
    cleanPrompt.includes('อัพเดทข่าว') ||
    cleanPrompt.includes('บ้านเมือง') ||
    cleanPrompt.includes('news');

  let newsRule = '';
  if (isNewsRequest) {
    newsRule = `
กฎพิเศษสำหรับการรายงานข่าวสารบ้านเมือง:
1. ให้แจ้งจำนวนหัวข้อข่าวที่เตรียมไว้ล่วงหน้า เช่น "วันนี้ผมเตรียมสรุปข่าวสารบ้านเมืองสำคัญมาให้ทั้งหมด 5 เรื่องครับ ${userTitle}:"
2. เรียงลำดับเฉพาะ "หัวเรื่องข่าวสั้นๆ กระชับ" 1 ถึง 5 ดังนี้:
   - เรื่องที่ 1: [หัวข้อข่าวเศรษฐกิจ / การค้า]
   - เรื่องที่ 2: [หัวข้อข่าวการเมือง / นโยบายรัฐบาล]
   - เรื่องที่ 3: [หัวข้อข่าวเทคโนโลยี / ดิจิทัล / AI]
   - เรื่องที่ 4: [หัวข้อข่าวสังคม / พลังงาน / คมนาคม]
   - เรื่องที่ 5: [หัวข้อข่าวการลงทุน / ต่างประเทศ]
3. จบด้วยประโยคเชิญชวนอย่างมีระดับ: "${userTitle} สนใจอยากฟังเจาะลึกเรื่องไหนเป็นพิเศษ แจ้งผมได้เลยครับ เดี๋ยวผมจะเล่ารายละเอียดให้ฟังทันทีครับ"
4. ในส่วนของเสียงพูด (Speech) ให้อ่านเฉพาะหัวข้อสั้นๆ ครบทุกข้อตามลำดับเพื่อให้ ${userTitle} ฟังและเลือกได้ง่าย`;
  }

  const systemInstruction = `คุณคือ J.A.R.V.I.S. (Just A Rather Very Intelligent System) ผู้ช่วย AI อัจฉริยะส่วนตัวของ "${userTitle}"
บุคลิกภาพและการโต้ตอบ:
- เรียกผู้ใช้ว่า "${userTitle}" เสมอ ด้วยน้ำเสียงสุภาพ นุ่มลึก มีชั้นเชิง เฉลียวฉลาดแบบ Paul Bettany ในภาพยนตร์ Iron Man
- รับฟังคำถาม/คำสั่งของ ${userTitle} อย่างตั้งใจ และตอบกลับอย่างเป็นธรรมชาติ ลื่นไหล มีชีวิตชีวา เหมือนมนุษย์กำลังพูดคุยกันจริงๆ
- จดจำบริบทการพูดคุยก่อนหน้าอย่างแม่นยำ เช่น หาก ${userTitle} เคยถามเรื่องข่าว แล้วบอกว่า "อยากฟังเรื่องที่ 1" หรือ "เล่าเรื่องเศรษฐกิจให้ฟังหน่อย" ให้ดึงรายละเอียดของข่าวนั้นมาอธิบายต่ออย่างละเอียดและน่าสนใจทันที
- สามารถคุยได้ทุกเรื่อง ทั้งเรื่องงาน โค้ดและระบบใน D:\\Light (18 โปรเจกต์), เรื่องธุรกิจ หรือพูดคุยสนทนาทั่วไป
- ห้ามตอบเป็นประโยคซ้ำซากจำเจแบบหุ่นยนต์เด็ดขาด ให้ตอบตามเนื้อหาที่ ${userTitle} ถามจริงๆ อย่างมีสาระและน่าฟัง
${newsRule}`;

  // Build History Payload
  const historyParts = conversationMemory.slice(-6).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const currentContent = {
    role: 'user',
    parts: [{ text: `คำสั่งหรือคำถามจาก ${userTitle}: ${cleanPrompt}` }],
  };

  // 1. Try Local/Cloud Serverless Bridge first
  try {
    const res = await fetch('/api/gemini/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: cleanPrompt,
        apiKey,
        context: `User: ${userTitle}. History: ${JSON.stringify(conversationMemory.slice(-4))}`,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.reply) {
        const formatted = formatGeminiResponse(data.reply, data.model || 'Gemini Cloud', userTitle, isNewsRequest);
        recordMemory(cleanPrompt, formatted.reply);
        return formatted;
      }
    }
  } catch {
    // Fallback to direct client call
  }

  // 2. Direct Browser-to-Gemini Fallback (Zero Server Dependency)
  const candidateModels = ['gemini-flash-lite-latest', 'gemini-3.8-flash-lite', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [...historyParts, currentContent],
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

      const formatted = formatGeminiResponse(reply, model, userTitle, isNewsRequest);
      recordMemory(cleanPrompt, formatted.reply);
      return formatted;
    } catch (err) {
      lastError = err;
    }
  }

  // 3. Fallback only if completely offline
  return {
    success: false,
    reply: `ขออภัยครับ ${userTitle} สัญญาณการเชื่อมต่อ Google Gemini ขัดข้องชั่วคราว: ${lastError?.message || 'Network Timeout'}`,
    speech: `ขออภัยครับ ${userTitle} สัญญาณระบบ AI ขัดข้องชั่วคราวครับ`,
    model: 'Offline Safe Mode',
  };
}

function recordMemory(userText, aiReply) {
  conversationMemory.push({ role: 'user', text: userText });
  conversationMemory.push({ role: 'assistant', text: aiReply });
  if (conversationMemory.length > 12) {
    conversationMemory = conversationMemory.slice(-12);
  }
}

function formatGeminiResponse(rawReply, model, userTitle, isNewsRequest = false) {
  // Extract natural conversational speech
  const cleanText = rawReply
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#_~`[\]]/g, '')
    .trim();

  let speech = cleanText;

  if (isNewsRequest) {
    // For news, read the summary and list of items cleanly
    speech = cleanText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(' ');
    if (speech.length > 250) {
      speech = speech.slice(0, 245) + '... ' + `ท่านอยากฟังเรื่องไหน แจ้งผมได้เลยครับ ${userTitle}`;
    }
  } else if (cleanText.length > 180) {
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
    isNews: isNewsRequest,
  };
}
