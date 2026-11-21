# 📈 AGENT_CONTEXT.md — Auto Stock Trading WebApp (System Blueprint & Engineering Rules)

> **Purpose:** เอกสารบริบทหลักสำหรับ AI Agent และนักพัฒนา ใช้ควบคุมสถาปัตยกรรม มาตรฐานความปลอดภัยทางการเงิน (Financial Risk Guardrails) โครงสร้างข้อมูล และ API Contract ของระบบเทรดหุ้นอัตโนมัติ

---

## 1. Project Identity & Core Rules
- **System Type:** Automated Equity Trading Terminal & Execution Engine (Paper & Live Trading)
- **Supported Markets (via Broker Adapter):**
  - **TH Equity / TFEX:** Settrade Open API
  - **US Equity:** Alpaca Markets API / Interactive Brokers (IBKR)
- **Golden Safety Rule (กฎเหล็กอันดับ 1):**
  - **ห้าม** ให้ Strategy เรียก Broker API โดยตรงเด็ดขาด ทุกคำสั่งซื้อขายต้องไหลผ่าน `PreTradeRiskEngine` และมี `idempotencyKey` เสมอ
  - ค่าเริ่มต้นของระบบ (`TRADING_MODE`) ต้องเป็น `PAPER` เสมอ การสลับเป็น `LIVE` ต้องผ่านการยืนยันตัวตนและตรวจสถานะ Risk Limit ก่อนทุกครั้ง

---

## 2. Technology Stack
- **Frontend (Trading Terminal UI):**
  - React 19 + TypeScript + Vite (หรือ Next.js App Router)
  - Tailwind CSS (Slate/Zinc Financial Dark Theme, `font-variant-numeric: tabular-nums` สำหรับตัวเลขราคาทั้งหมด)
  - TradingView `lightweight-charts` สำหรับกราฟแท่งเทียน (OHLCV) และจุดเข้าซื้อ/ขาย (Buy/Sell Markers)
  - WebSocket Client พร้อม Auto-Reconnect และ Heartbeat Latency Monitor
- **Backend (Execution & Strategy Server):**
  - Node.js 22+ (TypeScript / Fastify หรือ Express) หรือ Python 3.12 (FastAPI)
  - **In-Memory Lock & Pub/Sub:** Redis (หรือ SQLite WAL + In-Memory Mutex สำหรับ Single-Node)
  - **Database:** PostgreSQL / TimescaleDB (หรือ SQLite สำหรับ Local Dev) เก็บ Order Audit Logs, Signals, Candles และ Daily PnL Snapshots
- **Testing & Verification:**
  - Vitest / Pytest สำหรับทดสอบตรรกะ Strategy, Risk Engine และ Backtest
  - Playwright E2E สำหรับทดสอบหน้าจอ Terminal และปุ่ม Emergency Kill Switch

---

## 3. System Architecture & Execution Pipeline

```
[Market Data Feed (WS/REST)]
        │
        ▼
[1. Data Normalizer & Stale Guard] ──► (Reject if tick age > MAX_TICK_AGE_MS)
        │
        ▼
[2. Strategy Engine (Signal Generator)]
   - EMA Crossover / RSI Mean Reversion / Breakout / Custom Webhook
   - Emits deterministic Signal with unique `signalId`
        │
        ▼
[3. Pre-Trade Risk Gatekeeper (MANDATORY)]
   ├─ Check 1: Kill Switch Active?
   ├─ Check 2: Duplicate Signal / Idempotency Lock?
   ├─ Check 3: Max Orders Per Minute (Anti-Runaway Loop)?
   ├─ Check 4: Daily Drawdown Limit Exceeded?
   └─ Check 5: Max Position Size / Buying Power Sufficient?
        │
        ▼
[4. Broker Execution Adapter (PaperAdapter | SettradeAdapter | AlpacaAdapter)]
        │
        ▼
[5. Position & PnL Reconciler + Immutable Audit Logger + WebSocket Broadcaster]
```

---

## 4. Core Data Contracts (TypeScript Schemas)

