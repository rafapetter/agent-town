import type { Priority } from '../src/types';

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export interface ScenarioAgent {
  id: string;
  name: string;
  role: string;
  team: string;
  skills?: string[];
}

export interface ScenarioObjective {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  sprintId?: string;
}

export interface ScenarioStory {
  id: string;
  objectiveId: string;
  title: string;
  description: string;
  priority: Priority;
  points?: number;
}

export interface ScenarioTask {
  id: string;
  storyId: string;
  title: string;
  priority: Priority;
}

export interface ScenarioSprint {
  id: string;
  name: string;
  goal: string;
}

export interface ScenarioWorkspace {
  name: string;
  color: string;
  team: string; // matches ScenarioAgent.team
}

export interface Scenario {
  name: string;
  description: string;
  agents: ScenarioAgent[];
  sprints: ScenarioSprint[];
  objectives: ScenarioObjective[];
  stories: ScenarioStory[];
  tasks: ScenarioTask[];
  workspaces?: ScenarioWorkspace[];
}

export const SCENARIOS: Record<string, Scenario> = {
  startup: {
    name: 'Startup Sprint',
    description: 'A 4-agent team building an MVP',
    agents: [
      { id: 'a0', name: 'Claude', role: 'Tech Lead', team: 'Core', skills: ['architecture', 'backend'] },
      { id: 'a1', name: 'Nova', role: 'Frontend', team: 'Core', skills: ['react', 'css'] },
      { id: 'a2', name: 'Atlas', role: 'Backend', team: 'Core', skills: ['api', 'database'] },
      { id: 'a3', name: 'Sage', role: 'QA', team: 'Core', skills: ['testing', 'automation'] },
    ],
    sprints: [
      { id: 's1', name: 'Sprint 1 — MVP', goal: 'Ship authentication and dashboard' },
    ],
    objectives: [
      { id: 'obj1', title: 'User Authentication', description: 'Complete auth flow with login, signup, and password reset', priority: 'critical', sprintId: 's1' },
      { id: 'obj2', title: 'Dashboard MVP', description: 'Basic analytics dashboard with charts', priority: 'high', sprintId: 's1' },
    ],
    stories: [
      { id: 'st1', objectiveId: 'obj1', title: 'Login/Signup Flow', description: 'Design and implement login form with validation', priority: 'critical', points: 5 },
      { id: 'st2', objectiveId: 'obj1', title: 'OAuth Integration', description: 'Add Google and GitHub OAuth providers', priority: 'high', points: 3 },
      { id: 'st3', objectiveId: 'obj2', title: 'Dashboard Layout', description: 'Responsive grid layout with sidebar navigation', priority: 'high', points: 5 },
      { id: 'st4', objectiveId: 'obj2', title: 'Chart Components', description: 'Line and bar chart components with real-time data', priority: 'medium', points: 3 },
    ],
    tasks: [
      { id: 't0', storyId: 'st1', title: 'Design login form UI', priority: 'critical' },
      { id: 't1', storyId: 'st1', title: 'Implement auth API endpoints', priority: 'critical' },
      { id: 't2', storyId: 'st1', title: 'Add session management', priority: 'high' },
      { id: 't3', storyId: 'st2', title: 'Setup OAuth providers', priority: 'high' },
      { id: 't4', storyId: 'st2', title: 'Token refresh flow', priority: 'medium' },
      { id: 't5', storyId: 'st3', title: 'Dashboard grid layout', priority: 'high' },
      { id: 't6', storyId: 'st3', title: 'Responsive sidebar', priority: 'medium' },
      { id: 't7', storyId: 'st4', title: 'Line chart component', priority: 'medium' },
      { id: 't8', storyId: 'st4', title: 'Bar chart component', priority: 'low' },
    ],
  },

  sprint: {
    name: 'Sprint Team',
    description: 'An 8-agent team in a full sprint',
    agents: [
      { id: 'a0', name: 'Claude', role: 'Tech Lead', team: 'Core', skills: ['architecture', 'backend'] },
      { id: 'a1', name: 'Nova', role: 'Frontend', team: 'Core', skills: ['react', 'css'] },
      { id: 'a2', name: 'Atlas', role: 'Backend', team: 'Core', skills: ['api', 'database'] },
      { id: 'a3', name: 'Sage', role: 'QA', team: 'Core', skills: ['testing', 'automation'] },
      { id: 'a4', name: 'Echo', role: 'DevOps', team: 'Platform', skills: ['ci-cd', 'docker'] },
      { id: 'a5', name: 'Pixel', role: 'Designer', team: 'Core', skills: ['ui', 'figma'] },
      { id: 'a6', name: 'Blaze', role: 'Full Stack', team: 'Platform', skills: ['node', 'react'] },
      { id: 'a7', name: 'Luna', role: 'Data Eng', team: 'Platform', skills: ['sql', 'etl'] },
    ],
    sprints: [
      { id: 's1', name: 'Sprint 2 — Platform', goal: 'Build API platform and expand auth' },
    ],
    objectives: [
      { id: 'obj1', title: 'User Authentication', description: 'Complete auth flow', priority: 'critical', sprintId: 's1' },
      { id: 'obj2', title: 'Dashboard MVP', description: 'Analytics dashboard', priority: 'high', sprintId: 's1' },
      { id: 'obj3', title: 'API Platform', description: 'REST API with rate limiting and docs', priority: 'high', sprintId: 's1' },
    ],
    stories: [
      { id: 'st1', objectiveId: 'obj1', title: 'Login/Signup Flow', description: 'Login form with validation', priority: 'critical', points: 5 },
      { id: 'st2', objectiveId: 'obj1', title: 'OAuth Integration', description: 'Google/GitHub OAuth', priority: 'high', points: 3 },
      { id: 'st3', objectiveId: 'obj1', title: 'Password Reset', description: 'Email-based password reset flow', priority: 'medium', points: 2 },
      { id: 'st4', objectiveId: 'obj2', title: 'Dashboard Layout', description: 'Responsive grid', priority: 'high', points: 5 },
      { id: 'st5', objectiveId: 'obj2', title: 'Chart Components', description: 'Interactive charts', priority: 'medium', points: 3 },
      { id: 'st6', objectiveId: 'obj3', title: 'REST Endpoints', description: 'CRUD API with validation', priority: 'high', points: 5 },
      { id: 'st7', objectiveId: 'obj3', title: 'Rate Limiting', description: 'Token bucket rate limiter', priority: 'medium', points: 3 },
      { id: 'st8', objectiveId: 'obj3', title: 'API Documentation', description: 'OpenAPI/Swagger docs', priority: 'low', points: 2 },
    ],
    tasks: [
      { id: 't0', storyId: 'st1', title: 'Design login form UI', priority: 'critical' },
      { id: 't1', storyId: 'st1', title: 'Implement auth API', priority: 'critical' },
      { id: 't2', storyId: 'st1', title: 'Add session management', priority: 'high' },
      { id: 't3', storyId: 'st2', title: 'Setup OAuth providers', priority: 'high' },
      { id: 't4', storyId: 'st2', title: 'Token refresh flow', priority: 'medium' },
      { id: 't5', storyId: 'st3', title: 'Email template for reset', priority: 'medium' },
      { id: 't6', storyId: 'st3', title: 'Reset token logic', priority: 'medium' },
      { id: 't7', storyId: 'st4', title: 'Dashboard grid layout', priority: 'high' },
      { id: 't8', storyId: 'st4', title: 'Responsive sidebar', priority: 'medium' },
      { id: 't9', storyId: 'st4', title: 'Widget framework', priority: 'medium' },
      { id: 't10', storyId: 'st5', title: 'Line chart component', priority: 'medium' },
      { id: 't11', storyId: 'st5', title: 'Bar chart component', priority: 'low' },
      { id: 't12', storyId: 'st6', title: 'User CRUD endpoints', priority: 'high' },
      { id: 't13', storyId: 'st6', title: 'Input validation middleware', priority: 'high' },
      { id: 't14', storyId: 'st6', title: 'Error handling middleware', priority: 'medium' },
      { id: 't15', storyId: 'st7', title: 'Token bucket implementation', priority: 'medium' },
      { id: 't16', storyId: 'st7', title: 'Rate limit headers', priority: 'low' },
      { id: 't17', storyId: 'st8', title: 'Generate OpenAPI spec', priority: 'low' },
      { id: 't18', storyId: 'st8', title: 'Swagger UI integration', priority: 'low' },
    ],
    workspaces: [
      { name: 'Core Team', color: '#E74C3C', team: 'Core' },
      { name: 'Platform Team', color: '#3498DB', team: 'Platform' },
    ],
  },

  enterprise: {
    name: 'Enterprise',
    description: '12-agent team across multiple sprints',
    agents: [
      { id: 'a0', name: 'Claude', role: 'Tech Lead', team: 'Core', skills: ['architecture'] },
      { id: 'a1', name: 'Nova', role: 'Frontend', team: 'Core', skills: ['react'] },
      { id: 'a2', name: 'Atlas', role: 'Backend', team: 'Core', skills: ['api'] },
      { id: 'a3', name: 'Sage', role: 'QA', team: 'Core', skills: ['testing'] },
      { id: 'a4', name: 'Echo', role: 'DevOps', team: 'Platform', skills: ['ci-cd'] },
      { id: 'a5', name: 'Pixel', role: 'Designer', team: 'Core', skills: ['ui'] },
      { id: 'a6', name: 'Blaze', role: 'Full Stack', team: 'Platform', skills: ['node'] },
      { id: 'a7', name: 'Luna', role: 'Data Eng', team: 'Platform', skills: ['sql'] },
      { id: 'a8', name: 'Cosmo', role: 'Security', team: 'Infra', skills: ['security'] },
      { id: 'a9', name: 'Aria', role: 'SRE', team: 'Infra', skills: ['monitoring'] },
      { id: 'a10', name: 'Bolt', role: 'Backend', team: 'Core', skills: ['database'] },
      { id: 'a11', name: 'Ivy', role: 'Frontend', team: 'Core', skills: ['css'] },
    ],
    sprints: [
      { id: 's1', name: 'Sprint 3 — Foundation', goal: 'Core product features' },
      { id: 's2', name: 'Sprint 4 — Hardening', goal: 'Security and infrastructure' },
    ],
    objectives: [
      { id: 'obj1', title: 'User Authentication', description: 'Complete auth', priority: 'critical', sprintId: 's1' },
      { id: 'obj2', title: 'Dashboard MVP', description: 'Analytics dashboard', priority: 'high', sprintId: 's1' },
      { id: 'obj3', title: 'API Platform', description: 'REST API', priority: 'high', sprintId: 's1' },
      { id: 'obj4', title: 'Infrastructure', description: 'CI/CD, monitoring, and scaling', priority: 'high', sprintId: 's2' },
      { id: 'obj5', title: 'Security Hardening', description: 'Audit and fix vulnerabilities', priority: 'critical', sprintId: 's2' },
    ],
    stories: [
      { id: 'st1', objectiveId: 'obj1', title: 'Login/Signup Flow', description: 'Auth UI', priority: 'critical', points: 5 },
      { id: 'st2', objectiveId: 'obj1', title: 'OAuth Integration', description: 'OAuth providers', priority: 'high', points: 3 },
      { id: 'st3', objectiveId: 'obj2', title: 'Dashboard Layout', description: 'Grid layout', priority: 'high', points: 5 },
      { id: 'st4', objectiveId: 'obj2', title: 'Chart Components', description: 'Charts', priority: 'medium', points: 3 },
      { id: 'st5', objectiveId: 'obj3', title: 'REST Endpoints', description: 'CRUD API', priority: 'high', points: 5 },
      { id: 'st6', objectiveId: 'obj3', title: 'Rate Limiting', description: 'Rate limiter', priority: 'medium', points: 3 },
      { id: 'st7', objectiveId: 'obj3', title: 'GraphQL Schema', description: 'GraphQL layer', priority: 'medium', points: 5 },
      { id: 'st8', objectiveId: 'obj4', title: 'CI/CD Pipeline', description: 'GitHub Actions', priority: 'high', points: 3 },
      { id: 'st9', objectiveId: 'obj4', title: 'Monitoring & Alerts', description: 'Observability', priority: 'high', points: 5 },
      { id: 'st10', objectiveId: 'obj4', title: 'Auto-scaling', description: 'K8s HPA', priority: 'medium', points: 3 },
      { id: 'st11', objectiveId: 'obj5', title: 'Security Audit', description: 'Vulnerability scan', priority: 'critical', points: 5 },
      { id: 'st12', objectiveId: 'obj5', title: 'Dependency Updates', description: 'Update deps', priority: 'high', points: 2 },
    ],
    tasks: [
      { id: 't0', storyId: 'st1', title: 'Design login form UI', priority: 'critical' },
      { id: 't1', storyId: 'st1', title: 'Implement auth API', priority: 'critical' },
      { id: 't2', storyId: 'st1', title: 'Session management', priority: 'high' },
      { id: 't3', storyId: 'st2', title: 'Setup OAuth providers', priority: 'high' },
      { id: 't4', storyId: 'st2', title: 'Token refresh flow', priority: 'medium' },
      { id: 't5', storyId: 'st3', title: 'Dashboard grid', priority: 'high' },
      { id: 't6', storyId: 'st3', title: 'Responsive sidebar', priority: 'medium' },
      { id: 't7', storyId: 'st4', title: 'Line chart', priority: 'medium' },
      { id: 't8', storyId: 'st4', title: 'Bar chart', priority: 'low' },
      { id: 't9', storyId: 'st5', title: 'User CRUD endpoints', priority: 'high' },
      { id: 't10', storyId: 'st5', title: 'Validation middleware', priority: 'high' },
      { id: 't11', storyId: 'st5', title: 'Error handling', priority: 'medium' },
      { id: 't12', storyId: 'st6', title: 'Token bucket impl', priority: 'medium' },
      { id: 't13', storyId: 'st6', title: 'Rate limit headers', priority: 'low' },
      { id: 't14', storyId: 'st7', title: 'Schema definition', priority: 'medium' },
      { id: 't15', storyId: 'st7', title: 'Resolvers', priority: 'medium' },
      { id: 't16', storyId: 'st7', title: 'Subscriptions', priority: 'low' },
      { id: 't17', storyId: 'st8', title: 'Build pipeline', priority: 'high' },
      { id: 't18', storyId: 'st8', title: 'Deploy pipeline', priority: 'high' },
      { id: 't19', storyId: 'st9', title: 'Prometheus metrics', priority: 'high' },
      { id: 't20', storyId: 'st9', title: 'Grafana dashboards', priority: 'medium' },
      { id: 't21', storyId: 'st9', title: 'Alert rules', priority: 'medium' },
      { id: 't22', storyId: 'st10', title: 'K8s manifests', priority: 'medium' },
      { id: 't23', storyId: 'st10', title: 'HPA configuration', priority: 'medium' },
      { id: 't24', storyId: 'st11', title: 'OWASP scan', priority: 'critical' },
      { id: 't25', storyId: 'st11', title: 'Fix vulnerabilities', priority: 'critical' },
      { id: 't26', storyId: 'st11', title: 'Penetration testing', priority: 'high' },
      { id: 't27', storyId: 'st12', title: 'Audit npm deps', priority: 'high' },
      { id: 't28', storyId: 'st12', title: 'Update outdated', priority: 'medium' },
    ],
    workspaces: [
      { name: 'Core Team', color: '#E74C3C', team: 'Core' },
      { name: 'Platform Team', color: '#3498DB', team: 'Platform' },
      { name: 'Infra Team', color: '#F39C12', team: 'Infra' },
    ],
  },
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>;
