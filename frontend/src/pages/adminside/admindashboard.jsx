import { useState, useEffect, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import io from 'socket.io-client';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import './admindashboard.css';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

function getAdminToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken') ||
    ''
  );
}

const todayStr = new Date().toISOString().slice(0, 10);

/* ── helpers ── */
function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

// Weekly: last 7 ISO weeks (Mon–Sun buckets)
function getLast7Weeks() {
  return Array.from({ length: 7 }, (_, i) => {
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return { label: `${fmt(start)}–${fmt(end)}`, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }).reverse();
}

// Monthly: last 6 months
function getLast6Months() {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'short' }) };
  });
}

// Quarterly: last 4 quarters
function getLast4Quarters() {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i * 3);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const y = d.getFullYear();
    const startMonth = (q - 1) * 3;
    return {
      label: `Q${q} ${y}`,
      year: y,
      startMonth, // 0-indexed
      endMonth: startMonth + 2,
    };
  }).reverse();
}

// Yearly: last 4 years
function getLast4Years() {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const y = now.getFullYear() - (3 - i);
    return { label: String(y), year: y };
  });
}

function isoInYear(isoStr, year) {
  if (!isoStr) return false;
  return new Date(isoStr).getFullYear() === year;
}

function isoInQuarter(isoStr, year, startMonth, endMonth) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  return d.getFullYear() === year && d.getMonth() >= startMonth && d.getMonth() <= endMonth;
}

function isoInWeek(isoStr, start, end) {
  if (!isoStr) return false;
  return isoStr >= start && isoStr <= end;
}

function dayLabel(iso) {
  const [, month, day] = iso.split('-');
  return `${Number(month)}/${Number(day)}`;
}

const REPORT_PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function toLocalDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

function formatReportDate(date, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return date.toLocaleDateString('en-US', options);
}

function formatReportRange(start, end) {
  if (toLocalDateKey(start) === toLocalDateKey(end)) return formatReportDate(start);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatReportDate(start, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })} - ${formatReportDate(end)}`;
}

function getQuarterInfo(date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  return { quarter, startMonth };
}

function getReportPeriodRange(period, baseDate = new Date()) {
  const today = startOfDay(baseDate);
  let start = today;
  let end = today;
  let previousStart = addDays(today, -1);
  let previousEnd = addDays(today, -1);
  let periodLabel = `Daily - ${formatReportDate(today)}`;
  let comparisonLabel = 'previous day';
  let fileKey = `daily-${toLocalDateKey(today)}`;

  if (period === 'weekly') {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start = addDays(today, mondayOffset);
    end = addDays(start, 6);
    previousStart = addDays(start, -7);
    previousEnd = addDays(end, -7);
    periodLabel = `Weekly - ${formatReportRange(start, end)}`;
    comparisonLabel = 'previous week';
    fileKey = `weekly-${toLocalDateKey(start)}`;
  } else if (period === 'quarterly') {
    const { quarter, startMonth } = getQuarterInfo(today);
    start = startOfDay(new Date(today.getFullYear(), startMonth, 1));
    end = startOfDay(new Date(today.getFullYear(), startMonth + 3, 0));
    previousStart = startOfDay(new Date(today.getFullYear(), startMonth - 3, 1));
    previousEnd = startOfDay(new Date(today.getFullYear(), startMonth, 0));
    periodLabel = `Quarterly - Q${quarter} ${today.getFullYear()}`;
    comparisonLabel = 'previous quarter';
    fileKey = `quarterly-${today.getFullYear()}-q${quarter}`;
  } else if (period === 'yearly') {
    start = startOfDay(new Date(today.getFullYear(), 0, 1));
    end = startOfDay(new Date(today.getFullYear(), 11, 31));
    previousStart = startOfDay(new Date(today.getFullYear() - 1, 0, 1));
    previousEnd = startOfDay(new Date(today.getFullYear() - 1, 11, 31));
    periodLabel = `Yearly - ${today.getFullYear()}`;
    comparisonLabel = 'previous year';
    fileKey = `yearly-${today.getFullYear()}`;
  }

  return {
    period,
    start,
    end,
    previousStart,
    previousEnd,
    startKey: toLocalDateKey(start),
    endKey: toLocalDateKey(end),
    previousStartKey: toLocalDateKey(previousStart),
    previousEndKey: toLocalDateKey(previousEnd),
    periodLabel,
    comparisonLabel,
    fileKey,
  };
}

function getDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : toLocalDateKey(d);
}

function isInReportRange(value, range, usePrevious = false) {
  const key = getDateKey(value);
  if (!key) return false;
  const startKey = usePrevious ? range.previousStartKey : range.startKey;
  const endKey = usePrevious ? range.previousEndKey : range.endKey;
  return key >= startKey && key <= endKey;
}

function percentOf(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'Uncategorized';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function entriesToChart(counts, limit = 6) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function serviceTypeFromPurpose(purpose = '') {
  const text = purpose.toLowerCase();
  if (text.includes('clearance')) return 'Barangay Clearance Requests';
  if (
    text.includes('certificate') ||
    text.includes('certification') ||
    text.includes('residency') ||
    text.includes('indigency') ||
    text.includes('good moral')
  ) {
    return 'Certificates Issued';
  }
  return 'Other Services';
}

function residentIdentity(record) {
  return String(record.userId || record.residentEmail || record.resident || record._id || '');
}

function compareSentence(current, previous, label, comparisonLabel) {
  if (current === previous) return `${label} stayed level compared with the ${comparisonLabel}.`;
  if (previous === 0) return `${label} increased from 0 to ${current} this period.`;
  const delta = Math.abs(current - previous);
  const rate = percentOf(delta, previous);
  return `${label} ${current > previous ? 'increased' : 'decreased'} by ${rate}% compared with the ${comparisonLabel}.`;
}

function includesAny(value = '', terms = []) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

/* ── Custom Tooltip ── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="chart-tooltip__row">
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, delta, deltaNote, icon, iconBg, iconColor, deltaColor, trend }) {
  return (
    <div className="stat-card">
      <div className="stat-card__left">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value ?? '—'}</p>
        <p className="stat-card__delta">
          <span style={{ color: deltaColor ?? '#16a34a' }}>{delta}</span>
          {' '}
          <span className="stat-card__delta-note">{deltaNote}</span>
        </p>
        {trend && (
          <div className="stat-card__sparkline">
            <ResponsiveContainer width="100%" height={36}>
              <AreaChart data={trend} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\s/g,'')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={iconColor} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={iconColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={iconColor} strokeWidth={1.5}
                  fill={`url(#spark-${label.replace(/\s/g,'')})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="stat-card__icon" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
    </div>
  );
}

