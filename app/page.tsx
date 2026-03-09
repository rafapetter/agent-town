'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { TownCanvas } from '../components/TownCanvas';
import { Sidebar, Control } from '../components/Sidebar';
import { AgentPanel } from '../components/panels/AgentPanel';
import { KanbanPanel } from '../components/panels/KanbanPanel';
import { ActivityPanel } from '../components/panels/ActivityPanel';
import { AnalyticsPanel } from '../components/panels/AnalyticsPanel';
import { ReviewsPanel } from '../components/panels/ReviewsPanel';
import { ChatPanel } from '../components/panels/ChatPanel';
import { ManagePanel } from '../components/panels/ManagePanel';
import { AgentSimulation } from '../lib/simulation';
import type { AgentTown } from '../src/index';
import type { EnvironmentId, ThemeId, RoomMode } from '../src/index';
import Link from 'next/link';

const NAMES = ['Claude', 'Nova', 'Atlas', 'Sage', 'Echo', 'Pixel', 'Blaze', 'Luna', 'Cosmo', 'Aria'];
const ROLES = ['Full Stack', 'Frontend', 'Backend', 'DevOps', 'QA', 'PM', 'Designer', 'Data Eng'];
const TEAMS = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const STATUSES = ['idle', 'typing', 'reading', 'thinking', 'waiting', 'success', 'error'] as const;
const TASK_TITLES = [
  'Implement auth module', 'Design landing page', 'API endpoint tests', 'CI/CD pipeline setup',
  'Fix login bugs', 'Add dark mode', 'Database migration', 'Real-time notifications',
  'Performance audit', 'Security hardening', 'Mobile responsive layout', 'E2E test suite',
];
const MSGS: Record<string, string[]> = {
  typing: ['Writing auth module...', 'Refactoring utils...', 'Implementing API...'],
  reading: ['Reading config.json', 'Scanning codebase...', 'Reviewing PR #42'],
  thinking: ['Analyzing codebase...', 'Planning approach...', 'Evaluating options...'],
  waiting: ['Needs approval', 'Waiting for review', 'Blocked on dependency'],
  success: ['Build passed!', 'Tests green!', 'Deploy complete!'],
  error: ['Test failed', 'Build error', 'Lint issues'],
};
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const STAGES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

type DemoMode = 'simple' | 'advanced' | 'enterprise';

