import type { EnvironmentId } from './types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'dust' | 'leaf' | 'firefly' | 'spark' | 'spray' | 'star';
}

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