/* ── Section Header ── */
function SectionHeader({ title, subtitle, link, linkLabel = 'View All →' }) {
  return (
    <div className="panel__header">
      <div>
        <h2 className="panel__title">{title}</h2>
        {subtitle && <p className="panel__subtitle">{subtitle}</p>}
      </div>
      {link && <a href={link} className="panel__link">{linkLabel}</a>}
    </div>
  );
}

/* ── Range Toggle ── */
function RangeToggle({ value, onChange, options }) {
  return (
    <div className="range-toggle">
      {options.map(o => (
        <button key={o.value} className={`range-toggle__btn${value === o.value ? ' range-toggle__btn--active' : ''}`}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function ReportSection({ number, title, children }) {
  return (
    <section className="report-section">
      <div className="report-section__heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ReportPage({ children }) {
  return <div className="report-page">{children}</div>;
}

function ReportTable({ columns, rows }) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          {columns.map((column) => <th key={column}>{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
          </tr>
        )) : (
          <tr>
            <td colSpan={columns.length}>No data recorded for this period.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function BarangayResidentsReport({ data }) {
  return (
    <article className="report-document">
      <ReportPage>
        <header className="report-cover">
          <div>
            <p className="report-kicker">NCESS Barangay Analytics</p>
            <h1>Barangay Residents Report (NCESS)</h1>
            <p className="report-period">Reporting Period: {data.periodLabel}</p>
          </div>
          <div className="report-meta">
            <span>Barangay New Cabalan</span>
            <span>Prepared {data.generatedDate}</span>
          </div>
        </header>

        <ReportSection number="1" title="Overview">
          <ReportTable
            columns={['Data Field', 'Value']}
            rows={[
              ['Reporting Period', data.periodLabel],
              ['Prepared Date', data.generatedDate],
              ['Total Registered Residents', data.totalResidents],
              ['Active Residents', data.activeResidents],
              ['Active Resident Rate', `${data.activeRate}%`],
              ['New Residents', data.newResidents],
              ['Total Appointments', data.totalAppointments],
              ['Total Complaints', data.totalComplaints],
              ['Total Announcements', data.totalAnnouncements],
            ]}
          />
        </ReportSection>

        <ReportSection number="2" title="Population & Participation">
          <ReportTable
            columns={['Population Data', 'Count / Rate']}
            rows={[
              ['Total Registered Residents', data.totalResidents],
              ['Active Residents (used services)', data.activeResidents],
              ['Inactive Registered Residents', Math.max(data.totalResidents - data.activeResidents, 0)],
              ['New Residents This Period', data.newResidents],
              ['Participation Rate', `${data.activeRate}%`],
            ]}
          />
        </ReportSection>

        <ReportSection number="3" title="Resident Activity Summary">
          <ReportTable
            columns={['Activity Type', 'Total']}
            rows={data.activityChart.map((item) => [item.name, item.value])}
          />
        </ReportSection>
      </ReportPage>

      <ReportPage>
        <ReportSection number="4" title="Services Availed by Residents">
          <ReportTable
            columns={['Service', 'Requests']}
            rows={[
              ['Barangay Clearance Requests', data.clearanceRequests],
              ['Certificates Issued', data.certificatesIssued],
              ['Other Services', data.otherServices],
              ['Most Requested Service', data.topServiceName],
            ]}
          />
        </ReportSection>

        <ReportSection number="5" title="Appointment Activity">
          <ReportTable
            columns={['Appointment Data', 'Count']}
            rows={[
              ['Total Appointments', data.totalAppointments],
              ['Walk-ins', data.walkInAppointments],
              ['Scheduled Online', data.onlineAppointments],
            ]}
          />
        </ReportSection>

        <ReportSection number="6" title="Appointment Source Breakdown">
          <ReportTable
            columns={['Source', 'Count']}
            rows={data.appointmentSourceChart.map((item) => [item.name, item.value])}
          />
        </ReportSection>

        <ReportSection number="7" title={data.trendTitle}>
          <ReportTable
            columns={['Period', 'Appointments', 'Complaints']}
            rows={data.trendChart.map((item) => [item.label, item.Appointments, item.Complaints])}
          />
        </ReportSection>
      </ReportPage>

      <ReportPage>
        <ReportSection number="8" title="Community Concerns (Complaints)">
          <ReportTable
            columns={['Complaint Data', 'Count']}
            rows={[
              ['Total Complaints', data.totalComplaints],
              ['Resolved', data.resolvedComplaints],
              ['Pending', data.pendingComplaints],
            ]}
          />
        </ReportSection>

        <ReportSection number="9" title="Complaint Status Breakdown">
          <ReportTable
            columns={['Status', 'Count']}
            rows={data.complaintStatusChart.map((item) => [item.name, item.value])}
          />
        </ReportSection>

        <ReportSection number="10" title="Top Complaint Categories">
          <ReportTable
            columns={['Category', 'Count']}
            rows={data.topIssues.map((item) => [item.name, item.value])}
          />
        </ReportSection>

        <ReportSection number="11" title="Announcements & Community Engagement">
          <ReportTable
            columns={['Announcement Data', 'Count']}
            rows={[
              ['Total Announcements', data.totalAnnouncements],
              ['Events Conducted', data.eventsConducted],
            ]}
          />
        </ReportSection>

        <ReportSection number="12" title="Announcement Categories">
          <ReportTable
            columns={['Category', 'Count']}
            rows={data.announcementCategoryChart.map((item) => [item.name, item.value])}
          />
        </ReportSection>

        <ReportSection number="13" title="Public Safety / Cleanliness">
          <ReportTable
            columns={['Data Field', 'Count']}
            rows={[
              ['Reported Incidents', data.reportedIncidents],
              ['Clean-up Activities', data.cleanupActivities],
            ]}
          />
        </ReportSection>
      </ReportPage>

      <ReportPage>
        <ReportSection number="14" title="Observations Data">
          <ReportTable
            columns={['No.', 'Data']}
            rows={data.observations.map((item, index) => [index + 1, item])}
          />
        </ReportSection>
      </ReportPage>
    </article>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════ */
export default function Dashboard() {
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* raw data */
  const [allAppointments, setAllAppointments] = useState([]);
  const [allComplaints, setAllComplaints] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [messageStats, setMessageStats] = useState({ totalMessages: 0, messagesToday: 0 });

  /* chart ranges */
  const [aptRange, setAptRange] = useState('weekly');
  const [cmpRange, setCmpRange] = useState('weekly');
  const [resRange, setResRange] = useState('monthly');
  const [actRange, setActRange] = useState('weekly');
  const [reportPeriod, setReportPeriod] = useState('weekly');
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);

  const token = getAdminToken();

  /* ── initial load ── */
  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/admin/appointments`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/admin/complaints`,   { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/users`,              { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/announcements`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/chat/admin/message-stats`, { headers: h }).then(r => r.ok ? r.json() : null),
    ]).then(([apts, cmps, users, anns, msgs]) => {
      setAllAppointments(Array.isArray(apts) ? apts : []);
      setAllComplaints(Array.isArray(cmps) ? cmps : []);
      setAllUsers(Array.isArray(users) ? users : []);
      setAllAnnouncements(Array.isArray(anns) ? anns : []);
      if (msgs) setMessageStats(msgs);
    }).catch(() => {});
  }, [token]);

  /* ── real-time ── */
  useEffect(() => {
    if (!token) return;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );
    const h = { Authorization: `Bearer ${token}` };
    const refetchAll = () => {
      fetch(`${API_URL}/admin/appointments`, { headers: h }).then(r => r.ok ? r.json() : []).then(d => setAllAppointments(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${API_URL}/admin/complaints`, { headers: h }).then(r => r.ok ? r.json() : []).then(d => setAllComplaints(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${API_URL}/users`, { headers: h }).then(r => r.ok ? r.json() : []).then(d => setAllUsers(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${API_URL}/announcements`).then(r => r.ok ? r.json() : []).then(d => setAllAnnouncements(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${API_URL}/chat/admin/message-stats`, { headers: h }).then(r => r.ok ? r.json() : null).then(d => { if (d) setMessageStats(d); }).catch(() => {});
    };
    socket.on('appointment_created', refetchAll);
    socket.on('appointment_updated', refetchAll);
    socket.on('appointment_deleted', refetchAll);
    socket.on('complaint_created', refetchAll);
    socket.on('complaint_updated', refetchAll);
    socket.on('complaint_deleted', refetchAll);
    socket.on('announcement_created', refetchAll);
    socket.on('announcement_deleted', refetchAll);
    socket.on('conversation_updated', () => {
      fetch(`${API_URL}/chat/admin/message-stats`, { headers: h }).then(r => r.ok ? r.json() : null).then(d => { if (d) setMessageStats(d); }).catch(() => {});
    });
    return () => socket.disconnect();
  }, [token]);

  /* ── derived stats ── */
  const approvedUsers = useMemo(() => allUsers.filter(u => u.status === 'approved'), [allUsers]);
  const newResidentsToday = useMemo(() => approvedUsers.filter(u => u.createdAt?.slice(0, 10) === todayStr).length, [approvedUsers]);
  const activeAppointments = useMemo(() => allAppointments.filter(a => a.status === 'Scheduled').length, [allAppointments]);
  const appointmentsToday = useMemo(() => allAppointments.filter(a => a.createdAt?.slice(0, 10) === todayStr).length, [allAppointments]);

  /* ── sparkline: last 7 days ── */
  const days7 = useMemo(() => getLast7Days(), []);

  const residentSparkline = useMemo(() =>
    days7.map(d => ({ v: approvedUsers.filter(u => u.createdAt?.slice(0, 10) === d).length })),
    [approvedUsers, days7]);

  const aptSparkline = useMemo(() =>
    days7.map(d => ({ v: allAppointments.filter(a => a.createdAt?.slice(0, 10) === d).length })),
    [allAppointments, days7]);

  /* ── Appointments trend chart ── */
  const aptTrendData = useMemo(() => {
    if (aptRange === 'daily') {
      return days7.map(d => ({
        label: dayLabel(d),
        Scheduled: allAppointments.filter(a => getDateKey(a.rawDate) === d && a.status === 'Scheduled').length,
        Completed: allAppointments.filter(a => getDateKey(a.rawDate) === d && (a.status === 'Completed' || a.status === 'Closed')).length,
        Cancelled: allAppointments.filter(a => getDateKey(a.rawDate) === d && a.status === 'Cancelled').length,
      }));
    }
    if (aptRange === 'weekly') {
      return getLast7Weeks().map(({ label, start, end }) => ({
        label,
        Scheduled: allAppointments.filter(a => isoInWeek(a.rawDate, start, end) && a.status === 'Scheduled').length,
        Completed: allAppointments.filter(a => isoInWeek(a.rawDate, start, end) && (a.status === 'Completed' || a.status === 'Closed')).length,
        Cancelled: allAppointments.filter(a => isoInWeek(a.rawDate, start, end) && a.status === 'Cancelled').length,
      }));
    }
    if (aptRange === 'monthly') {
      return getLast6Months().map(({ key, label }) => ({
        label,
        Scheduled: allAppointments.filter(a => a.rawDate?.slice(0, 7) === key && a.status === 'Scheduled').length,
        Completed: allAppointments.filter(a => a.rawDate?.slice(0, 7) === key && (a.status === 'Completed' || a.status === 'Closed')).length,
        Cancelled: allAppointments.filter(a => a.rawDate?.slice(0, 7) === key && a.status === 'Cancelled').length,
      }));
    }
    if (aptRange === 'quarterly') {
      return getLast4Quarters().map(({ label, year, startMonth, endMonth }) => ({
        label,
        Scheduled: allAppointments.filter(a => isoInQuarter(a.rawDate, year, startMonth, endMonth) && a.status === 'Scheduled').length,
        Completed: allAppointments.filter(a => isoInQuarter(a.rawDate, year, startMonth, endMonth) && (a.status === 'Completed' || a.status === 'Closed')).length,
        Cancelled: allAppointments.filter(a => isoInQuarter(a.rawDate, year, startMonth, endMonth) && a.status === 'Cancelled').length,
      }));
    }
    // yearly
    return getLast4Years().map(({ label, year }) => ({
      label,
      Scheduled: allAppointments.filter(a => isoInYear(a.rawDate, year) && a.status === 'Scheduled').length,
      Completed: allAppointments.filter(a => isoInYear(a.rawDate, year) && (a.status === 'Completed' || a.status === 'Closed')).length,
      Cancelled: allAppointments.filter(a => isoInYear(a.rawDate, year) && a.status === 'Cancelled').length,
    }));
  }, [allAppointments, aptRange, days7]);

  /* ── Complaint status donut ── */
  const complaintDonut = useMemo(() => {
    const statuses = ['Pending', 'In Progress', 'Resolved', 'Escalated'];
    return statuses.map(s => ({
      name: s,
      value: allComplaints.filter(c => c.status === s).length,
    })).filter(d => d.value > 0);
  }, [allComplaints]);

  const DONUT_COLORS = { Pending: '#f59e0b', 'In Progress': '#3b82f6', Resolved: '#22c55e', Escalated: '#ef4444' };

  /* ── Complaints trend chart ── */
  const cmpTrendData = useMemo(() => {
    if (cmpRange === 'daily') {
      return days7.map(d => ({
        label: dayLabel(d),
        Filed: allComplaints.filter(c => getDateKey(c.createdAt) === d).length,
        Resolved: allComplaints.filter(c => c.status === 'Resolved' && getDateKey(c.createdAt) === d).length,
      }));
    }
    if (cmpRange === 'weekly') {
      return getLast7Weeks().map(({ label, start, end }) => ({
        label,
        Filed: allComplaints.filter(c => isoInWeek(c.createdAt?.slice(0, 10), start, end)).length,
        Resolved: allComplaints.filter(c => c.status === 'Resolved' && isoInWeek(c.createdAt?.slice(0, 10), start, end)).length,
      }));
    }
    if (cmpRange === 'monthly') {
      return getLast6Months().map(({ key, label }) => ({
        label,
        Filed: allComplaints.filter(c => c.createdAt?.slice(0, 7) === key).length,
        Resolved: allComplaints.filter(c => c.status === 'Resolved' && c.createdAt?.slice(0, 7) === key).length,
      }));
    }
    if (cmpRange === 'quarterly') {
      return getLast4Quarters().map(({ label, year, startMonth, endMonth }) => ({
        label,
        Filed: allComplaints.filter(c => isoInQuarter(c.createdAt, year, startMonth, endMonth)).length,
        Resolved: allComplaints.filter(c => c.status === 'Resolved' && isoInQuarter(c.createdAt, year, startMonth, endMonth)).length,
      }));
    }
    // yearly
    return getLast4Years().map(({ label, year }) => ({
      label,
      Filed: allComplaints.filter(c => isoInYear(c.createdAt, year)).length,
      Resolved: allComplaints.filter(c => c.status === 'Resolved' && isoInYear(c.createdAt, year)).length,
    }));
  }, [allComplaints, cmpRange, days7]);

  /* ── Resident growth chart ── */
  const residentGrowthData = useMemo(() => {
    if (resRange === 'daily') {
      return days7.map(d => ({
        label: dayLabel(d),
        New: approvedUsers.filter(u => getDateKey(u.createdAt) === d).length,
      }));
    }
    if (resRange === 'weekly') {
      return getLast7Weeks().map(({ label, start, end }) => ({
        label,
        New: approvedUsers.filter(u => isoInWeek(u.createdAt?.slice(0, 10), start, end)).length,
      }));
    }
    if (resRange === 'monthly') {
      return getLast6Months().map(({ key, label }) => ({
        label,
        New: approvedUsers.filter(u => u.createdAt?.slice(0, 7) === key).length,
      }));
    }
    if (resRange === 'quarterly') {
      return getLast4Quarters().map(({ label, year, startMonth, endMonth }) => ({
        label,
        New: approvedUsers.filter(u => isoInQuarter(u.createdAt, year, startMonth, endMonth)).length,
      }));
    }
    // yearly
    return getLast4Years().map(({ label, year }) => ({
      label,
      New: approvedUsers.filter(u => isoInYear(u.createdAt, year)).length,
    }));
  }, [approvedUsers, resRange, days7]);

  /* ── Category breakdown ── */
  const categoryData = useMemo(() => {
    const counts = {};
    allComplaints.forEach(c => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  }, [allComplaints]);

  const CAT_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4'];

  /* ── Activity summary ── */
  const activitySummaryData = useMemo(() => {
    if (actRange === 'daily') {
      return days7.map(d => ({
        label: dayLabel(d),
        Residents: approvedUsers.filter(u => getDateKey(u.createdAt) === d).length,
        Appointments: allAppointments.filter(a => getDateKey(a.createdAt) === d).length,
        Complaints: allComplaints.filter(c => getDateKey(c.createdAt) === d).length,
      }));
    }
    if (actRange === 'weekly') {
      return getLast7Weeks().map(({ label, start, end }) => ({
        label,
        Residents: approvedUsers.filter(u => isoInWeek(u.createdAt?.slice(0, 10), start, end)).length,
        Appointments: allAppointments.filter(a => isoInWeek(a.createdAt?.slice(0, 10), start, end)).length,
        Complaints: allComplaints.filter(c => isoInWeek(c.createdAt?.slice(0, 10), start, end)).length,
      }));
    }
    if (actRange === 'monthly') {
      return getLast6Months().map(({ key, label }) => ({
        label,
        Residents: approvedUsers.filter(u => u.createdAt?.slice(0, 7) === key).length,
        Appointments: allAppointments.filter(a => a.createdAt?.slice(0, 7) === key).length,
        Complaints: allComplaints.filter(c => c.createdAt?.slice(0, 7) === key).length,
      }));
    }
    if (actRange === 'quarterly') {
      return getLast4Quarters().map(({ label, year, startMonth, endMonth }) => ({
        label,
        Residents: approvedUsers.filter(u => isoInQuarter(u.createdAt, year, startMonth, endMonth)).length,
        Appointments: allAppointments.filter(a => isoInQuarter(a.createdAt, year, startMonth, endMonth)).length,
        Complaints: allComplaints.filter(c => isoInQuarter(c.createdAt, year, startMonth, endMonth)).length,
      }));
    }
    // yearly
    return getLast4Years().map(({ label, year }) => ({
      label,
      Residents: approvedUsers.filter(u => isoInYear(u.createdAt, year)).length,
      Appointments: allAppointments.filter(a => isoInYear(a.createdAt, year)).length,
      Complaints: allComplaints.filter(c => isoInYear(c.createdAt, year)).length,
    }));
  }, [approvedUsers, allAppointments, allComplaints, actRange, days7]);

  const reportData = useMemo(() => {
    const range = getReportPeriodRange(reportPeriod);
    const periodAppointments = allAppointments.filter(a => isInReportRange(a.rawDate || a.createdAt, range));
    const previousAppointments = allAppointments.filter(a => isInReportRange(a.rawDate || a.createdAt, range, true));
    const periodComplaints = allComplaints.filter(c => isInReportRange(c.createdAt, range));
    const previousComplaints = allComplaints.filter(c => isInReportRange(c.createdAt, range, true));
    const periodAnnouncements = allAnnouncements.filter(a => isInReportRange(a.createdAt, range));
    const periodResidents = approvedUsers.filter(u => isInReportRange(u.createdAt, range));

    const activeResidentIds = new Set(
      [...periodAppointments, ...periodComplaints]
        .map(residentIdentity)
        .filter(Boolean)
    );

    const serviceCounts = {
      'Barangay Clearance Requests': 0,
      'Certificates Issued': 0,
      'Other Services': 0,
    };
    periodAppointments.forEach((appt) => {
      serviceCounts[serviceTypeFromPurpose(appt.purpose)] += 1;
    });
    const serviceChart = Object.entries(serviceCounts).map(([name, value]) => ({ name, value }));
    const topService = [...serviceChart].sort((a, b) => b.value - a.value)[0];
    const topServiceName = topService?.value ? topService.name : 'no recorded service category';

    const onlineAppointments = periodAppointments.filter(a => a.userId).length;
    const walkInAppointments = periodAppointments.length - onlineAppointments;
    const resolvedComplaints = periodComplaints.filter(c => c.status === 'Resolved').length;
    const pendingComplaints = periodComplaints.filter(c => c.status === 'Pending').length;
    const complaintStatusChart = entriesToChart(countBy(periodComplaints, c => c.status), 4);
    const topIssues = entriesToChart(countBy(periodComplaints, c => c.category), 3);
    const topIssueName = topIssues[0]?.name;

    const eventTerms = ['event', 'meeting', 'assembly', 'activity', 'program', 'seminar', 'orientation'];
    const cleanupTerms = ['clean', 'cleanup', 'clean-up', 'linis', 'kalinisan', 'waste', 'garbage'];
    const incidentTerms = ['incident', 'safety', 'security', 'noise', 'dispute', 'violence', 'emergency', 'hazard'];
    const eventsConducted = periodAnnouncements.filter(a =>
      includesAny(`${a.category} ${a.title} ${a.body}`, eventTerms)
    ).length;
    const cleanupActivities = periodAnnouncements.filter(a =>
      includesAny(`${a.category} ${a.title} ${a.body}`, cleanupTerms)
    ).length;
    const reportedIncidents = periodComplaints.filter(c =>
      includesAny(`${c.category} ${c.description}`, incidentTerms)
    ).length;

    const announcementCategories = entriesToChart(countBy(periodAnnouncements, a => a.category), 3);
    const activeRate = percentOf(activeResidentIds.size, approvedUsers.length);

    let trendTitle = 'Activity Trend';
    let trendBuckets = [];
    if (reportPeriod === 'daily') {
      trendTitle = 'Last 7 Days Activity Trend';
      trendBuckets = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(range.end, -(6 - i));
        return {
          label: formatReportDate(d, { month: 'short', day: 'numeric' }),
          startKey: toLocalDateKey(d),
          endKey: toLocalDateKey(d),
        };
      });
    } else if (reportPeriod === 'weekly') {
      trendTitle = 'Last 6 Weeks Activity Trend';
      trendBuckets = Array.from({ length: 6 }, (_, i) => {
        const start = addDays(range.start, -(5 - i) * 7);
        const end = addDays(start, 6);
        return {
          label: `${formatReportDate(start, { month: 'short', day: 'numeric' })} - ${formatReportDate(end, { month: 'short', day: 'numeric' })}`,
          startKey: toLocalDateKey(start),
          endKey: toLocalDateKey(end),
        };
      });
    } else if (reportPeriod === 'quarterly') {
      trendTitle = 'Last 4 Quarters Activity Trend';
      trendBuckets = Array.from({ length: 4 }, (_, i) => {
        const start = startOfDay(new Date(range.start.getFullYear(), range.start.getMonth() - (3 * (3 - i)), 1));
        const end = startOfDay(new Date(start.getFullYear(), start.getMonth() + 3, 0));
        const { quarter } = getQuarterInfo(start);
        return {
          label: `Q${quarter} ${start.getFullYear()}`,
          startKey: toLocalDateKey(start),
          endKey: toLocalDateKey(end),
        };
      });
    } else {
      trendTitle = 'Last 4 Years Activity Trend';
      trendBuckets = Array.from({ length: 4 }, (_, i) => {
        const year = range.start.getFullYear() - (3 - i);
        return {
          label: String(year),
          startKey: `${year}-01-01`,
          endKey: `${year}-12-31`,
        };
      });
    }

    const inBucket = (value, bucket) => {
      const key = getDateKey(value);
      return key >= bucket.startKey && key <= bucket.endKey;
    };

    const trendChart = trendBuckets.map((bucket) => ({
      label: bucket.label,
      Appointments: allAppointments.filter(a => inBucket(a.rawDate || a.createdAt, bucket)).length,
      Complaints: allComplaints.filter(c => inBucket(c.createdAt, bucket)).length,
    }));

    const requestTotal = periodAppointments.length + periodComplaints.length;
    const previousRequestTotal = previousAppointments.length + previousComplaints.length;
    const observations = [
      compareSentence(requestTotal, previousRequestTotal, 'Service requests', range.comparisonLabel),
      topIssueName
        ? `The most common resident concern was ${topIssueName}.`
        : 'No common resident concern emerged from the recorded complaints.',
      activeRate > 0
        ? `${activeRate}% of registered residents used at least one tracked service this period.`
        : 'Resident service participation was not recorded for this period.',
    ];

    return {
      periodLabel: range.periodLabel,
      generatedDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      fileKey: range.fileKey,
      totalResidents: approvedUsers.length,
      activeResidents: activeResidentIds.size,
      activeRate,
      newResidents: periodResidents.length,
      totalAppointments: periodAppointments.length,
      onlineAppointments,
      walkInAppointments,
      clearanceRequests: serviceCounts['Barangay Clearance Requests'],
      certificatesIssued: serviceCounts['Certificates Issued'],
      otherServices: serviceCounts['Other Services'],
      topServiceName,
      totalComplaints: periodComplaints.length,
      resolvedComplaints,
      pendingComplaints,
      topIssues,
      totalAnnouncements: periodAnnouncements.length,
      eventsConducted,
      announcementCategoryChart: announcementCategories,
      reportedIncidents,
      cleanupActivities,
      observations,
      activityChart: [
        { name: 'New Residents', value: periodResidents.length },
        { name: 'Appointments', value: periodAppointments.length },
        { name: 'Complaints', value: periodComplaints.length },
        { name: 'Announcements', value: periodAnnouncements.length },
      ],
      serviceChart,
      appointmentSourceChart: [
        { name: 'Walk-ins', value: walkInAppointments },
        { name: 'Scheduled Online', value: onlineAppointments },
      ],
      complaintStatusChart,
      trendChart,
      trendTitle,
    };
  }, [allAnnouncements, allAppointments, allComplaints, approvedUsers, reportPeriod]);

  /* ── STAT CARDS CONFIG ── */
  const STAT_CARDS = [
    {
      label: 'Total Residents',
      value: approvedUsers.length,
      delta: `+${newResidentsToday} today`,
      deltaNote: 'new registrations',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="3"/><circle cx="16" cy="8" r="2.5"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><path d="M18 14c2.2.5 4 2.1 4 4.5"/></svg>,
      iconBg: '#eff6ff', iconColor: '#2563eb', deltaColor: '#16a34a',
    },
    {
      label: 'Active Appointments',
      value: activeAppointments,
      delta: `+${appointmentsToday} today`,
      deltaNote: 'scheduled',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="7" y="14" width="2" height="2" rx="0.5" fill="currentColor"/><rect x="11" y="14" width="2" height="2" rx="0.5" fill="currentColor"/></svg>,
      iconBg: '#e8f4fd', iconColor: '#3b82f6', deltaColor: '#16a34a',
    },
    {
      label: 'Total Complaints',
      value: allComplaints.length,
      delta: `${allComplaints.filter(c => c.status === 'Pending').length} pending`,
      deltaNote: 'awaiting action',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.7" fill="currentColor"/></svg>,
      iconBg: '#fef2f2', iconColor: '#ef4444',
      deltaColor: allComplaints.filter(c => c.status === 'Pending').length > 0 ? '#ef4444' : '#16a34a',
    },
    {
      label: 'Support Messages',
      value: messageStats.totalMessages,
      delta: `+${messageStats.messagesToday} today`,
      deltaNote: 'received',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="9" cy="11" r="0.8" fill="currentColor"/><circle cx="12" cy="11" r="0.8" fill="currentColor"/><circle cx="15" cy="11" r="0.8" fill="currentColor"/></svg>,
      iconBg: '#fdf0f7', iconColor: '#ec4899', deltaColor: '#16a34a',
    },
  ];

  const RANGE_OPTIONS = [
    { value: 'daily',     label: 'Daily' },
    { value: 'weekly',    label: 'Weekly' },
    { value: 'monthly',   label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly',    label: 'Yearly' },
  ];

  const reportRef = useRef(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadReportPDF = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const el = reportRef.current;
      if (!el) throw new Error('Report preview is not ready.');
      const pages = Array.from(el.querySelectorAll('.report-page'));
      if (!pages.length) throw new Error('Report pages are not ready.');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const reportPageWidthPx = 794;
      const reportPageHeightPx = 1123;

      for (const [index, page] of pages.entries()) {
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: reportPageWidthPx,
          height: reportPageHeightPx,
          windowWidth: reportPageWidthPx,
          windowHeight: reportPageHeightPx,
          onclone: (doc) => {
            doc.querySelectorAll('.report-render-surface').forEach((surface) => {
              surface.style.width = `${reportPageWidthPx}px`;
            });
            doc.querySelectorAll('.report-document').forEach((documentEl) => {
              documentEl.style.zoom = '1';
            });
            doc.querySelectorAll('.report-page').forEach((clonedPage) => {
              clonedPage.style.boxShadow = 'none';
              clonedPage.style.width = `${reportPageWidthPx}px`;
              clonedPage.style.height = `${reportPageHeightPx}px`;
              clonedPage.style.minHeight = `${reportPageHeightPx}px`;
              clonedPage.style.overflow = 'hidden';
            });
          },
        });
        const imgData = canvas.toDataURL('image/png');

        if (index > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
      }

      pdf.save(`NCESS-Residents-Report-${reportData.fileKey}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="dashboard-content">
        <div className="dashboard">
          <AdminTopbar
            placeholder="Search dashboard..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(o => !o)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <main className="dashboard__main">

            <div className="dashboard__heading">
              <div className="dashboard__heading-left">
                <h1>Dashboard Overview</h1>
                <p>Here's an overview of your Barangay.</p>
              </div>
              <button
                className={`pdf-download-btn${pdfLoading ? ' pdf-download-btn--loading' : ''}`}
                onClick={() => setReportPreviewOpen(true)}
                disabled={pdfLoading}
                title="Preview residents report PDF"
              >
                {pdfLoading ? (
                  <>
                    <svg className="pdf-download-btn__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    Exporting…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Preview PDF
                  </>
                )}
              </button>
            </div>

            {/* ── Stat Cards ── */}
            <div className="dashboard__stats">
              {STAT_CARDS.map(card => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>

            {/* ── Row 1: Appointment Trend + Complaint Donut ── */}
            <div className="chart-row chart-row--70-30">

              {/* Appointment trend */}
              <div className="panel">
                <SectionHeader title="Appointments Trend" subtitle="Scheduled vs completed vs cancelled" link="/adminappointments" />
                <div className="panel__controls">
                  <RangeToggle value={aptRange} onChange={setAptRange} options={RANGE_OPTIONS} />
                </div>
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={aptTrendData} barSize={10} barGap={3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                      <Bar dataKey="Scheduled" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Cancelled" fill="#f87171" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Complaint donut */}
              <div className="panel panel--center">
                <SectionHeader title="Complaint Status" subtitle="Current breakdown" link="/admincomplaints" />
                <div className="chart-area chart-area--donut">
                  {complaintDonut.length === 0 ? (
                    <div className="chart-empty">No complaints yet</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={150}>
                        <PieChart>
                          <Pie data={complaintDonut} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                            paddingAngle={3} dataKey="value">
                            {complaintDonut.map((entry) => (
                              <Cell key={entry.name} fill={DONUT_COLORS[entry.name] ?? '#9ca3af'} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <ul className="donut-legend">
                        {complaintDonut.map(d => (
                          <li key={d.name} className="donut-legend__item">
                            <span className="donut-legend__dot" style={{ background: DONUT_COLORS[d.name] ?? '#9ca3af' }} />
                            <span className="donut-legend__name">{d.name}</span>
                            <span className="donut-legend__val">{d.value}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Row 2: Resident Growth + Activity Summary ── */}
            <div className="chart-row chart-row--50-50">

              {/* Resident growth */}
              <div className="panel">
                <SectionHeader title="Resident Growth" subtitle="New approvals over time" link="/adminusers" />
                <div className="panel__controls">
                  <RangeToggle value={resRange} onChange={setResRange} options={RANGE_OPTIONS} />
                </div>
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={residentGrowthData}>
                      <defs>
                        <linearGradient id="gradResidents" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Area type="monotone" dataKey="New" stroke="#2563eb" strokeWidth={2} fill="url(#gradResidents)" dot={{ r: 3, fill: '#2563eb' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Activity summary */}
              <div className="panel">
                <SectionHeader title="Activity Summary" subtitle="Residents, appointments & complaints" />
                <div className="panel__controls">
                  <RangeToggle value={actRange} onChange={setActRange} options={RANGE_OPTIONS} />
                </div>
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={activitySummaryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Line type="monotone" dataKey="Residents" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Appointments" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Complaints" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ── Row 3: Complaint Trend + Category Breakdown ── */}
            <div className="chart-row chart-row--60-40">

              {/* Complaint trend */}
              <div className="panel">
                <SectionHeader title="Complaints Filed vs Resolved" subtitle="Track resolution progress" link="/admincomplaints" />
                <div className="panel__controls">
                  <RangeToggle value={cmpRange} onChange={setCmpRange} options={RANGE_OPTIONS} />
                </div>
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={cmpTrendData}>
                      <defs>
                        <linearGradient id="gradFiled" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Area type="monotone" dataKey="Filed" stroke="#ef4444" strokeWidth={2} fill="url(#gradFiled)" dot={{ r: 3 }} />
                      <Area type="monotone" dataKey="Resolved" stroke="#22c55e" strokeWidth={2} fill="url(#gradResolved)" dot={{ r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="panel">
                <SectionHeader title="Top Complaint Categories" subtitle="Most frequent issues" link="/admincomplaints" />
                <div className="chart-area">
                  {categoryData.length === 0 ? (
                    <div className="chart-empty">No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={categoryData} layout="vertical" barSize={10}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={90} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {categoryData.map((_, i) => (
                            <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* ── Row 4: Summary Cards ── */}
            <div className="summary-row">
              <div className="summary-card">
                <div className="summary-card__icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <p className="summary-card__value">{allComplaints.filter(c => c.status === 'Resolved').length}</p>
                  <p className="summary-card__label">Complaints Resolved</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card__icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div>
                  <p className="summary-card__value">{allAppointments.filter(a => a.status === 'Closed' || a.status === 'Completed').length}</p>
                  <p className="summary-card__label">Appointments Completed</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card__icon" style={{ background: '#fef9c3', color: '#92400e' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.7" fill="currentColor"/></svg>
                </div>
                <div>
                  <p className="summary-card__value">{allComplaints.filter(c => c.status === 'Escalated').length}</p>
                  <p className="summary-card__label">Escalated Cases</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card__icon" style={{ background: '#f1f0fe', color: '#8b5cf6' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <div>
                  <p className="summary-card__value">{allAnnouncements.length}</p>
                  <p className="summary-card__label">Announcements Posted</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card__icon" style={{ background: '#fdf0f7', color: '#ec4899' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14z"/></svg>
                </div>
                <div>
                  <p className="summary-card__value">{allUsers.filter(u => u.status === 'pending').length}</p>
                  <p className="summary-card__label">Pending Approvals</p>
                </div>
              </div>
            </div>

          </main>

          {reportPreviewOpen && (
            <div className="report-modal" role="dialog" aria-modal="true" aria-label="Barangay residents report preview">
              <div className="report-modal__panel">
                <div className="report-modal__bar">
                  <div>
                    <h2>PDF Preview</h2>
                    <p>Review the residents report before downloading.</p>
                  </div>
                  <div className="report-modal__actions">
                    <label className="report-period-field">
                      <span>Period</span>
                      <select
                        value={reportPeriod}
                        onChange={(e) => setReportPeriod(e.target.value)}
                      >
                        {REPORT_PERIOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="report-modal__primary"
                      onClick={handleDownloadReportPDF}
                      disabled={pdfLoading}
                    >
                      {pdfLoading ? (
                        <>
                          <svg className="pdf-download-btn__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                          Exporting...
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Download PDF
                        </>
                      )}
                    </button>
                    <button
                      className="report-modal__close"
                      onClick={() => setReportPreviewOpen(false)}
                      aria-label="Close report preview"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <div className="report-modal__body">
                  <div className="report-render-surface" ref={reportRef}>
                    <BarangayResidentsReport data={reportData} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
