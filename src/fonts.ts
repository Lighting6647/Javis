/*
 * ฟอนต์ของแอปอยู่ในแอปเอง ไม่ดึงจาก Google Fonts
 * - แอปมือถือและเดสก์ท็อปแสดงฟอนต์ถูกต้องแม้ไม่มีอินเทอร์เน็ต
 * - ไม่ส่ง IP ของผู้ใช้ไปเซิร์ฟเวอร์ภายนอก และตัด fonts.googleapis.com / fonts.gstatic.com ออกจาก CSP ได้
 * น้ำหนักชุดเดียวกับที่เคยขอจาก Google Fonts แต่ละไฟล์ CSS แบ่งตามชุดอักษรด้วย unicode-range
 * เบราว์เซอร์จึงดาวน์โหลดเฉพาะไฟล์ที่ข้อความบนจอใช้จริง (ปกติคืออักษรไทยกับอังกฤษ)
 */
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
