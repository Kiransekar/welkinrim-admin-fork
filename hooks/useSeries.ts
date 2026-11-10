'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface Series {
  id: string;
  label: string;
  description?: string;
  use_svg_logo: boolean;
  logo_src?: string;
  accent: string;
  text_on_accent: string;
  icon_url?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export function useSeries() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const loadFromSupabase = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('series')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('id', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('Error loading series from Supabase', error);
        setSeries([]);
        setLoading(false);
        return;
      }

      setSeries((data as Series[]) || []);
      setLoading(false);
    };

    void loadFromSupabase();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading series from Supabase', error);
      setSeries([]);
      setLoading(false);
      return;
    }

    setSeries((data as Series[]) || []);
    setLoading(false);
  }, []);

  const getAll = useCallback((): Series[] => {
    return series;
  }, [series]);

  const getById = useCallback((id: string): Series | undefined => {
    return series.find(s => s.id === id);
  }, [series]);

  const create = useCallback(async (newSeries: Series): Promise<boolean> => {
    const id = (newSeries.id || '').trim();
    const label = (newSeries.label || '').trim();
    if (!id || !label) return false;

    const row: Record<string, unknown> = {
      id,
      label,
      use_svg_logo: !!newSeries.use_svg_logo,
      logo_src: newSeries.logo_src || null,
      accent: newSeries.accent || '#ffc812',
      text_on_accent: newSeries.text_on_accent || '#000',
      icon_url: newSeries.icon_url || null,
      is_deleted: false,
    };
    if (newSeries.description) row.description = newSeries.description;

    let { error } = await supabase.from('series').insert(row);
    // The `description` column is optional in the schema; retry without it if it does not exist
    if (error && 'description' in row && /description/i.test(error.message)) {
      delete row.description;
      ({ error } = await supabase.from('series').insert(row));
    }

    if (error) {
      console.error('Error creating series', error);
      return false;
    }

    await refresh();
    return true;
  }, [refresh]);

  const update = useCallback(async (id: string, updates: Partial<Series>): Promise<boolean> => {
    // Only send editable columns (the form state also carries id/created_at/etc.)
    const row: Record<string, unknown> = {};
    if (updates.label !== undefined) row.label = updates.label;
    if (updates.use_svg_logo !== undefined) row.use_svg_logo = updates.use_svg_logo;
    if (updates.logo_src !== undefined) row.logo_src = updates.logo_src || null;
    if (updates.accent !== undefined) row.accent = updates.accent;
    if (updates.text_on_accent !== undefined) row.text_on_accent = updates.text_on_accent;
    if (updates.icon_url !== undefined) row.icon_url = updates.icon_url || null;
    if (updates.description !== undefined) row.description = updates.description;

    let { error } = await supabase.from('series').update(row).eq('id', id);
    if (error && 'description' in row && /description/i.test(error.message)) {
      delete row.description;
      ({ error } = await supabase.from('series').update(row).eq('id', id));
    }

    if (error) {
      console.error('Error updating series', error);
      return false;
    }

    await refresh();
    return true;
  }, [refresh]);

  // Soft delete - move to trash
  const softDelete = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('series')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Error soft deleting series', error);
      return false;
    }

    await refresh();
    return true;
  }, [refresh]);

  // Hard delete - permanent removal (used from trash page)
  const remove = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('series')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error permanently deleting series', error);
      return false;
    }

    await refresh();
    return true;
  }, [refresh]);

  const restore = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('series')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', id);
    if (error) {
      console.error('Error restoring series', error);
      return false;
    }

    await refresh();
    return true;
  }, [refresh]);

  const getDeleted = useCallback(async (): Promise<Series[]> => {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('Error loading deleted series', error);
      return [];
    }

    return (data as Series[]) || [];
  }, []);

  return {
    series,
    loading,
    getAll,
    getById,
    create,
    update,
    remove,
    softDelete,
    restore,
    getDeleted,
    refresh,
  };
}
