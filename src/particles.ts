import type { EnvironmentId, ParticleEventType } from './types';

type AmbientType = 'dust' | 'leaf' | 'firefly' | 'spark' | 'spray' | 'star';
type EventType = 'confetti' | 'burst' | 'pulse';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: AmbientType | EventType;
  rotation?: number;
  rotationSpeed?: number;
}

interface EventParticleConfig {
  type: EventType;
  count: number;
  colors: string[];
  speed: number;
  life: number;
  size: number;
  gravity?: number;
}

const EVENT_CONFIGS: Record<ParticleEventType, EventParticleConfig> = {
  task_picked: {
    type: 'burst', count: 8, colors: ['#FFD700', '#FFA500', '#FFE44D'],
    speed: 60, life: 0.6, size: 3,
  },
  task_completed: {
    type: 'confetti', count: 18, colors: ['#4CAF50', '#81C784', '#66BB6A', '#A5D6A7', '#FFD700'],
    speed: 80, life: 1.5, size: 4, gravity: 120,
  },
  review_submitted: {
    type: 'pulse', count: 3, colors: ['#FF9800', '#FFB74D', '#FFA726'],
    speed: 40, life: 0.8, size: 6,
  },
  error_burst: {
    type: 'burst', count: 14, colors: ['#F44336', '#E53935', '#FF5252', '#FF8A80'],
    speed: 90, life: 0.8, size: 3,
  },
  review_approved: {
    type: 'confetti', count: 22, colors: ['#4CAF50', '#81C784', '#A5D6A7', '#C8E6C9', '#FFD700'],
    speed: 100, life: 1.8, size: 4, gravity: 120,
  },
  review_rejected: {
    type: 'burst', count: 12, colors: ['#F44336', '#E53935', '#FF5252'],
    speed: 70, life: 0.7, size: 3,
  },
};

export class ParticleSystem {
  private particles: Particle[] = [];
  private maxParticles = 50;
  private spawnTimer = 0;
  private worldW = 0;
  private worldH = 0;
  private env: EnvironmentId = 'office';

  configure(env: EnvironmentId, gridW: number, gridH: number, tileSize: number): void {
    this.env = env;
    this.worldW = gridW * tileSize;
    this.worldH = gridH * tileSize;
    this.particles = [];
    this.spawnTimer = 0;
  }

  /** Spawn event particles at a world position — bypasses maxParticles cap */
  spawnEventParticles(worldX: number, worldY: number, eventType: ParticleEventType): void {
    const cfg = EVENT_CONFIGS[eventType];
    if (!cfg) return;

    for (let i = 0; i < cfg.count; i++) {
      const angle = (Math.PI * 2 * i) / cfg.count + (Math.random() - 0.5) * 0.4;
      const speed = cfg.speed * (0.5 + Math.random() * 0.5);
      const color = cfg.colors[i % cfg.colors.length];

      const p: Particle = {
        x: worldX, y: worldY,
        vx: Math.cos(angle) * speed,
        vy: cfg.type === 'confetti'
          ? -Math.abs(Math.sin(angle) * speed) - 30
          : Math.sin(angle) * speed,
        life: cfg.life * (0.7 + Math.random() * 0.3),
        maxLife: cfg.life,
        size: cfg.size * (0.7 + Math.random() * 0.6),
        color,
        type: cfg.type,
      };

      if (cfg.type === 'confetti') {
        p.rotation = Math.random() * Math.PI * 2;
        p.rotationSpeed = (Math.random() - 0.5) * 12;
      }

      this.particles.push(p);
    }
  }

