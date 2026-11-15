"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { TIMEFRAMES, TIMEFRAME_LABEL, type Candle, type Timeframe } from "@/domain/bars";
import { MA_LENGTHS } from "@/domain/direction";
import { bollinger, sma } from "@/domain/indicators";

const INK = "#f4efe6";
const RULE = "#3d3832";
const SIGNAL = "#9fd0da";
const AMBER = "#e6c27a";
const CLAY = "#e7b2ab";
const MA_COLORS: Record<(typeof MA_LENGTHS)[number], string> = { 20: SIGNAL, 40: AMBER, 100: "#c4bbb0", 200: CLAY };

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const ET_FULL = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });

function toDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(`${time}T12:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day, 12));
}

/**
 * Delayed context chart: candles, Bollinger 20/2, and the 20/40/100/200 simple averages.
 * Times are drawn in Eastern. TC2000 remains the chart of record; this one has no drawing tools.
 */
export function PriceChart({ symbol, candlesByTf, timeframe, onTimeframe }: { symbol: string; candlesByTf: Record<Timeframe, Candle[]>; timeframe: Timeframe; onTimeframe: (tf: Timeframe) => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [overlays, setOverlays] = useState({ bands: true, mas: true });
  const candles = candlesByTf[timeframe];
  const daily = timeframe === "1d";

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#1e1b18" }, textColor: INK, fontFamily: "var(--font-plex), ui-monospace, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#262220" }, horzLines: { color: "#262220" } },
      rightPriceScale: { borderColor: RULE },
      timeScale: {
        borderColor: RULE,
        timeVisible: !daily,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => (daily ? ET_DATE.format(toDate(time)) : ET_TIME.format(toDate(time))),
      },
      localization: { timeFormatter: (time: Time) => (daily ? ET_DATE.format(toDate(time)) : ET_FULL.format(toDate(time))) },
      crosshair: { vertLine: { color: RULE, labelBackgroundColor: RULE }, horzLine: { color: RULE, labelBackgroundColor: RULE } },
      handleScale: { axisPressedMouseMove: true },
    });
    chartRef.current = chart;
    const closes = candles.map((c) => c.close);
    const toTime = (c: Candle): Time => (daily ? (new Date(c.time * 1000).toISOString().slice(0, 10) as Time) : (c.time as UTCTimestamp));
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: SIGNAL,
      downColor: CLAY,
      borderUpColor: SIGNAL,
      borderDownColor: CLAY,
      wickUpColor: SIGNAL,
      wickDownColor: CLAY,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    candleSeries.setData(candles.map((c) => ({ time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close })));
    if (overlays.bands) {
      const bands = bollinger(closes);
      for (const key of ["upper", "mid", "lower"] as const) {
        const line = chart.addSeries(LineSeries, { color: key === "mid" ? AMBER : "#5c6f74", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        line.setData(candles.flatMap((c, i) => (bands[i] ? [{ time: toTime(c), value: bands[i]![key] }] : [])));
      }
    }
    if (overlays.mas) {
      for (const len of MA_LENGTHS) {
        const values = sma(closes, len);
        const line = chart.addSeries(LineSeries, { color: MA_COLORS[len], lineWidth: len === 20 ? 2 : 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineStyle: len >= 100 ? 2 : 0 });
        line.setData(candles.flatMap((c, i) => (values[i] === null ? [] : [{ time: toTime(c), value: values[i]! }])));
      }
    }
    const visible = daily ? 160 : 130;
    if (candles.length > visible) chart.timeScale().setVisibleLogicalRange({ from: candles.length - visible, to: candles.length + 3 });
    else chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, daily, overlays]);

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <div className="filters" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button key={tf} type="button" className={tf === timeframe ? "chip chip-on" : "chip"} aria-pressed={tf === timeframe} onClick={() => onTimeframe(tf)}>
              {TIMEFRAME_LABEL[tf]}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="meta">
            <input type="checkbox" checked={overlays.bands} onChange={(e) => setOverlays({ ...overlays, bands: e.target.checked })} /> Bands 20,2
          </label>
          <label className="meta">
            <input type="checkbox" checked={overlays.mas} onChange={(e) => setOverlays({ ...overlays, mas: e.target.checked })} /> MAs 20/40/100/200
          </label>
        </div>
      </div>
      <div ref={host} className="chart-host" role="img" aria-label={`${symbol} ${TIMEFRAME_LABEL[timeframe]} delayed candles with Bollinger Bands and moving averages`} />
      <p className="meta chart-legend">
        <span style={{ color: SIGNAL }}>■</span> 20 · <span style={{ color: AMBER }}>■</span> 40 and band mid · <span style={{ color: "#c4bbb0" }}>■</span> 100 · <span style={{ color: CLAY }}>■</span> 200 · bands in slate. Eastern time. Delayed context, not TC2000.
      </p>
    </div>
  );
}
