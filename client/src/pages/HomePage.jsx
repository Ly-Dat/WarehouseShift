import { useState, useEffect } from "react";

const SHEET_URL = import.meta.env.VITE_SHEET_URL;
// const SHEET_URL = process.env.REACT_APP_SHEET_URL;

const DAYS_VN = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SHIFTS = ['Sáng','Chiều','Tối'];
const SHIFT_STYLES = [
  { bg: '#FEF3C7', text: '#92400E', label: 'Morning Shift' },
  { bg: '#DBEAFE', text: '#1E40AF', label: 'Afternoon Shift' },
  { bg: '#EDE9FE', text: '#5B21B6', label: 'Evening Shift' },
];
const AVATAR_COLORS = ['#DBEAFE','#D1FAE5','#FEF3C7','#FCE7F3','#EDE9FE','#FFE4E6'];
const AVATAR_TEXT = ['#1E40AF','#065F46','#92400E','#9D174D','#5B21B6','#9F1239'];

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

// Fix 1: parseCSV xử lý đúng quoted fields có dấu phẩy bên trong
function parseCSV(text) {
  const lines = text.trim().split('\n');
  
  function parseLine(line) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
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

// Fix 2: processSheetData trim key khi lookup vì header có spaces thừa
function normalizeKey(str) {
  return str.trim().replace(/\s+/g, ' ');
}

function processSheetData(rawRows) {
  const empSet = new Set();

  const normalized = rawRows.map(row => {
    const clean = {};
    Object.keys(row).forEach(k => { clean[normalizeKey(k)] = row[k]; });
    return clean;
  });

  if (normalized.length > 0) {
    console.log('Headers after normalize:', Object.keys(normalized[0]));
  }

  const data = normalized.map(row => {
    const name = (row['Tên nhân viên'] || '').trim();
    if (!name) return null;
    empSet.add(name);
    const applyDate = (row['Ngày áp dụng'] || '').trim();
    const days = DAYS_VN.map(dayKey => {
      const val = row[`Ngày bạn rảnh [${dayKey}]`] || '';
      return val.split(',').map(s => s.trim()).filter(Boolean);
    });
    return { name, applyDate, days };
  }).filter(Boolean);

  return { data, employees: [...empSet] };
}

function getRelevantRows(allData, date) {
  const applicable = allData
    .filter(r => { const d = parseDate(r.applyDate); return d && d <= date; })
    .sort((a, b) => parseDate(b.applyDate) - parseDate(a.applyDate));
  if (!applicable.length) return [];
  const latest = parseDate(applicable[0].applyDate).getTime();
  return applicable.filter(r => parseDate(r.applyDate).getTime() === latest);
}

function getAvailability(allData, empName, dayIndex, weekStart) {
  const date = new Date(weekStart);
  date.setDate(weekStart.getDate() + dayIndex);
  const rows = getRelevantRows(allData, date);
  const empRow = rows.find(r => r.name === empName);
  return empRow ? (empRow.days[dayIndex] || []) : [];
}

function Avatar({ name, index }) {
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const color = AVATAR_TEXT[index % AVATAR_TEXT.length];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', background: bg, color,
      fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function ShiftCell({ available, assigned, isToday, onClick }) {
  const [hovered, setHovered] = useState(false);
  let bg = 'transparent';
  if (!available) bg = '#F3F4F6';
  else if (assigned) bg = '#D1FAE5';
  else if (hovered) bg = '#F3F4F6';
  else if (isToday) bg = 'rgba(59,130,246,0.04)';

  return (
    <div
      onClick={available ? onClick : undefined}
      onMouseEnter={() => available && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, cursor: available ? 'pointer' : 'default',
        borderRight: '0.5px solid #E5E7EB', transition: 'background 0.1s',
      }}
    >
      {!available && <span style={{ color: '#D1D5DB', fontSize: 14 }}>—</span>}
      {available && assigned && <span style={{ color: '#065F46', fontSize: 16, fontWeight: 500 }}>✓</span>}
    </div>
  );
}

export default function HomePage() {
  const [allData, setAllData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchSheet() {
      try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        console.log(text);
        const raw = parseCSV(text);
        const { data, employees: emps } = processSheetData(raw);
        setAllData(data);
        setEmployees(emps);
        console.log(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSheet();
  }, []);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIdx = weekDates.findIndex(d => d.getTime() === today.getTime());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  const applyRows = getRelevantRows(allData, weekStart);
  const applyLabel = applyRows.length
    ? `Applying availability from: ${applyRows[0].applyDate}`
    : allData.length ? 'No availability data for this week' : '';

  const totalAssigned = Object.values(assignments).filter(Boolean).length;
  const assignedEmps = new Set(
    Object.keys(assignments).filter(k => assignments[k]).map(k => k.split('|')[0])
  ).size;
  const coverage = employees.length > 0
    ? Math.round(totalAssigned / (employees.length * 3 * 7) * 100) + '%'
    : '0%';

  function toggle(emp, shift, day) {
    const key = `${emp}|${shift}|${day}`;
    setAssignments(prev => ({ ...prev, [key]: !prev[key] }));
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
        <br /><small style={{ color: '#9CA3AF' }}>Check REACT_APP_SHEET_URL in .env and make sure the sheet is published to CSV.</small>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#111827', margin: 0 }}>Shift Schedule</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{applyLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {[
            { bg: '#D1FAE5', border: '#059669', label: 'Assigned' },
            { bg: '#fff', border: '#D1D5DB', label: 'Available' },
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
          { label: 'Shifts assigned', value: totalAssigned },
          { label: 'Employees scheduled', value: assignedEmps },
          { label: 'Coverage rate', value: coverage },
          { label: 'Week', value: `${formatDate(weekStart)} – ${formatDate(weekEnd)}` },
        ].map(s => (
          <div key={s.label} style={{ background: '#F9FAFB', borderRadius: 8, padding: '14px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: s.label === 'Week' ? 13 : 22, fontWeight: 500, color: '#111827' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Week nav */}
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
        <button onClick={() => setWeekStart(getWeekStart(new Date()))}
          style={{ padding: '6px 14px', border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#2563EB' }}>
          Today
        </button>
      </div>

      {/* Grid */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>

        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: col, background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '0.5px solid #E5E7EB' }}>
            Employee
          </div>
          {weekDates.map((d, i) => (
            <div key={i} style={{
              padding: '10px 8px', textAlign: 'center',
              background: i === todayIdx ? '#EFF6FF' : 'transparent',
              borderRight: i < 6 ? '0.5px solid #E5E7EB' : 'none',
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: i === todayIdx ? '#2563EB' : '#9CA3AF' }}>
                {DAYS_EN[i]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: i === todayIdx ? '#2563EB' : '#111827', marginTop: 2 }}>
                {d.getDate()}/{d.getMonth()+1}
              </div>
            </div>
          ))}
        </div>

        {/* Shifts */}
        {SHIFTS.map((shift, si) => (
          <div key={shift}>
            <div style={{
              padding: '8px 16px', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              background: SHIFT_STYLES[si].bg, color: SHIFT_STYLES[si].text,
              borderTop: '0.5px solid #E5E7EB',
            }}>
              {SHIFT_STYLES[si].label}
            </div>
            {employees.map((emp, ei) => (
              <div key={emp} style={{
                display: 'grid', gridTemplateColumns: col,
                borderBottom: '0.5px solid #E5E7EB',
              }}>
                <div style={{
                  padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: '#111827', minHeight: 48,
                  borderRight: '0.5px solid #E5E7EB',
                }}>
                  <Avatar name={emp} index={ei} />
                  {emp}
                </div>
                {weekDates.map((_, di) => {
                  const avail = getAvailability(allData, emp, di, weekStart);
                  const key = `${emp}|${shift}|${di}`;
                  return (
                    <ShiftCell
                      key={di}
                      available={avail.includes(shift)}
                      assigned={!!assignments[key]}
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
  );
}