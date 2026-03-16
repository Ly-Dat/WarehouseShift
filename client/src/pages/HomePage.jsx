import { useState, useEffect, useRef } from "react";

const SHEET_URL  = import.meta.env.VITE_SHEET_URL;
const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL;

const DAYS_VN = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SHIFTS  = ['Sáng','Chiều','Tối'];
const SHIFT_STYLES = [
  { bg: '#FEF3C7', text: '#92400E', label: 'Morning Shift'   },
  { bg: '#DBEAFE', text: '#1E40AF', label: 'Afternoon Shift' },
  { bg: '#EDE9FE', text: '#5B21B6', label: 'Evening Shift'   },
];
const AVATAR_COLORS = ['#DBEAFE','#D1FAE5','#FEF3C7','#FCE7F3','#EDE9FE','#FFE4E6'];
const AVATAR_TEXT   = ['#1E40AF','#065F46','#92400E','#9D174D','#5B21B6','#9F1239'];

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function parseDate(str) {
  if (!str) return null;
  const p = str.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[1]-1, +p[0]) : new Date(str);
}

function parseTimestamp(str) {
  if (!str) return new Date(0);
  const [datePart, timePart] = str.trim().split(' ');
  if (!datePart) return new Date(0);
  const [dd, mm, yyyy] = datePart.split('/');
  if (!yyyy) return new Date(str);
  return new Date(`${yyyy}-${mm}-${dd}T${timePart || '00:00:00'}`);
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  function parseLine(line) {
    const result = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  }
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = parseLine(line);
    if (cols.every(c => !c)) return null;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  }).filter(Boolean);
}

function normalizeKey(str) { return str.trim().replace(/\s+/g, ' '); }

function deduplicateRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.name}|||${row.applyDate}`;
    const existing = map.get(key);
    if (!existing || row.timestamp > existing.timestamp) map.set(key, row);
  }
  return [...map.values()];
}

function processSheetData(rawRows) {
  const normalized = rawRows.map(row => {
    const clean = {};
    Object.keys(row).forEach(k => { clean[normalizeKey(k)] = row[k]; });
    return clean;
  });
  const data = normalized.map(row => {
    const name = (row['Tên nhân viên'] || '').trim();
    if (!name) return null;
    const applyDate = (row['Ngày áp dụng'] || '').trim();
    const timestamp = parseTimestamp((row['Dấu thời gian'] || '').trim());
    const days = DAYS_VN.map(dayKey => {
      const val = row[`Ngày bạn rảnh [${dayKey}]`] || '';
      return val.split(',').map(s => s.trim()).filter(Boolean);
    });
    return { name, applyDate, timestamp, days };
  }).filter(Boolean);
  const deduped = deduplicateRows(data);
  return { data: deduped, employees: [...new Set(deduped.map(r => r.name))] };
}

function getRelevantRows(allData, weekStartDate) {
  const weekStart = getWeekStart(weekStartDate);
  const weekEnd   = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const inWeek = allData.filter(r => {
    const d = parseDate(r.applyDate);
    return d && d >= weekStart && d <= weekEnd;
  });
  if (!inWeek.length) return [];
  const latestTs = Math.max(...inWeek.map(r => parseDate(r.applyDate).getTime()));
  return inWeek.filter(r => parseDate(r.applyDate).getTime() === latestTs);
}

function getAvailability(allData, empName, dayIndex, weekStart) {
  const rows   = getRelevantRows(allData, weekStart);
  const empRow = rows.find(r => r.name === empName);
  return empRow ? (empRow.days[dayIndex] || []) : [];
}

function buildWeekAssignments(allAssignments, weekKey) {
  const obj = {};
  for (const a of allAssignments) {
    if (a.weekStart === weekKey) {
      obj[`${a.emp}|${a.shift}|${a.dayIndex}`] = true;
    }
  }
  return obj;
}

function mergeIntoAll(allAssignments, weekKey, weekAssignments) {
  const filtered = allAssignments.filter(a => a.weekStart !== weekKey);
  const newEntries = Object.entries(weekAssignments)
    .filter(([, v]) => v)
    .map(([key]) => {
      const [emp, shift, dayIndex] = key.split('|');
      return { weekStart: weekKey, emp, shift, dayIndex: Number(dayIndex) };
    });
  return [...filtered, ...newEntries];
}

function assignmentsToArray(weekAssignments) {
  return Object.entries(weekAssignments)
    .filter(([, v]) => v)
    .map(([key]) => {
      const [emp, shift, dayIndex] = key.split('|');
      return { emp, shift, dayIndex: Number(dayIndex) };
    });
}

async function fetchAllAssignments() {
  const res  = await fetch(SCRIPT_URL, { redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Bad response: ${text.slice(0, 200)}`); }
}

