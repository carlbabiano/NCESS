import { useState } from 'react';
import UserSidebar from '../../components/usersidebar';
import UserTopbar from '../../components/usertopbar';
import './usersidehotlinemapping.css';

/* ── Data ── */
const BARANGAY_HALL = {
  name: 'Barangay Hall – New Cabalan',
  desc: 'For reports, assistance, local concerns and coordination.',
  numbers: ['09104845635', '224-5414'],
};

const EMERGENCY_RESPONSE = [
  {
    num: 1,
    name: 'OCPO – Olongapo City Police Office',
    desc: 'Police assistance, crime, public safety',
    number: '0919-245-0666',
    tel: '09192450666',
    scheme: 'blue',
    icon: 'shield',
  },
  {
    num: 2,
    name: 'BFP – Olongapo City Bureau of Fire Protection',
    desc: 'Fire emergency and fire-related incidents',
    number: '223-1415 / 610-9114',
    tel: '2231415',
    scheme: 'red',
    icon: 'flame',
  },
  {
    num: 3,
    name: 'Fire & Rescue',
    desc: 'Fire and rescue emergency response',
    number: '223-1415',
    tel: '2231415',
    scheme: 'red',
    icon: 'truck',
  },
  {
    num: 4,
    name: 'DRRMO / Olongapo Rescue',
    desc: 'Disaster Risk Reduction and Management Office',
    number: '0998-593-7446',
    tel: '09985937446',
    scheme: 'amber',
    icon: 'alert',
  },
];

const MEDICAL_DISASTER = [
  {
    num: 1,
    name: 'Philippine Red Cross',
    desc: 'Medical assistance and disaster response',
    number: '0917-889-2783 / 222-2181',
    tel: '09178892783',
    scheme: 'red',
    icon: 'cross',
  },
  {
    num: 2,
    name: 'Disaster Management Office',
    desc: 'City Disaster Management Office',
    number: '0998-536-7121',
    tel: '09985367121',
    scheme: 'purple',
    icon: 'people',
  },
];

const UTILITIES = [
  {
    num: 1,
    name: 'OEDC – Olongapo Electricity Distribution Company',
    desc: 'Electricity emergency and support',
    number: '0998-976-3369 / 047-222-0013',
    tel: '09989763369',
    scheme: 'green',
    icon: 'zap',
  },
];

const LOCAL_SUPPORT = [
  {
    num: 1,
    name: 'New Cabalan Fire & Rescue',
    desc: 'New Cabalan barangay fire and rescue',
    number: '224-5414',
    tel: '2245414',
    scheme: 'red',
    icon: 'flame',
  },
  {
    num: 2,
    name: 'Police Department 4',
    desc: 'Local police department',
    number: '09985985563',
    tel: '',
    scheme: 'blue',
    icon: 'shield',
  },
  {
    num: 3,
    name: 'City Hall Olongapo',
    desc: 'Olongapo City Hall main lines',
    number: '222-2565 / 611-4800',
    tel: '2222565',
    scheme: 'indigo',
    icon: 'building',
  },
];

const TIPS = [
  'Stay calm and provide clear information when calling.',
  'Know your location or the nearest landmark.',
  'Save these numbers offline for emergencies.',
  'Speak slowly and clearly when on the line.',
  'Do not hang up until instructed to do so.',
];

const HOURS = [
  { day: 'Monday – Thursday', time: '8:00 AM – 6:00 PM', closed: false },
  { day: 'Friday - Sunday', time: 'Closed', closed: true },
];

