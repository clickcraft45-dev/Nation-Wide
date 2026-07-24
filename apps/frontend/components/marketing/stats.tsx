"use client";

import { useEffect, useRef, useState } from "react";

// Placeholder figures — swap for real numbers once available.
const STATS = [
  { label: "Shipments Delivered", value: 12000, suffix: "+" },
  { label: "Cities Served", value: 80, suffix: "+" },
  { label: "On-Time Rate", value: 99, suffix: "%" },
  { label: "Happy Customers", value: 5000, suffix: "+" },
];

function useCountUp(target: number, active: boolean, durationMs = 1400) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let frame: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target, durationMs]);

  return value;
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = useCountUp(value, active);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setActive(true);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="text-center">
      <p className="text-4xl font-semibold text-white">
        {count.toLocaleString()}
        {suffix}
      </p>
      <p className="mt-1 text-sm text-sidebar-foreground">{label}</p>
    </div>
  );
}

export function MarketingStats() {
  return (
    <section className="bg-sidebar-bg py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
    </section>
  );
}
