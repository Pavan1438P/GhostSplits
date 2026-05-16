import type { GroupData } from '@/app/page'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

let supabase: SupabaseClient | null = null

async function getSupabaseClient(): Promise<SupabaseClient> {
  if (supabase) return supabase

  const { createClient } = await import('@supabase/supabase-js')
  supabase = createClient(supabaseUrl!, supabaseAnonKey!)
  return supabase
}

export async function loadGroupData(groupId: string): Promise<GroupData | null> {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient
      .from('groups')
      .select('id,creator,members,transactions,created_at')
      .eq('id', groupId)
      .single()

    if (error) {
      console.error('Error loading group:', error.message)
      return null
    }

    if (!data) {
      console.warn('Group not found:', groupId)
      return null
    }

    return {
      id: data.id,
      creator: data.creator,
      members: data.members ?? [],
      transactions: data.transactions ?? [],
      createdAt: new Date(data.created_at),
    }
  } catch (err) {
    console.error('Load group exception:', err)
    return null
  }
}

export async function saveGroupData(groupData: GroupData): Promise<void> {
  const supabaseClient = await getSupabaseClient()
  const { error } = await supabaseClient.from('groups').upsert({
    id: groupData.id,
    creator: groupData.creator,
    members: groupData.members,
    transactions: groupData.transactions,
    created_at: groupData.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error('Error saving group:', error.message)
    throw new Error(`Failed to save group: ${error.message}`)
  }
}

export async function deleteGroupData(groupId: string): Promise<void> {
  const supabaseClient = await getSupabaseClient()
  await supabaseClient.from('groups').delete().eq('id', groupId)
}

export async function subscribeToGroup(
  groupId: string,
  callback: (groupData: GroupData | null) => void,
): Promise<() => void> {
  const supabaseClient = await getSupabaseClient()
  const channel = supabaseClient
    .channel(`group-${groupId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          callback(null)
          return
        }

        const row = payload.new
        if (row) {
          callback({
            id: row.id,
            creator: row.creator,
            members: row.members ?? [],
            transactions: row.transactions ?? [],
            createdAt: new Date(row.created_at),
          })
        }
      },
    )
    .subscribe()

  return () => {
    void supabaseClient.removeChannel(channel)
  }
}