```typescript
export type TradingMode = "PAPER" | "LIVE";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP_LIMIT";
export type OrderStatus =
  | "PENDING_RISK"
  | "SUBMITTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED_RISK"
  | "REJECTED_BROKER";

export interface MarketBar {
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "1d";
  timestamp: number; // Unix ms (open time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeSignal {
  signalId: string; // deterministic: `${strategyId}:${symbol}:${timeframe}:${barTimestamp}:${side}`
  strategyId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  limitPrice?: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  suggestedQty: number;
  reason: string;
  generatedAt: number;
}

export interface RiskPolicy {
  tradingMode: TradingMode;
  killSwitchEngaged: boolean;
  maxDailyLossAmount: number;       // ขาดทุนสูงสุดต่อวัน (บาท/USD)
  maxDailyLossPct: number;          // เช่น 2.0 (2% ของพอร์ต)
  maxPositionValuePerSymbol: number;// มูลค่าถือครองสูงสุดต่อหุ้น 1 ตัว
  maxOpenPositions: number;         // จำนวนหุ้นที่ถือพร้อมกันสูงสุด
  maxOrdersPerMinute: number;       // ป้องกันบอทรวนยิงคำสั่งรัว (เช่น ไม่เกิน 5 คำสั่ง/นาที)
  maxQuoteStalenessMs: number;      // ห้ามเทรดถ้าราคาล่าสุดเก่ากว่าค่านี้ (เช่น 3000 ms)
}

export interface OrderRecord {
  orderId: string;
  idempotencyKey: string;
  brokerOrderId: string | null;
  signalId: string | null;
  strategyId: string | null;
  mode: TradingMode;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  qty: number;
  filledQty: number;
  requestedPrice: number | null;
  avgFillPrice: number | null;
  status: OrderStatus;
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
}
```

---

## 5. Mandatory Risk Engine Rules (ห้ามข้ามในการเขียนโค้ด)

ทุกฟังก์ชันที่ส่งคำสั่งซื้อขาย (`submitOrder`) ต้องตรวจผ่าน 6 ข้อนี้ตามลำดับ:
1. **Kill Switch Check:** หาก `riskPolicy.killSwitchEngaged === true` ต้องปฏิเสธคำสั่งทันที (`REJECTED_RISK: KILL_SWITCH_ACTIVE`)
2. **Idempotency Lock:** ตรวจสอบ `idempotencyKey` (ผูกกับ `signalId`) หากเคยประมวลผลไปแล้วภายในรอบแท่งเทียนเดียวกัน ต้องคืนผลลัพธ์เดิม ห้ามส่งซ้ำ
3. **Rate Limit / Anti-Loop:** นับจำนวนคำสั่งในรอบ 60 วินาทีล่าสุด หากเกิน `maxOrdersPerMinute` ให้สั่งเปิด `killSwitchEngaged = true` อัตโนมัติทันที
4. **Stale Market Data Guard:** หาก `Date.now() - latestQuote.timestamp > maxQuoteStalenessMs` ห้ามส่งคำสั่ง `MARKET` เด็ดขาด
5. **Daily Drawdown Circuit Breaker:** หาก `(realizedPnLToday + unrealizedPnLToday) <= -Math.abs(maxDailyLossAmount)` ให้บล็อกคำสั่งเปิดสถานะใหม่ (`BUY`) และแจ้งเตือนทันที
6. **Position Sizing & Buying Power:** มูลค่าคำสั่ง (`qty * price`) รวมกับสถานะเดิมของหุ้นตัวนั้น ต้องไม่เกิน `maxPositionValuePerSymbol` และไม่เกินเงินสดคงเหลือจริง

---

## 6. REST API & WebSocket Contracts

### REST Endpoints
- `GET /api/system/status`
  - คืนค่า `{ mode: "PAPER" | "LIVE", brokerConnected: boolean, marketOpen: boolean, killSwitchEngaged: boolean, latencyMs: number }`
- `GET /api/portfolio/summary`
  - คืนค่า `{ equity, cash, buyingPower, realizedPnLToday, unrealizedPnLToday, dailyDrawdownPct }`
- `GET /api/positions`
  - คืนค่ารายการหุ้นที่ถืออยู่ `{ symbol, qty, avgCost, lastPrice, unrealizedPnL, unrealizedPnLPct, stopLossPrice }[]`
- `GET /api/orders?limit=50`
  - คืนค่าประวัติคำสั่งซื้อขายพร้อม `status` และ `rejectReason`
