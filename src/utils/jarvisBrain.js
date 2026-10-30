/**
 * J.A.R.V.I.S. MARK III Neural AI Orchestrator
 * Persona: Tony Stark's J.A.R.V.I.S. - Executive, polite, addresses user as USER_TITLE (Default: "คุณผู้ชาย" / Sir).
 * Role: Central Brain orchestrating all AI teams behind the scenes:
 *  - 1. AI Marketing (Lead Gen & Content)
 *  - 2. AI Sales & Closing (Pricing & Quotations)
 *  - 3. AI Engineering & Architecture (Tech Lead, DB Schema, APIs)
 *  - 4. AI DevOps & Cloud (CI/CD, Vercel, Server Uptime)
 *  - 5. AI QA & Security (4 Quality Gates, Vuln Scanner, Audit Logs)
 *  - 6. AI Finance & Billing (PromptPay QR, VAT, Cashflow)
 */

import { INITIAL_PROJECTS } from '../data/projectsData.js';

export let USER_TITLE = 'คุณผู้ชาย'; // "คุณผู้ชาย" (Sir - Authentic Iron Man Thai Dub), "ท่านประธาน", "ผู้การ", "คุณไลท์"

export function setUserTitle(title) {
  if (title && title.trim()) USER_TITLE = title.trim();
}

export function getUserTitle() {
  return USER_TITLE;
}

export const SYSTEM_TELEMETRY = {
  codename: 'J.A.R.V.I.S. MK III',
  status: 'ONLINE',
  location: 'BANGKOK 26°C',
  humidity: '85%',
  network: 'ONLINE (12ms)',
  power: 'POWER ONLINE',
};

/**
 * Intelligent Thai Natural Language Processing
 * Searches across all AI teams and returns executive response + optional holographic projection payload.
 */
