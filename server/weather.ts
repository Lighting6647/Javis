/**
 * สภาพอากาศสำหรับสรุปเช้า จาก Open-Meteo (ฟรี ไม่ต้องมีกุญแจ) ตามพิกัดที่หน้าเว็บส่งมา
 * พิกัดถูกปัดเหลือทศนิยม 2 ตำแหน่ง (ราว 1 กม.) ก่อนส่งออกไป และไม่ถูกเก็บไว้ที่ใด
 * ล้มเหลวเมื่อไร (เครือข่าย หมดเวลา ข้อมูลผิดรูป) คืน null เพื่อให้สรุปเช้าข้ามเรื่องอากาศไปเงียบ ๆ
 */
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_TIMEOUT_MS = 3000;

export interface WeatherSummary {
  /** อุณหภูมิตอนนี้ (°C ปัดเป็นจำนวนเต็ม) */
  temperature: number;
  /** อุณหภูมิสูงสุดและต่ำสุดของวันนี้ */
  max: number;
  min: number;
  /** โอกาสฝนตกสูงสุดของวันนี้ (%) */
  rainChance: number;
  /** สภาพอากาศเป็นภาษาไทย */
  description: string;
}

/** รหัสสภาพอากาศ WMO → คำไทยสั้น ๆ */
export function describeWeatherCode(code: number): string {
  if (code === 0) return "ท้องฟ้าแจ่มใส";
  if (code <= 2) return "มีเมฆบางส่วน";
  if (code === 3) return "เมฆมาก";
  if (code === 45 || code === 48) return "มีหมอก";
  if (code >= 51 && code <= 57) return "ฝนปรอย";
  if (code >= 61 && code <= 67) return "ฝนตก";
  if (code >= 80 && code <= 82) return "ฝนตกเป็นช่วง ๆ";
  if (code >= 95) return "พายุฝนฟ้าคะนอง";
  return "สภาพอากาศแปรปรวน";
}

/** พิกัดที่ใช้ได้: ตัวเลขในช่วงที่ถูกต้อง ปัดเหลือทศนิยม 2 ตำแหน่ง */
export function readCoordinates(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { lat: Math.round(latitude * 100) / 100, lon: Math.round(longitude * 100) / 100 };
}

export async function fetchWeather(coords: { lat: number; lon: number }, fetchImpl: typeof fetch = fetch): Promise<WeatherSummary | null> {
  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Asia/Bangkok",
    forecast_days: "1"
  });
  try {
    const response = await fetchImpl(`${OPEN_METEO_URL}?${params.toString()}`, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
    };
    const temperature = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    const max = data.daily?.temperature_2m_max?.[0];
    const min = data.daily?.temperature_2m_min?.[0];
    if (typeof temperature !== "number" || typeof code !== "number" || typeof max !== "number" || typeof min !== "number") return null;
    return {
      temperature: Math.round(temperature),
      max: Math.round(max),
      min: Math.round(min),
      rainChance: Math.round(data.daily?.precipitation_probability_max?.[0] ?? 0),
      description: describeWeatherCode(code)
    };
  } catch {
    return null;
  }
}
