import { useState, useRef, useEffect } from "react";
import { XMarkIcon, TrashIcon } from "../components/icons";
import { apiFetch } from "../lib/api";

const HOUR_HEIGHT = 60; // px per hour; 1 px = 1 minute
const SNAP = 5; // minutes
const MIN_DURATION = 15; // minimum block size in minutes
const COLORS = [
  "#60a5fa", "#34d399", "#a78bfa", "#f87171", "#fbbf24",
  "#2dd4bf", "#818cf8", "#f472b6", "#fb923c", "#94a3b8",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

interface TimeBlock {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  title: string;
  color: string;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function snapTo(min: number) {
  return Math.round(min / SNAP) * SNAP;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatMin(min: number) {
  if (min >= 24 * 60) return "midnight";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? "am" : "pm";
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${dh} ${period}` : `${dh}:${String(m).padStart(2, "0")} ${period}`;
}

function formatHour(h: number) {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function minToTimeValue(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function timeValueToMin(val: string): number | null {
  const [h, m] = val.split(":").map(Number);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function groupByDate(blocks: TimeBlock[]): Record<string, TimeBlock[]> {
  const out: Record<string, TimeBlock[]> = {};
  for (const b of blocks) {
    (out[b.date] ??= []).push(b);
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => a.startMin - b.startMin);
  }
  return out;
}

export default function Calendar() {
  const today = new Date();
  const [selected, setSelected] = useState(today);
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [blocks, setBlocks] = useState<Record<string, TimeBlock[]>>({});
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const [pending, setPending] = useState<{ startMin: number; endMin: number } | null>(null);
  const [editing, setEditing] = useState<TimeBlock | null>(null);
  const [liveBlock, setLiveBlock] = useState<TimeBlock | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingColor, setPendingColor] = useState(COLORS[0]);

  const isDragging = useRef(false);
  const dragAnchor = useRef(0);
  const dragRef = useRef<{ start: number; end: number } | null>(null);
  const isResizing = useRef(false);
  const resizeBlockRef = useRef<TimeBlock | null>(null);
  const resizeEdge = useRef<"start" | "end">("end");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/api/events")
      .then(r => r.json())
      .then((data: TimeBlock[]) => setBlocks(groupByDate(data)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, [selected]);

  useEffect(() => {
    function getMin(e: MouseEvent): number {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top + el.scrollTop;
      return clamp(snapTo(y / HOUR_HEIGHT * 60), 0, 24 * 60);
    }

    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current && !isResizing.current) return;
      const min = getMin(e);

      if (isDragging.current) {
        const anchor = dragAnchor.current;
        const start = Math.min(anchor, min);
        const end = Math.max(anchor, min);
        const d = { start, end: Math.max(end, start + SNAP) };
        dragRef.current = d;
        setDrag(d);
      } else if (isResizing.current && resizeBlockRef.current) {
        const block = resizeBlockRef.current;
        let updated: TimeBlock;
        if (resizeEdge.current === "end") {
          updated = { ...block, endMin: Math.max(block.startMin + MIN_DURATION, min) };
        } else {
          updated = { ...block, startMin: Math.min(block.endMin - MIN_DURATION, min) };
        }
        resizeBlockRef.current = updated;
        setLiveBlock(updated);
      }
    }

    function onMouseUp() {
      document.body.style.cursor = "";
      if (isDragging.current) {
        isDragging.current = false;
        const d = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (d && d.end > d.start) setPending({ startMin: d.start, endMin: d.end });
      } else if (isResizing.current) {
        isResizing.current = false;
        const block = resizeBlockRef.current;
        resizeBlockRef.current = null;
        setLiveBlock(null);
        if (block) {
          setBlocks(prev => ({
            ...prev,
            [block.date]: (prev[block.date] ?? []).map(b => b.id === block.id ? block : b),
          }));
          apiFetch(`/api/events/${block.id}`, {
            method: "PUT",
            body: JSON.stringify({
              date: block.date,
              start_min: block.startMin,
              end_min: block.endMin,
              title: block.title,
              color: block.color,
            }),
          });
        }
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
    };
  }, []);

  function handleGridMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top + el.scrollTop;
    const min = clamp(snapTo(y / HOUR_HEIGHT * 60), 0, 24 * 60 - SNAP);
    isDragging.current = true;
    dragAnchor.current = min;
    const d = { start: min, end: min + SNAP };
    dragRef.current = d;
    setDrag(d);
    document.body.style.cursor = "crosshair";
  }

  function startResize(block: TimeBlock, edge: "start" | "end", e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = true;
    resizeBlockRef.current = { ...block };
    resizeEdge.current = edge;
    document.body.style.cursor = edge === "end" ? "s-resize" : "n-resize";
  }

  async function saveBlock() {
    if (!pending) return;
    const r = await apiFetch("/api/events", {
      method: "POST",
      body: JSON.stringify({
        date: dateKey(selected),
        start_min: pending.startMin,
        end_min: pending.endMin,
        title: pendingTitle.trim() || "Untitled",
        color: pendingColor,
      }),
    });
    const block: TimeBlock = await r.json();
    setBlocks(prev => ({
      ...prev,
      [block.date]: [...(prev[block.date] ?? []), block].sort((a, b) => a.startMin - b.startMin),
    }));
    setPending(null);
    setPendingTitle("");
    setPendingColor(COLORS[0]);
  }

  async function saveEdit() {
    if (!editing) return;
    await apiFetch(`/api/events/${editing.id}`, {
      method: "PUT",
      body: JSON.stringify({
        date: editing.date,
        start_min: editing.startMin,
        end_min: editing.endMin,
        title: editing.title,
        color: editing.color,
      }),
    });
    setBlocks(prev => ({
      ...prev,
      [editing.date]: (prev[editing.date] ?? []).map(b => b.id === editing.id ? editing : b),
    }));
    setEditing(null);
  }

  async function deleteBlock(block: TimeBlock) {
    await apiFetch(`/api/events/${block.id}`, { method: "DELETE" });
    setBlocks(prev => ({
      ...prev,
      [block.date]: (prev[block.date] ?? []).filter(b => b.id !== block.id),
    }));
    setEditing(null);
  }

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calCells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (calCells.length % 7) calCells.push(null);

  const selectedKey = dateKey(selected);
  const todayKey = dateKey(today);
  const dayBlocks = blocks[selectedKey] ?? [];

  return (
    <div className="flex h-full select-none overflow-hidden">
      {/* Left: month calendar */}
      <div className="w-64 shrink-0 border-r border-slate-200 flex flex-col p-4 gap-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 text-base leading-none"
          >‹</button>
          <span className="text-xs font-semibold text-slate-700">
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 text-base leading-none"
          >›</button>
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {DOW.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-slate-400 pb-1">{d}</div>
          ))}
          {calCells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = dateKey(d);
            const isSel = key === selectedKey;
            const isToday = key === todayKey;
            const hasBlocks = (blocks[key] ?? []).length > 0;
            return (
              <button
                key={i}
                onClick={() => setSelected(d)}
                className={`flex flex-col items-center justify-center h-8 rounded-md text-xs transition-colors ${
                  isSel
                    ? "bg-slate-900 text-white"
                    : isToday
                    ? "bg-blue-50 text-blue-700 font-bold"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {d.getDate()}
                {hasBlocks && (
                  <span className={`block w-1 h-1 rounded-full -mt-0.5 ${isSel ? "bg-white/60" : "bg-slate-400"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: day view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-200 shrink-0">
          <p className="text-sm font-semibold text-slate-800">{formatDate(selected)}</p>
          <p className="text-xs text-slate-400 mt-0.5">Drag to create · drag edges to resize · click to edit</p>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div
              className="relative cursor-crosshair"
              style={{ height: 24 * HOUR_HEIGHT }}
              onMouseDown={handleGridMouseDown}
            >
              {/* Hour lines and labels */}
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute w-full flex pointer-events-none"
                  style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <div className="w-16 shrink-0 pr-3 flex items-start justify-end">
                    <span className="text-[11px] text-slate-400 -mt-2">{formatHour(h)}</span>
                  </div>
                  <div
                    className={`flex-1 border-t ${
                      drag && h * 60 < drag.end && (h + 1) * 60 > drag.start
                        ? "bg-blue-50 border-slate-200"
                        : "border-slate-100"
                    }`}
                  />
                </div>
              ))}

              {/* Blocks */}
              {dayBlocks.map(block => {
                const b = liveBlock?.id === block.id ? liveBlock : block;
                const top = b.startMin + 1;
                const height = Math.max(20, b.endMin - b.startMin - 2);
                const showTime = b.endMin - b.startMin >= 20;
                return (
                  <div
                    key={b.id}
                    className="absolute rounded-lg text-white text-xs shadow-sm z-10 overflow-hidden"
                    style={{ top, height, left: 68, right: 16, backgroundColor: b.color }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    {/* Top resize handle */}
                    <div
                      className="absolute top-0 left-0 right-0 h-2 cursor-n-resize z-20"
                      onMouseDown={e => startResize(block, "start", e)}
                    />
                    {/* Clickable content */}
                    <button
                      className="absolute inset-0 top-2 bottom-2 px-2.5 py-1 text-left w-full hover:brightness-110 active:brightness-95"
                      onClick={() => setEditing({ ...b })}
                    >
                      <div className="font-semibold leading-tight truncate">{b.title}</div>
                      {showTime && (
                        <div className="text-white/75 text-[10px] mt-0.5">
                          {formatMin(b.startMin)} – {formatMin(b.endMin)}
                        </div>
                      )}
                    </button>
                    {/* Bottom resize handle */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize z-20"
                      onMouseDown={e => startResize(block, "end", e)}
                    />
                  </div>
                );
              })}

              {/* Drag preview */}
              {drag && (
                <div
                  className="absolute rounded-lg pointer-events-none z-20 border-2 border-blue-400 bg-blue-400/20"
                  style={{
                    top: drag.start + 1,
                    height: Math.max(4, drag.end - drag.start - 2),
                    left: 68,
                    right: 16,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {pending && (
        <div
          className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
          onMouseDown={() => setPending(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm">New time block</h3>
              <button onClick={() => setPending(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">Start</label>
                <input
                  type="time"
                  step="300"
                  value={minToTimeValue(pending.startMin)}
                  onChange={e => {
                    const m = timeValueToMin(e.target.value);
                    if (m !== null) setPending({ ...pending, startMin: m });
                  }}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">End</label>
                <input
                  type="time"
                  step="300"
                  value={minToTimeValue(pending.endMin)}
                  onChange={e => {
                    const m = timeValueToMin(e.target.value);
                    if (m !== null) setPending({ ...pending, endMin: m });
                  }}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Block title"
              value={pendingTitle}
              onChange={e => setPendingTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") saveBlock();
                if (e.key === "Escape") setPending(null);
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex gap-2 mb-5 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    pendingColor === c ? "scale-125 ring-2 ring-offset-1 ring-slate-400" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setPendingColor(c)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPending(null)} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={saveBlock} className="flex-1 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
          onMouseDown={() => setEditing(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm">Edit time block</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">Start</label>
                <input
                  type="time"
                  step="300"
                  value={minToTimeValue(editing.startMin)}
                  onChange={e => {
                    const m = timeValueToMin(e.target.value);
                    if (m !== null) setEditing({ ...editing, startMin: m });
                  }}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">End</label>
                <input
                  type="time"
                  step="300"
                  value={minToTimeValue(editing.endMin)}
                  onChange={e => {
                    const m = timeValueToMin(e.target.value);
                    if (m !== null) setEditing({ ...editing, endMin: m });
                  }}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <input
              autoFocus
              type="text"
              value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(null);
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex gap-2 mb-5 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    editing.color === c ? "scale-125 ring-2 ring-offset-1 ring-slate-400" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setEditing({ ...editing, color: c })}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => deleteBlock(editing)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <TrashIcon className="w-4 h-4" /> Delete
              </button>
              <button onClick={saveEdit} className="flex-1 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
