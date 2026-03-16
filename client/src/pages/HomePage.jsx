import { useState, useEffect, useRef } from "react";

const SHEET_URL  = import.meta.env.VITE_SHEET_URL;
const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL;

const DAYS_VN = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const DAYS_EN = ['T2','T3','T4','T5','T6','T7','CN'];
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

// ─── Auto-select algorithm ────────────────────────────────────────────────────
function autoSelectOptimal({ allData, employees, weekStart, weekKey, targets, currentAssignments, allAssignmentsHistory }) {
  const historicalCount = {};
  for (const emp of employees) historicalCount[emp] = 0;
  for (const a of allAssignmentsHistory) {
    if (a.weekStart !== weekKey && historicalCount[a.emp] !== undefined) {
      historicalCount[a.emp] = (historicalCount[a.emp] || 0) + 1;
    }
  }
  const result = { ...currentAssignments };
  function weekCount(emp) {
    let c = 0;
    for (const s of SHIFTS) for (let d = 0; d < 7; d++) if (result[`${emp}|${s}|${d}`]) c++;
    return c;
  }
  for (const shift of SHIFTS) {
    for (let di = 0; di < 7; di++) {
      const target = targets[di] ?? 0;
      const available = employees.filter(emp => {
        const avail = getAvailability(allData, emp, di, weekStart);
        return avail.includes(shift);
      });
      const assigned   = available.filter(emp =>  result[`${emp}|${shift}|${di}`]);
      const unassigned = available.filter(emp => !result[`${emp}|${shift}|${di}`]);
      const currentCount = assigned.length;
      if (currentCount < target) {
        const sorted = [...unassigned].sort((a, b) => {
          const wDiff = weekCount(a) - weekCount(b);
          if (wDiff !== 0) return wDiff;
          return (historicalCount[a] || 0) - (historicalCount[b] || 0);
        });
        const toAdd = target - currentCount;
        for (let i = 0; i < Math.min(toAdd, sorted.length); i++) {
          result[`${sorted[i]}|${shift}|${di}`] = true;
        }
      } else if (currentCount > target) {
        const sorted = [...assigned].sort((a, b) => {
          const wDiff = weekCount(b) - weekCount(a);
          if (wDiff !== 0) return wDiff;
          return (historicalCount[b] || 0) - (historicalCount[a] || 0);
        });
        const toCut = currentCount - target;
        for (let i = 0; i < toCut; i++) {
          result[`${sorted[i]}|${shift}|${di}`] = false;
        }
      }
    }
  }
  return result;
}

