'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Check } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import { getInitials } from '@/lib/utils';

interface Props {
  moduleId:        string;
  existingUserIds: Set<string>;
  onClose:         () => void;
}

export function AssignUsersModal({ moduleId, existingUserIds, onClose }: Props) {
  const qc = useQueryClient();
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roleId,   setRoleId]   = useState('');
  const [errMsg,   setErrMsg]   = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn:  () => usersService.getUsers({ limit: 200 }),
  });

  const { data: roles } = useQuery({
    queryKey: ['module-roles', moduleId],
    queryFn:  () => modulesService.getModuleRoles(moduleId),
  });

  const assignMut = useMutation({
    mutationFn: () => usersService.bulkAssignToModule(moduleId, Array.from(selected), roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-members', moduleId] });
      qc.invalidateQueries({ queryKey: ['module', moduleId] });
      onClose();
    },
    onError: (e: Error) => setErrMsg(e.message ?? 'Error al asignar usuarios'),
  });

  const availableUsers = useMemo(() => {
    const all = usersData?.data ?? [];
    const q   = search.toLowerCase();
    return all.filter((u) => {
      if (existingUserIds.has(u.id)) return false;
      if (!q) return true;
      const name = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
      return name.includes(q);
    });
  }, [usersData, existingUserIds, search]);

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const canSubmit = selected.size > 0 && roleId && !assignMut.isPending;

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1px solid #E2E8F0', borderRadius: 8,
    background: '#fff', color: '#0F172A', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: 0 }}>Asignar usuarios al módulo</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
          {/* Role selector */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>ROL A ASIGNAR</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            style={{ ...inp, cursor: 'pointer' }}
          >
            <option value="">Seleccionar rol…</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* Search */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6, marginTop: 14 }}>BUSCAR USUARIOS</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              style={{ ...inp, paddingLeft: 32 }}
              placeholder="Nombre o correo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {availableUsers.length === 0 && (
            <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: '32px 20px' }}>
              {search ? 'Sin resultados' : 'Todos los usuarios ya están en este módulo'}
            </p>
          )}
          {availableUsers.map((u) => {
            const checked   = selected.has(u.id);
            const initials  = getInitials(u.first_name, u.last_name);
            return (
              <div
                key={u.id}
                onClick={() => toggleUser(u.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px',
                  cursor: 'pointer', background: checked ? '#F5F3FF' : 'transparent',
                  borderBottom: '1px solid #F8FAFC', transition: 'background .1s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: checked ? '2px solid #0e2235' : '2px solid #E2E8F0',
                  background: checked ? '#0e2235' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <Check size={12} color="#fff" strokeWidth={3} />}
                </div>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#0e2235',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#bfdbfe', flexShrink: 0, overflow: 'hidden',
                }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                    : initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0 }}>
                    {u.first_name} {u.last_name}
                  </p>
                  <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{u.email}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            {selected.size > 0 ? `${selected.size} seleccionado${selected.size > 1 ? 's' : ''}` : 'Ningún usuario seleccionado'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {errMsg && <span style={{ fontSize: 12, color: '#B91C1C', alignSelf: 'center' }}>{errMsg}</span>}
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => { setErrMsg(''); assignMut.mutate(); }}
              disabled={!canSubmit}
              style={{
                padding: '8px 16px', background: canSubmit ? '#0e2235' : '#94a3b8',
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              }}
            >
              {assignMut.isPending ? 'Asignando…' : 'Asignar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