  /** Spawn welding sparks at a specific world position (for rocket construction) */
  spawnWeldingSparks(worldX: number, worldY: number): void {
    if (this.particles.length >= this.maxParticles + 20) return;
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      this.particles.push({
        x: worldX, y: worldY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        life: 0.2 + Math.random() * 0.3,
        maxLife: 0.5,
        size: 1 + Math.random(),
        color: Math.random() > 0.5 ? '#FFAA33' : '#FFDD66',
        type: 'spark',
      });
    }
  }

  update(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.particles.length < this.maxParticles) {
      this.spawn();
      this.spawnTimer = this.getSpawnInterval();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (p.type === 'firefly') {
        p.vx += (Math.random() - 0.5) * 20 * dt;
        p.vy += (Math.random() - 0.5) * 20 * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
      } else if (p.type === 'leaf') {
        p.vx += Math.sin(Date.now() * 0.002 + p.y * 0.01) * 5 * dt;
      } else if (p.type === 'confetti') {
        // gravity
        p.vy += 120 * dt;
        // flutter
        p.vx += Math.sin(Date.now() * 0.003 + p.x * 0.02) * 15 * dt;
        if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
          p.rotation += p.rotationSpeed * dt;
        }
      } else if (p.type === 'pulse') {
        // expand
        p.size += 30 * dt;
      }

      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const fadeOut = Math.min(1, p.life / (p.maxLife * 0.3));
      const fadeIn = Math.min(1, (p.maxLife - p.life) / (p.maxLife * 0.15));
      const alpha = fadeOut * fadeIn;

      if (p.type === 'firefly') {
        const pulse = 0.4 + Math.sin(Date.now() * 0.01 + p.x * 0.1) * 0.6;
        ctx.fillStyle = `rgba(200,255,100,${(alpha * pulse * 0.4).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const rgb = this.hexToRgb(p.color);

      if (p.type === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation ?? 0);
        ctx.fillStyle = `rgba(${rgb},${(alpha * 0.85).toFixed(3)})`;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        continue;
      }

      if (p.type === 'burst') {
        ctx.fillStyle = `rgba(${rgb},${(alpha * 0.8).toFixed(3)})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        continue;
      }

      if (p.type === 'pulse') {
        ctx.strokeStyle = `rgba(${rgb},${(alpha * 0.6).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      // ambient particles
      ctx.fillStyle = `rgba(${rgb},${(alpha * 0.5).toFixed(3)})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  private spawn(): void {
    const { worldW: w, worldH: h } = this;

    switch (this.env) {
      case 'office':
        this.particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2 - 0.5,
          life: 5 + Math.random() * 5, maxLife: 10,
          size: Math.max(1, 1 + Math.random()), color: '#FFFFFF', type: 'dust',
        });
        break;
      case 'farm':
        if (Math.random() < 0.3) {
          this.particles.push({
            x: Math.random() * w, y: h * 0.3 + Math.random() * h * 0.6,
            vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
            life: 4 + Math.random() * 4, maxLife: 8,
            size: 2, color: '#CCFF44', type: 'firefly',
          });
        } else {
          this.particles.push({
            x: Math.random() * w, y: -5,
            vx: Math.random() * 5 + 2, vy: Math.random() * 10 + 5,
            life: 6 + Math.random() * 3, maxLife: 9,
            size: 3, color: '#8B6914', type: 'leaf',
          });
        }
        break;
      case 'space_station':
        this.particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
          life: 6 + Math.random() * 4, maxLife: 10,
          size: 1, color: '#88BBFF', type: 'star',
        });
        break;
      case 'rocket':
        this.particles.push({
          x: w * 0.7 + (Math.random() - 0.5) * w * 0.15,
          y: h * 0.8 + Math.random() * h * 0.1,
          vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 20 - 5,
          life: 0.4 + Math.random() * 0.6, maxLife: 1,
          size: 2, color: '#FFAA33', type: 'spark',
        });
        break;
      case 'pirate_ship':
        this.particles.push({
          x: Math.random() * w, y: h - Math.random() * h * 0.08,
          vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 12 - 3,
          life: 1 + Math.random() * 2, maxLife: 3,
          size: 2, color: '#88CCEE', type: 'spray',
        });
        break;
      case 'hospital':
        this.particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 1, vy: -Math.random() * 0.5,
          life: 8 + Math.random() * 5, maxLife: 13,
          size: 1, color: '#FFFFFF', type: 'dust',
        });
        break;
      case 'town':
        if (Math.random() < 0.7) {
          // drifting leaves — fall slowly with sine-wave horizontal drift
          this.particles.push({
            x: Math.random() * w, y: -5,
            vx: Math.random() * 4 + 1, vy: Math.random() * 8 + 4,
            life: 7 + Math.random() * 4, maxLife: 11,
            size: 3, color: '#8B6914', type: 'leaf',
          });
        } else {
          // dust motes — float upward slowly
          this.particles.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2 - 0.5,
            life: 6 + Math.random() * 5, maxLife: 11,
            size: 1, color: '#FFE4B5', type: 'dust',
          });
        }
        break;
    }
  }

  private getSpawnInterval(): number {
    switch (this.env) {
      case 'rocket': return 0.06;
      case 'pirate_ship': return 0.25;
      case 'farm': return 0.5;
      case 'office': return 1;
      case 'space_station': return 0.6;
      case 'hospital': return 2;
      case 'town': return 0.8;
      default: return 1;
    }
  }

  private hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  }
}
