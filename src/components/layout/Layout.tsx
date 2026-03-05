import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {children}
      </div>
    </div>
  )
}
