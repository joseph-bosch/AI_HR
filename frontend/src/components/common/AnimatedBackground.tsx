import { useRef, useState } from 'react';
import { motion, useMotionValue, useAnimationFrame } from 'framer-motion';

// BOSCH brand palette at watermark-level opacity
const BOSCH_COLORS = [
  'rgba(227, 6, 19, 0.08)',
  'rgba(139, 0, 139, 0.08)',
  'rgba(27, 20, 100, 0.08)',
  'rgba(0, 82, 165, 0.08)',
  'rgba(0, 180, 216, 0.08)',
  'rgba(0, 155, 58, 0.08)',
  'rgba(124, 179, 66, 0.08)',
];

export default function AnimatedBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ vx: 1.2, vy: 0.8 });
  const [colorIdx, setColorIdx] = useState(0);

  useAnimationFrame(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();

    const textW = Math.min(width * 0.55, 580);
    const textH = 90;
    const maxX = (width - textW) / 2;
    const maxY = (height - textH) / 2;

    let { x, y } = pos.current;
    let { vx, vy } = vel.current;

    x += vx;
    y += vy;

    let bounced = false;
    if (x > maxX || x < -maxX) {
      vx = -vx;
      x = Math.max(-maxX, Math.min(maxX, x));
      bounced = true;
    }
    if (y > maxY || y < -maxY) {
      vy = -vy;
      y = Math.max(-maxY, Math.min(maxY, y));
      bounced = true;
    }

    if (bounced) setColorIdx(prev => (prev + 1) % BOSCH_COLORS.length);

    pos.current = { x, y };
    vel.current = { vx, vy };
    offsetX.set(x);
    offsetY.set(y);
  });

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
    >
      {/* Gradient blobs */}
      <div
        className="bg-blob"
        style={{
          width: 500, height: 500, top: -100, right: -100,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.2))',
          animationDelay: '0s',
        }}
      />
      <div
        className="bg-blob"
        style={{
          width: 400, height: 400, top: '60%', left: -80,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.2))',
          animationDelay: '-3s', animationDuration: '10s',
        }}
      />
      <div
        className="bg-blob"
        style={{
          width: 350, height: 350, top: '30%', right: '20%',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))',
          animationDelay: '-5s', animationDuration: '12s',
        }}
      />

      {/* Bouncing watermark – changes color on edge bounce (BOSCH palette) */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0 }}>
        <motion.span
          className="watermark-text"
          style={{ x: offsetX, y: offsetY, display: 'block' }}
          animate={{ color: BOSCH_COLORS[colorIdx] }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          HR @ RBSZ
        </motion.span>
      </div>
    </div>
  );
}
