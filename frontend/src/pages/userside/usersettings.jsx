import { useState, useEffect } from 'react';
import {
  Bell,
  MessageSquare,
  Globe,
  Accessibility,
  Check
} from 'lucide-react';
import Sidebar from '../../components/usersidebar';
import UserTopbar from '../../components/usertopbar';
import './usersettings.css';

export default function UserSettings() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [chatAlerts, setChatAlerts] = useState(true);
  const [reportUpdates, setReportUpdates] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [muteConversations, setMuteConversations] = useState(false);
  const [language, setLanguage] = useState('english');
  const [textSize, setTextSize] = useState('medium');

  const handleSave = () => {
    const settings = { notificationsEnabled, chatAlerts, reportUpdates, chatEnabled, muteConversations, language, textSize };
    localStorage.setItem('userSettings', JSON.stringify(settings));
    document.documentElement.setAttribute('data-text-size', textSize);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    const s = localStorage.getItem('userSettings');
    if (s) {
      const p = JSON.parse(s);
      setNotificationsEnabled(p.notificationsEnabled ?? true);
      setChatAlerts(p.chatAlerts ?? true);
      setReportUpdates(p.reportUpdates ?? true);
      setChatEnabled(p.chatEnabled ?? true);
      setMuteConversations(p.muteConversations ?? false);
      setLanguage(p.language ?? 'english');
      setTextSize(p.textSize ?? 'medium');
      document.documentElement.setAttribute('data-text-size', p.textSize ?? 'medium');
    }
  }, []);

  const Toggle = ({ checked, onChange, disabled }) => (
    <button
      className={`settings-toggle ${checked ? 'settings-toggle--on' : ''} ${disabled ? 'settings-toggle--disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      type="button"
    >
      <span className="settings-toggle__thumb" />
    </button>
  );

  const settingsQuery = search.trim().toLowerCase();
  const matchesSettings = (...terms) => (
    !settingsQuery || terms.some((term) => term.toLowerCase().includes(settingsQuery))
  );
  const visibleSections = {
    notifications: matchesSettings('notifications', 'enable notifications', 'chat message alerts', 'report status updates', 'alerts'),
    chat: matchesSettings('chat preferences', 'mute conversations', 'conversation alerts', 'chat'),
    language: matchesSettings('language', 'display language', 'english', 'filipino'),
    accessibility: matchesSettings('accessibility', 'text size', 'small', 'medium', 'large'),
  };
  const hasVisibleSettings = Object.values(visibleSections).some(Boolean);

  return (
    <div className="settings-layout">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="settings-page">
        <UserTopbar
          placeholder="Search settings..."
          search={search}
          onSearch={setSearch}
          onHamburger={() => setSidebarOpen(prev => !prev)}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="settings-main">
          <div className="settings-page-header">
            <h1 className="settings-title">Settings</h1>
            <p className="settings-subtitle">Manage your preferences</p>
          </div>

          <div className="settings-content">

            {visibleSections.notifications && (
            <section className="settings-card">
              <div className="settings-card__header">
                <span className="settings-card__icon settings-card__icon--bell"><Bell size={18} /></span>
                <h2 className="settings-card__title">Notifications</h2>
              </div>
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row__info">
                    <span className="settings-row__label">Enable Notifications</span>
                    <span className="settings-row__desc">Receive alerts from the system</span>
                  </div>
                  <Toggle checked={notificationsEnabled} onChange={setNotificationsEnabled} />
                </div>
                <div className="settings-row settings-row--sub">
                  <div className="settings-row__info">
                    <span className="settings-row__label">Chat Message Alerts</span>
                    <span className="settings-row__desc">Notify on new chat messages</span>
                  </div>
                  <Toggle checked={chatAlerts} onChange={setChatAlerts} disabled={!notificationsEnabled} />
                </div>
                <div className="settings-row settings-row--sub settings-row--last">
                  <div className="settings-row__info">
                    <span className="settings-row__label">Report Status Updates</span>
                    <span className="settings-row__desc">Notify when your reports change status</span>
                  </div>
                  <Toggle checked={reportUpdates} onChange={setReportUpdates} disabled={!notificationsEnabled} />
                </div>
              </div>
            </section>
            )}

            {visibleSections.chat && (
            <section className="settings-card">
              <div className="settings-card__header">
                <span className="settings-card__icon settings-card__icon--chat"><MessageSquare size={18} /></span>
                <h2 className="settings-card__title">Chat Preferences</h2>
              </div>
              <div className="settings-rows">
                {/* Enable Chat removed */}
                <div className="settings-row settings-row--last">
                  <div className="settings-row__info">
                    <span className="settings-row__label">Mute Conversations</span>
                    <span className="settings-row__desc">Silence all incoming chat sounds</span>
                  </div>
                  <Toggle checked={muteConversations} onChange={setMuteConversations} />
                </div>
              </div>
            </section>
            )}

            {visibleSections.language && (
            <section className="settings-card">
              <div className="settings-card__header">
                <span className="settings-card__icon settings-card__icon--lang"><Globe size={18} /></span>
                <h2 className="settings-card__title">Language</h2>
              </div>
              <div className="settings-rows">
                <div className="settings-row settings-row--last">
                  <span className="settings-row__label">Display Language</span>
                  <div className="settings-pill-group">
                    <button className={`settings-pill ${language === 'english' ? 'settings-pill--active' : ''}`} onClick={() => setLanguage('english')} type="button">🇺🇸 English</button>
                    <button className={`settings-pill ${language === 'filipino' ? 'settings-pill--active' : ''}`} onClick={() => setLanguage('filipino')} type="button">🇵🇭 Filipino</button>
                  </div>
                </div>
              </div>
            </section>
            )}

            {visibleSections.accessibility && (
            <section className="settings-card">
              <div className="settings-card__header">
                <span className="settings-card__icon settings-card__icon--access"><Accessibility size={18} /></span>
                <h2 className="settings-card__title">Accessibility</h2>
              </div>
              <div className="settings-rows">
                <div className="settings-row settings-row--last settings-row--col">
                  <div className="settings-row__info">
                    <span className="settings-row__label">Text Size</span>
                    <span className="settings-row__desc">Adjust the size of text throughout the app</span>
                  </div>
                  <div className="settings-text-size-group">
                    {['small', 'medium', 'large'].map((size) => (
                      <button key={size} className={`settings-text-size-btn settings-text-size-btn--${size} ${textSize === size ? 'settings-text-size-btn--active' : ''}`} onClick={() => setTextSize(size)} type="button">
                        A<span>{size.charAt(0).toUpperCase() + size.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            )}

            {!hasVisibleSettings && (
              <div className="settings-empty">No settings found for "{search}".</div>
            )}

            {hasVisibleSettings && (
            <div className="settings-actions">
              <button className={`settings-save-btn ${saved ? 'settings-save-btn--saved' : ''}`} onClick={handleSave}>
                {saved ? (<><Check size={16} /> Saved!</>) : 'Save Changes'}
              </button>
            </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
