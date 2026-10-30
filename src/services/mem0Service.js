// Mem0 Long-Term Persistent Memory Integration for J.A.R.V.I.S.
// Retains sir ไลท์'s personal preferences, project context, and operational habits across sessions

const STORAGE_KEY = 'jarvis_mem0_ecosystem_memories';
const MEM0_USER_ID = 'sir_light';

// Pre-seeded foundational memories about sir ไลท์ and D:\Light Ecosystem
const DEFAULT_MEMORIES = [
  {
    id: 'mem_core_01',
    user_id: MEM0_USER_ID,
    memory: 'sir ไลท์ เป็นผู้บริหารสูงสุด (CEO) ของเครือข่าย D:\\Light Ecosystem ดูแลระบบทั้งหมด 18 โปรเจกต์',
    category: 'identity',
    created_at: new Date('2026-10-01').toISOString(),
  },
  {
    id: 'mem_core_02',
    user_id: MEM0_USER_ID,
    memory: 'sir ไลท์ ต้องการให้ J.A.R.V.I.S. สรุปข่าวสารบ้านเมืองโดยบอกจำนวนเรื่องก่อน แล้วเรียงลำดับหัวข้อข่าวเพื่อให้เลือกฟังเรื่องที่สนใจ',
    category: 'preference_news',
    created_at: new Date('2026-10-30').toISOString(),
  },
  {
    id: 'mem_core_03',
    user_id: MEM0_USER_ID,
    memory: 'ชอบการสนทนาที่เป็นธรรมชาติ สุภาพ สุขุม มีชีวิตชีวา และไม่ชอบการตอบแบบหุ่นยนต์ประโยคซ้ำๆ',
    category: 'personality',
    created_at: new Date('2026-10-30').toISOString(),
  },
  {
    id: 'mem_core_04',
    user_id: MEM0_USER_ID,
    memory: 'โปรเจกต์สำคัญที่ใช้งานบ่อย: CEO Master, J.A.R.V.I.S. HUD, Krob POS Inventory, และ Fern Clinic IT',
    category: 'projects',
    created_at: new Date('2026-10-29').toISOString(),
  },
];

export function getStoredMemories() {
  if (typeof window === 'undefined') return DEFAULT_MEMORIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_MEMORIES));
      return DEFAULT_MEMORIES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MEMORIES;
  } catch {
    return DEFAULT_MEMORIES;
  }
}

export function saveMemories(memories) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  } catch {}
}

/**
 * Add a new memory fact or preference to Mem0 store
 */
export function addMemory(text, category = 'general') {
  if (!text || !text.trim()) return null;
  const memories = getStoredMemories();

  // Avoid exact duplicate memories
  const isDuplicate = memories.some(
    (m) => m.memory.trim().toLowerCase() === text.trim().toLowerCase()
  );
  if (isDuplicate) return null;

  const newEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: MEM0_USER_ID,
    memory: text.trim(),
    category,
    created_at: new Date().toISOString(),
  };

  const updated = [newEntry, ...memories].slice(0, 50); // Keep up to 50 active long-term memories
  saveMemories(updated);
  return newEntry;
}

/**
 * Search relevant memories based on conversational query
 */
export function searchMemories(query) {
  const memories = getStoredMemories();
  if (!query || !query.trim()) return memories.slice(0, 5);

  const q = query.toLowerCase();
  const matched = memories.filter((m) => {
    const text = (m.memory + ' ' + (m.category || '')).toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 1);
    return words.some((w) => text.includes(w));
  });

  return matched.length > 0 ? matched.slice(0, 5) : memories.slice(0, 4);
}

/**
 * Delete a specific memory by ID
 */
export function deleteMemory(id) {
  const memories = getStoredMemories();
  const updated = memories.filter((m) => m.id !== id);
  saveMemories(updated);
  return updated;
}

/**
 * Clear all memories and reset to default foundations
 */
export function resetMemories() {
  saveMemories(DEFAULT_MEMORIES);
  return DEFAULT_MEMORIES;
}

/**
 * Extract and auto-learn user habits from conversation text
 */
export function autoLearnFromConversation(userText) {
  const clean = userText.trim();
  if (clean.length < 5) return;

  if (clean.includes('ชอบ') || clean.includes('อยากให้') || clean.includes('ต้องการ')) {
    addMemory(`ความชอบของ sir ไลท์: "${clean.slice(0, 100)}"`, 'user_preference');
  }
}