// ─── Parse Excel paste (for personal data modal) ──────────────────────────────
function parseExcelPaste(text, forcedEmpCount = 0) {
  const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n').map(l => l.split('\t').map(c => c.trim()));
  if (lines.length < 2) return null;

  const isBlankLine = line => line.every(c => !c);

  let dateRow = -1, dayRow = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (dateRow < 0 && /\d{2}\/\d{2}\/\d{4}/.test(lines[i].join(' '))) dateRow = i;
    if (dayRow  < 0 && lines[i].some(c => DAYS_EN.includes(c)))          dayRow  = i;
  }

  let colOffset = 0;
  if (dayRow >= 0) {
    for (let c = 0; c < lines[dayRow].length; c++) {
      if (DAYS_EN.includes(lines[dayRow][c])) { colOffset = c; break; }
    }
  } else if (dateRow >= 0) {
    for (let c = 0; c < lines[dateRow].length; c++) {
      if (/\d{2}\/\d{2}\/\d{4}/.test(lines[dateRow][c])) { colOffset = c; break; }
    }
  }

  const numCols    = 7;
  const dates      = dateRow >= 0 ? lines[dateRow].slice(colOffset, colOffset + numCols) : [];
  const headerRows = Math.max(dateRow, dayRow) + 1;
  const rawData    = lines.slice(headerRows);

  const employees    = new Set();
  const availability = {};

  // ── Build shift blocks ─────────────────────────────────────────────────────
  const shiftBlocks = [];

  if (forcedEmpCount > 0) {
    // User explicitly told us how many employees per shift — trust it completely.
    // Skip ALL blank lines first, then slice by count.
    const nonBlank = rawData.filter(r => !isBlankLine(r));
    const p = forcedEmpCount;
    shiftBlocks.push(nonBlank.slice(0,     p));
    shiftBlocks.push(nonBlank.slice(p,     p * 2));
    shiftBlocks.push(nonBlank.slice(p * 2, p * 3));

  } else {
    // Group consecutive non-blank rows into chunks separated by blank lines.
    const chunks = [];
    let cur = [];
    for (const line of rawData) {
      if (isBlankLine(line)) {
        if (cur.length) { chunks.push(cur); cur = []; }
      } else {
        cur.push(line);
      }
    }
    if (cur.length) chunks.push(cur);

    if (chunks.length === 3) {
      // Perfect: exactly 3 blank-separated blocks → Sáng / Chiều / Tối
      shiftBlocks.push(...chunks);

    } else if (chunks.length > 3) {
      // Too many chunks — blank lines appear within shift blocks (e.g. between rows).
      // Merge into 3 equal-ish groups by total non-blank row count.
      const allRows  = chunks.flat();
      const perShift = Math.ceil(allRows.length / 3);
      shiftBlocks.push(allRows.slice(0,         perShift));
      shiftBlocks.push(allRows.slice(perShift,  perShift * 2));
      shiftBlocks.push(allRows.slice(perShift * 2));

    } else if (chunks.length > 0) {
      // 1–2 chunks: no blank separators or only one gap.
      // Use repeat-name detection on the flat rows.
      const allRows   = chunks.flat();
      const seenNames = new Set();
      let perShift    = 0;
      for (let i = 0; i < allRows.length; i++) {
        const tokens    = allRows[i].map(c => c.trim()).filter(Boolean);
        const hasRepeat = tokens.some(n => seenNames.has(n));
        if (hasRepeat && i > 0) { perShift = i; break; }
        tokens.forEach(n => seenNames.add(n));
      }
      if (perShift <= 0) perShift = Math.ceil(allRows.length / 3);
      shiftBlocks.push(allRows.slice(0,         perShift));
      shiftBlocks.push(allRows.slice(perShift,  perShift * 2));
      shiftBlocks.push(allRows.slice(perShift * 2));
    }
  }

  // ── Parse each block ───────────────────────────────────────────────────────
  for (let si = 0; si < shiftBlocks.length && si < 3; si++) {
    const shift = SHIFTS[si];
    for (const row of shiftBlocks[si]) {
      for (let di = 0; di < numCols; di++) {
        const cell = (row[di + colOffset] || '').trim();
        if (cell) {
          employees.add(cell);
          if (!availability[cell])     availability[cell]     = {};
          if (!availability[cell][di]) availability[cell][di] = [];
          if (!availability[cell][di].includes(shift)) availability[cell][di].push(shift);
        }
      }
    }
  }

  if (!employees.size) return null;

  const empList   = [...employees];
  const applyDate = dates[0] || formatDate(new Date());
  const allData   = empList.map(name => ({
    name,
    applyDate,
    timestamp: new Date(),
    days: Array.from({ length: 7 }, (_, di) => availability[name]?.[di] || []),
  }));

  return { allData, employees: empList, applyDate, dates, days: DAYS_EN };
}

// ─── Components ───────────────────────────────────────────────────────────────
function countWeekShifts(emp, weekAssignments) {
  let count = 0;
  for (const shift of SHIFTS) {
    for (let d = 0; d < 7; d++) {
      if (weekAssignments[`${emp}|${shift}|${d}`]) count++;
    }
  }
  return count;
}

function countAvailableShifts(emp, allData, weekStart) {
  let count = 0;
  for (const shift of SHIFTS) {
    for (let d = 0; d < 7; d++) {
      const avail = getAvailability(allData, emp, d, weekStart);
      if (avail.includes(shift)) count++;
    }
  }
  return count;
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

function ShiftCell({ available, assigned, isToday, onClick, empName }) {
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
      {available && assigned && (
        <span style={{ color: '#065F46', fontSize: 12, fontWeight: 500, textAlign: 'center', padding: '0 4px', lineHeight: 1.2 }}>
          {empName}
        </span>
      )}
    </div>
  );
}

