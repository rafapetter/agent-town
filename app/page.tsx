'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { TownCanvas } from '../components/TownCanvas';
import { Sidebar, Control } from '../components/Sidebar';
import { DashboardView } from '../components/DashboardView';
import { AgentPanel } from '../components/panels/AgentPanel';
import { ProjectPanel } from '../components/panels/ProjectPanel';
import { KanbanPanel } from '../components/panels/KanbanPanel';
import { ActivityPanel } from '../components/panels/ActivityPanel';
import { AnalyticsPanel } from '../components/panels/AnalyticsPanel';
import { ReviewsPanel } from '../components/panels/ReviewsPanel';
import { ChatPanel } from '../components/panels/ChatPanel';
import { ManagePanel } from '../components/panels/ManagePanel';
import { SettingsPanel } from '../components/panels/SettingsPanel';
import { TimelinePanel } from '../components/panels/TimelinePanel';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import { AgentSimulation } from '../lib/simulation';
import { SCENARIOS, type Scenario } from '../lib/scenarios';
import type { AgentTown } from '../src/index';
import type { EnvironmentId, ThemeId } from '../src/index';

type PresetKey = keyof typeof SCENARIOS;

export default function PlaygroundPage() {
  const townRef = useRef<AgentTown | null>(null);
  const simRef = useRef<AgentSimulation | null>(null);
  const uiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [env, setEnv] = useState<EnvironmentId>('office');
  const [theme, setTheme] = useState<ThemeId>('hybrid');
  const [activeTab, setActiveTab] = useState('agents');
  const [simStatus, setSimStatus] = useState<'stopped' | 'running' | 'paused'>('stopped');
  const [speed, setSpeed] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'canvas' | 'dashboard'>('canvas');
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

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setSpeed(v);
    simRef.current?.setSpeed(v);
  }, []);

  const startSimulation = useCallback((presetKey: PresetKey) => {
    const town = townRef.current;
    const sim = simRef.current;
    if (!town || !sim) return;

    stopSimulation();

    const scenario = SCENARIOS[presetKey];
    const agentCount = scenario.agents.length;
    const size = agentCount <= 6 ? 'small' : agentCount <= 14 ? 'medium' : 'large';
    town.setOfficeSize(size as any);
    town.removeAllAgents();
    town.clearTasks();
    town.clearReviews();
    town.clearActivityLog();
    town.clearObjectives();
    town.clearStories();
    town.clearSprints();

    // Clear existing workspaces
    for (const ws of town.getWorkspaces()) {
      town.removeWorkspace(ws.id);
    }

    // Auto-create workspaces from scenario presets
    if (scenario.workspaces) {
      for (const wsDef of scenario.workspaces) {
        const agentIds = scenario.agents
          .filter(a => a.team === wsDef.team)
          .map(a => a.id);
        town.addWorkspace({
          id: `ws_${wsDef.team.toLowerCase().replace(/\s+/g, '_')}`,
          name: wsDef.name,
          color: wsDef.color,
          agentIds,
        });
      }
    }

    // Add sprints
    for (const sprint of scenario.sprints) {
      town.addSprint({ ...sprint, status: 'active' });
    }

    // Add objectives
    for (const obj of scenario.objectives) {
      town.addObjective({ ...obj, status: 'active', description: obj.description });
    }

    // Add stories
    for (const story of scenario.stories) {
      town.addStory({ ...story, status: 'ready', description: story.description });
    }

    // Add tasks (all start in backlog)
    sim.taskCounter = scenario.tasks.length;
    sim.agentCounter = scenario.agents.length;
    for (const task of scenario.tasks) {
      town.addTask({ ...task, description: '', stage: 'backlog' });
    }

    // Stagger agent spawning
    let i = 0;
    const spawnNext = () => {
      if (i >= scenario.agents.length) {
        sim.start();
        sim.onUIUpdate = () => {
          rerender();
        };
        // Periodic UI refresh
        uiIntervalRef.current = setInterval(rerender, 2000);
        return;
      }
      const a = scenario.agents[i++];
      town.addAgent(a);
      sim.addAgent(a.id);
      town.logActivity(a.id, 'system', `${a.name} joined the team as ${a.role}`);
      rerender();
      spawnTimerRef.current = setTimeout(spawnNext, 500);
    };
    spawnNext();

    setSimStatus('running');
    rerender();
  }, [rerender]);

  const stopSimulation = useCallback(() => {
    simRef.current?.stop();
    if (spawnTimerRef.current) { clearTimeout(spawnTimerRef.current); spawnTimerRef.current = null; }
    if (uiIntervalRef.current) { clearInterval(uiIntervalRef.current); uiIntervalRef.current = null; }
    setSimStatus('stopped');
  }, []);

  const togglePause = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.paused) {
      sim.resume();
      setSimStatus('running');
    } else {
      sim.pause();
      setSimStatus('paused');
    }
  }, []);

  useEffect(() => {
    return () => {
      simRef.current?.destroy();
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      if (uiIntervalRef.current) clearInterval(uiIntervalRef.current);
    };
  }, []);

  const town = townRef.current;
  const sim = simRef.current;

  const tabs = [
    { id: 'agents', label: 'Agents' },
    { id: 'project', label: 'Project' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'manage', label: 'Manage' },
    { id: 'activity', label: 'Activity' },
    { id: 'reviews', label: 'Reviews', badge: town?.getPendingReviews().length },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
    { id: 'chat', label: 'Chat' },
  ];

  // ── Shared controls (used by both Sidebar and DashboardView) ──
  const controlsJSX = (
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
      <Control label="Preset">
        <select
          onChange={(e) => e.target.value && startSimulation(e.target.value as PresetKey)}
          defaultValue=""
        >
          <option value="" disabled>Select...</option>
          <option value="startup">Startup (4)</option>
          <option value="sprint">Sprint Team (8)</option>
          <option value="enterprise">Enterprise (12)</option>
        </select>
      </Control>
      <Control label="Speed">
        <div className="speed-control">
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={speed}
            onChange={handleSpeedChange}
          />
          <span className="speed-label">{speed.toFixed(1)}x</span>
        </div>
      </Control>
      {simStatus !== 'stopped' && (
        <>
          <button
            className={simStatus === 'paused' ? 'btn-g' : 'btn-w'}
            onClick={togglePause}
          >
            {simStatus === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button className="btn-s" onClick={stopSimulation}>Stop</button>
        </>
      )}
    </>
  );

  // ── Shared panel content (used by both Sidebar and DashboardView) ──
  const renderPanelContent = () => (
    <>
      {town && <WorkspaceSelector town={town} onWorkspaceChange={rerender} />}
      {town && sim && (
        <>
          {activeTab === 'agents' && <AgentPanel town={town} sim={sim} />}
          {activeTab === 'project' && <ProjectPanel town={town} />}
          {activeTab === 'kanban' && <KanbanPanel town={town} />}
          {activeTab === 'timeline' && <TimelinePanel town={town} />}
          {activeTab === 'manage' && <ManagePanel town={town} onUpdate={rerender} />}
          {activeTab === 'activity' && <ActivityPanel town={town} />}
          {activeTab === 'reviews' && <ReviewsPanel town={town} sim={sim} onUpdate={rerender} />}
          {activeTab === 'analytics' && <AnalyticsPanel town={town} sim={sim} />}
          {activeTab === 'settings' && (
            <SettingsPanel
              town={town}
              env={env}
              theme={theme}
              speed={speed}
              onEnvChange={(v) => { setEnv(v); town.setEnvironment(v); }}
              onThemeChange={(v) => { setTheme(v); town.setTheme(v); }}
              onSpeedChange={(v) => { setSpeed(v); simRef.current?.setSpeed(v); }}
            />
          )}
          {activeTab === 'chat' && <ChatPanel town={town} sim={sim} />}
        </>
      )}
      {!town && <div className="empty">Loading...</div>}
    </>
  );

  const githubLink = (
    <a href="https://github.com/rafapetter/agent-town" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', textDecoration: 'none', marginTop: 4 }} title="View on GitHub">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      github.com/rafapetter/agent-town
    </a>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Canvas — hidden but not unmounted in dashboard mode */}
      <div style={{
        flex: 1, minWidth: 0,
        display: viewMode === 'dashboard' ? 'none' : 'flex',
      }}>
        <TownCanvas
          theme={theme}
          environment={env}
          onTownReady={handleTownReady}
          onAgentClick={(id) => setActiveTab('agents')}
        />
      </div>

      {viewMode === 'canvas' ? (
        <Sidebar
          title="Agent Town"
          subtitle="Realistic agentic simulation"
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            setSidebarCollapsed(!sidebarCollapsed);
            setTimeout(() => townRef.current?.resize(), 220);
          }}
          subtitleExtra={githubLink}
          headerExtra={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <button
                onClick={() => setViewMode('dashboard')}
                title="Switch to Dashboard view"
                className="btn-s"
                style={{ fontSize: 10, padding: '3px 8px' }}
              >
                Dashboard
              </button>
              <div className={`sim-status ${simStatus}`}>
                <span className="pulse-dot" />
                <span>{simStatus.charAt(0).toUpperCase() + simStatus.slice(1)}</span>
              </div>
            </div>
          }
          controls={controlsJSX}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {renderPanelContent()}
        </Sidebar>
      ) : (
        <DashboardView
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSwitchToCanvas={() => {
            setViewMode('canvas');
            setTimeout(() => townRef.current?.resize(), 50);
          }}
          controls={controlsJSX}
          simStatus={simStatus}
          subtitleExtra={githubLink}
        >
          {renderPanelContent()}
        </DashboardView>
      )}
    </div>
  );
}
