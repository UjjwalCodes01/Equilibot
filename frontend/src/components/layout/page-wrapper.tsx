'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 overflow-y-auto p-6 bg-grid"
    >
      {children}
    </motion.main>
  )
}
