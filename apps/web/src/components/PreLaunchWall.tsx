'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/* ─────────────────────────────────────────────────────────────────
 * Configuration — adjust these before launch
 * ───────────────────────────────────────────────────────────────── */

/** Target launch date for the countdown. Set to null to hide the countdown. */
const LAUNCH_DATE: Date | null = new Date('2026-08-02T00:00:00Z');

/* ─────────────────────────────────────────────────────────────────
 * PreLaunchWall – premium pre-launch gate page
 * Renders outside the normal app shell (no Navbar, no Providers).
 * Always dark mode, centered composition, subtle animated bg.
 * ───────────────────────────────────────────────────────────────── */

export function PreLaunchWall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const countdown = useCountdown(LAUNCH_DATE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    let mouseX = -9999;
    let mouseY = -9999;
    let frame = 0;

    const resize = () => {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 18000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      radius: Math.random() * 1.8 + 0.6,
      phase: Math.random() * Math.PI * 2,
    }));

    // Mouse tracking for interactive glow
    const onMouse = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    const onMouseLeave = () => { mouseX = -9999; mouseY = -9999; };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mouseleave', onMouseLeave);

    const draw = () => {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      frame++;

      // Draw the atmospheric gradient overlays
      const grad1 = ctx!.createRadialGradient(
        canvas!.width * 0.25, canvas!.height * 0.15, 0,
        canvas!.width * 0.25, canvas!.height * 0.15, canvas!.width * 0.55,
      );
      grad1.addColorStop(0, 'rgba(39, 117, 202, 0.045)');
      grad1.addColorStop(1, 'rgba(39, 117, 202, 0)');
      ctx!.fillStyle = grad1;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      const grad2 = ctx!.createRadialGradient(
        canvas!.width * 0.78, canvas!.height * 0.88, 0,
        canvas!.width * 0.78, canvas!.height * 0.88, canvas!.width * 0.5,
      );
      grad2.addColorStop(0, 'rgba(39, 117, 202, 0.03)');
      grad2.addColorStop(1, 'rgba(39, 117, 202, 0)');
      ctx!.fillStyle = grad2;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      // Faint grid overlay — very subtle
      ctx!.strokeStyle = 'rgba(39, 117, 202, 0.025)';
      ctx!.lineWidth = 0.5;
      const gridSize = 48;
      for (let x = 0; x < canvas!.width; x += gridSize) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, canvas!.height);
        ctx!.stroke();
      }
      for (let y = 0; y < canvas!.height; y += gridSize) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(canvas!.width, y);
        ctx!.stroke();
      }

      // Update particles
      for (const p of particles) {
        p.x += p.vx + Math.sin(frame * 0.003 + p.phase) * 0.06;
        p.y += p.vy + Math.cos(frame * 0.004 + p.phase) * 0.06;

        // Wrap around edges with padding
        if (p.x < -20) p.x = canvas!.width + 20;
        if (p.x > canvas!.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas!.height + 20;
        if (p.y > canvas!.height + 20) p.y = -20;
      }

      // Draw connections between nearby particles
      const connectionDistance = Math.min(canvas!.width, canvas!.height) * 0.14;
      ctx!.lineWidth = 0.5;

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.15;
            ctx!.strokeStyle = `rgba(39, 117, 202, ${alpha})`;
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.stroke();
          }
        }
      }

      // Draw mouse connections (interactive)
      if (mouseX > 0 && mouseY > 0) {
        for (const p of particles) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance * 1.2) {
            const alpha = (1 - dist / (connectionDistance * 1.2)) * 0.2;
            ctx!.strokeStyle = `rgba(39, 117, 202, ${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.beginPath();
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(mouseX, mouseY);
            ctx!.stroke();
          }
        }
      }

      // Draw particle dots
      for (const p of particles) {
        const glow = 0.5 + Math.sin(frame * 0.02 + p.phase) * 0.2;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(147, 197, 253, ${glow * 0.4})`;
        ctx!.fill();
        // Core dot
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius * 0.5, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(147, 197, 253, ${glow * 0.8})`;
        ctx!.fill();
      }

      // Occasional data pulse — a wave ring that expands from a random point
      if (frame % 360 === 0) {
        const origin = particles[Math.floor(Math.random() * particles.length)];
        pulseData(ctx!, origin.x, origin.y, canvas!);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#060810] text-white overflow-hidden select-none">
      {/* Canvas — subtle animated network background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      />

      {/* Additional ambient glow — fixed gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: `
            radial-gradient(ellipse 70% 35% at 30% 5%, rgba(39, 117, 202, 0.06), transparent 60%),
            radial-gradient(ellipse 60% 40% at 75% 85%, rgba(39, 117, 202, 0.04), transparent 55%),
            radial-gradient(ellipse 50% 30% at 50% 50%, rgba(39, 117, 202, 0.02), transparent 50%)
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-16">
        <div className="w-full max-w-xl mx-auto text-center space-y-8">

          {/* Logo */}
          <div className="flex justify-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/orba-logo-light.svg"
              alt="Orba"
              className="h-10 md:h-12 w-auto opacity-90"
            />
          </div>

          {/* Headline */}
          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif font-normal leading-tight tracking-tight text-white"
          >
            The On-Chain Economy{' '}
            <span>Is Coming</span>
          </h1>

          {/* Supporting copy */}
          <p className="text-sm sm:text-base text-white/80 max-w-md mx-auto leading-relaxed">
            A stablecoin-native launchpad for launching, discovering, trading,
            and growing tokens on Arc.
          </p>

          {/* Status badge */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] uppercase text-[#5aa2e8] bg-[#2775CA]/10 border border-[#2775CA]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2775CA] animate-pulse" />
              Mainnet Launching Soon
            </span>
          </div>

          {/* Countdown */}
          {LAUNCH_DATE && countdown && (
            <div className="pt-2">
              <div className="flex items-center justify-center gap-4 sm:gap-6 font-mono">
                <CountdownUnit value={countdown.days} label="DAYS" />
                <span className="text-[#2775CA]/40 text-2xl sm:text-3xl font-light">:</span>
                <CountdownUnit value={countdown.hours} label="HOURS" />
                <span className="text-[#2775CA]/40 text-2xl sm:text-3xl font-light">:</span>
                <CountdownUnit value={countdown.minutes} label="MINUTES" />
                <span className="text-[#2775CA]/40 text-2xl sm:text-3xl font-light">:</span>
                <CountdownUnit value={countdown.seconds} label="SECONDS" />
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setNotifyOpen(true)}
              className="inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold tracking-wider uppercase transition-all duration-300 text-white bg-[#2775CA] hover:bg-[#1a5fa8] active:scale-[0.98] w-full sm:w-auto justify-center"
            >
              Get Notified
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            <a
              href="https://x.com/OrbaOnArc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold tracking-wider uppercase transition-all duration-300 text-[#9aa7bb] border border-[#2775CA]/30 hover:border-[#2775CA]/60 hover:text-white active:scale-[0.98] w-full sm:w-auto justify-center"
            >
              Follow the Launch
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>

          {/* Subtle footer */}
          <div className="pt-12">
            <p className="text-[#5c6675] text-xs tracking-wider font-mono uppercase">
              Powered by Arc • USDC-native
            </p>
          </div>
        </div>
      </div>

      {/* Notify Modal */}
      {notifyOpen && (
        <NotifyModal onClose={() => setNotifyOpen(false)} />
      )}
    </div>
  );
}

/* ─── Countdown unit ─────────────────────────────────────── */

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl sm:text-4xl md:text-5xl font-light tabular-nums tracking-wider text-white">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[9px] sm:text-[10px] tracking-[0.25em] text-[#5c6675] mt-1 uppercase font-mono">
        {label}
      </span>
    </div>
  );
}