// ─── Auto-select Modal ────────────────────────────────────────────────────────
function AutoSelectModal({ onClose, onApply, allData, employees, weekStart, weekKey, allAssignments, currentAssignments }) {
  const defaultTarget = 6;
  const [targets, setTargets] = useState(() =>
    Object.fromEntries([0,1,2,3,4,5,6].map(i => [i, defaultTarget]))
  );
  const [preview, setPreview]       = useState(null);
  const [hasPreview, setHasPreview] = useState(false);

  function setAll(val) {
    const v = Math.max(0, Number(val) || 0);
    setTargets(Object.fromEntries([0,1,2,3,4,5,6].map(i => [i, v])));
    setHasPreview(false); setPreview(null);
  }

  function handlePreview() {
    const result = autoSelectOptimal({ allData, employees, weekStart, weekKey, targets, currentAssignments, allAssignmentsHistory: allAssignments });
    setPreview(result); setHasPreview(true);
  }

  function getDayShiftStat(di, shift) {
    if (!preview) return null;
    const count  = employees.filter(emp => preview[`${emp}|${shift}|${di}`]).length;
    const target = targets[di] || 0;
    return { count, target };
  }

  const inputStyle = { width: 52, textAlign: 'center', padding: '5px 6px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14, fontWeight: 500, color: '#111827', outline: 'none' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 700, margin: '1rem', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F3F4F6', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'linear-gradient(135deg,#EDE9FE,#DDD6FE)', borderRadius: 6, padding: '2px 8px', fontSize: 14 }}>⚡ Auto-Select</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Nhập số người mỗi ca/ngày — thuật toán phân ca công bằng tối ưu</div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 18, color: '#6B7280', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '14px 24px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Điền nhanh tất cả:</span>
          <input type="number" min="0" max="99" defaultValue={defaultTarget} onChange={e => setAll(e.target.value)} style={{ ...inputStyle, width: 64 }} />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>người / ca / ngày</span>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>{employees.length} nhân viên trong hệ thống</div>
        </div>

        <div style={{ padding: '20px 24px', overflowX: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Chỉnh từng ngày (số người / ca)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
            {[0,1,2,3,4,5,6].map(di => (
              <div key={di} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{DAYS_EN[di]}</div>
                <input type="number" min="0" max="99" value={targets[di]}
                  onChange={e => { const v = Math.max(0, Number(e.target.value) || 0); setTargets(prev => ({ ...prev, [di]: v })); setHasPreview(false); setPreview(null); }}
                  style={inputStyle} />
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>/ ca</div>
                {hasPreview && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {SHIFTS.map((shift, si) => {
                      const stat = getDayShiftStat(di, shift);
                      if (!stat) return null;
                      const { count, target } = stat;
                      const diff = count - target;
                      const color = diff === 0 ? '#059669' : diff > 0 ? '#2563EB' : '#DC2626';
                      const bg2   = diff === 0 ? '#D1FAE5' : diff > 0 ? '#DBEAFE' : '#FEE2E2';
                      const shiftLabel = ['S','C','T'][si];
                      return (
                        <div key={shift} style={{ fontSize: 10, background: bg2, color, borderRadius: 4, padding: '2px 4px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{shiftLabel}</span>
                          <span>{count}/{target}{diff > 0 ? ` +${diff}` : diff < 0 ? ` ${diff}` : ' ✓'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {hasPreview && (
          <div style={{ padding: '0 24px 12px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ bg: '#D1FAE5', color: '#059669', label: 'Đủ người ✓' }, { bg: '#DBEAFE', color: '#2563EB', label: 'Dư người' }, { bg: '#FEE2E2', color: '#DC2626', label: 'Thiếu người' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: l.color }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.bg, border: `1px solid ${l.color}` }} />
                {l.label}
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>S=Sáng · C=Chiều · T=Tối</div>
          </div>
        )}

        <div style={{ margin: '0 24px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
          <strong>Thuật toán công bằng:</strong><br/>
          • <strong>Thêm ca:</strong> ưu tiên nhân viên ít ca nhất tuần này → ít ca nhất lịch sử<br/>
          • <strong>Cắt ca:</strong> ưu tiên cắt nhân viên nhiều ca nhất tuần này → nhiều ca nhất lịch sử<br/>
          • Nếu thiếu người do không đủ nhân viên rảnh, số hiển thị sẽ nhỏ hơn target
        </div>

        <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>Huỷ</button>
          <button onClick={handlePreview} style={{ padding: '8px 18px', border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#2563EB', fontWeight: 500 }}>
            {hasPreview ? 'Xem lại' : 'Xem trước'}
          </button>
          <button
            onClick={() => {
              if (!hasPreview) {
                const result = autoSelectOptimal({ allData, employees, weekStart, weekKey, targets, currentAssignments, allAssignmentsHistory: allAssignments });
                onApply(result);
              } else {
                onApply(preview);
              }
              onClose();
            }}
            style={{ padding: '8px 20px', border: '1px solid #059669', background: '#D1FAE5', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#065F46', fontWeight: 600 }}>
            ✓ Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Personal Data Modal ──────────────────────────────────────────────────────
function PersonalDataModal({ onClose, onApply }) {
  const [pasteText, setPasteText] = useState('');
  const [empCount, setEmpCount]   = useState('');
  const [error, setError]         = useState('');

  const SAMPLE = `02/02/2026\t03/02/2026\t04/02/2026\t05/02/2026\t06/02/2026\t07/02/2026\t08/02/2026
T2\tT3\tT4\tT5\tT6\tT7\tCN
Đạt\tĐạt\t\t\tĐạt\t\tĐạt
Ánh\t\tÁnh\t\t\t\t
lidet\t\tlidet\t\t\tlidet\tlidet
\tÁnh li\t\tÁnh li\tÁnh li\tÁnh li\t

\t\tĐạt\t\t\t\tĐạt
\t\t\tÁnh\tÁnh\tÁnh\t
lidet\tlidet\tlidet\t\t\t\t
\tÁnh li\t\tÁnh li\tÁnh li\tÁnh li\tÁnh li

\t\t\t\tĐạt\t\tĐạt
\t\t\t\t\t\tÁnh
\t\t\t\tlidet\tlidet\tlidet
`;

  function handleApply() {
    const text = pasteText.trim();
    if (!text) { setError('Vui lòng paste dữ liệu từ Excel vào ô trên.'); return; }
    const parsed = parseExcelPaste(text, parseInt(empCount) || 0);
    if (!parsed || !parsed.employees.length) {
      setError('Không nhận ra định dạng. Hãy thử tải dữ liệu mẫu để xem định dạng chuẩn.');
      return;
    }
    onApply(parsed);
    onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 580, margin: '1rem', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F3F4F6', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'linear-gradient(135deg,#EDE9FE,#DDD6FE)', borderRadius: 6, padding: '2px 8px', fontSize: 14 }}>+ Thêm dữ liệu cá nhân</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                Paste dữ liệu phân ca từ Excel — từ T2 tới CN (bao gồm hàng ngày tháng)
              </div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 18, color: '#6B7280', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* Textarea */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Dữ liệu Excel (Ctrl+V)
            </div>
            <textarea
              rows={10}
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setError(''); }}
              placeholder={`Paste dữ liệu từ Excel vào đây...\n\nĐịnh dạng mẫu:\n02/02/2026  03/02/2026  ...\nT2          T3          ...\nĐạt                     ...\nÁnh         Ánh         ...\n\n(Sáng / Chiều / Tối theo nhóm hàng, cách nhau bằng hàng trống)`}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', color: '#111827', background: '#FAFAFA', lineHeight: 1.5 }}
            />
            {error && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#FEF2F2', color: '#B91C1C', borderRadius: 6, fontSize: 12 }}>
                ⚠ {error}
              </div>
            )}
          </div>

          {/* Employee count hint */}
          {/* <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>
              Số nhân viên / ca:
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={empCount}
              onChange={e => { setEmpCount(e.target.value); setError(''); }}
              placeholder="Tự động"
              style={{ width: 90, padding: '5px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, color: '#111827', outline: 'none' }}
            />
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>Nhập nếu ca tối bị thiếu dữ liệu</span>
          </div> */}

          {/* Instruction */}
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#166534', lineHeight: 1.7, marginBottom: 16 }}>
            <strong>Hướng dẫn:</strong><br/>
            1. Trong Excel, chọn vùng từ hàng ngày (<em>02/02/2026...</em>) đến hàng cuối cùng<br/>
            2. Copy (Ctrl+C) rồi paste vào ô trên (Ctrl+V)<br/>
            3. Mỗi nhóm hàng = 1 ca (Sáng → Chiều → Tối), cách nhau bằng hàng trống<br/>
            4. Tên nhân viên xuất hiện ở cột nào = rảnh ca đó, ngày đó
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => { setPasteText(SAMPLE); setError(''); }}
              style={{ padding: '7px 14px', border: '1px solid #E5E7EB', background: '#F9FAFB', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#6B7280' }}
            >
              Tải dữ liệu mẫu
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                Huỷ
              </button>
              <button
                onClick={handleApply}
                style={{ padding: '8px 20px', border: '1px solid #059669', background: '#D1FAE5', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#065F46', fontWeight: 600 }}
              >
                ✓ Áp dụng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [allData,        setAllData]        = useState([]);
  const [employees,      setEmployees]      = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const savedAllRef = useRef([]);

  const dragRef  = useRef({ dragIdx: null, touchY: 0, rowHeights: [] });
  const EMP_ORDER_KEY = 'shiftSchedule_empOrder';

  const [weekStart,           setWeekStart]           = useState(() => getWeekStart(new Date()));
  const [loading,             setLoading]             = useState(true);
  const [loadingAssignments,  setLoadingAssignments]  = useState(true);
  const [error,               setError]               = useState('');
  const [loadError,           setLoadError]           = useState('');
  const [saveStatus,          setSaveStatus]          = useState('idle');
  const [showAutoModal,       setShowAutoModal]        = useState(false);
  const [showPersonalModal,   setShowPersonalModal]   = useState(false);
  const [isPersonalMode,      setIsPersonalMode]      = useState(false);

  useEffect(() => {
    async function fetchSheet() {
      try {
        const res  = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const { data, employees: emps } = processSheetData(parseCSV(text));
        setAllData(data);
        try {
          const saved = JSON.parse(localStorage.getItem(EMP_ORDER_KEY) || '[]');
          if (saved.length) {
            const ordered = [
              ...saved.filter(n => emps.includes(n)),
              ...emps.filter(n => !saved.includes(n)),
            ];
            setEmployees(ordered);
          } else { setEmployees(emps); }
        } catch { setEmployees(emps); }
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    }
    fetchSheet();
  }, []);

  useEffect(() => {
    if (!SCRIPT_URL) { setLoadingAssignments(false); return; }
    async function load() {
      setLoadingAssignments(true); setLoadError('');
      try {
        const json = await fetchAllAssignments();
        const data = (json && Array.isArray(json.assignments)) ? json.assignments : [];
        setAllAssignments(data);
        savedAllRef.current = data.map(a => ({ ...a }));
      } catch (e) { setLoadError(e.message); }
      finally { setLoadingAssignments(false); }
    }
    load();
  }, []);

  const weekKey              = formatDate(weekStart);
  const weekAssignments      = buildWeekAssignments(allAssignments, weekKey);
  const savedWeekAssignments = buildWeekAssignments(savedAllRef.current, weekKey);
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
    ? `Áp dụng từ ngày: ${applyRows[0].applyDate}`
    : allData.length ? 'Không có dữ liệu trong tuần này' : '';

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

  function toggleSelectAll() {
    setAllAssignments(prev => {
      const cur     = buildWeekAssignments(prev, weekKey);
      const updated = { ...cur };
      if (allWeekSelected) {
        for (const emp of employees) {
          for (let di = 0; di < 7; di++) {
            const avail = getAvailability(allData, emp, di, weekStart);
            for (const shift of avail) updated[`${emp}|${shift}|${di}`] = false;
          }
        }
      } else {
        for (const emp of employees) {
          for (let di = 0; di < 7; di++) {
            const avail = getAvailability(allData, emp, di, weekStart);
            for (const shift of avail) updated[`${emp}|${shift}|${di}`] = true;
          }
        }
      }
      return mergeIntoAll(prev, weekKey, updated);
    });
    setSaveStatus('idle');
  }

  const allWeekSelected = employees.length > 0 && employees.every(emp =>
    [0,1,2,3,4,5,6].every(di => {
      const avail = getAvailability(allData, emp, di, weekStart);
      return avail.every(shift => weekAssignments[`${emp}|${shift}|${di}`]);
    })
  );

  function handleAutoApply(newWeekAssignments) {
    setAllAssignments(prev => mergeIntoAll(prev, weekKey, newWeekAssignments));
    setSaveStatus('idle');
  }

  function handlePersonalApply(parsed) {
    const newApplyDate = parsed.applyDate;
    const newWeekStart = getWeekStart(parseDate(newApplyDate) || new Date());
    const newWeekKey   = formatDate(newWeekStart);

    setAllData(parsed.allData);
    setEmployees(parsed.employees);
    setAllAssignments(prev => prev.filter(a => a.weekStart !== newWeekKey));
    setWeekStart(newWeekStart);
    setIsPersonalMode(true);
    setSaveStatus('idle');
  }

  async function handleSave() {
    if (!SCRIPT_URL) { alert('VITE_SCRIPT_URL chưa được thiết lập trong .env'); return; }
    setSaveStatus('saving');
    try {
      const payload = { weekStart: weekKey, assignments: assignmentsToArray(weekAssignments) };
      const res  = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.ok) {
        savedAllRef.current = mergeIntoAll(savedAllRef.current, weekKey, weekAssignments);
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
    setLoadingAssignments(true); setLoadError('');
    try {
      const json = await fetchAllAssignments();
      const data = (json && Array.isArray(json.assignments)) ? json.assignments : [];
      setAllAssignments(data);
      savedAllRef.current = data.map(a => ({ ...a }));
    } catch (e) { setLoadError(e.message); }
    finally { setLoadingAssignments(false); }
  }

  function moveEmployee(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    setEmployees(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  function buildExcelText() {
    const lines = [];
    for (const shift of SHIFTS) {
      for (const emp of employees) {
        const cells = [];
        for (let di = 0; di < 7; di++) {
          const avail = getAvailability(allData, emp, di, weekStart);
          const key   = `${emp}|${shift}|${di}`;
          cells.push(avail.includes(shift) && weekAssignments[key] ? emp : '');
        }
        lines.push(cells.join('\t'));
      }
      lines.push('\t\t\t\t\t\t');
    }
    return lines.join('\r\n');
  }

  const [copyStatus, setCopyStatus] = useState('idle');
  async function handleCopy() {
    const text = buildExcelText();
    const done = () => { setCopyStatus('copied'); setTimeout(() => setCopyStatus('idle'), 2000); };
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blob = new Blob([text], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      } else { await navigator.clipboard.writeText(text); }
      done();
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta); done();
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

  const effectiveStatus = (saveStatus === 'idle' && hasChanges) ? 'unsaved' : saveStatus;
  const saveBtnStyle = {
    unsaved: { bg: '#F97316', border: '#EA6C00', color: '#fff',    label: 'Save'                },
    idle:    { bg: '#2563EB', border: '#1D4ED8', color: '#fff',    label: 'Save'                },
    saving:  { bg: '#93C5FD', border: '#93C5FD', color: '#fff',    label: 'Saving...'           },
    saved:   { bg: '#D1FAE5', border: '#059669', color: '#065F46', label: '✓ Saved'             },
    error:   { bg: '#FEF2F2', border: '#EF4444', color: '#B91C1C', label: 'Save failed — retry' },
  }[effectiveStatus];

  return (
    <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>

      {showAutoModal && (
        <AutoSelectModal
          onClose={() => setShowAutoModal(false)}
          onApply={handleAutoApply}
          allData={allData}
          employees={employees}
          weekStart={weekStart}
          weekKey={weekKey}
          allAssignments={allAssignments}
          currentAssignments={weekAssignments}
        />
      )}

      {showPersonalModal && (
        <PersonalDataModal
          onClose={() => setShowPersonalModal(false)}
          onApply={handlePersonalApply}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#111827', margin: 0 }}>Đăng Ký Lịch Xếp Ca</h1>
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
        <button
          onClick={() => setShowPersonalModal(true)}
          style={{ padding: '6px 14px', border: '1px solid #86EFAC', background: 'linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#065F46', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
          + Thêm dữ liệu cá nhân
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Số ca đăng ký',    value: totalAssigned },
          { label: 'Số người đăng ký', value: assignedEmps  },
        ].map(s => (
          <div key={s.label} style={{ background: '#F9FAFB', borderRadius: 8, padding: '14px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#111827' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Week nav + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>

        {!isPersonalMode && (
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
        )}

        {isPersonalMode && <div />}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

          {!isPersonalMode && (
            <button onClick={() => setWeekStart(getWeekStart(new Date()))}
              style={{ padding: '6px 14px', border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#2563EB' }}>
              Today
            </button>
          )}

          <button
            onClick={() => setShowAutoModal(true)}
            style={{ padding: '6px 14px', border: '1px solid #A78BFA', background: 'linear-gradient(135deg,#EDE9FE 0%,#DDD6FE 100%)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#5B21B6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
            Auto-Select
          </button>

          <button
            onClick={toggleSelectAll}
            style={{ padding: '6px 14px', border: `1px solid ${allWeekSelected ? '#059669' : '#D1D5DB'}`, background: allWeekSelected ? '#D1FAE5' : '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: allWeekSelected ? '#065F46' : '#374151', transition: 'all 0.15s' }}>
            {allWeekSelected ? 'Deselect all' : 'Select all'}
          </button>

          <button
            onClick={handleCopy}
            style={{ padding: '6px 14px', border: `1px solid ${copyStatus === 'copied' ? '#059669' : '#D1D5DB'}`, background: copyStatus === 'copied' ? '#D1FAE5' : '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: copyStatus === 'copied' ? '#065F46' : '#374151', transition: 'all 0.2s' }}>
            {copyStatus === 'copied' ? '✓ Copied' : 'Copy'}
          </button>

          {!isPersonalMode && (
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || loadingAssignments}
              style={{ padding: '6px 18px', border: `1px solid ${saveBtnStyle.border}`, background: saveBtnStyle.bg, color: saveBtnStyle.color, borderRadius: 8, cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s', opacity: (saveStatus === 'saving' || loadingAssignments) ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {saveStatus === 'saving' && (
                <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              )}
              {saveBtnStyle.label}
            </button>
          )}
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
                      const rows = document.querySelectorAll('[data-emp-row]');
                      dragRef.current.rowTops = Array.from(rows).map(r => r.getBoundingClientRect().top);
                    } : undefined}
                    onTouchMove={si === 0 ? (e) => { e.preventDefault(); dragRef.current.touchY = e.touches[0].clientY; } : undefined}
                    onTouchEnd={si === 0 ? () => {
                      const { dragIdx, touchY, rowTops } = dragRef.current;
                      if (dragIdx === null || !rowTops) return;
                      let toIdx = rowTops.length - 1;
                      for (let i = 0; i < rowTops.length; i++) {
                        if (touchY < rowTops[i] + 24) { toIdx = i; break; }
                      }
                      moveEmployee(dragIdx, toIdx);
                      dragRef.current.dragIdx = null;
                    } : undefined}
                    data-emp-row={si === 0 ? ei : undefined}
                    style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827', minHeight: 48, borderRight: '0.5px solid #E5E7EB', cursor: si === 0 ? 'grab' : 'default', userSelect: 'none', touchAction: si === 0 ? 'none' : 'auto' }}
                  >
                    {si === 0 && <span style={{ color: '#D1D5DB', fontSize: 14, flexShrink: 0, marginRight: -4 }}>⠿</span>}
                    <Avatar name={emp} index={ei} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp}</span>
                    {(() => {
                      const assigned  = countWeekShifts(emp, weekAssignments);
                      const available = countAvailableShifts(emp, allData, weekStart);
                      if (available === 0) return null;
                      const full  = assigned === available;
                      const none  = assigned === 0;
                      const bg    = full ? '#D1FAE5' : none ? '#F3F4F6' : '#EDE9FE';
                      const color = full ? '#065F46' : none ? '#9CA3AF' : '#5B21B6';
                      return (
                        <span style={{ flexShrink: 0, height: 20, borderRadius: 10, background: bg, color, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px', lineHeight: 1, transition: 'background 0.2s, color 0.2s', letterSpacing: '0.01em' }}>
                          {assigned}/{available}
                        </span>
                      );
                    })()}
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
                        empName={emp}
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