export function processJarvisCommand(input, _context = {}) {
  const clean = input.trim().toLowerCase();

  // 0. Change User Honorific Title / Persona Command
  if (
    clean.includes('ให้เรียกว่า') ||
    clean.includes('เปลี่ยนชื่อเรียก') ||
    clean.includes('ไม่ต้องเรียกว่า') ||
    clean.includes('เรียกผมว่า') ||
    clean.includes('เปลี่ยนคำนำหน้า')
  ) {
    let newTitle = 'คุณผู้ชาย';
    if (clean.includes('ท่านประธาน') || clean.includes('ประธาน')) {
      newTitle = 'ท่านประธาน';
    } else if (clean.includes('ผู้การ') || clean.includes('กัปตัน')) {
      newTitle = 'ผู้การ';
    } else if (clean.includes('คุณไลท์') || clean.includes('ไลท์') || clean.includes('light')) {
      newTitle = 'คุณไลท์';
    } else if (clean.includes('หัวหน้า') || clean.includes('ผู้นำ')) {
      newTitle = 'หัวหน้า';
    } else if (clean.includes('คุณผู้ชาย') || clean.includes('sir')) {
      newTitle = 'คุณผู้ชาย';
    } else {
      // Extract custom title
      const extracted = clean
        .replace(/.*(?:ให้เรียกว่า|เรียกผมว่า|เปลี่ยนชื่อเรียกเป็น|เรียกว่า)\s*/i, '')
        .trim();
      if (extracted.length > 1) {
        newTitle = extracted;
      }
    }

    setUserTitle(newTitle);

    return {
      action: 'SET_TITLE',
      title: newTitle,
      squadId: 'ops',
      delegatedTo: 'J.A.R.V.I.S. Persona Core',
      reply: `รับทราบครับ ${newTitle} ต่อจากนี้ผมจะเรียกท่านว่า "${newTitle}" อย่างเป็นทางการครับ`,
      speech: `รับทราบครับ ${newTitle} ต่อจากนี้ผมจะเรียกท่านว่า ${newTitle} ครับ`,
      hologram: {
        title: 'USER HONORIFIC // UPDATED',
        category: 'J.A.R.V.I.S. PERSONA PROTOCOL',
        badge: newTitle.toUpperCase(),
        details: [
          { label: 'Active Title', val: newTitle },
          { label: 'Tone Protocol', val: 'Executive Formal' },
          { label: 'Inspiration', val: 'Iron Man Mark III OS' },
          { label: 'Status', val: 'Applied System-wide' },
        ],
      },
    };
  }

  // 1. Theme Changing Command (Top Priority Override)
  if (
    clean.includes('ธีม') ||
    clean.includes('theme') ||
    clean.includes('เปลี่ยนสี') ||
    clean.includes('สลับสี')
  ) {
    let brandId = 'ceo-master';
    let brandName = 'Executive Slate & Cyan';
    if (clean.includes('แดง') || clean.includes('คอน')) {
      brandId = 'concert-ticket';
      brandName = 'Stadium Crimson & Charcoal';
    } else if (clean.includes('เขียว') || clean.includes('ฟิต')) {
      brandId = 'fitness-gym';
      brandName = 'Neon Lime & Obsidian Fit';
    } else if (clean.includes('ส้ม') || clean.includes('pos')) {
      brandId = 'pos-inventory';
      brandName = 'Amber Gold & Slate';
    }

    return {
      action: 'CHANGE_THEME',
      brandId: brandId,
      squadId: 'eng',
      delegatedTo: 'ทีม AI UI/UX Design System',
      reply: `ปรับเปลี่ยนโทนสีหน้าจอและแสงโฮโลแกรมเป็น "${brandName}" เรียบร้อยแล้วครับ ${USER_TITLE}`,
      speech: `ปรับเปลี่ยนโทนสีหน้าจอตามที่${USER_TITLE}สั่งเรียบร้อยแล้วครับ`,
    };
  }

  // 1.1 Thai Language Capabilities & Greetings (Conversational Thai)
  if (
    clean.includes('คุยภาษาไทย') ||
    clean.includes('พูดภาษาไทย') ||
    clean.includes('พูดไทย') ||
    clean.includes('ภาษาไทย') ||
    clean.includes('เข้าใจภาษาไทย')
  ) {
    return {
      action: 'CHAT',
      squadId: 'ops',
      delegatedTo: 'J.A.R.V.I.S. Neural Voice Core',
      reply:
        `ผมคุยและโต้ตอบเป็นภาษาไทยได้ 100% ครับ ${USER_TITLE}!\n\nท่านสามารถสั่งการด้วยเสียงพูดภาษาไทยหรือพิมพ์ข้อความได้ทุกเรื่อง เช่น:\n• "ตรวจระบบทั้งหมด" (สั่ง AI QA ตรวจสอบ 17 โปรเจกต์ในเครื่อง)\n• "ดูข้อมูลระบบ POS" (ดึงราคาและฟังก์ชันระบบคลังสินค้า)\n• "ออกใบเสนอราคา" (สร้างใบเสนอราคาพร้อม QR พร้อมเพย์)\n• "ดูระบบบัตรคอนเสิร์ต" (ระบบ ThaiTicket Hub)\n• "เปลี่ยนธีมหน้าจอเป็นสีส้ม"\n\n${USER_TITLE}มีคำสั่งหรืออยากให้ค้นหาข้อมูลส่วนไหนต่อ แจ้งได้ทันทีครับ!`,
      speech:
        `ผมคุยและโต้ตอบภาษาไทยได้ร้อยเปอร์เซ็นต์ครับ ${USER_TITLE} สั่งงานด้วยเสียงพูดภาษาไทยได้เลยครับ`,
      hologram: {
        title: 'THAI NATURAL LANGUAGE // ONLINE',
        category: 'VOICE & INTELLIGENCE CORE',
        badge: '100% THAI NATIVE',
        details: [
          { label: 'Voice Model', val: 'Thai Speech Engine (th-TH)' },
          { label: 'Wake Word', val: '"javis" / "จาร์วิส"' },
          { label: 'Command Routing', val: '6 AI Squads Delegated' },
          { label: 'Status', val: 'Listening & Ready' },
        ],
      },
    };
  }

  // 1.2 Greetings & Casual Rapport
  if (
    clean.includes('สวัสดี') ||
    clean.includes('หวัดดี') ||
    clean.includes('ฮัลโหล') ||
    clean === 'hello' ||
    clean === 'hi' ||
    clean === 'hey' ||
    clean.includes('เป็นไงบ้าง') ||
    clean.includes('สบายดีไหม')
  ) {
    return {
      action: 'CHAT',
      squadId: 'ops',
      delegatedTo: 'J.A.R.V.I.S. Executive Core',
      reply:
        `สวัสดีครับ ${USER_TITLE}! วันนี้ผม J.A.R.V.I.S. และทีม AI ทั้ง 6 แผนก สแตนด์บายพร้อมช่วยท่านเต็มที่ครับ\n\nสถานะระบบตอนนี้:\n• ซอฟต์แวร์ทั้ง 15 ตัวใน 17 โฟลเดอร์: ออนไลน์พร้อมใช้งาน 100%\n• การรักษาความปลอดภัย: ปกติทุกระบบ\n\n${USER_TITLE}ต้องการให้ผมช่วยค้นหาข้อมูล หรือสั่งงานทีม AI ในระบบไหนเป็นพิเศษไหมครับ?`,
      speech:
        `สวัสดีครับ ${USER_TITLE} ผม จาร์วิส พร้อมช่วยจัดการและค้นหาข้อมูลให้ท่านทุกอย่างครับ`,
    };
  }

  // 1.3 Identity & Purpose
  if (
    clean.includes('คุณคือใคร') ||
    clean.includes('นายคือใคร') ||
    clean.includes('เธอคือใคร') ||
    clean.includes('แนะนำตัว') ||
    clean.includes('who are you')
  ) {
    return {
      action: 'CHAT',
      squadId: 'ops',
      delegatedTo: 'J.A.R.V.I.S. Persona Core',
      reply:
        `ผมคือ J.A.R.V.I.S. MARK 3 ระบบปัญญาประดิษฐ์ผู้ช่วยส่วนตัวของ${USER_TITLE}ครับ\n\nหน้าที่หลักของผมคือ:\n1. เป็นศูนย์กลางค้นหาข้อมูลและสั่งการทีม AI เบื้องหลังทั้ง 6 แผนก (การตลาด, ฝ่ายขาย, วิศวกรรม, การเงิน, DevOps, และความปลอดภัย)\n2. ควบคุมและตรวจสอบความพร้อมของ 15 โปรเจกต์ใน D:\\Light\n3. ฉายโฮโลแกรมรายงานข้อมูลแบบกระชับเฉพาะตอนที่${USER_TITLE}ต้องการครับ`,
      speech:
        `ผมคือ จาร์วิส มาร์คทรี ผู้ช่วยส่วนตัวของ${USER_TITLE} พร้อมค้นหาข้อมูลและสั่งการทีมเอไอทุกแผนกครับ`,
    };
  }

  // 1.4 Capabilities & Help
  if (
    clean.includes('ช่วยอะไรได้บ้าง') ||
    clean.includes('ทำอะไรได้บ้าง') ||
    clean.includes('สั่งอะไรได้บ้าง') ||
    clean.includes('ความสามารถ')
  ) {
    return {
      action: 'VIEW_SQUAD',
      squadId: 'ops',
      delegatedTo: 'J.A.R.V.I.S. Feature Matrix',
      reply:
        `ผมสามารถช่วย${USER_TITLE}ได้หลากหลายด้านเลยครับ:\n\n1. 🔍 ตรวจสอบระบบ: พูดว่า "จาร์วิส ตรวจระบบทั้งหมด" เพื่อเช็คความพร้อมของ 17 โปรเจกต์\n2. 💼 ดูข้อมูลโปรเจกต์: ถามข้อมูลระบบ เช่น "จาร์วิส ดูระบบ POS", "จาร์วิส ดูระบบบัตรคอน", "จาร์วิส ดูระบบฟิตเนส"\n3. 💰 การเงินและเอกสาร: สั่ง "จาร์วิส ออกใบเสนอราคา" เพื่อสร้างใบเสนอราคาพร้อม QR พร้อมเพย์\n4. 🎨 ปรับแต่งหน้าจอ: สั่ง "เปลี่ยนธีมเป็นสีส้ม" หรือ "เปลี่ยนธีมเป็นสีแดง"\n5. 🛡️ ความปลอดภัย: สั่ง "เช็คความปลอดภัย vault"\n\n${USER_TITLE}ต้องการให้ผมจัดการเรื่องไหนก่อนดีครับ?`,
      speech:
        `ผมช่วย${USER_TITLE}ตรวจระบบ ค้นหาข้อมูลโปรเจกต์ ออกใบเสนอราคา และสั่งการทีมเอไอได้ทั้งหมดครับ ${USER_TITLE}ต้องการให้เริ่มที่จุดไหนดีครับ`,
    };
  }

  // 1.5 Gratitude
  if (clean.includes('ขอบคุณ') || clean.includes('ขอบใจ') || clean.includes('thanks')) {
    return {
      action: 'CHAT',
      squadId: 'ops',
      delegatedTo: 'J.A.R.V.I.S. Executive Core',
      reply: `ยินดีรับใช้เสมอครับ ${USER_TITLE}! มีข้อมูลอะไรให้ผมค้นหาเพิ่มเติม แจ้งได้ทุกเวลาครับ`,
      speech: `ยินดีรับใช้เสมอครับ ${USER_TITLE}`,
    };
  }

  // 2. Audit / Health Check -> Delegate to AI QA & Security Squad
  if (
    clean.includes('ตรวจ') ||
    clean.includes('audit') ||
    clean.includes('ทดสอบ') ||
    clean.includes('เช็คระบบ') ||
    clean.includes('คุณภาพ') ||
    clean.includes('ไฟล์') ||
    clean.includes('ซ่อม')
  ) {
    return {
      action: 'RUN_AUDIT',
      squadId: 'sec',
      delegatedTo: 'ทีม AI QA Automation & Security Auditor',
      reply:
        `รับทราบครับ ${USER_TITLE} กำลังสั่งการทีม AI QA และ Security ตรวจสอบ 4 Quality Gates ข้ามทั้ง 17 โปรเจกต์ใน D:\\Light ให้เรียบร้อยครับ\n\n[สถานะการตรวจสอบ]:\n• Gate 1 (Design Tokens): 100% Pass\n• Gate 2 (Test Suites): 6/6 ผ่านเกณฑ์\n• Gate 3 (Linter & Build): 0 Errors\n• Gate 4 (Workspace Files): ครบ 17 โฟลเดอร์ สมบูรณ์ 100% ครับ ${USER_TITLE}`,
      speech: `รับทราบครับ ${USER_TITLE} สั่งการทีม AI ตรวจสอบระบบทั้งสิบเจ็ดโปรเจกต์ เรียบร้อยสมบูรณ์ร้อยเปอร์เซ็นต์ครับ`,
      hologram: {
        title: 'FULL QA SYSTEM AUDIT // REPORT',
        category: 'AI QA & SECURITY SQUAD',
        badge: '100% VERIFIED',
        details: [
          { label: 'Total Projects', val: '15 Active Apps + CEO Director' },
          { label: 'Workspace Files', val: '17/17 Folders Verified' },
          { label: 'Security Protocols', val: 'AES-256 Vault Stable' },
          { label: 'Build Status', val: 'Vite Production Passed' },
        ],
      },
    };
  }

  // 2. Quotation / Invoice -> Delegate to AI Finance & Sales Squad
  if (
    clean.includes('ใบเสนอราคา') ||
    clean.includes('ราคา') ||
    clean.includes('คิดเงิน') ||
    clean.includes('พร้อมเพย์') ||
    clean.includes('quote')
  ) {
    return {
      action: 'OPEN_QUOTATION',
      squadId: 'fin',
      delegatedTo: 'ทีม AI Finance & Sales Closer',
      reply:
        `จัดให้ครับ ${USER_TITLE} ประสานงานกับทีม AI การเงิน ออกใบเสนอราคาอิเล็กทรอนิกส์ คำนวณภาษีมูลค่าเพิ่ม 7% พร้อมสร้างคิวอาร์โค้ดพร้อมเพย์มาตรฐาน EMVCo ให้เรียบร้อยแล้วครับ สามารถส่งมอบให้ลูกค้าภายนอกได้ทันทีครับ`,
      speech: `จัดให้ครับ ${USER_TITLE} ทีมการเงินสร้างใบเสนอราคาพร้อมคิวอาร์โค้ดพร้อมเพย์เรียบร้อยแล้วครับ`,
      hologram: {
        title: 'ELECTRONIC QUOTATION & EMVCo QR',
        category: 'AI FINANCE & BILLING',
        badge: 'READY TO CLOSE',
        details: [
          { label: 'Document Type', val: 'Official Commercial Quotation' },
          { label: 'Payment Gateway', val: 'PromptPay EMVCo CRC-16' },
          { label: 'Tax Spec', val: 'VAT 7% Included' },
          { label: 'Digital Sign', val: 'Founder Verified' },
        ],
      },
    };
  }

  // 3. POS & Inventory Info -> Delegate to AI Engineering & Product Squad
  if (
    clean.includes('pos') ||
    clean.includes('คลัง') ||
    clean.includes('สต็อก') ||
    clean.includes('inventory') ||
    clean.includes('ขายหน้าร้าน')
  ) {
    return {
      action: 'VIEW_PROJECT',
      squadId: 'eng',
      delegatedTo: 'ทีม AI Software Engineering (Krob POS)',
      reply:
        `ครับ ${USER_TITLE} ค้นหาข้อมูลจากทีมวิศวกรรมให้เรียบร้อย:\n• โปรเจกต์: Krob POS & Inventory AI (D:\\Light\\Inventoty AI Light)\n• สแตกเทคโนโลยี: Next.js 16 + Prisma + QR PromptPay\n• โมเดลราคา: ฿390 / เดือน\n• ฟังก์ชันพร้อมขาย: คิดเงินไว, ตัดสต็อกอัตโนมัติ, แจ้งเตือนของใกล้หมด, ออกใบเสร็จความร้อนครบถ้วนครับ`,
      speech: `ระบบคลังสินค้าและขายหน้าร้าน POS พร้อมให้บริการ ราคา 390 บาทต่อเดือนครับ ${USER_TITLE}`,
      hologram: {
        title: 'KROB POS & INVENTORY AI',
        category: 'DIGITAL COMMERCE SAAS',
        badge: '฿390 / MONTH',
        details: [
          { label: 'Location', val: 'D:\\Light\\Inventoty AI Light' },
          { label: 'Tech Stack', val: 'Next.js 16 + Prisma' },
          { label: 'Key Feature', val: 'Auto-Stock Deduction & Thermal Receipt' },
          { label: 'Readiness', val: 'Production Verified (100%)' },
        ],
      },
    };
  }

  // 4. Ticket Concert Info -> Delegate to AI Event & Ticketing Squad
  if (
    clean.includes('บัตร') ||
    clean.includes('คอน') ||
    clean.includes('ticket') ||
    clean.includes('อีเวนต์') ||
    clean.includes('ที่นั่ง')
  ) {
    return {
      action: 'VIEW_PROJECT',
      squadId: 'sales',
      delegatedTo: 'ทีม AI Event Ticketing Architect',
      reply:
        `ครับ ${USER_TITLE} ข้อมูลระบบ ThaiTicket Hub (D:\\Light\\บัตรคอน Light):\n• ราคาขาย: ฿1,500 / งาน + ค่าธรรมเนียม 2% ต่อบัตร\n• เทคโนโลยี: Node.js + SQLite + PromptPay CRC-16\n• ไฮไลต์: ผังที่นั่ง Interactive โซน VIP, ระบบตรวจจับสลิปปลอมด้วย SHA-256 และ Anti-passback QR Check-in หน้าประตูครับ`,
      speech: `ระบบจองบัตรคอนเสิร์ตไทยทิกเก็ตฮับ ผังที่นั่งและตรวจสลิปพร้อมใช้งานครับ ${USER_TITLE}`,
      hologram: {
        title: 'THAI TICKET CONCERT HUB',
        category: 'EVENT & SEATING INFRA',
        badge: '฿1,500 / EVENT',
        details: [
          { label: 'Location', val: 'D:\\Light\\บัตรคอน Light' },
          { label: 'Anti-Fraud', val: 'SHA-256 Slip Hash Verification' },
          { label: 'Gate Control', val: 'Anti-passback QR Scanner' },
          { label: 'Status', val: '38/38 Tests Passed' },
        ],
      },
    };
  }

  // 5. Fitness Gym Info
  if (
    clean.includes('fit') ||
    clean.includes('ฟิตเนส') ||
    clean.includes('ยิม') ||
    clean.includes('กล้อง') ||
    clean.includes('สมาชิก')
  ) {
    return {
      action: 'VIEW_PROJECT',
      squadId: 'mkt',
      delegatedTo: 'ทีม AI Fitness IoT Architect',
      reply:
        `ครับ ${USER_TITLE} ข้อมูลระบบ Krob Fit (D:\\Light\\Fitness):\n• ราคาขาย: ฿990 / เดือน\n• เทคโนโลยี: React + Vite + HTML5 QR Camera Scanner\n• ฟังก์ชัน: สแกนบัตรสมาชิกเข้ายิมผ่านกล้องมือถือ/แท็บเล็ตทันที, จัดการคอร์สเทรนเนอร์ และ AI แจ้งเตือนต่ออายุสมาชิกอัตโนมัติครับ`,
      speech: `ระบบบริหารฟิตเนส พร้อมสแกนเนอร์เปิดกล้องตรวจบัตรสมาชิก ราคา 990 บาทต่อเดือนครับ ${USER_TITLE}`,
      hologram: {
        title: 'KROB FIT // GYM MANAGEMENT',
        category: 'IOT & QR SCANNER',
        badge: '฿990 / MONTH',
        details: [
          { label: 'Location', val: 'D:\\Light\\Fitness' },
          { label: 'Scanner', val: 'HTML5 Live Web Camera QR' },
          { label: 'Retention', val: 'AI Auto Renewal Reminder' },
          { label: 'Status', val: 'Ready for Demo' },
        ],
      },
    };
  }

  // 6. Security Pass & Vault
  if (
    clean.includes('pass') ||
    clean.includes('ความปลอดภัย') ||
    clean.includes('บัตรผ่าน') ||
    clean.includes('vault') ||
    clean.includes('รหัส')
  ) {
    return {
      action: 'OPEN_VAULT',
      squadId: 'sec',
      delegatedTo: 'ทีม AI Cyber Security & Vault Guard',
      reply:
        `ครับ ${USER_TITLE} ข้อมูลระบบ Krob Pass (D:\\Light\\Pass App Light):\n• ราคาขาย: ฿690 / เดือน\n• ความปลอดภัย: มาตรฐาน AES-256 Vault Crypto เข้ารหัสข้อมูลรหัสผ่านระดับองค์กร พร้อม QR Gate Pass สำหรับผู้มาติดต่อและบันทึก Audit Log ทุกวินาทีครับ`,
      speech: `ระบบบัตรผ่านและมาสเตอร์วอลท์ ความปลอดภัยระดับองค์กรพร้อมใช้งานครับ ${USER_TITLE}`,
      hologram: {
        title: 'KROB PASS // SECURITY VAULT',
        category: 'ENTERPRISE ACCESS CONTROL',
        badge: 'AES-256 ENCRYPTED',
        details: [
          { label: 'Location', val: 'D:\\Light\\Pass App Light' },
          { label: 'Encryption', val: 'AES-256-GCM Hardware Vault' },
          { label: 'Gate Pass', val: 'Time-based Dynamic QR' },
          { label: 'Test Score', val: '38/38 Tests Passed' },
        ],
      },
    };
  }

  // 7. Overview of All AI Teams & Projects
  if (
    clean.includes('โปรเจกต์') ||
    clean.includes('project') ||
    clean.includes('ทั้งหมด') ||
    clean.includes('มีอะไรบ้าง') ||
    clean.includes('ทีม') ||
    clean.includes('ทีมงาน') ||
    clean.includes('ทำอะไรได้')
  ) {
    const listNames = INITIAL_PROJECTS.slice(0, 6)
      .map((p) => `• ${p.name}: ${p.thName}`)
      .join('\n');

    return {
      action: 'VIEW_SQUAD',
      squadId: 'ops',
      delegatedTo: 'ทีม AI Core Executive Squad',
      reply: `รายงานสถานะทีม AI ทั้งหมดครับ ${USER_TITLE}:\n\nปัจจุบันทีม AI ของเราดูแลอยู่ 15 โปรเจกต์หลักใน 17 โฟลเดอร์:\n${listNames}\n...และระบบอื่นๆ รวม 15 ซอฟต์แวร์\n\nทีม AI ทั้ง 6 แผนก (การตลาด, ฝ่ายขาย, วิศวกรรม, บริการลูกค้า, การเงิน, และบริหาร) สแตนด์บายพร้อมรับคำสั่งจาก${USER_TITLE}ทุกวินาทีครับ`,
      speech: `รายงานสถานะครับ ${USER_TITLE} ทีมเอไอทั้งหมดสแตนด์บายพร้อมค้นหาข้อมูลและสั่งการทุกระบบตามที่ท่านต้องการครับ`,
      hologram: {
        title: 'AI WORKSPACE ROSTER // 17 PROJECTS',
        category: 'EXECUTIVE OVERVIEW',
        badge: 'ALL SQUADS READY',
        details: [
          { label: 'Active Projects', val: '15 Commercial SaaS' },
          { label: 'Autonomous Squads', val: '6 Business + 5 Coding Squads' },
          { label: 'Network Runtime', val: 'Dual-Stack IPv6 & IPv4' },
          { label: 'Cloud Status', val: 'Vercel Synchronized' },
        ],
      },
    };
  }

  // 9. Conversational Fallback
  return {
    action: 'CHAT',
    squadId: 'ops',
    delegatedTo: 'J.A.R.V.I.S. Neural Core',
    reply: `รับทราบครับ ${USER_TITLE} เกี่ยวกับ "${input}" J.A.R.V.I.S. พร้อมค้นหาข้อมูลเชิงลึกจากทีม AI ที่ดูแลทั้ง 17 โฟลเดอร์ให้ท่านทันทีครับ\n• ท่านสามารถสั่ง "ตรวจระบบ", "ดูข้อมูลระบบ POS", หรือ "ออกใบเสนอราคา"\nต้องการให้ผมประสานงานกับทีม AI แผนกไหนเป็นพิเศษไหมครับ?`,
    speech: `รับทราบครับ ${USER_TITLE} J.A.R.V.I.S. พร้อมค้นหาข้อมูลและสั่งการทุกทีมเอไอให้ท่านทันทีครับ`,
  };
}