/* ── Icon Components ── */
function PhoneIcon({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={size} height={size}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

function ContactIcon({ type, size = 18 }) {
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', width: size, height: size };
  if (type === 'shield') return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
  if (type === 'flame')  return <svg {...props}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 3z"/></svg>;
  if (type === 'truck')  return <svg {...props}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
  if (type === 'alert')  return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="currentColor"/></svg>;
  if (type === 'cross')  return <svg {...props}><path d="M8 2h8v6h6v8h-6v6H8v-6H2v-8h6z"/></svg>;
  if (type === 'people') return <svg {...props}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
  if (type === 'zap')    return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  if (type === 'building') return <svg {...props}><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22V12h6v10M9 7h1M14 7h1M9 12h1M14 12h1"/></svg>;
  return <PhoneIcon size={size} />;
}

/* ── Section Component ── */
function ContactSection({ title, sub, iconType, iconScheme, contacts, search }) {
  const q = search.trim().toLowerCase();
  const filtered = contacts.filter(c =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.number.toLowerCase().includes(q) ||
    c.desc.toLowerCase().includes(q)
  );
  if (filtered.length === 0) return null;

  return (
    <section className="uhl-panel">
      <div className="uhl-panel__header">
        <div className="uhl-panel__header-left">
          <div className={`uhl-panel__header-icon uhl-scheme--${iconScheme}`}>
            <ContactIcon type={iconType} />
          </div>
          <div>
            <h2 className="uhl-panel__title">{title}</h2>
            {sub && <p className="uhl-panel__sub">{sub}</p>}
          </div>
        </div>
      </div>
      <ul className="uhl-contact-list">
        {filtered.map((c) => (
          <li className="uhl-contact-item" key={c.name}>
            {/* Remove icon for all contact sections except fallback */}
            {(title === "Emergency Response" || title === "Medical & Disaster Support" || title === "Utilities & Services" || title === "Additional Local Support") ? null : (
              <div className={`uhl-contact-icon uhl-scheme--${c.scheme}`}>
                <ContactIcon type={c.icon} />
              </div>
            )}
            <div
              className="uhl-contact-body"
              style={
                (title === "Emergency Response" || title === "Medical & Disaster Support" || title === "Utilities & Services" || title === "Additional Local Support")
                  ? { marginLeft: 50 } // aligns with icon space
                  : undefined
              }
            >
              <p className="uhl-contact-name">{c.name}</p>
              <p className="uhl-contact-desc">{c.desc}</p>
            </div>
            <a
              href={`tel:${c.tel}`}
              className={`uhl-contact-call ` +
                (title === "Emergency Response"
                  ? "uhl-call--red"
                  : title === "Medical & Disaster Support"
                  ? "uhl-call--green"
                  : title === "Utilities & Services"
                  ? "uhl-call--amber"
                  : title === "Additional Local Support"
                  ? "uhl-call--blue"
                  : `uhl-call--${c.scheme}`)
              }
            >
              <PhoneIcon size={12} />
              {c.number}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Main Component ── */
export default function UserSideHotlineMapping() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <UserSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="uhl-page">
          <UserTopbar
            placeholder="Search emergency contacts..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(prev => !prev)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <main className="uhl-main">
            {/* Heading */}
            <div className="uhl-heading__text">
              <h1>Emergency Hotline Mapping</h1>
              <p>Quickly find and call emergency numbers for urgent situations in Barangay New Cabalan.</p>
            </div>

            {/* Hero — Barangay Hall */}
            <div className="uhl-hero">
              <div className="uhl-hero__left">
                <div className="uhl-hero__icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div className="uhl-hero__text">
                  <h2>Barangay Hall – New Cabalan</h2>
                  <p>For reports, assistance, local concerns and coordination.</p>
                  <div className="uhl-hero__numbers">
                    {BARANGAY_HALL.numbers.map((n) => (
                      <span key={n} className="uhl-hero__num">
                        <PhoneIcon size={13} />
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="uhl-hero__right">
                <div className="uhl-hero__tip">
                  <div className="uhl-hero__tip-icon">🏛️</div>
                  <p><strong>Your first point of contact.</strong> We are here to help our community.</p>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div className="uhl-grid">
              <div className="uhl-left">
                <ContactSection
                  title="Emergency Response"
                  sub="Immediate response — police, fire, disaster"
                  iconType="alert"
                  iconScheme="red"
                  contacts={EMERGENCY_RESPONSE}
                  search={search}
                />
                <ContactSection
                  title="Medical & Disaster Support"
                  sub="Medical assistance and disaster relief"
                  iconType="cross"
                  iconScheme="green"
                  contacts={MEDICAL_DISASTER}
                  search={search}
                />
                <ContactSection
                  title="Utilities & Services"
                  sub="Power outages and utility emergencies"
                  iconType="zap"
                  iconScheme="amber"
                  contacts={UTILITIES}
                  search={search}
                />
                <ContactSection
                  title="Additional Local Support"
                  sub="Local barangay and city support lines"
                  iconType="building"
                  iconScheme="indigo"
                  contacts={LOCAL_SUPPORT}
                  search={search}
                />

                {/* All filtered out */}
                {search.trim() && [...EMERGENCY_RESPONSE, ...MEDICAL_DISASTER, ...UTILITIES, ...LOCAL_SUPPORT].filter((c) => {
                  const q = search.trim().toLowerCase();
                  return c.name.toLowerCase().includes(q) ||
                    c.number.toLowerCase().includes(q) ||
                    c.desc.toLowerCase().includes(q);
                }).length === 0 && (
                  <div className="uhl-panel">
                    <p className="uhl-empty">No contacts found for "{search}".</p>
                  </div>
                )}
              </div>

              {/* Right sidebar */}
              <aside className="uhl-right">
                {/* Tips */}
                <section className="uhl-panel">
                  <div className="uhl-panel__header">
                    <div className="uhl-panel__header-left">
                      <div className="uhl-panel__header-icon uhl-scheme--blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <circle cx="12" cy="16" r=".5" fill="currentColor"/>
                        </svg>
                      </div>
                      <div>
                        <h2 className="uhl-panel__title">Tips for Emergencies</h2>
                        <p className="uhl-panel__sub">Stay prepared, stay safe</p>
                      </div>
                    </div>
                  </div>
                  <ul className="uhl-tips-list">
                    {TIPS.map((tip) => (
                      <li className="uhl-tip-item" key={tip}>
                        <div className="uhl-tip-dot" />
                        <p className="uhl-tip-text">{tip}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Hours */}
                <section className="uhl-panel">
                  <div className="uhl-panel__header">
                    <div className="uhl-panel__header-left">
                      <div className="uhl-panel__header-icon uhl-scheme--amber">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                      </div>
                      <div>
                        <h2 className="uhl-panel__title">Barangay Hall Hours</h2>
                        <p className="uhl-panel__sub">Office operating schedule</p>
                      </div>
                    </div>
                  </div>
                  <ul className="uhl-hours-list">
                    {HOURS.map((h) => (
                      <li className="uhl-hour-item" key={h.day}>
                        <span className="uhl-hour-day">{h.day}</span>
                        {h.closed
                          ? <span className="uhl-hour-closed">Closed</span>
                          : <span className="uhl-hour-time">{h.time}</span>
                        }
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Reminder */}
                <div className="uhl-reminder">
                  <div className="uhl-reminder__icon">💡</div>
                  <div className="uhl-reminder__text">
                    <h4>Remember</h4>
                    <p>Provide your location, stay calm, and follow instructions from emergency responders.</p>
                  </div>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
