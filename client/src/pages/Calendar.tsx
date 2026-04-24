import { useState, useRef, useEffect } from "react";
import { XMarkIcon, TrashIcon } from "../components/icons";
import { apiFetch } from "../lib/api";

const HOUR_HEIGHT = 56;
const COLORS = [
  "#60a5fa", "#34d399", "#a78bfa", "#f87171", "#fbbf24",
  "#2dd4bf", "#818cf8", "#f472b6", "#fb923c", "#94a3b8",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

interface TimeBlock {
  id: string;
  date: string;
  startHour: number;
  endHour: number;
  title: string;
  color: string;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHour(h: number) {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
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
    out[key].sort((a, b) => a.startHour - b.startHour);
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
  const [pending, setPending] = useState<{ startHour: number; endHour: number } | null>(null);
  const [editing, setEditing] = useState<TimeBlock | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingColor, setPendingColor] = useState(COLORS[0]);

  const isDragging = useRef(false);
  const dragAnchor = useRef(0);
  const dragRef = useRef<{ start: number; end: number } | null>(null);
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
    function onMouseUp() {
      if (!isDragging.current) return;
      isDragging.current = false;
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d) setPending({ startHour: d.start, endHour: d.end });
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  function startDrag(hour: number) {
    isDragging.current = true;
    dragAnchor.current = hour;
    const d = { start: hour, end: hour + 1 };
    dragRef.current = d;
    setDrag(d);
  }

  function moveDrag(hour: number) {
    if (!isDragging.current) return;
    const start = Math.min(dragAnchor.current, hour);
    const end = Math.max(dragAnchor.current, hour) + 1;
    const d = { start, end };
    dragRef.current = d;
    setDrag(d);
  }

  async function saveBlock() {
    if (!pending) return;
    const r = await apiFetch("/api/events", {
      method: "POST",
      body: JSON.stringify({
        date: dateKey(selected),
        start_hour: pending.startHour,
        end_hour: pending.endHour,
        title: pendingTitle.trim() || "Untitled",
        color: pendingColor,
      }),
    });
    const block: TimeBlock = await r.json();
    setBlocks(prev => ({
      ...prev,
      [block.date]: [...(prev[block.date] ?? []), block].sort((a, b) => a.startHour - b.startHour),
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
        start_hour: editing.startHour,
        end_hour: editing.endHour,
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
          <p className="text-xs text-slate-400 mt-0.5">Drag to create a block · click a block to edit</p>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute w-full flex"
                  style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  onMouseDown={() => startDrag(h)}
                  onMouseEnter={() => moveDrag(h)}
                >
                  <div className="w-16 shrink-0 pr-3 flex items-start justify-end pointer-events-none">
                    <span className="text-[11px] text-slate-400 -mt-2">{formatHour(h)}</span>
                  </div>
                  <div
                    className={`flex-1 border-t cursor-crosshair transition-colors ${
                      drag && h >= drag.start && h < drag.end
                        ? "bg-blue-50 border-slate-200"
                        : "border-slate-100 hover:bg-slate-50/60"
                    }`}
                  />
                </div>
              ))}

              {dayBlocks.map(block => (
                <button
                  key={block.id}
                  className="absolute rounded-lg px-2.5 py-1.5 text-left text-white text-xs shadow-sm z-10 overflow-hidden hover:brightness-110 active:brightness-95 transition-all"
                  style={{
                    top: block.startHour * HOUR_HEIGHT + 2,
                    height: (block.endHour - block.startHour) * HOUR_HEIGHT - 4,
                    left: 68,
                    right: 16,
                    backgroundColor: block.color,
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setEditing({ ...block })}
                >
                  <div className="font-semibold leading-tight truncate">{block.title}</div>
                  <div className="text-white/75 text-[10px] mt-0.5">
                    {formatHour(block.startHour)} – {formatHour(block.endHour)}
                  </div>
                </button>
              ))}

              {drag && (
                <div
                  className="absolute rounded-lg pointer-events-none z-20 border-2 border-blue-400 bg-blue-400/20"
                  style={{
                    top: drag.start * HOUR_HEIGHT + 2,
                    height: (drag.end - drag.start) * HOUR_HEIGHT - 4,
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
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-800 text-sm">New time block</h3>
              <button onClick={() => setPending(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {formatHour(pending.startHour)} – {formatHour(pending.endHour)}
            </p>
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
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-800 text-sm">Edit time block</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {formatHour(editing.startHour)} – {formatHour(editing.endHour)}
            </p>
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
