import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import AnimatedBackground from '../common/AnimatedBackground';
import Breadcrumb from '../common/Breadcrumb';
import ChatWidget from '../chat/ChatWidget';

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh';

  const toggleLang = () => {
    const next = isZh ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  return (
    <button
      onClick={toggleLang}
      className="flex items-center gap-1.5 text-sm font-medium bg-white/70 backdrop-blur-sm border border-slate-200 rounded-full px-4 py-1.5 hover:bg-white/90 transition-all shadow-sm"
    >
      <span className={!isZh ? 'text-indigo-600 font-semibold' : 'text-slate-400'}>EN</span>
      <span className="text-slate-300">|</span>
      <span className={isZh ? 'text-indigo-600 font-semibold' : 'text-slate-400'}>中文</span>
    </button>
  );
}

export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto animated-bg relative scrollbar-thin">
        <AnimatedBackground />
        <div className="absolute top-4 right-6 z-10">
          <LanguageSwitcher />
        </div>
        <div className="relative" style={{ zIndex: 1 }}>
          <Breadcrumb />
          <AnimatePresence mode="wait">
            <div key={location.pathname}>
              <Outlet />
            </div>
          </AnimatePresence>
        </div>
      </main>
      <ChatWidget />
    </div>
  );
}
