# XAUUSD 盘感训练系统

基于历史 `XAUUSD 1M` 数据的交易训练项目，前后端分离：

- 后端：`FastAPI`（游戏状态、K线接口、下单快进结算）
- 前端：`Next.js + lightweight-charts`（图表与训练交互）

目标：在不泄露未来数据的前提下，训练交易执行与风控习惯。

## 1. 功能概览

- 随机历史时间点开局，每局最多 `10` 次开仓
- 支持时间推演：`+1M / +5M / +15M / +1H`
- 支持周期切换：`1M / 5M / 15M / 1H / 4H / 1D`
- 下单后后端自动快进，直到 `SL / TP / 爆仓 / 数据末尾`
- 固定点差、合约规格一致化，盈亏计算可复现
- 交易历史、余额、胜率、统计结果实时展示

## 2. 项目结构

```text
xauusd_trainer/
├── backend/
│   ├── main.py            # FastAPI 服务与核心撮合/结算逻辑
│   └── requirements.txt   # Python 依赖
└── frontend/
    ├── app/               # Next.js 页面
    ├── components/        # 图表、下单面板、推演控制、统计弹窗
    ├── lib/               # API 客户端与类型定义
    └── next.config.js     # /api 代理到后端:8000
```

## 3. 环境要求

- Python `3.10+`
- Node.js `18+`（建议 `20+`）
- npm `9+`

## 4. 快速开始

### 4.1 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端默认监听：`http://localhost:8000`

### 4.2 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认地址：`http://localhost:3000`

前端会通过 `next.config.js` 将 `/api/*` 自动代理到 `http://localhost:8000/api/*`。

## 5. 数据要求

后端启动时会加载：

`~/data/workspace/finance/data_history/XAUUSD_1M.parquet`

如果你的数据路径不同，请修改 `backend/main.py` 中 `DATA_PATH`。

Parquet 需要至少包含以下列：

- `time`（可转 datetime）
- `open`
- `high`
- `low`
- `close`
- `tick_volume`

## 6. 交易规则（与代码一致）

- 品种：`XAUUSD`
- 合约大小：`1手 = 100盎司`
- 固定点差：`$0.20`（20 points）
- 杠杆：`1:100`（用于爆仓估算）
- 最小手数：`0.01`
- 每局最多交易次数：`10`

价格坐标说明：

- 图表/K线价格是 `Bid`
- `Ask = Bid + 0.20`
- 多单开仓按 `Ask`，空单开仓按 `Bid`
- 前端输入 `SL/TP` 使用 `Bid` 坐标系

## 7. 防作弊设计

- 每个 Session 维护一个 `current_time`（玩家当前可见时间边界）
- K 线接口严格返回 `<= current_time` 的数据，不返回未来 K 线
- 时间推演只返回本次新增 1M K 线
- 前端展示时间隐藏年份，降低“按年份猜趋势”的信息泄露

## 8. API 概览

- `POST /api/game/start`：创建新局，随机起点
- `GET /api/market/klines`：获取指定周期 K 线（防作弊边界）
- `POST /api/game/step`：时间推演
- `POST /api/trade/order`：下单并快进结算
- `GET /api/game/session/{session_id}`：读取当前局完整状态

## 9. 重要注意事项

- Session 状态仅保存在后端内存，重启后会丢失
- 当前 CORS 为 `allow_origins=["*"]`，仅建议本地训练使用
- 本项目为训练工具，不构成投资建议

如果你要部署到生产环境，至少补齐：

- 用户鉴权
- 持久化 Session（Redis/DB）
- CORS 白名单
- 接口限流与审计日志