- `POST /api/orders`
  - ส่งคำสั่งซื้อขายแบบ Manual / Semi-Auto (บังคับส่ง `idempotencyKey` ใน body)
- `POST /api/strategies/:strategyId/toggle`
  - เปิด/ปิดการทำงานของกลยุทธ์ `{ enabled: boolean, symbols: string[], timeframe: string }`
- `POST /api/risk/kill-switch`
  - **Emergency Action:** ตั้งค่า `killSwitchEngaged = true`, หยุดทุก Strategy, และส่งคำสั่ง `cancelAllOpenOrders()` ไปยังโบรกเกอร์ทันที (ต้องทำงานจบภายใน < 500ms)

### WebSocket Stream (`/ws/trading`)
- `market:tick` — `{ symbol, price, bid, ask, volume, timestamp }`
- `strategy:signal` — ข้อมูล `TradeSignal` เมื่อกลยุทธ์ตรวจพบสัญญาณเข้า/ออก
- `order:update` — ข้อมูล `OrderRecord` ทุกครั้งที่สถานะออเดอร์เปลี่ยน
- `portfolio:pnl` — อัปเดตยอด PnL และ Drawdown รายวินาที
- `risk:alert` — แจ้งเตือนเมื่อออเดอร์ถูกบล็อกจาก Risk Engine หรือเมื่อ Circuit Breaker ทำงาน

---

## 7. Directory Structure (Clean Modular Architecture)

```
├── src/                        # Frontend Trading Terminal
│   ├── components/
│   │   ├── terminal/           # CandlestickChart, OrderBook, Watchlist
│   │   ├── execution/          # OrderTicket, ActivePositionsTable, OrdersAuditTable
│   │   ├── strategies/         # StrategyControlCard, BacktestMetricsPanel
│   │   └── safety/             # EmergencyKillSwitchBar, RiskPolicyDialog, ModeBadge
│   ├── stores/                 # Zustand stores (portfolioStore, marketStore, riskStore)
│   └── services/               # REST & WebSocket clients with zod schema validation
├── server/                     # Backend Trading & Execution Engine
│   ├── adapters/               # BrokerAdapter interface + PaperAdapter, AlpacaAdapter, SettradeAdapter
│   ├── strategies/             # BaseStrategy + EmaRsiStrategy, BreakoutStrategy
│   ├── risk/                   # PreTradeRiskEngine.ts, CircuitBreaker.ts
│   ├── execution/              # OrderManager.ts, PositionReconciler.ts
│   ├── backtest/               # BacktestRunner.ts (walk-forward historical simulation)
│   └── db/                     # Schema migrations & repository layer
└── tests/
    ├── riskEngine.test.ts      # Unit tests for all 6 risk guardrails
    ├── orderIdempotency.test.ts# Verify zero duplicate order execution
    └── e2e/                    # Playwright terminal & kill-switch verification
```

---

## 8. UI/UX & Production Quality Gates
1. **Visual Hierarchy & Anti-Slop Design:**
   - ใช้โทนสี Slate/Zinc เข้มสำหรับการดูกราฟนานๆ สีเขียว (`emerald-400`) สำหรับกำไร/ฝั่งซื้อ สีแดง (`rose-500`) สำหรับขาดทุน/ฝั่งขาย และสีเหลืองอำพัน (`amber-400`) สำหรับโหมด `PAPER`
   - ตัวเลขราคา จำนวนหุ้น และ PnL ทุกจุดต้องใช้ `tabular-nums` เพื่อไม่ให้ตัวเลขกระตุกเวลาอัปเดตแบบ Real-time
2. **Always-Visible Safety Header:**
   - แถบด้านบนสุดต้องแสดงป้าย **`PAPER MODE`** หรือ **`LIVE TRADING`** ขนาดใหญ่ พร้อมสถานะการเชื่อมต่อโบรกเกอร์ และปุ่ม **`EMERGENCY STOP (KILL SWITCH)`** ที่กดได้ในคลิกเดียว
3. **Mandatory Verification Before Merge:**
   - `npm run build` และ `npm run lint` ต้องผ่าน 100% (0 TypeScript errors)
   - Unit Test ของ `PreTradeRiskEngine` ต้องครอบคลุมกรณี Kill Switch, Duplicate Signal, Daily Loss Limit, และ Stale Price ครบทุกกรณี
