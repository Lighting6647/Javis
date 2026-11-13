/** คำสั่งที่แอปทำเองทันทีโดยไม่ถาม AI เช่นเริ่มโหมดสรุปการประชุม */
export interface AppCommand {
  /** คำพูดหรือข้อความนี้คือคำสั่งนี้ไหม */
  matches: (text: string) => boolean;
  run: () => void;
}

export interface CommandRelay {
  /** ถามคำสั่งที่ลงทะเบียนไว้ตามลำดับ ทำคำสั่งแรกที่ตรง และคืน true เมื่อมีคำสั่งรับไปทำแล้ว */
  handle: (text: string) => boolean;
  /** ลงทะเบียนคำสั่ง คืนฟังก์ชันสำหรับถอนออก */
  register: (command: AppCommand) => () => void;
}

/**
 * ตัวส่งต่อคำสั่งของแอป: ตัวควบคุมบทสนทนาถามที่นี่ทุกครั้งที่ได้คำพูดหรือข้อความ ก่อนส่งไปถาม AI
 * ส่วนที่ทำคำสั่งได้ (เช่นโหมดสรุปการประชุม) ลงทะเบียนตัวเองเมื่อพร้อม และถอนออกเมื่อใช้ไม่ได้
 * แยกไว้เพราะสองฝั่งต้องรู้จักกัน: บทสนทนาต้องส่งคำสั่งให้โหมดนั้น และโหมดนั้นต้องหยุดบทสนทนาก่อนเริ่ม
 */
export function createCommandRelay(): CommandRelay {
  const commands = new Set<AppCommand>();

  return {
    handle(text) {
      for (const command of commands) {
        if (command.matches(text)) {
          command.run();
          return true;
        }
      }
      return false;
    },
    register(command) {
      commands.add(command);
      return () => {
        commands.delete(command);
      };
    }
  };
}

/** คำสั่งของแอปในแท็บนี้ */
export const appCommands: CommandRelay = createCommandRelay();
