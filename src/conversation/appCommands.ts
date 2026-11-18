export type CommandHandleResult = boolean | "keep-listening";

/** คำสั่งที่แอปทำเองทันทีโดยไม่ถาม AI เช่นเริ่มโหมดสรุปการประชุม หรือสลับเสียง */
export interface AppCommand {
  /** คำพูดหรือข้อความนี้คือคำสั่งนี้ไหม */
  matches: (text: string) => boolean;
  run: (text: string) => void | "keep-listening";
}

export interface CommandRelay {
  /** ถามคำสั่งที่ลงทะเบียนไว้ตามลำดับ ทำคำสั่งแรกที่ตรง และคืนผลเพื่อให้ตัวควบคุมตัดสินใจหยุดหรือฟังต่อ */
  handle: (text: string) => CommandHandleResult;
  /** ลงทะเบียนคำสั่ง คืนฟังก์ชันสำหรับถอนออก */
  register: (command: AppCommand) => () => void;
}

export function createCommandRelay(): CommandRelay {
  const commands = new Set<AppCommand>();

  return {
    handle(text) {
      for (const command of commands) {
        if (command.matches(text)) {
          const result = command.run(text);
          return result === "keep-listening" ? "keep-listening" : true;
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