/* ─── Notify Modal ───────────────────────────────────────── */

function NotifyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1528] border border-[#2775CA]/15 p-8 sm:p-10 max-w-sm w-full text-center shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#2775CA]/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-[#5aa2e8]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white mb-2">
          Notifications Coming Soon
        </h3>
        <p className="text-sm text-[#9aa7bb] leading-relaxed mb-6">
          We are finalizing the launch infrastructure. Subscribe notifications
          will be available closer to mainnet deployment.
        </p>
        <button
          onClick={onClose}
          className="px-6 py-2 text-sm font-medium text-white bg-[#2775CA] hover:bg-[#1a5fa8] transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/* ─── Countdown hook ─────────────────────────────────────── */

function useCountdown(target: Date | null) {
  const calc = useCallback(() => {
    if (!target) return null;
    const now = Date.now();
    const diff = target.getTime() - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  }, [target]);

  // Start with null to avoid hydration mismatch (server and client may disagree on the exact count)
  const [countdown, setCountdown] = useState<ReturnType<typeof calc>>(null);

  useEffect(() => {
    if (!target) return;
    setCountdown(calc());
    const interval = setInterval(() => setCountdown(calc()), 1000);
    return () => clearInterval(interval);
  }, [target, calc]);

  return countdown;
}

/* ─── Data pulse animation ───────────────────────────────── */

function pulseData(ctx: CanvasRenderingContext2D, x: number, y: number, canvas: HTMLCanvasElement, startRadius = 0, maxRadius = Math.min(canvas.width, canvas.height) * 0.5) {
  let radius = startRadius;
  const maxR = maxRadius;
  const step = 1.2;

  function animatePulse() {
    radius += step;
    const progress = radius / maxR;
    if (progress > 1) return;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(39, 117, 202, ${(1 - progress) * 0.15})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner glow
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(147, 197, 253, ${(1 - progress) * 0.08})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    requestAnimationFrame(animatePulse);
  }
  requestAnimationFrame(animatePulse);
}

/* ─── Particle type ──────────────────────────────────────── */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
}
