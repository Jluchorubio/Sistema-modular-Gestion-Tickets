'use client';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  Handle, Position, MarkerType,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  Plus, Check, X, Trash2, MapPin, Users, GitBranch,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  ZoomIn, ZoomOut, Maximize2, Pencil, AlertCircle,
} from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { OrgNode, StructureType } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────────── */

const NODE_W  = 220;
const NODE_H  = 86;
const NSEP    = 40;   // horizontal gap between nodes at same level
const RSEP    = 80;   // vertical gap between levels

/* ─────────────────────────────────────────────────────────────────────────────
   WEIGHT HELPERS
   ───────────────────────────────────────────────────────────────────────────── */

const wColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#eab308' : '#64748b';

const wLabel = (w: number) =>
  w >= 9 ? 'Crítico' : w >= 7 ? 'Alto' : w >= 5 ? 'Medio' : 'Bajo';

/* ─────────────────────────────────────────────────────────────────────────────
   DAGRE LAYOUT
   dagre gives CENTER position → we store {x,y} = top-left + declare width/height
   so ReactFlow fitView works immediately without node measurement.
   ───────────────────────────────────────────────────────────────────────────── */

function flatList(nodes: OrgNode[], collapsed: Set<string>): OrgNode[] {
  const out: OrgNode[] = [];
  function walk(arr: OrgNode[]) {
    for (const n of arr) {
      out.push(n);
      if (n.children?.length && !collapsed.has(n.id)) walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

function edgeList(nodes: OrgNode[], collapsed: Set<string>): { src: string; tgt: string }[] {
  const out: { src: string; tgt: string }[] = [];
  function walk(arr: OrgNode[]) {
    for (const n of arr) {
      if (n.parent_id) out.push({ src: n.parent_id, tgt: n.id });
      if (n.children?.length && !collapsed.has(n.id)) walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

interface BuildCallbacks {
  onAdd:      (parentId: string, parentName: string) => void;
  onCollapse: (id: string) => void;
  onSelect:   (node: OrgNode) => void;
}

function buildLayout(
  tree:      OrgNode[],
  typeMap:   Map<string, StructureType>,
  collapsed: Set<string>,
  cbs:       BuildCallbacks,
): { nodes: Node[]; edges: Edge[] } {
  const flat  = flatList(tree, collapsed);
  const eList = edgeList(tree, collapsed);
  if (!flat.length) return { nodes: [], edges: [] };

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: NSEP, ranksep: RSEP, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));
  flat.forEach(n  => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  eList.forEach(e => g.setEdge(e.src, e.tgt));
  dagre.layout(g);

  const nodes: Node[] = flat.map(n => {
    const pos  = g.node(n.id);
    const type = typeMap.get(n.type_id);
    const color = type?.color ?? '#64748b';
    return {
      id:       n.id,
      type:     'orgCard',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      width:    NODE_W,   // ← key: RF uses this for immediate fitView
      height:   NODE_H,
      data: {
        node:        n,
        color,
        typeName:    type?.name ?? n.type_slug,
        hasChildren: !!n.children?.length,
        isCollapsed: collapsed.has(n.id),
        onAdd:       cbs.onAdd,
        onCollapse:  cbs.onCollapse,
        onSelect:    cbs.onSelect,
      },
    };
  });

  const edges: Edge[] = eList.map(e => ({
    id:        `e-${e.src}-${e.tgt}`,
    source:    e.src,
    target:    e.tgt,
    type:      'step',
    style:     { stroke: '#94a3b8', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 9, height: 9, color: '#94a3b8' },
  }));

  return { nodes, edges };
}

/* ─────────────────────────────────────────────────────────────────────────────
   ORG CARD NODE
   ───────────────────────────────────────────────────────────────────────────── */

type CardData = {
  node:        OrgNode;
  color:       string;
  typeName:    string;
  hasChildren: boolean;
  isCollapsed: boolean;
  onAdd:       (id: string, name: string) => void;
  onCollapse:  (id: string) => void;
  onSelect:    (n: OrgNode) => void;
};

function OrgCard({ data, selected }: NodeProps) {
  const d = data as CardData;
  const { node, color, typeName, hasChildren, isCollapsed } = d;
  const childCount = node.child_count ?? node.children?.length ?? 0;

  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: color, border: '2px solid #fff', width: 8, height: 8, top: -4 }} />

      <div
        onClick={e => { e.stopPropagation(); d.onSelect(node); }}
        style={{
          width:    NODE_W,
          height:   NODE_H,
          background: '#fff',
          borderRadius: 10,
          borderLeft:   `4px solid ${color}`,
          borderTop:    `1px solid ${selected ? color : '#e2e8f0'}`,
          borderRight:  `1px solid ${selected ? color : '#e2e8f0'}`,
          borderBottom: `1px solid ${selected ? color : '#e2e8f0'}`,
          boxShadow: selected
            ? `0 0 0 2px ${color}30, 0 4px 14px rgba(0,0,0,.1)`
            : '0 1px 6px rgba(0,0,0,.06)',
          display: 'flex', flexDirection: 'column',
          cursor: 'pointer',
          opacity: node.is_active === false ? 0.5 : 1,
          fontFamily: 'inherit',
          overflow: 'hidden',
          userSelect: 'none',
          transition: 'box-shadow .15s',
          boxSizing: 'border-box',
        }}
      >
        {/* Type badge */}
        <div style={{
          padding: '6px 10px 2px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: color,
            background: `${color}12`, padding: '1px 6px', borderRadius: 99,
            border: `1px solid ${color}25`,
          }}>
            {typeName}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: wColor(node.weight),
            background: `${wColor(node.weight)}12`, padding: '1px 5px', borderRadius: 4,
          }}>
            {node.weight}
          </span>
        </div>

        {/* Node name */}
        <div style={{
          flex: 1,
          padding: '0 10px 4px',
          display: 'flex', alignItems: 'center',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {node.name}
          </span>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0 8px 6px',
          display: 'flex', alignItems: 'center', gap: 4,
          borderTop: '1px solid #f1f5f9',
          paddingTop: 4,
        }}>
          {node.city && (
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
              <MapPin size={8} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.city}</span>
            </span>
          )}
          {!node.city && node.user_count > 0 && (
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              <Users size={8} />{node.user_count}
            </span>
          )}
          {!node.city && node.user_count <= 0 && <div style={{ flex: 1 }} />}

          {/* Add child */}
          <button type="button" title="Agregar hijo"
            onClick={e => { e.stopPropagation(); d.onAdd(node.id, node.name); }}
            style={{
              width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
              background: `${color}12`, color, border: `1px solid ${color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            <Plus size={9} />
          </button>

          {/* Collapse/expand */}
          {hasChildren && (
            <button type="button" title={isCollapsed ? 'Expandir' : 'Colapsar'}
              onClick={e => { e.stopPropagation(); d.onCollapse(node.id); }}
              style={{
                width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
                background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 10, fontWeight: 700,
              }}>
              {isCollapsed
                ? <span style={{ display: 'flex', alignItems: 'center' }}><ChevronRight size={8} /><span style={{ fontSize: 8 }}>{childCount}</span></span>
                : <ChevronDown size={9} />}
            </button>
          )}
        </div>

        {/* Collapsed hint bubble */}
        {isCollapsed && childCount > 0 && (
          <div style={{
            position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
            fontSize: 8, fontWeight: 700, color: '#64748b',
            background: '#f8fafc', border: '1px solid #e2e8f0',
            padding: '1px 6px', borderRadius: 99, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            +{childCount}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: color, border: '2px solid #fff', width: 8, height: 8, bottom: -4 }} />
    </>
  );
}

const nodeTypes = { orgCard: OrgCard };

/* ─────────────────────────────────────────────────────────────────────────────
   INNER TOOLBAR (inside ReactFlow — gets correct RF context)
   ───────────────────────────────────────────────────────────────────────────── */

function InnerToolbar({ onCollapseAll, onExpandAll }: { onCollapseAll: () => void; onExpandAll: () => void }) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const b: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: 'none', background: '#f8fafc',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#475569',
  };
  return (
    <Panel position="top-right">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
        <button style={b} title="Zoom +" type="button" onClick={() => zoomIn({ duration: 180 })}><ZoomIn size={12} /></button>
        <button style={b} title="Zoom -" type="button" onClick={() => zoomOut({ duration: 180 })}><ZoomOut size={12} /></button>
        <div style={{ height: 1, background: '#f1f5f9', margin: '1px 0' }} />
        <button style={b} title="Ajustar vista" type="button" onClick={() => fitView({ padding: 0.15, duration: 350 })}><Maximize2 size={12} /></button>
        <div style={{ height: 1, background: '#f1f5f9', margin: '1px 0' }} />
        <button style={b} title="Colapsar todo" type="button" onClick={onCollapseAll}><ChevronRight size={12} /></button>
        <button style={b} title="Expandir todo"  type="button" onClick={onExpandAll}><ChevronDown size={12} /></button>
      </div>
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FIT ON LAYOUT CHANGE
   Because we declare width/height on nodes, fitView works immediately.
   We still do a deferred call so layout animation looks smooth.
   ───────────────────────────────────────────────────────────────────────────── */

function FitOnChange({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    // Immediate: works because nodes declare width/height
    fitView({ padding: 0.15, duration: 0 });
    // Smooth follow-up after React renders
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────────────────────── */

function findNode(tree: OrgNode[], id: string): OrgNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) { const f = findNode(n.children, id); if (f) return f; }
  }
  return null;
}

function isDescendant(tree: OrgNode[], ancestorId: string, targetId: string): boolean {
  const n = findNode(tree, ancestorId);
  if (!n?.children?.length) return false;
  return n.children.some(c => c.id === targetId || isDescendant(tree, c.id, targetId));
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED STYLE TOKENS
   ───────────────────────────────────────────────────────────────────────────── */

const inp: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
  fontSize: 12, fontFamily: 'inherit', background: '#fff',
  width: '100%', boxSizing: 'border-box', outline: 'none', color: '#0e2235',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
};

/* ─────────────────────────────────────────────────────────────────────────────
   QUICK ADD PANEL  (floating form above canvas)
   ───────────────────────────────────────────────────────────────────────────── */

function QuickAddPanel({
  types, flatNodes, parentId, parentName,
  onSave, onCancel, isPending,
}: {
  types:     StructureType[];
  flatNodes: OrgNode[];
  parentId:  string;
  parentName: string;
  onSave:    (dto: { type_id: string; parent_id?: string; name: string; weight: number }) => void;
  onCancel:  () => void;
  isPending: boolean;
}) {
  const [typeId,  setTypeId]  = useState('');
  const [pid,     setPid]     = useState(parentId);
  const [name,    setName]    = useState('');
  const [weight,  setWeight]  = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPid(parentId); }, [parentId]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const ok = typeId && name.trim();

  return (
    <div style={{
      background: '#fff', border: '2px solid #ff5e3a', borderRadius: 12,
      padding: '16px 18px', marginBottom: 14,
      boxShadow: '0 8px 28px rgba(255,94,58,.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#fff5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GitBranch size={13} style={{ color: '#ff5e3a' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>
          {parentId ? `Nuevo hijo de "${parentName}"` : 'Nuevo nodo raíz'}
        </span>
        <button type="button" onClick={onCancel}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Tipo *</label>
          <select style={inp} value={typeId} onChange={e => setTypeId(e.target.value)}>
            <option value="">— tipo —</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Nombre *</label>
          <input ref={inputRef} style={inp} value={name}
            placeholder="Ej: Mesa de Ayuda, Laboratorio A..."
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ok) onSave({ type_id: typeId, parent_id: pid || undefined, name, weight }); }} />
        </div>
        <div>
          <label style={lbl}>Nodo padre</label>
          <select style={inp} value={pid} onChange={e => setPid(e.target.value)}>
            <option value="">— raíz —</option>
            {flatNodes.map(n => <option key={n.id} value={n.id}>[{n.type_slug}] {n.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <label style={{ ...lbl, margin: 0, flexShrink: 0 }}>Peso operacional</label>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1,2,3,4,5,6,7,8,9,10].map(v => (
            <button key={v} type="button" onClick={() => setWeight(v)}
              style={{
                width: 26, height: 26, borderRadius: 5, fontSize: 10, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                border: weight === v ? `1.5px solid ${wColor(v)}` : '1px solid #e2e8f0',
                background: weight === v ? `${wColor(v)}14` : '#f8fafc',
                color: weight === v ? wColor(v) : '#94a3b8',
              }}>
              {v}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: wColor(weight), flexShrink: 0 }}>
          {wLabel(weight)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!ok || isPending} onClick={() => onSave({ type_id: typeId, parent_id: pid || undefined, name, weight })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
            borderRadius: 8, background: ok ? '#ff5e3a' : '#e2e8f0',
            color: ok ? '#fff' : '#94a3b8', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: ok && !isPending ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}>
          {isPending ? '…' : <><Check size={13} /> Crear nodo</>}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NODE DETAIL SIDEBAR
   ───────────────────────────────────────────────────────────────────────────── */

type EditForm = {
  name: string; code: string; weight: number; description: string;
  address: string; city: string; country: string; phone: string; email: string;
  is_active: boolean; parent_id: string;
};

function toForm(n: OrgNode): EditForm {
  return {
    name: n.name, code: n.code ?? '', weight: n.weight,
    description: n.description ?? '', address: n.address ?? '',
    city: n.city ?? '', country: n.country ?? '',
    phone: n.phone ?? '', email: n.email ?? '',
    is_active: n.is_active, parent_id: n.parent_id ?? '',
  };
}

function NodeSidebar({
  node, typeColor, typeName, flatNodes,
  onClose, onAddChild,
  saveMut, deleteMut, toggleMut,
}: {
  node:      OrgNode;
  typeColor: string;
  typeName:  string;
  flatNodes: OrgNode[];
  onClose:   () => void;
  onAddChild: (id: string, name: string) => void;
  saveMut:   ReturnType<typeof useMutation<any, any, EditForm>>;
  deleteMut: ReturnType<typeof useMutation<any, any, void>>;
  toggleMut: ReturnType<typeof useMutation<any, any, { id: string; is_active: boolean }>>;
}) {
  const [tab,   setTab]   = useState<'info' | 'edit'>('info');
  const [form,  setForm]  = useState<EditForm>(toForm(node));
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setForm(toForm(node)); setDirty(false); setTab('info'); }, [node.id]);

  function upd<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
  }

  const tabB = (a: boolean): React.CSSProperties => ({
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: 'none', borderRadius: 5,
    background: a ? '#fff' : 'transparent',
    color: a ? '#0e2235' : '#94a3b8', transition: 'all .1s',
  });

  const childCount = node.child_count ?? node.children?.length ?? 0;

  return (
    <div style={{ background: '#fff', border: `1.5px solid ${typeColor}40`, borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: `${typeColor}08`, borderBottom: `1px solid ${typeColor}20` }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: typeColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
            {typeName}
            {node.parent_name && <> · hijo de <strong style={{ color: '#64748b' }}>{node.parent_name}</strong></>}
            {childCount > 0 && <> · {childCount} hijo{childCount !== 1 ? 's' : ''}</>}
          </div>
        </div>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 7, padding: 3, gap: 2 }}>
          <button style={tabB(tab === 'info')} onClick={() => setTab('info')}>Info</button>
          <button style={tabB(tab === 'edit')} onClick={() => setTab('edit')}>Editar</button>
        </div>
        <button title="Agregar hijo" onClick={() => onAddChild(node.id, node.name)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: `${typeColor}10`, color: typeColor, border: `1px solid ${typeColor}30`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={11} /> Hijo
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}>
          <X size={13} />
        </button>
      </div>

      {/* INFO TAB */}
      {tab === 'info' && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 20px', marginBottom: 14 }}>
            <InfoField label="Tipo"   v={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: typeColor, flexShrink: 0, display: 'inline-block' }} />{typeName}</span>} />
            <InfoField label="Peso"   v={<span style={{ fontWeight: 900, color: wColor(node.weight) }}>{node.weight} — {wLabel(node.weight)}</span>} />
            <InfoField label="Estado" v={<span style={{ color: node.is_active ? '#22c55e' : '#94a3b8', fontWeight: 700 }}>{node.is_active ? 'Activo' : 'Inactivo'}</span>} />
            {node.code    && <InfoField label="Código"   v={node.code} />}
            {node.city    && <InfoField label="Ciudad"   v={node.city} />}
            {node.phone   && <InfoField label="Teléfono" v={node.phone} />}
            {node.email   && <InfoField label="Email"    v={node.email} />}
            {node.address && <InfoField label="Dirección" v={node.address} />}
          </div>
          {node.description && (
            <div style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '8px 12px', borderRadius: 7, borderLeft: `3px solid ${typeColor}50`, marginBottom: 14, lineHeight: 1.6 }}>
              {node.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTab('edit')}
              style={{ padding: '6px 14px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Pencil size={10} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />Editar
            </button>
            <button
              onClick={() => toggleMut.mutate({ id: node.id, is_active: !node.is_active })}
              disabled={toggleMut.isPending}
              style={{ padding: '6px 12px', background: '#fff', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, color: node.is_active ? '#ef4444' : '#22c55e', border: `1px solid ${node.is_active ? '#fecaca' : '#bbf7d0'}` }}>
              {node.is_active ? <><ToggleRight size={12} />Desactivar</> : <><ToggleLeft size={12} />Activar</>}
            </button>
            <button
              onClick={() => { if (confirm(`¿Eliminar "${node.name}"?`)) deleteMut.mutate(); }}
              disabled={deleteMut.isPending}
              style={{ padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={11} />{deleteMut.isPending ? '…' : 'Eliminar'}
            </button>
          </div>
        </div>
      )}

      {/* EDIT TAB */}
      {tab === 'edit' && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Nombre *</label><input style={inp} value={form.name} onChange={e => upd('name', e.target.value)} /></div>
            <div><label style={lbl}>Código</label><input style={inp} value={form.code} placeholder="ej. BOG-01" onChange={e => upd('code', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Nodo padre</label>
              <select style={inp} value={form.parent_id} onChange={e => upd('parent_id', e.target.value)}>
                <option value="">— raíz (sin padre) —</option>
                {flatNodes.filter(n => n.id !== node.id).map(n => <option key={n.id} value={n.id}>[{n.type_slug}] {n.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Estado</label>
              <button onClick={() => upd('is_active', !form.is_active)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, width: '100%', color: form.is_active ? '#22c55e' : '#94a3b8', fontWeight: 700 }}>
                {form.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {form.is_active ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Peso operacional</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,7,8,9,10].map(v => (
                <button key={v} type="button" onClick={() => upd('weight', v)}
                  style={{ width: 26, height: 26, borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: form.weight === v ? `1.5px solid ${wColor(v)}` : '1px solid #e2e8f0', background: form.weight === v ? `${wColor(v)}14` : '#f8fafc', color: form.weight === v ? wColor(v) : '#94a3b8' }}>
                  {v}
                </button>
              ))}
              <span style={{ fontSize: 10, fontWeight: 700, color: wColor(form.weight), marginLeft: 4 }}>{wLabel(form.weight)}</span>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Descripción</label>
            <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={form.description} placeholder="Opcional..." onChange={e => upd('description', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>Dirección</label><input style={inp} value={form.address} placeholder="Calle..." onChange={e => upd('address', e.target.value)} /></div>
            <div><label style={lbl}>Ciudad</label><input style={inp} value={form.city} placeholder="Bogotá" onChange={e => upd('city', e.target.value)} /></div>
            <div><label style={lbl}>País</label><input style={inp} value={form.country} placeholder="CO" onChange={e => upd('country', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 14 }}>
            <div><label style={lbl}>Teléfono</label><input style={inp} value={form.phone} onChange={e => upd('phone', e.target.value)} /></div>
            <div><label style={lbl}>Email</label><input type="email" style={inp} value={form.email} onChange={e => upd('email', e.target.value)} /></div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => saveMut.mutate(form)} disabled={!form.name.trim() || saveMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 18px', borderRadius: 8, background: form.name.trim() ? (dirty ? '#ff5e3a' : '#0e2235') : '#e2e8f0', color: form.name.trim() ? '#fff' : '#94a3b8', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Check size={12} />{saveMut.isPending ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}
            </button>
            <button onClick={() => { setForm(toForm(node)); setDirty(false); }}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontFamily: 'inherit' }}>
              Restablecer
            </button>
          </div>
          {saveMut.isSuccess && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={10} /> Guardado correctamente.
            </div>
          )}
          {saveMut.isError && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={10} /> Error al guardar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoField({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600, lineHeight: 1.4 }}>{v ?? '—'}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES TAB
   ───────────────────────────────────────────────────────────────────────────── */

const ICON_PRESETS = ['folder','layers','grid','building','building-2','briefcase','map-pin','layout','users','git-branch','cpu','server','tool','shield','star','box','tag','flag'];

function slugify(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function TypesTab({ types }: { types: StructureType[] }) {
  const qc    = useQueryClient();
  const inv   = () => qc.invalidateQueries({ queryKey: ['org-structure-types'] });

  const createMut = useMutation({
    mutationFn: (dto: Omit<StructureType, 'id' | 'is_active'>) => systemConfigService.createStructureType(dto),
    onSuccess: inv,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...dto }: Partial<StructureType> & { id: string }) =>
      systemConfigService.updateStructureType(id, dto),
    onSuccess: inv,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => systemConfigService.deleteStructureType(id),
    onSuccess: inv,
  });

  const emptyForm = { name: '', slug: '', description: '', color: '#64748b', icon: 'folder', weight: 5, allows_users: true };
  const [creating,    setCreating]    = useState(false);
  const [newForm,     setNewForm]     = useState(emptyForm);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState<Partial<StructureType>>({});
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  const inp: React.CSSProperties = { padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box', color: '#0f172a', background: '#fafafa' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3 };

  const startEdit = (t: StructureType) => {
    setEditingId(t.id);
    setEditForm({ name: t.name, description: t.description ?? '', color: t.color ?? '#64748b', icon: t.icon ?? 'folder', weight: t.weight, allows_users: t.allows_users, is_active: t.is_active });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, maxWidth: 520 }}>
          Cada tipo tiene un peso base (usado como sugerencia al crear nodos). El motor de prioridad usa el <strong>peso individual de cada nodo</strong>, por lo que cualquier tipo nuevo funciona automáticamente en las automatizaciones.
        </p>
        {!creating && (
          <button onClick={() => { setCreating(true); setNewForm(emptyForm); }}
            style={{ flexShrink: 0, marginLeft: 12, padding: '5px 12px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Plus size={11} /> Nuevo tipo
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Nombre *</label>
              <input style={inp} value={newForm.name}
                onChange={e => setNewForm(p => ({ ...p, name: e.target.value, slug: slugify(e.target.value) }))}
                placeholder="ej. Laboratorio" />
            </div>
            <div>
              <label style={lbl}>Slug (auto)</label>
              <input style={inp} value={newForm.slug}
                onChange={e => setNewForm(p => ({ ...p, slug: slugify(e.target.value) }))}
                placeholder="laboratorio" />
            </div>
            <div>
              <label style={lbl}>Descripción</label>
              <input style={inp} value={newForm.description ?? ''}
                onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Opcional" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px 140px', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Color</label>
              <input type="color" value={newForm.color}
                onChange={e => setNewForm(p => ({ ...p, color: e.target.value }))}
                style={{ width: '100%', height: 32, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
            </div>
            <div>
              <label style={lbl}>Ícono (nombre Lucide)</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {ICON_PRESETS.map(ic => (
                  <button key={ic} type="button" onClick={() => setNewForm(p => ({ ...p, icon: ic }))}
                    style={{ padding: '2px 6px', fontSize: 10, borderRadius: 4, border: `1px solid ${newForm.icon === ic ? '#ff5e3a' : '#e2e8f0'}`, background: newForm.icon === ic ? '#fff5f0' : '#fff', color: newForm.icon === ic ? '#ff5e3a' : '#64748b', cursor: 'pointer', fontFamily: 'monospace' }}>
                    {ic}
                  </button>
                ))}
              </div>
              <input style={inp} value={newForm.icon ?? ''}
                onChange={e => setNewForm(p => ({ ...p, icon: e.target.value }))}
                placeholder="folder" />
            </div>
            <div>
              <label style={lbl}>Peso ({newForm.weight})</label>
              <input type="range" min={1} max={10} value={newForm.weight}
                onChange={e => setNewForm(p => ({ ...p, weight: +e.target.value }))}
                style={{ width: '100%', accentColor: newForm.color }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
              <label style={{ ...lbl, marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="checkbox" checked={newForm.allows_users}
                  onChange={e => setNewForm(p => ({ ...p, allows_users: e.target.checked }))} />
                Acepta usuarios
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)}
              style={{ padding: '5px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button
              disabled={!newForm.name.trim() || createMut.isPending}
              onClick={() => createMut.mutate({ ...newForm, sort_order: 50 } as Omit<StructureType, 'id' | 'is_active'>, { onSuccess: () => setCreating(false) })}
              style={{ padding: '5px 14px', background: newForm.name.trim() ? '#ff5e3a' : '#fca58a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {createMut.isPending ? '...' : 'Crear tipo'}
            </button>
          </div>
        </div>
      )}

      {/* Types list */}
      {types.map(t => (
        <div key={t.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8, borderLeft: `4px solid ${t.color ?? '#64748b'}`, opacity: t.is_active ? 1 : 0.55 }}>
          {editingId === t.id ? (
            /* Edit row */
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 60px', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={lbl}>Nombre</label>
                  <input style={inp} value={editForm.name ?? ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Color</label>
                  <input type="color" value={editForm.color ?? '#64748b'}
                    onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                    style={{ width: '100%', height: 32, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                </div>
                <div>
                  <label style={lbl}>Ícono</label>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
                    {ICON_PRESETS.map(ic => (
                      <button key={ic} type="button" onClick={() => setEditForm(p => ({ ...p, icon: ic }))}
                        style={{ padding: '1px 5px', fontSize: 10, borderRadius: 3, border: `1px solid ${editForm.icon === ic ? '#ff5e3a' : '#e2e8f0'}`, background: editForm.icon === ic ? '#fff5f0' : '#fff', color: editForm.icon === ic ? '#ff5e3a' : '#64748b', cursor: 'pointer', fontFamily: 'monospace' }}>
                        {ic}
                      </button>
                    ))}
                  </div>
                  <input style={inp} value={editForm.icon ?? ''} onChange={e => setEditForm(p => ({ ...p, icon: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Peso ({editForm.weight})</label>
                  <input type="range" min={1} max={10} value={editForm.weight ?? 5}
                    onChange={e => setEditForm(p => ({ ...p, weight: +e.target.value }))}
                    style={{ width: '100%', accentColor: editForm.color ?? '#64748b' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11, cursor: 'pointer', display: 'flex', gap: 5, alignItems: 'center', color: '#64748b' }}>
                  <input type="checkbox" checked={editForm.allows_users ?? true} onChange={e => setEditForm(p => ({ ...p, allows_users: e.target.checked }))} />
                  Acepta usuarios
                </label>
                <label style={{ fontSize: 11, cursor: 'pointer', display: 'flex', gap: 5, alignItems: 'center', color: editForm.is_active ? '#059669' : '#dc2626' }}>
                  <input type="checkbox" checked={editForm.is_active ?? true} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} />
                  {editForm.is_active ? 'Activo' : 'Inactivo'}
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditingId(null)}
                    style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                  <button disabled={updateMut.isPending}
                    onClick={() => updateMut.mutate({ id: t.id, ...editForm }, { onSuccess: () => setEditingId(null) })}
                    style={{ padding: '4px 12px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {updateMut.isPending ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* View row */
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: `${t.color ?? '#64748b'}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: t.color ?? '#64748b' }}>✦</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>{t.name}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8 }}>
                  <code style={{ fontFamily: 'monospace' }}>{t.slug}</code>
                  {t.icon && <span>ícono: <code style={{ fontFamily: 'monospace' }}>{t.icon}</code></span>}
                  {t.allows_users && <span style={{ color: '#059669', fontWeight: 600 }}>acepta usuarios</span>}
                  {!t.is_active && <span style={{ color: '#dc2626', fontWeight: 600 }}>inactivo</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>Peso</span>
                <input type="range" min={1} max={10} value={t.weight}
                  onChange={e => updateMut.mutate({ id: t.id, weight: +e.target.value })}
                  style={{ flex: 1, accentColor: t.color ?? '#64748b' }} />
                <span style={{ fontSize: 12, fontWeight: 800, minWidth: 18, color: wColor(t.weight) }}>{t.weight}</span>
              </div>
              <button onClick={() => startEdit(t)}
                style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 10, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit', flexShrink: 0 }}>
                <Pencil size={9} /> Editar
              </button>
              <button onClick={() => setConfirmDelId(confirmDelId === t.id ? null : t.id)}
                style={{ padding: '4px 8px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 5, fontSize: 10, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit', flexShrink: 0 }}>
                <Trash2 size={9} />
              </button>
            </div>
          )}
          {/* Inline confirm — outside ternary, inside outer wrapper */}
          {confirmDelId === t.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
              <span style={{ fontSize: 11, color: '#991b1b', flex: 1 }}>
                ¿Eliminar tipo <strong>{t.name}</strong>? Se enviará a la papelera (90 días).
              </span>
              <button
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(t.id, { onSuccess: () => setConfirmDelId(null) })}
                style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {deleteMut.isPending ? '...' : 'Eliminar'}
              </button>
              <button onClick={() => setConfirmDelId(null)}
                style={{ padding: '4px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 10, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CANVAS COMPONENT  (inside ReactFlowProvider)
   ───────────────────────────────────────────────────────────────────────────── */

function OrgCanvas({
  tree, typeMap, selectedId, setSelectedId,
  collapsed, setCollapsed, onAddChild, reparentMut,
  onCollapseAll, onExpandAll,
}: {
  tree:          OrgNode[];
  typeMap:       Map<string, StructureType>;
  selectedId:    string | null;
  setSelectedId: (id: string | null) => void;
  collapsed:     Set<string>;
  setCollapsed:  React.Dispatch<React.SetStateAction<Set<string>>>;
  onAddChild:    (parentId: string, parentName: string) => void;
  reparentMut:   ReturnType<typeof useMutation<any, any, { nodeId: string; parentId: string }>>;
  onCollapseAll: () => void;
  onExpandAll:   () => void;
}) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dropId,  setDropId]                 = useState<string | null>(null);
  const [layoutSeq, setLayoutSeq]            = useState(0);
  const dropRef                              = useRef<string | null>(null);
  const layoutRef                            = useRef<Node[]>([]);

  const onCollapse = useCallback((id: string) => {
    setCollapsed(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, [setCollapsed]);

  const onSelect = useCallback((n: OrgNode) => setSelectedId(n.id), [setSelectedId]);

  // Rebuild layout — store snapshot in ref for drag reset
  useEffect(() => {
    if (!tree.length) { setRfNodes([]); setRfEdges([]); layoutRef.current = []; return; }
    const { nodes, edges } = buildLayout(tree, typeMap, collapsed, { onAdd: onAddChild, onCollapse, onSelect });
    layoutRef.current = nodes;
    setRfNodes(nodes);
    setRfEdges(edges);
    setLayoutSeq(v => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, typeMap, collapsed]);

  // Drag reparent
  const onNodeDrag = useCallback((_: React.MouseEvent, dragged: Node) => {
    const cx = dragged.position.x + NODE_W / 2;
    const cy = dragged.position.y + NODE_H / 2;
    let hit: string | null = null;
    for (const n of rfNodes) {
      if (n.id === dragged.id) continue;
      if (cx >= n.position.x && cx <= n.position.x + NODE_W && cy >= n.position.y && cy <= n.position.y + NODE_H) { hit = n.id; break; }
    }
    dropRef.current = hit;
    setDropId(hit);
  }, [rfNodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, dragged: Node) => {
    const tgt = dropRef.current;
    dropRef.current = null;
    setDropId(null);
    if (!tgt) {
      // No valid drop target — snap back to dagre positions
      setRfNodes(layoutRef.current);
      return;
    }
    if (isDescendant(tree, dragged.id, tgt)) return;
    if (findNode(tree, dragged.id)?.parent_id === tgt) return;
    reparentMut.mutate({ nodeId: dragged.id, parentId: tgt });
  }, [tree, reparentMut]);

  const onNodeClick = useCallback((_: React.MouseEvent, n: Node) => setSelectedId(n.id), [setSelectedId]);

  const layoutKey = String(layoutSeq);

  if (rfNodes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafbfc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <GitBranch size={22} style={{ color: '#94a3b8' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Sin estructura organizacional</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Usa "+ Nuevo nodo" para construir la jerarquía.</div>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={rfNodes.map(n => ({
        ...n,
        selected: n.id === selectedId,
        style: n.id === dropId ? { outline: '2px solid #ff5e3a', borderRadius: 12, outlineOffset: 3 } : undefined,
      }))}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={() => setSelectedId(null)}
      onInit={inst => { inst.fitView({ padding: 0.15, duration: 0 }); }}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.06}
      maxZoom={1.5}
      nodesDraggable={!reparentMut.isPending}
      nodesConnectable={false}
      elementsSelectable
      style={{ background: '#fafbfc' }}
    >
      <Background variant={'dots' as any} color="#d1d5db" gap={24} size={1} />
      <MiniMap
        nodeColor={n => (n.data as CardData).color ?? '#64748b'}
        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
        maskColor="rgba(241,245,249,.85)"
      />
      <InnerToolbar onCollapseAll={onCollapseAll} onExpandAll={onExpandAll} />
      <FitOnChange layoutKey={layoutKey} />

      {/* Status bar */}
      <Panel position="bottom-left">
        <div style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(250,251,252,.9)', padding: '3px 10px', borderRadius: 6, border: '1px solid #f1f5f9', backdropFilter: 'blur(4px)' }}>
          {reparentMut.isPending
            ? '⟳ Cambiando padre…'
            : `${rfNodes.length} nodo${rfNodes.length !== 1 ? 's' : ''} · Arrastra sobre otro → reparentar`}
          {collapsed.size > 0 && <span style={{ marginLeft: 8, fontWeight: 600, color: '#64748b' }}>· {collapsed.size} colapsada{collapsed.size !== 1 ? 's' : ''}</span>}
        </div>
      </Panel>
    </ReactFlow>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   LIST TAB — tree-table view (no canvas needed)
   ───────────────────────────────────────────────────────────────────────────── */

function flattenSearch(nodes: OrgNode[], q: string): OrgNode[] {
  const out: OrgNode[] = [];
  const walk = (arr: OrgNode[]) => arr.forEach(n => {
    if (n.name.toLowerCase().includes(q) || (n.description ?? '').toLowerCase().includes(q)) out.push(n);
    if (n.children?.length) walk(n.children);
  });
  walk(nodes);
  return out;
}

function countAll(nodes: OrgNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countAll(n.children ?? []), 0);
}

interface ListRowProps {
  node: OrgNode;
  depth: number;
  typeMap: Map<string, StructureType>;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (id: string, name: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toggleMut: any;
}

function ListRow({ node, depth, typeMap, expanded, toggle, onSelect, onAddChild, toggleMut }: ListRowProps) {
  const type   = typeMap.get(node.type_id);
  const color  = type?.color ?? '#64748b';
  const hasKids = (node.children?.length ?? 0) > 0 || (node.child_count ?? 0) > 0;
  const isOpen  = expanded.has(node.id);

  const cell: React.CSSProperties = { padding: '7px 8px', verticalAlign: 'middle' };
  const actionBtn = (bg: string, border: string, fg: string): React.CSSProperties => ({
    background: bg, border: `1px solid ${border}`, color: fg,
    borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit',
  });

  return (
    <>
      <tr style={{
        background: !node.is_active ? '#fef2f2' : depth % 2 === 0 ? '#fff' : '#fafcff',
        opacity: node.is_active ? 1 : 0.65,
        borderBottom: '1px solid #f1f5f9',
        transition: 'background .1s',
      }}>
        {/* Indent + toggle */}
        <td style={{ ...cell, paddingLeft: 10 + depth * 18, width: 1, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* depth lines */}
            {depth > 0 && <span style={{ width: depth * 2, height: 1 }} />}
            <button
              onClick={() => hasKids && toggle(node.id)}
              style={{ background: 'none', border: 'none', cursor: hasKids ? 'pointer' : 'default', padding: 2, color: hasKids ? '#94a3b8' : 'transparent', display: 'flex', borderRadius: 3 }}
            >
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
        </td>

        {/* Type badge */}
        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            color, background: `${color}14`, border: `1px solid ${color}28`,
            borderRadius: 4, padding: '2px 6px', letterSpacing: .3,
          }}>
            {type?.name ?? node.type_slug}
          </span>
        </td>

        {/* Name */}
        <td style={{ ...cell, maxWidth: 260 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
          {node.description && (
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.description}
            </span>
          )}
        </td>

        {/* Weight */}
        <td style={{ ...cell, textAlign: 'center', width: 50 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: wColor(node.weight) }}>{node.weight}</span>
        </td>

        {/* Children count */}
        <td style={{ ...cell, textAlign: 'center', width: 50 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{node.child_count ?? node.children?.length ?? 0}</span>
        </td>

        {/* Actions */}
        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={actionBtn('#f0fdf4', '#bbf7d0', '#16a34a')} onClick={() => onAddChild(node.id, node.name)}>
              <Plus size={9} /> Hijo
            </button>
            <button style={actionBtn('#f8fafc', '#e2e8f0', '#475569')} onClick={() => onSelect(node.id)}>
              <Pencil size={9} /> Editar
            </button>
            <button
              style={actionBtn(node.is_active ? '#fff7ed' : '#f0fdf4', node.is_active ? '#fed7aa' : '#bbf7d0', node.is_active ? '#ea580c' : '#16a34a')}
              onClick={() => toggleMut.mutate({ id: node.id, is_active: !node.is_active })}
            >
              {node.is_active ? <ToggleRight size={10} /> : <ToggleLeft size={10} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Recursive children */}
      {isOpen && node.children?.map(child => (
        <ListRow
          key={child.id} node={child} depth={depth + 1}
          typeMap={typeMap} expanded={expanded} toggle={toggle}
          onSelect={onSelect} onAddChild={onAddChild} toggleMut={toggleMut}
        />
      ))}
    </>
  );
}

interface OrgListTabProps {
  tree: OrgNode[];
  typeMap: Map<string, StructureType>;
  onSelect: (id: string) => void;
  onAddChild: (id: string, name: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toggleMut: any;
}

function OrgListTab({ tree, typeMap, onSelect, onAddChild, toggleMut }: OrgListTabProps) {
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand ALL non-leaf nodes on first load
  useEffect(() => {
    const all = new Set<string>();
    const walk = (nodes: OrgNode[]) => nodes.forEach(n => {
      if (n.children?.length) { all.add(n.id); walk(n.children); }
    });
    walk(tree);
    setExpanded(all);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length === 0 ? 0 : tree[0]?.id]);

  const toggle = (id: string) => setExpanded(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const expandAll = () => {
    const all = new Set<string>();
    const walk = (nodes: OrgNode[]) => nodes.forEach(n => { if (n.children?.length) { all.add(n.id); walk(n.children); } });
    walk(tree);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded(new Set());

  const q            = search.trim().toLowerCase();
  const searchResult = q ? flattenSearch(tree, q) : null;
  const total        = countAll(tree);

  const thStyle: React.CSSProperties = {
    padding: '8px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5,
    background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
  };

  return (
    <div>
      {/* Search + controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <AlertCircle size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nodo por nombre o descripción..."
            style={{ width: '100%', padding: '6px 10px 6px 28px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#0f172a', background: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>
        {!q && (
          <>
            <button onClick={expandAll} style={{ padding: '5px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
              <ChevronDown size={10} /> Expandir todo
            </button>
            <button onClick={collapseAll} style={{ padding: '5px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
              <ChevronRight size={10} /> Colapsar todo
            </button>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
          {q ? `${searchResult!.length} resultados` : `${total} nodos`}
        </span>
      </div>

      {/* Empty state */}
      {tree.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <GitBranch size={32} style={{ marginBottom: 12, opacity: .35 }} />
          <p style={{ margin: 0, fontSize: 13 }}>Sin nodos. Usa "+ Nuevo nodo" para crear el primero.</p>
        </div>
      )}

      {/* Table */}
      {tree.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 1 }} />
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Nombre</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Peso</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Hijos</th>
                <th style={thStyle}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {q
                ? searchResult!.map(node => {
                    const type  = typeMap.get(node.type_id);
                    const color = type?.color ?? '#64748b';
                    return (
                      <tr key={node.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbf0' }}>
                        <td style={{ padding: 8, width: 1 }} />
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color, background: `${color}14`, border: `1px solid ${color}28`, borderRadius: 4, padding: '2px 6px' }}>
                            {type?.name ?? node.type_slug}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px', fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                          {node.name}
                          {node.description && <span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{node.description}</span>}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: wColor(node.weight) }}>{node.weight}</span>
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{node.child_count ?? 0}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }} onClick={() => onAddChild(node.id, node.name)}>
                              <Plus size={9} /> Hijo
                            </button>
                            <button style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', borderRadius: 5, padding: '3px 8px', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }} onClick={() => onSelect(node.id)}>
                              <Pencil size={9} /> Editar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : tree.map(node => (
                    <ListRow
                      key={node.id} node={node} depth={0}
                      typeMap={typeMap} expanded={expanded} toggle={toggle}
                      onSelect={onSelect} onAddChild={onAddChild} toggleMut={toggleMut}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
   ───────────────────────────────────────────────────────────────────────────── */

export function OrgFlowTab() {
  const qc = useQueryClient();

  const [section,    setSection]    = useState<'flow' | 'types' | 'list'>('flow');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [addPid,     setAddPid]     = useState('');
  const [addPname,   setAddPname]   = useState('');
  const [collapsed,  setCollapsed]  = useState<Set<string>>(new Set());

  const { data: tree  = [], isLoading: treeLoad  } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const { data: types = [], isLoading: typesLoad } = useQuery<StructureType[]>({
    queryKey: ['org-structure-types'],
    queryFn:  () => systemConfigService.getStructureTypes(),
    staleTime: 60_000,
  });
  const { data: flat  = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-nodes-flat'],
    queryFn:  () => systemConfigService.getOrgNodes({ active: true }),
    enabled:  showAdd || !!selectedId,
    staleTime: 30_000,
  });

  const typeMap = useMemo(() => new Map((types as StructureType[]).map(t => [t.id, t])), [types]);

  const selectedNode = useMemo(() => selectedId ? findNode(tree as OrgNode[], selectedId) : null, [selectedId, tree]);
  const selectedType = useMemo(() => selectedNode ? typeMap.get(selectedNode.type_id) : null, [selectedNode, typeMap]);

  const inv = () => { qc.invalidateQueries({ queryKey: ['org-node-tree'] }); qc.invalidateQueries({ queryKey: ['org-nodes-flat'] }); };

  const updateTypeMut = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      systemConfigService.updateStructureType(id, { weight }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-structure-types'] }),
  });

  const createMut = useMutation({
    mutationFn: (dto: { type_id: string; parent_id?: string; name: string; weight: number }) =>
      systemConfigService.createOrgNode(dto),
    onSuccess: () => { inv(); setShowAdd(false); setAddPid(''); setAddPname(''); },
  });

  const saveMut = useMutation<any, any, EditForm>({
    mutationFn: (form: EditForm) => systemConfigService.updateOrgNode(selectedId!, {
      name: form.name, code: form.code || undefined, weight: form.weight,
      description: form.description || undefined, address: form.address || undefined,
      city: form.city || undefined, country: form.country || undefined,
      phone: form.phone || undefined, email: form.email || undefined,
      is_active: form.is_active, parent_id: form.parent_id || undefined,
    }),
    onSuccess: inv,
  });

  const deleteMut = useMutation<any, any, void>({
    mutationFn: () => systemConfigService.deleteOrgNode(selectedId!),
    onSuccess: () => { inv(); setSelectedId(null); },
  });

  const toggleMut = useMutation<any, any, { id: string; is_active: boolean }>({
    mutationFn: ({ id, is_active }) => systemConfigService.updateOrgNode(id, { is_active }),
    onSuccess: inv,
  });

  const reparentMut = useMutation({
    mutationFn: ({ nodeId, parentId }: { nodeId: string; parentId: string }) =>
      systemConfigService.updateOrgNode(nodeId, { parent_id: parentId }),
    onSuccess: inv,
  });

  const handleAddChild = useCallback((pid: string, pname: string) => {
    setAddPid(pid); setAddPname(pname); setShowAdd(true); setSelectedId(null);
  }, []);

  const hasTree = (tree as OrgNode[]).length > 0;

  const sBtn = (a: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    border: a ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
    background: a ? 'rgba(255,94,58,.07)' : '#fff',
    color: a ? '#ff5e3a' : '#64748b', transition: 'all .1s',
  });

  const handleCollapseAll = useCallback(() => {
    const s = new Set<string>();
    const walk = (ns: OrgNode[]) => ns.forEach(n => { if (n.children?.length) { s.add(n.id); walk(n.children); } });
    walk(tree as OrgNode[]);
    setCollapsed(s);
  }, [tree, setCollapsed]);

  const handleExpandAll = useCallback(() => setCollapsed(new Set()), [setCollapsed]);

  if (treeLoad || typesLoad) return <Spinner />;

  return (
    <div>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={sBtn(section === 'flow')}  onClick={() => setSection('flow')}>
          <GitBranch size={11} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />Árbol visual
        </button>
        <button style={sBtn(section === 'types')} onClick={() => setSection('types')}>
          Tipos de estructura
        </button>
        <button style={sBtn(section === 'list')} onClick={() => setSection('list')}>
          Lista / Tabla
        </button>


        {(section === 'flow' || section === 'list') && (
          <button onClick={() => { setAddPid(''); setAddPname(''); setShowAdd(v => !v); setSelectedId(null); }}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, background: showAdd ? '#f8fafc' : '#ff5e3a', color: showAdd ? '#64748b' : '#fff', border: showAdd ? '1px solid #e2e8f0' : 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {showAdd ? <><X size={12} /> Cancelar</> : <><Plus size={12} /> Nuevo nodo</>}
          </button>
        )}
      </div>

      {/* ── Types tab ── */}
      {section === 'types' && (
        <TypesTab types={types as StructureType[]} />
      )}

      {/* ── List tab ── */}
      {section === 'list' && (
        <>
          {showAdd && (
            <QuickAddPanel
              types={types as StructureType[]}
              flatNodes={flat as OrgNode[]}
              parentId={addPid}
              parentName={addPname}
              isPending={createMut.isPending}
              onSave={dto => createMut.mutate(dto)}
              onCancel={() => { setShowAdd(false); setAddPid(''); setAddPname(''); }}
            />
          )}
          <OrgListTab
            tree={tree as OrgNode[]}
            typeMap={typeMap}
            onSelect={id => { setSelectedId(id); setShowAdd(false); }}
            onAddChild={(pid, pname) => { handleAddChild(pid, pname); setShowAdd(true); }}
            toggleMut={toggleMut}
          />
          {selectedNode && (
            <NodeSidebar
              node={selectedNode}
              typeColor={selectedType?.color ?? '#64748b'}
              typeName={selectedType?.name ?? selectedNode.type_slug}
              flatNodes={flat as OrgNode[]}
              onClose={() => setSelectedId(null)}
              onAddChild={handleAddChild}
              saveMut={saveMut}
              deleteMut={deleteMut}
              toggleMut={toggleMut}
            />
          )}
        </>
      )}

      {/* ── Flow tab ── */}
      {section === 'flow' && (
        <>
          {showAdd && (
            <QuickAddPanel
              types={types as StructureType[]}
              flatNodes={flat as OrgNode[]}
              parentId={addPid}
              parentName={addPname}
              isPending={createMut.isPending}
              onSave={dto => createMut.mutate(dto)}
              onCancel={() => { setShowAdd(false); setAddPid(''); setAddPname(''); }}
            />
          )}

          {/* Canvas */}
          <div style={{ height: 'calc(100vh - 380px)', minHeight: 620, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <ReactFlowProvider>
              <OrgCanvas
                tree={tree as OrgNode[]}
                typeMap={typeMap}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                onAddChild={handleAddChild}
                reparentMut={reparentMut}
                onCollapseAll={handleCollapseAll}
                onExpandAll={handleExpandAll}
              />
            </ReactFlowProvider>
          </div>

          {/* Node sidebar */}
          {selectedNode && (
            <NodeSidebar
              node={selectedNode}
              typeColor={selectedType?.color ?? '#64748b'}
              typeName={selectedType?.name ?? selectedNode.type_slug}
              flatNodes={flat as OrgNode[]}
              onClose={() => setSelectedId(null)}
              onAddChild={handleAddChild}
              saveMut={saveMut}
              deleteMut={deleteMut}
              toggleMut={toggleMut}
            />
          )}
        </>
      )}
    </div>
  );
}