function Avatar({ name, index }) {
  const bg    = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const color = AVATAR_TEXT[index % AVATAR_TEXT.length];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: bg, color, fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function ShiftCell({ available, assigned, isToday, onClick }) {
  const [hovered, setHovered] = useState(false);
  let bg = 'transparent';
  if (!available)    bg = '#F3F4F6';
  else if (assigned) bg = '#D1FAE5';
  else if (hovered)  bg = '#ffffff';
  else if (isToday)  bg = 'rgba(59,130,246,0.04)';
  return (
    <div
      onClick={available ? onClick : undefined}
      onMouseEnter={() => available && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, cursor: available ? 'pointer' : 'default', borderRight: '0.5px solid #E5E7EB', transition: 'background 0.1s' }}
    >
      {!available && <span style={{ color: '#D1D5DB', fontSize: 20 }}>—</span>}
      {available && assigned && <span style={{ color: '#065F46', fontSize: 16, fontWeight: 500 }}>✓</span>}
    </div>
  );
}

export default function HomePage() {
  const [allData,        setAllData]        = useState([]);
  const [employees,      setEmployees]      = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const savedAllRef = useRef([]);

  // Employee order — persisted to localStorage
  const dragRef  = useRef({ dragIdx: null, touchY: 0, rowHeights: [] });
  const EMP_ORDER_KEY = 'shiftSchedule_empOrder';

  const [weekStart,          setWeekStart]          = useState(() => getWeekStart(new Date()));
  const [loading,            setLoading]            = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [error,              setError]              = useState('');
  const [loadError,          setLoadError]          = useState('');
  const [saveStatus,         setSaveStatus]         = useState('idle');

  useEffect(() => {
    async function fetchSheet() {
      try {
        const res  = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const { data, employees: emps } = processSheetData(parseCSV(text));
        setAllData(data);
        // Apply saved order from localStorage
        try {
          const saved = JSON.parse(localStorage.getItem(EMP_ORDER_KEY) || '[]');
          if (saved.length) {
            const ordered = [
              ...saved.filter(n => emps.includes(n)),
              ...emps.filter(n => !saved.includes(n)),
            ];
            setEmployees(ordered);
          } else {
            setEmployees(emps);
          }
        } catch { setEmployees(emps); }
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    }
    fetchSheet();
  }, []);

  useEffect(() => {
    if (!SCRIPT_URL) { setLoadingAssignments(false); return; }
    async function load() {
      setLoadingAssignments(true);
      setLoadError('');
      try {
        const json = await fetchAllAssignments();
        const data = (json && Array.isArray(json.assignments)) ? json.assignments : [];
        setAllAssignments(data);
        savedAllRef.current = data.map(a => ({ ...a }));  // deep copy
      } catch (e) { setLoadError(e.message); }
      finally { setLoadingAssignments(false); }
    }
    load();
  }, []);

  const weekKey              = formatDate(weekStart);
  const weekAssignments      = buildWeekAssignments(allAssignments, weekKey);
  const savedWeekAssignments = buildWeekAssignments(savedAllRef.current, weekKey);
  // Sort keys before comparing to avoid false positives from insertion order differences
  function stableKeys(obj) { return Object.keys(obj).filter(k => obj[k]).sort().join(','); }
  const hasChanges = stableKeys(weekAssignments) !== stableKeys(savedWeekAssignments);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const todayIdx = weekDates.findIndex(d => d.getTime() === today.getTime());
  const weekEnd  = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  const applyRows  = getRelevantRows(allData, weekStart);
  const applyLabel = applyRows.length
    ? `Applying availability from: ${applyRows[0].applyDate}`
    : allData.length ? 'No availability data for this week' : '';

  const totalAssigned = Object.values(weekAssignments).filter(Boolean).length;
  const assignedEmps  = new Set(Object.keys(weekAssignments).filter(k => weekAssignments[k]).map(k => k.split('|')[0])).size;

  function toggle(emp, shift, day) {
    const key = `${emp}|${shift}|${day}`;
    setAllAssignments(prev => {
      const cur     = buildWeekAssignments(prev, weekKey);
      const updated = { ...cur, [key]: !cur[key] };
      return mergeIntoAll(prev, weekKey, updated);
    });
    setSaveStatus('idle');
  }

  // Toggle select-all: if all available slots are ticked → clear all, else select all
  function toggleSelectAll() {
    setAllAssignments(prev => {
      const cur     = buildWeekAssignments(prev, weekKey);
      const updated = { ...cur };
      if (allWeekSelected) {
        // Clear all available slots for this week
        for (const emp of employees) {
          for (let di = 0; di < 7; di++) {
            const avail = getAvailability(allData, emp, di, weekStart);
            for (const shift of avail) {
              updated[`${emp}|${shift}|${di}`] = false;
            }
          }
        }
      } else {
        // Select all available slots for this week
        for (const emp of employees) {
          for (let di = 0; di < 7; di++) {
            const avail = getAvailability(allData, emp, di, weekStart);
            for (const shift of avail) {
              updated[`${emp}|${shift}|${di}`] = true;
            }
          }
        }
      }
      return mergeIntoAll(prev, weekKey, updated);
    });
    setSaveStatus('idle');
  }

  // True when every available slot in the week is already ticked
  const allWeekSelected = employees.length > 0 && employees.every(emp =>
    [0,1,2,3,4,5,6].every(di => {
      const avail = getAvailability(allData, emp, di, weekStart);
      return avail.every(shift => weekAssignments[`${emp}|${shift}|${di}`]);
    })
  );

  async function handleSave() {
    if (!SCRIPT_URL) { alert('VITE_SCRIPT_URL chưa được thiết lập trong .env'); return; }
    setSaveStatus('saving');
    try {
      const payload = { weekStart: weekKey, assignments: assignmentsToArray(weekAssignments) };
      const res  = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.ok) {
        savedAllRef.current = mergeIntoAll(savedAllRef.current, weekKey, weekAssignments);
        // Persist employee order
        try { localStorage.setItem(EMP_ORDER_KEY, JSON.stringify(employees)); } catch {}
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else throw new Error(json.error || 'Unknown error');
    } catch (e) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  async function handleReload() {
    if (!SCRIPT_URL) return;
    setLoadingAssignments(true);
    setLoadError('');
    try {
      const json = await fetchAllAssignments();
      const data = (json && Array.isArray(json.assignments)) ? json.assignments : [];
      setAllAssignments(data);
      savedAllRef.current = data.map(a => ({ ...a }));  // deep copy
    } catch (e) { setLoadError(e.message); }
    finally { setLoadingAssignments(false); }
  }

  // Reorder employees via drag-and-drop
  function moveEmployee(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    setEmployees(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  // Build tab-separated text for pasting into Excel
  // Format matches the image: each shift section has employee rows, columns = days
  function buildExcelText() {
    const lines = [];
    for (const shift of SHIFTS) {
      // One row per employee
      for (const emp of employees) {
        const cells = [];
        for (let di = 0; di < 7; di++) {
          const avail = getAvailability(allData, emp, di, weekStart);
          const key   = `${emp}|${shift}|${di}`;
          // Show name if assigned, empty if not
          cells.push(avail.includes(shift) && weekAssignments[key] ? emp : '');
        }
        lines.push(cells.join('	'));
      }
      // Empty separator row between shifts
      lines.push('						');
    }
    return lines.join('\r\n');  // CRLF for Excel
  }

  const [copyStatus, setCopyStatus] = useState('idle');
  async function handleCopy() {
    const text = buildExcelText();
    const done = () => { setCopyStatus('copied'); setTimeout(() => setCopyStatus('idle'), 2000); };
    try {
      // Use ClipboardItem with text/plain so Excel/Sheets respects CRLF
      if (navigator.clipboard && window.ClipboardItem) {
        const blob = new Blob([text], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      done();
    } catch {
      // Fallback textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    }
  }

  const col = 'minmax(0,180px) repeat(7, minmax(0,1fr))';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: 'system-ui, sans-serif', color: '#6B7280' }}>
      Loading schedule...
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 600, margin: '4rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '14px 16px', borderRadius: 8, fontSize: 14 }}>
        Failed to load sheet: {error}
      </div>
    </div>
  );

  // When there are unsaved changes, show orange; otherwise blue
  const effectiveStatus = (saveStatus === 'idle' && hasChanges) ? 'unsaved' : saveStatus;
  const saveBtnStyle = {
    unsaved:{ bg: '#F97316', border: '#EA6C00', color: '#fff',    label: 'Save'                },
    idle:   { bg: '#2563EB', border: '#1D4ED8', color: '#fff',    label: 'Save'                },
    saving: { bg: '#93C5FD', border: '#93C5FD', color: '#fff',    label: 'Saving...'           },
    saved:  { bg: '#D1FAE5', border: '#059669', color: '#065F46', label: '✓ Saved'             },
    error:  { bg: '#FEF2F2', border: '#EF4444', color: '#B91C1C', label: 'Save failed — retry' },
  }[effectiveStatus];

  return (
    <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#111827', margin: 0 }}>Shift Schedule</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{applyLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { bg: '#D1FAE5', border: '#059669', label: 'Assigned'    },
            { bg: '#fff',    border: '#D1D5DB', label: 'Available'   },
            { bg: '#F3F4F6', border: '#E5E7EB', label: 'Unavailable' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.bg, border: `1px solid ${l.border}` }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Shifts assigned',     value: totalAssigned },
          { label: 'Employees scheduled', value: assignedEmps  },
        ].map(s => (
          <div key={s.label} style={{ background: '#F9FAFB', borderRadius: 8, padding: '14px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#111827' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Week nav + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['‹ Prev', 'Next ›'].map((label, i) => (
            <button key={label} onClick={() => setWeekStart(ws => {
              const d = new Date(ws); d.setDate(d.getDate() + (i === 0 ? -7 : 7)); return d;
            })} style={{ padding: '6px 14px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              {label}
            </button>
          ))}
          <span style={{ fontSize: 14, fontWeight: 500, color: '#111827', minWidth: 180, textAlign: 'center' }}>
            {formatDate(weekStart)} – {formatDate(weekEnd)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setWeekStart(getWeekStart(new Date()))}
            style={{ padding: '6px 14px', border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#2563EB' }}>
            Today
          </button>

          {/* Toggle select/deselect all available shifts for the week */}
          <button
            onClick={toggleSelectAll}
            style={{
              padding: '6px 14px',
              border: `1px solid ${allWeekSelected ? '#059669' : '#D1D5DB'}`,
              background: allWeekSelected ? '#D1FAE5' : '#fff',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              color: allWeekSelected ? '#065F46' : '#374151',
              transition: 'all 0.15s',
            }}
          >
            {allWeekSelected ? 'Deselect all' : 'Select all'}
          </button>

          {/* Copy to clipboard for Excel */}
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 14px',
              border: `1px solid ${copyStatus === 'copied' ? '#059669' : '#D1D5DB'}`,
              background: copyStatus === 'copied' ? '#D1FAE5' : '#fff',
              borderRadius: 8, cursor: 'pointer', fontSize: 13,
              color: copyStatus === 'copied' ? '#065F46' : '#374151',
              transition: 'all 0.2s',
            }}
          >
            {copyStatus === 'copied' ? '✓ Copied' : 'Copy'}
          </button>

          {/* Save button — orange when unsaved, blue when saved/idle */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || loadingAssignments}
            style={{
              padding: '6px 18px',
              border: `1px solid ${saveBtnStyle.border}`,
              background: saveBtnStyle.bg,
              color: saveBtnStyle.color,
              borderRadius: 8,
              cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 500,
              transition: 'all 0.2s',
              opacity: (saveStatus === 'saving' || loadingAssignments) ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saveStatus === 'saving' && (
              <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            )}
            {saveBtnStyle.label}
          </button>
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ Could not load assignments: {loadError}</span>
          <button onClick={handleReload} style={{ marginLeft: 12, padding: '3px 10px', background: '#FEF2F2', border: '1px solid #EF4444', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#B91C1C' }}>Retry</button>
        </div>
      )}

      {loadingAssignments && (
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, border: '2px solid #D1D5DB', borderTopColor: '#6B7280', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          Loading assignments...
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 640, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>

          <div style={{ display: 'grid', gridTemplateColumns: col, background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '0.5px solid #E5E7EB' }}>Employee</div>
            {weekDates.map((d, i) => (
              <div key={i} style={{ padding: '10px 8px', textAlign: 'center', background: i === todayIdx ? '#EFF6FF' : 'transparent', borderRight: i < 6 ? '0.5px solid #E5E7EB' : 'none' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: i === todayIdx ? '#2563EB' : '#9CA3AF' }}>{DAYS_EN[i]}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: i === todayIdx ? '#2563EB' : '#111827', marginTop: 2 }}>{d.getDate()}/{d.getMonth()+1}</div>
              </div>
            ))}
          </div>

          {SHIFTS.map((shift, si) => (
            <div key={shift}>
              <div style={{ padding: '8px 16px', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', background: SHIFT_STYLES[si].bg, color: SHIFT_STYLES[si].text, borderTop: '0.5px solid #E5E7EB' }}>
                {SHIFT_STYLES[si].label}
              </div>
              {employees.map((emp, ei) => (
                <div key={emp} style={{ display: 'grid', gridTemplateColumns: col, borderBottom: '0.5px solid #E5E7EB' }}>
                  <div
                    draggable={si === 0}
                    onDragStart={si === 0 ? () => { dragRef.current.dragIdx = ei; } : undefined}
                    onDragOver={si === 0 ? (e) => e.preventDefault() : undefined}
                    onDrop={si === 0 ? (e) => { e.preventDefault(); moveEmployee(dragRef.current.dragIdx, ei); dragRef.current.dragIdx = null; } : undefined}
                    onTouchStart={si === 0 ? (e) => {
                      dragRef.current.dragIdx = ei;
                      dragRef.current.touchY  = e.touches[0].clientY;
                      // Snapshot row top positions for all employee rows in Morning Shift
                      const rows = document.querySelectorAll('[data-emp-row]');
                      dragRef.current.rowTops = Array.from(rows).map(r => r.getBoundingClientRect().top);
                    } : undefined}
                    onTouchMove={si === 0 ? (e) => {
                      e.preventDefault(); // prevent page scroll while dragging
                      dragRef.current.touchY = e.touches[0].clientY;
                    } : undefined}
                    onTouchEnd={si === 0 ? () => {
                      const { dragIdx, touchY, rowTops } = dragRef.current;
                      if (dragIdx === null || !rowTops) return;
                      // Find which row the finger landed on
                      let toIdx = rowTops.length - 1;
                      for (let i = 0; i < rowTops.length; i++) {
                        if (touchY < rowTops[i] + 24) { toIdx = i; break; }
                      }
                      moveEmployee(dragIdx, toIdx);
                      dragRef.current.dragIdx = null;
                    } : undefined}
                    data-emp-row={si === 0 ? ei : undefined}
                    style={{
                      padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 13, color: '#111827', minHeight: 48,
                      borderRight: '0.5px solid #E5E7EB',
                      cursor: si === 0 ? 'grab' : 'default',
                      userSelect: 'none', touchAction: si === 0 ? 'none' : 'auto',
                    }}
                  >
                    {si === 0 && (
                      <span style={{ color: '#D1D5DB', fontSize: 14, flexShrink: 0, marginRight: -4 }}>⠿</span>
                    )}
                    <Avatar name={emp} index={ei} />
                    {emp}
                  </div>
                  {weekDates.map((_, di) => {
                    const avail = getAvailability(allData, emp, di, weekStart);
                    const key   = `${emp}|${shift}|${di}`;
                    return (
                      <ShiftCell
                        key={di}
                        available={avail.includes(shift)}
                        assigned={!!weekAssignments[key]}
                        isToday={di === todayIdx}
                        onClick={() => toggle(emp, shift, di)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}