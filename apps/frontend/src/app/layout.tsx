import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tickets System',
  description: 'Sistema modular de gestión de tickets',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
