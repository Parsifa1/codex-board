import { useEffect } from 'react'
import { useCredStore } from '@/store/credStore'
import { useConnection } from '@/hooks/useConnection'
import Layout from '@/components/layout/Layout'
import Header from '@/components/layout/Header'
import ConnectionPanel from '@/components/connection/ConnectionPanel'
import CredentialTabs from '@/components/credentials/CredentialTabs'
import BulkActionBar from '@/components/bulk/BulkActionBar'
import UsagePanel from '@/components/usage/UsagePanel'

export default function App() {
  const { reconnectFromStorage } = useConnection()
  const connected = useCredStore((s) => s.connected)

  useEffect(() => {
    reconnectFromStorage()
  }, [])

  return (
    <Layout>
      <Header />
      <ConnectionPanel />

      {connected && (
        <>
          <CredentialTabs />
          <UsagePanel />
        </>
      )}

      <BulkActionBar />
    </Layout>
  )
}
