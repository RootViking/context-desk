"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { TIMEFRAMES, TIMEFRAME_LABEL, type Candle, type Timeframe } from "@/domain/bars";
import { MA_LENGTHS } from "@/domain/direction";
import { bollinger, sma, stochastic } from "@/domain/indicators";

const INK = "#f4efe6";
const RULE = "#3d3832";
const SIGNAL = "#9fd0da";
const AMBER = "#e6c27a";
const CLAY = "#e7b2ab";
const SLATE = "#5c6f74";
const MA_COLORS: Record<(typeof MA_LENGTHS)[number], string> = { 20: SIGNAL, 40: AMBER, 100: "#c4bbb0", 200: CLAY };

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const ET_FULL = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });

function toDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(`${time}T12:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day, 12));
}

type Series = {
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  bands: Record<"upper" | "mid" | "lower", ISeriesApi<"Line">>;
  mas: Record<(typeof MA_LENGTHS)[number], ISeriesApi<"Line">>;
  stochK: ISeriesApi<"Line">;
  stochD: ISeriesApi<"Line">;
  stochHi: ISeriesApi<"Line">;
  stochLo: ISeriesApi<"Line">;
  markers: ISeriesMarkersPluginApi<Time>;
};

/**
 * Context chart: candles, Bollinger 20/2, the 20/40/100/200 simple averages, volume against its 20-bar
 * mean, and the 12/3 stochastic in a lower pane. Band exits are marked on the candles. Times are Eastern.
 * Data refreshes update the series in place so zoom and scroll survive. TC2000 remains the chart of record.
 */
export function PriceChart({ symbol, candlesByTf, timeframe, onTimeframe, stampLine }: { symbol: string; candlesByTf: Record<Timeframe, Candle[]>; timeframe: Timeframe; onTimeframe: (tf: Timeframe) => void; stampLine?: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Series | null>(null);
  const framedFor = useRef<string | null>(null);
  const [overlays, setOverlays] = useState({ bands: true, mas: true, exits: true, stoch: true });
  const candles = candlesByTf[timeframe];
  const daily = timeframe === "1d";

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#1e1b18" },
        textColor: INK,
        fontFamily: "var(--font-plex), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: RULE, separatorHoverColor: "#4a4440", enableResize: true },
      },
      grid: { vertLines: { color: "#262220" }, horzLines: { color: "#262220" } },
      rightPriceScale: { borderColor: RULE, scaleMargins: { top: 0.05, bottom: 0.22 } },
      timeScale: {
        borderColor: RULE,
        timeVisible: !daily,
        secondsVisible: false,
        rightOffset: 3,
        tickMarkFormatter: (time: Time) => (daily ? ET_DATE.format(toDate(time)) : ET_TIME.format(toDate(time))),
      },
      localization: { timeFormatter: (time: Time) => (daily ? ET_DATE.format(toDate(time)) : ET_FULL.format(toDate(time))) },
      crosshair: { vertLine: { color: RULE, labelBackgroundColor: RULE }, horzLine: { color: RULE, labelBackgroundColor: RULE } },
    });
    const line = (color: string, width: 1 | 2, dashed = false, pane = 0) =>
      chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: SIGNAL,
      downColor: CLAY,
      borderUpColor: SIGNAL,
      borderDownColor: CLAY,
      wickUpColor: SIGNAL,
      wickDownColor: CLAY,
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });
    const series: Series = {
      bands: { upper: line(SLATE, 1), lower: line(SLATE, 1), mid: line(AMBER, 1) },
      mas: { 200: line(MA_COLORS[200], 1, true), 100: line(MA_COLORS[100], 1, true), 40: line(MA_COLORS[40], 1), 20: line(MA_COLORS[20], 2) },
      candles: candleSeries,
      volume,
      stochHi: line("#4a4440", 1, true, 1),
      stochLo: line("#4a4440", 1, true, 1),
      stochD: line(AMBER, 1, false, 1),
      stochK: line(SIGNAL, 1, false, 1),
      markers: createSeriesMarkers(candleSeries, []),
    };
    const panes = chart.panes();
    if (panes[1]) panes[1].setHeight(90);
    chartRef.current = chart;
    seriesRef.current = series;
    framedFor.current = null;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [daily]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const closes = candles.map((c) => c.close);
    const toTime = (c: Candle): Time => (daily ? (new Date(c.time * 1000).toISOString().slice(0, 10) as Time) : (c.time as UTCTimestamp));
    series.candles.setData(candles.map((c) => ({ time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close })));
    const vols = candles.map((c) => c.volume ?? 0);
    const volMean = sma(vols, 20);
    series.volume.setData(
      candles.map((c, i) => {
        const v = c.volume ?? 0;
        const hot = volMean[i] !== null && v >= (volMean[i] as number) * 2;
        return { time: toTime(c), value: v, color: hot ? (c.close >= c.open ? "#9fd0da" : "#e7b2ab") : c.close >= c.open ? "rgba(159,208,218,0.35)" : "rgba(231,178,171,0.35)" };
      }),
    );
    const bands = bollinger(closes);
    for (const key of ["upper", "mid", "lower"] as const) {
      series.bands[key].setData(overlays.bands ? candles.flatMap((c, i) => (bands[i] ? [{ time: toTime(c), value: bands[i]![key] }] : [])) : []);
    }
    for (const len of MA_LENGTHS) {
      const values = overlays.mas ? sma(closes, len) : [];
      series.mas[len].setData(overlays.mas ? candles.flatMap((c, i) => (values[i] === null ? [] : [{ time: toTime(c), value: values[i]! }])) : []);
    }
    const st = stochastic(candles);
    series.stochK.setData(overlays.stoch ? candles.flatMap((c, i) => (st.k[i] === null ? [] : [{ time: toTime(c), value: st.k[i]! }])) : []);
    series.stochD.setData(overlays.stoch ? candles.flatMap((c, i) => (st.d[i] === null ? [] : [{ time: toTime(c), value: st.d[i]! }])) : []);
    series.stochHi.setData(overlays.stoch ? candles.map((c) => ({ time: toTime(c), value: 80 })) : []);
    series.stochLo.setData(overlays.stoch ? candles.map((c) => ({ time: toTime(c), value: 20 })) : []);
    const markers: SeriesMarker<Time>[] = [];
    if (overlays.exits) {
      candles.forEach((c, i) => {
        const b = bands[i];
        if (!b) return;
        const before = bands[i - 2];
        const widening = !!before && b.bandwidth > before.bandwidth * 1.03;
        if (c.close > b.upper) markers.push({ time: toTime(c), position: "belowBar", color: widening ? SIGNAL : SLATE, shape: widening ? "arrowUp" : "circle", size: widening ? 1 : 0.5 });
        else if (c.close < b.lower) markers.push({ time: toTime(c), position: "aboveBar", color: widening ? CLAY : SLATE, shape: widening ? "arrowDown" : "circle", size: widening ? 1 : 0.5 });
      });
    }
    series.markers.setMarkers(markers);
    const key = `${symbol}|${timeframe}`;
    if (candles.length && framedFor.current !== key) {
      framedFor.current = key;
      const visible = daily ? 160 : 130;
      if (candles.length > visible) chart.timeScale().setVisibleLogicalRange({ from: candles.length - visible, to: candles.length + 3 });
      else chart.timeScale().fitContent();
    }
  }, [candles, daily, overlays, symbol, timeframe]);

  const lastClose = candles.length ? candles[candles.length - 1].close : null;

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <div className="filters" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button key={tf} type="button" className={tf === timeframe ? "chip chip-on" : "chip"} aria-pressed={tf === timeframe} onClick={() => onTimeframe(tf)}>
              {TIMEFRAME_LABEL[tf]}
            </button>
          ))}
          {lastClose !== null ? <span className="mono chart-last">{lastClose.toFixed(2)}</span> : null}
        </div>
        <div className="filters">
          {(
            [
              ["bands", "Bands 20,2"],
              ["mas", "MAs"],
              ["exits", "Exit marks"],
              ["stoch", "Stoch 12/3"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="meta">
              <input type="checkbox" checked={overlays[key]} onChange={(e) => setOverlays({ ...overlays, [key]: e.target.checked })} /> {label}
            </label>
          ))}
        </div>
      </div>
      <div ref={host} className="chart-host" role="img" aria-label={`${symbol} ${TIMEFRAME_LABEL[timeframe]} candles with Bollinger Bands, moving averages, volume, and stochastic`} />
      <p className="meta chart-legend">
        <span style={{ color: SIGNAL }}>■</span> 20 · <span style={{ color: AMBER }}>■</span> 40 and band mid · <span style={{ color: "#c4bbb0" }}>■</span> 100 · <span style={{ color: CLAY }}>■</span> 200 · bands slate · bright volume bars are 2× their 20-bar mean · arrows mark closes outside the bands while they widen, dots when they do not.
        {stampLine ? ` ${stampLine}` : ""} Eastern time. Not TC2000.
      </p>
    </div>
  );
}
