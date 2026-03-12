import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FileSearch,
  MessageSquare,
  FileText,
  HelpCircle,
  Sparkles,
  ClipboardList,
  ChevronDown,
  Network,
} from 'lucide-react';

// Sub-items under "Hiring Processes".
// `end: true` on Evaluations prevents /interviews/pipeline from matching it.
const hiringSubItems = [
  { to: '/screening',  labelKey: 'nav.screening',   icon: FileSearch,    end: false },
  { to: '/questions',  labelKey: 'nav.questions',   icon: HelpCircle,    end: false },
  { to: '/interviews', labelKey: 'nav.evaluations', icon: MessageSquare, end: true  },
  { to: '/offers',     labelKey: 'nav.offers',      icon: FileText,      end: false },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();

  // "Hiring Processes" group is active only when NOT on the pipeline page
  const isPipelinePath = location.pathname.startsWith('/interviews/pipeline');
  const hiringActive = !isPipelinePath && hiringSubItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  const [hiringOpen, setHiringOpen] = useState(hiringActive);

  const topItems = [
    { to: '/',                   label: t('nav.dashboard'),  icon: LayoutDashboard, end: true  },
    { to: '/jobs',               label: t('nav.jobs'),       icon: Briefcase,       end: false },
    { to: '/candidates',         label: t('nav.candidates'), icon: Users,           end: false },
    { to: '/interviews/pipeline',label: t('nav.pipeline'),   icon: ClipboardList,   end: false },
  ];

  return (
    <aside className="w-64 sidebar-gradient text-white h-screen flex flex-col overflow-y-auto scrollbar-hidden">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-indigo-200 to-purple-200 bg-clip-text text-transparent">
            HR - AI System
          </span>
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {/* Top-level flat items */}
        {topItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="block relative">
            {({ isActive }) => (
              <div
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 relative z-10 ${
                  isActive ? 'text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg nav-active-glow"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }} className="relative z-10">
                  <item.icon className="w-5 h-5" />
                </motion.div>
                <span className="relative z-10">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}

        {/* Hiring Processes collapsible group */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setHiringOpen(o => !o)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
              hiringActive ? 'text-white bg-white/10' : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }}>
              <Network className="w-5 h-5" />
            </motion.div>
            <span className="flex-1 text-left">{t('nav.hiringProcesses')}</span>
            <motion.span animate={{ rotate: hiringOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 opacity-60" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {hiringOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-1 ml-3 pl-3 border-l border-white/10 space-y-0.5">
                  {hiringSubItems.map((item) => {
                    // Evaluations (/interviews) needs custom matching:
                    // active for /interviews and /interviews/report/* but NOT /interviews/pipeline
                    const customActive = item.to === '/interviews'
                      ? (location.pathname === '/interviews' ||
                         (location.pathname.startsWith('/interviews/') && !location.pathname.startsWith('/interviews/pipeline')))
                      : null; // null = use NavLink's default isActive

                    return (
                      <NavLink key={item.to} to={item.to} end={item.end} className="block relative">
                        {({ isActive: navIsActive }) => {
                          const isActive = customActive !== null ? customActive : navIsActive;
                          return (
                            <div
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-200 relative z-10 ${
                                isActive ? 'text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5 font-normal'
                              }`}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="active-nav"
                                  className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg nav-active-glow"
                                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                />
                              )}
                              <item.icon className="w-4 h-4 relative z-10" />
                              <span className="relative z-10">{t(item.labelKey)}</span>
                            </div>
                          );
                        }}
                      </NavLink>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      <div className="p-4 border-t border-white/10 text-xs text-indigo-300/60">
        {t('nav.footer')}
      </div>
    </aside>
  );
}
