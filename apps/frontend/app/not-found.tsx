"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Ghost } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// App-wide 404. `motion` (already a dependency) drives the entrance; the ghost keeps floating and
// wobbles on hover. No remote image and no extra font — the lucide icon and the app's own type
// scale carry it, so this page has nothing to load before it can render.
const container = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delayChildren: 0.1, staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const digit = (direction: number) => ({
  hidden: { opacity: 0, x: direction * 40, rotate: direction * 5 },
  visible: { opacity: 1, x: 0, rotate: 0, transition: { duration: 0.7 } },
});

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-background px-4">
      <motion.div className="text-center" variants={container} initial="hidden" animate="visible">
        <div className="mb-8 flex items-center justify-center gap-4 md:mb-12 md:gap-6">
          <motion.span
            className="select-none text-[80px] font-bold leading-none text-foreground/70 md:text-[120px]"
            variants={digit(-1)}
          >
            4
          </motion.span>
          <motion.div
            variants={{
              hidden: { opacity: 0, scale: 0.8, rotate: -5 },
              visible: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.6 } },
              floating: {
                y: [-6, 6],
                transition: { duration: 2, repeat: Infinity, repeatType: "reverse" },
              },
              hover: { scale: 1.1, rotate: [0, -6, 6, 0], transition: { duration: 0.8 } },
            }}
            animate={["visible", "floating"]}
            whileHover="hover"
          >
            <Ghost className="h-20 w-20 text-muted-foreground md:h-28 md:w-28" aria-hidden />
          </motion.div>
          <motion.span
            className="select-none text-[80px] font-bold leading-none text-foreground/70 md:text-[120px]"
            variants={digit(1)}
          >
            4
          </motion.span>
        </div>

        <motion.h1
          className="mb-4 text-3xl font-semibold text-foreground md:mb-6 md:text-5xl"
          variants={item}
        >
          Boo! Page missing!
        </motion.h1>

        <motion.p className="mb-8 text-base text-muted-foreground md:text-lg" variants={item}>
          Whoops! This page must be a ghost — it&apos;s not here.
        </motion.p>

        <motion.div variants={item} className="flex flex-col items-center gap-4">
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            Back to home
          </Link>
          <Link
            href="/track"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Track a shipment instead
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
