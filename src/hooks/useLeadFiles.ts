import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { LeadFile } from '../types/database';

export function useLeadFiles() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<LeadFile[]>([]);

  async function refresh() {
    if (!profile?.dealer_id) return;
    const { data } = await supabase
      .from('lead_files')
      .select('*')
      .eq('dealer_id', profile.dealer_id)
      .order('created_at', { ascending: false });
    setFiles(data as LeadFile[] ?? []);
  }

  useEffect(() => { refresh(); }, [profile?.dealer_id]);

  return { files, refresh };
}