export default function HomePage() {
  const townRef = useRef<AgentTown | null>(null);
  const simRef = useRef<AgentSimulation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [env, setEnv] = useState<EnvironmentId>('office');
  const [theme, setTheme] = useState<ThemeId>('hybrid');
  const [roomMode, setRoomMode] = useState<RoomMode>('environment');
  const [activeTab, setActiveTab] = useState('agents');
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);

  const handleTownReady = useCallback((town: AgentTown) => {
    townRef.current = town;
    simRef.current = new AgentSimulation(town);
    rerender();
  }, [rerender]);

  const handleEnvChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as EnvironmentId;
    setEnv(v);
    townRef.current?.setEnvironment(v);
  }, []);

  const handleThemeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as ThemeId;
    setTheme(v);
    townRef.current?.setTheme(v);
  }, []);

  const startDemo = useCallback((mode: DemoMode) => {
    const town = townRef.current;
    if (!town) return;
    stopDemo();

    const count = mode === 'simple' ? 4 : mode === 'advanced' ? 10 : 20;
    const size = count <= 6 ? 'small' : count <= 14 ? 'medium' : 'large';
    town.setOfficeSize(size as any);
    town.removeAllAgents();
    town.clearTasks();
    town.clearReviews();
    town.clearActivityLog();

    // Add tasks
    const taskCount = mode === 'simple' ? 8 : mode === 'advanced' ? 18 : 30;
    for (let i = 0; i < taskCount; i++) {
      town.addTask({
        id: `t${i}`, title: TASK_TITLES[i % TASK_TITLES.length],
        description: '', stage: pick(STAGES.slice(0, 4)),
        assigneeId: `a${i % count}`, assigneeName: NAMES[i % count],
        priority: pick(PRIORITIES),
      });
    }

    // Spawn agents staggered
    let i = 0;
    const spawnNext = () => {
      if (i >= count) {
        // Start cycling
        const interval = mode === 'enterprise' ? 1800 : mode === 'advanced' ? 2200 : 2800;
        timerRef.current = setInterval(() => {
          const agents = town.getAgents();
          if (!agents.length) return;
          const agent = pick(agents);
          const status = pick(STATUSES.filter(s => s !== agent.userStatus));
          const msgs = MSGS[status];
          town.updateAgent(agent.id, { status, message: msgs ? pick(msgs) : null });
          if (Math.random() < 0.3) {
            const tasks = town.getTasks().filter(t => t.stage !== 'done');
            if (tasks.length) {
              const task = pick(tasks);
              const si = STAGES.indexOf(task.stage as any);
              if (si < STAGES.length - 1) {
                town.updateTask(task.id, { stage: STAGES[si + 1], assigneeId: agent.id, assigneeName: agent.name });
              }
            }
          }
          rerender();
        }, interval);
        return;
      }
      const idx = i++;
      town.addAgent({
        id: `a${idx}`, name: NAMES[idx % NAMES.length],
        role: ROLES[idx % ROLES.length], team: TEAMS[idx % TEAMS.length],
      });
      rerender();
      setTimeout(spawnNext, 600);
    };
    spawnNext();
    setRunning(true);
  }, [rerender]);

  const stopDemo = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const town = townRef.current;
  const sim = simRef.current;

  const tabs = [
    { id: 'agents', label: 'Agents' },
    { id: 'activity', label: 'Activity' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'manage', label: 'Manage' },
    { id: 'reviews', label: 'Reviews', badge: town?.getPendingReviews().length },
    { id: 'analytics', label: 'Analytics' },
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <TownCanvas
        theme={theme}
        environment={env}
        onTownReady={handleTownReady}
        onAgentClick={(id) => { setActiveTab('agents'); }}
      />
      <Sidebar
        title="Agent Town"
        subtitle="Pixel-art AI agent visualization"
        subtitleExtra={
          <a href="https://github.com/rafapetter/agent-town" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', textDecoration: 'none', marginTop: 4 }} title="View on GitHub">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            github.com/rafapetter/agent-town
          </a>
        }
        headerExtra={
          <Link href="/playground" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
            Playground &rarr;
          </Link>
        }
        controls={
          <>
            <Control label="Environment">
              <select value={env} onChange={handleEnvChange}>
                <option value="office">Office</option>
                <option value="rocket">Rocket Launch</option>
                <option value="space_station">Space Station</option>
                <option value="farm">Farm &amp; Ranch</option>
                <option value="hospital">Hospital</option>
                <option value="pirate_ship">Pirate Ship</option>
                <option value="town">Town</option>
              </select>
            </Control>
            {env === 'office' && (
              <Control label="Theme">
                <select value={theme} onChange={handleThemeChange}>
                  <option value="casual">Casual</option>
                  <option value="business">Business</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Control>
            )}
            <Control label="Room Mode">
              <select
                value={roomMode}
                onChange={(e) => {
                  const m = e.target.value as RoomMode;
                  setRoomMode(m);
                  townRef.current?.setRoomMode(m);
                }}
              >
                <option value="environment">Standard</option>
                <option value="kanban">Kanban Stages</option>
              </select>
            </Control>
            <Control label="Demo">
              <select onChange={(e) => startDemo(e.target.value as DemoMode)} defaultValue="">
                <option value="" disabled>Select...</option>
                <option value="simple">Simple (4)</option>
                <option value="advanced">Advanced (10)</option>
                <option value="enterprise">Enterprise (20)</option>
              </select>
            </Control>
            {running && <button className="btn-s" onClick={stopDemo}>Stop</button>}
          </>
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {town && sim && (
          <>
            {activeTab === 'agents' && <AgentPanel town={town} sim={sim} />}
            {activeTab === 'activity' && <ActivityPanel town={town} />}
            {activeTab === 'kanban' && <KanbanPanel town={town} />}
            {activeTab === 'manage' && <ManagePanel town={town} onUpdate={rerender} />}
            {activeTab === 'reviews' && <ReviewsPanel town={town} sim={sim} onUpdate={rerender} />}
            {activeTab === 'analytics' && <AnalyticsPanel town={town} sim={sim} />}
            {activeTab === 'chat' && <ChatPanel town={town} sim={sim} />}
          </>
        )}
        {!town && <div className="empty">Loading...</div>}
      </Sidebar>
    </div>
  );
}
