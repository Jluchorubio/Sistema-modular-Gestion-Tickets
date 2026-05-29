'use client';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  Handle, Position,
  type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus, Check, X, Trash2, MapPin, Phone, Mail,
  ToggleLeft, ToggleRight, Users, Info, ChevronDown, ChevronRight,
} from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { OrgNode, StructureType } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';

/* ── Layout constants ─────────────────────────────────────────────────────── */

const NW  = 196;
const NH  = 90;
const VG  = 80;
const HG  = 36;

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#94a3b8';

/* ── Tree layout (respects collapsed set) ─────────────────────────────────── */

function leafCount(node: OrgNode, collapsed: Set<string>): number {
  if (collapsed.has(node.id) || !node.children?.length) return 1;
  return node.children.reduce((s, c) => s + leafCount(c, collapsed), 0);
}

function buildLayout(
  roots: OrgNode[],
  colorMap: Map<string, string>,
  collapsed: Set<string>,
  callbacks: {
    onAddChild:       (parentId: string, parentName: string) => void;
    onToggleCollapse: (id: string)                           => void;
  },
  depth = 0,
  xStart = 0,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let x = xStart;

  for (const node of roots) {
    const lc       = leafCount(node, collapsed);
    const subtreeW = lc * (NW + HG);
    const nodeX    = x + (subtreeW - NW) / 2;
    const hasChildren = !!node.children?.length;
    const isCollapsed = collapsed.has(node.id);

    nodes.push({
      id:       node.id,
      type:     'orgNode',
      position: { x: nodeX, y: depth * (NH + VG) },
      data: {
        node,
        typeColor:       colorMap.get(node.type_id) ?? '#64748b',
        hasChildren,
        isCollapsed,
        onAddChild:       callbacks.onAddChild,
        onToggleCollapse: callbacks.onToggleCollapse,
      },
    });

    if (node.parent_id) {
      edges.push({
        id:     `e-${node.parent_id}-${node.id}`,
        source: node.parent_id,
        target: node.id,
        type:   'smoothstep',
        style:  { stroke: '#cbd5e1', strokeWidth: 1.5 },
      });
    }

    if (hasChildren && !isCollapsed) {
      const child = buildLayout(node.children!, colorMap, collapsed, callbacks, depth + 1, x);
      nodes.push(...child.nodes);
      edges.push(...child.edges);
    }

    x += subtreeW;
  }

  return { nodes, edges };
}

/* ── Custom node card ────────────────────────────────────────────────────── */

type OrgNodeData = {
  node:             OrgNode;
  typeColor:        string;
  hasChildren:      boolean;
  isCollapsed:      boolean;
  onAddChild:       (parentId: string, parentName: string) => void;
  onToggleCollapse: (id: string) => void;
};

function OrgNodeCard({ data, selected }: { data: OrgNodeData; selected: boolean }) {
  const { node, typeColor, hasChildren, isCollapsed, onAddChild, onToggleCollapse } = data;
  const subtitle = node.city ?? node.code ?? null;

  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: typeColor, border: 'none', width: 8, height: 8 }} />
      <div style={{
        width: NW, background: '#fff', fontFamily: 'inherit',
        border: `2px solid ${selected ? typeColor : '#e2e8f0'}`,
        borderRadius: 10, padding: '8px 10px 6px',
        boxShadow: selected
          ? `0 0 0 3px ${typeColor}22, 0 4px 12px rgba(0,0,0,.12)`
          : '0 1px 4px rgba(0,0,0,.07)',
        cursor: 'pointer',
        opacity: node.is_active === false ? 0.5 : 1,
        position: 'relative',
      }}>
        {/* Top row: type badge + weight */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99,
            background: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}28`,
            textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {node.type_slug}
          </span>
          {node.is_active === false && (
            <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>inactivo</span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: weightColor(node.weight) }}>
            {node.weight}
          </span>
        </div>

        {/* Name */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', lineHeight: 1.3, wordBreak: 'break-word', marginBottom: 2 }}>
          {node.name}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
            {node.city ? <MapPin size={9} style={{ flexShrink: 0 }} /> : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
          </div>
        )}

        {/* Footer: user count + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          {node.user_count > 0 && (
            <span style={{ fontSize: 9, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2, marginRight: 2 }}>
              <Users size={9} />{node.user_count}
            </span>
          )}
          <div style={{ flex: 1 }} />

          {/* Add child button */}
          <button
            type="button"
            title="Agregar hijo"
            onClick={(e) => { e.stopPropagation(); onAddChild(node.id, node.name); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 5,
              background: 'rgba(255,94,58,.08)', color: '#ff5e3a',
              border: '1px solid rgba(255,94,58,.25)',
              cursor: 'pointer', flexShrink: 0,
            }}>
            <Plus size={10} />
          </button>

          {/* Collapse/expand button */}
          {hasChildren && (
            <button
              type="button"
              title={isCollapsed ? 'Expandir hijos' : 'Colapsar hijos'}
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: 5,
                background: '#f1f5f9', color: '#64748b',
                border: '1px solid #e2e8f0',
                cursor: 'pointer', flexShrink: 0,
              }}>
              {isCollapsed
                ? <ChevronRight size={10} />
                : <ChevronDown size={10} />}
            </button>
          )}
        </div>

        {/* Collapsed badge */}
        {isCollapsed && hasChildren && (
          <div style={{
            position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
            fontSize: 9, fontWeight: 700, color: '#94a3b8',
            background: '#f8fafc', border: '1px solid #e2e8f0',
            padding: '1px 6px', borderRadius: 99, whiteSpace: 'nowrap',
          }}>
            {node.child_count ?? node.children?.length ?? 0} ocultos
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: typeColor, border: 'none', width: 8, height: 8 }} />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes = { orgNode: OrgNodeCard as any };

/* ── Auto-fit helper ─────────────────────────────────────────────────────── */

function FlowAutoFit({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 60);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount]);
  return null;
}

/* ── Context menu ─────────────────────────────────────────────────────────── */

interface ContextMenuState {
  nodeId:   string;
  nodeName: string;
  x: number;
  y: number;
}

function ContextMenu({
  menu, onEdit, onAddChild, onToggleActive, onClose,
}: {
  menu:            ContextMenuState;
  onEdit:          () => void;
  onAddChild:      (parentId: string, parentName: string) => void;
  onToggleActive:  () => void;
  onClose:         () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as EventTarget & HTMLElement)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const item: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: 'transparent', fontFamily: 'inherit', width: '100%',
    textAlign: 'left', color: '#0e2235',
  };

  return (
    <div ref={ref} style={{
      position: 'fixed', zIndex: 9999,
      top: menu.y, left: menu.x,
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.14)',
      overflow: 'hidden', minWidth: 180,
    }}>
      <div style={{ padding: '6px 14px 4px', fontSize: 11, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
        {menu.nodeName}
      </div>
      <button style={item} onClick={() => { onEdit(); onClose(); }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Info size={13} /> Ver / Editar nodo
      </button>
      <button style={item} onClick={() => { onAddChild(menu.nodeId, menu.nodeName); onClose(); }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fff7ed')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Plus size={13} style={{ color: '#ff5e3a' }} />
        <span style={{ color: '#ff5e3a' }}>Agregar hijo</span>
      </button>
      <button style={{ ...item, color: '#64748b' }}
        onClick={() => { onToggleActive(); onClose(); }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <ToggleLeft size={13} /> Activar / Desactivar
      </button>
    </div>
  );
}

/* ── Edit form type ──────────────────────────────────────────────────────── */

type EditForm = {
  name: string; code: string; weight: number; description: string;
  address: string; city: string; country: string; phone: string; email: string;
  is_active: boolean;
};
const EDIT_EMPTY: EditForm = {
  name: '', code: '', weight: 5, description: '',
  address: '', city: '', country: '', phone: '', email: '', is_active: true,
};
function nodeToForm(n: OrgNode): EditForm {
  return {
    name: n.name, code: n.code ?? '', weight: n.weight,
    description: n.description ?? '', address: n.address ?? '',
    city: n.city ?? '', country: n.country ?? '',
    phone: n.phone ?? '', email: n.email ?? '', is_active: n.is_active,
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function findInTree(nodes: OrgNode[], id: string): OrgNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) { const f = findInTree(n.children, id); if (f) return f; }
  }
  return null;
}

function isDescendant(tree: OrgNode[], ancestorId: string, checkId: string): boolean {
  const node = findInTree(tree, ancestorId);
  if (!node?.children?.length) return false;
  return node.children.some(c => c.id === checkId || isDescendant(tree, c.id, checkId));
}

const inp: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 12, fontFamily: 'inherit', background: '#fff', width: '100%',
  boxSizing: 'border-box',
};
const fLabel: React.CSSProperties = { margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' };

/* ── Quick add child panel ───────────────────────────────────────────────── */

function QuickAddPanel({
  types, flatNodes, preParentId, preParentName,
  onSave, onCancel, isPending,
}: {
  types: StructureType[];
  flatNodes: OrgNode[];
  preParentId: string;
  preParentName: string;
  onSave: (dto: { type_id: string; parent_id?: string; name: string; weight: number }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [typeId,   setTypeId]   = useState('');
  const [parentId, setParentId] = useState(preParentId);
  const [name,     setName]     = useState('');
  const [weight,   setWeight]   = useState(5);

  // update parent if prop changes
  useEffect(() => setParentId(preParentId), [preParentId]);

  const canSave = typeId && name.trim();

  return (
    <div style={{
      border: '1.5px solid #ff5e3a', borderRadius: 10, padding: '14px 16px',
      marginBottom: 14, background: '#fff', boxShadow: '0 4px 16px rgba(255,94,58,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5e3a', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {preParentId ? `Nuevo hijo de "${preParentName}"` : 'Nuevo nodo raíz'}
        </span>
        <button type="button" onClick={onCancel}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {/* Type */}
        <div style={{ flex: '1 1 140px' }}>
          <p style={fLabel}>Tipo *</p>
          <select value={typeId} onChange={e => setTypeId(e.target.value)} style={inp}>
            <option value="">— seleccionar —</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Name */}
        <div style={{ flex: '2 1 160px' }}>
          <p style={fLabel}>Nombre *</p>
          <input style={inp} value={name} autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) onSave({ type_id: typeId, parent_id: parentId || undefined, name, weight }); }}
            placeholder="Ej. Sede Bogotá" />
        </div>

        {/* Parent */}
        <div style={{ flex: '1 1 150px' }}>
          <p style={fLabel}>Nodo padre</p>
          <select value={parentId} onChange={e => setParentId(e.target.value)} style={inp}>
            <option value="">— raíz —</option>
            {flatNodes.map(n => <option key={n.id} value={n.id}>[{n.type_slug}] {n.name}</option>)}
          </select>
        </div>

        {/* Weight */}
        <div style={{ flex: '1 1 120px' }}>
          <p style={fLabel}>Peso (1–10)</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="range" min={1} max={10} value={weight}
              onChange={e => setWeight(+e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, color: weightColor(weight), minWidth: 18 }}>{weight}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <button type="button"
            disabled={!canSave || isPending}
            onClick={() => onSave({ type_id: typeId, parent_id: parentId || undefined, name, weight })}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px',
              background: canSave ? '#ff5e3a' : '#e2e8f0', color: canSave ? '#fff' : '#94a3b8',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: canSave && !isPending ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}>
            {isPending ? '…' : <><Check size={12} /> Crear</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── OrgFlowTab ──────────────────────────────────────────────────────────── */

export function OrgFlowTab() {
  const qc = useQueryClient();

  const [section,    setSection]    = useState<'flow' | 'types'>('flow');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<EditForm>(EDIT_EMPTY);
  const [editPanel,  setEditPanel]  = useState<'info' | 'edit'>('info');
  const [showAdd,    setShowAdd]    = useState(false);
  const [addParentId,   setAddParentId]   = useState('');
  const [addParentName, setAddParentName] = useState('');
  const [collapsed,  setCollapsed]  = useState<Set<string>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu,  setContextMenu]  = useState<ContextMenuState | null>(null);
  const dropTargetRef = useRef<string | null>(null);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  /* ── Queries ── */
  const { data: tree  = [], isLoading: treeLoading  } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const { data: types = [], isLoading: typesLoading } = useQuery<StructureType[]>({
    queryKey: ['org-structure-types'],
    queryFn:  () => systemConfigService.getStructureTypes(),
    staleTime: 60_000,
  });
  const { data: flatNodes = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-nodes-flat'],
    queryFn:  () => systemConfigService.getOrgNodes({ active: true }),
    enabled:  showAdd,
    staleTime: 30_000,
  });

  /* ── Callbacks for node cards ── */
  const handleAddChild = useCallback((parentId: string, parentName: string) => {
    setAddParentId(parentId);
    setAddParentName(parentName);
    setShowAdd(true);
    setSelectedId(null);
  }, []);

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  /* ── Sync layout ── */
  useEffect(() => {
    if (!tree.length) { setRfNodes([]); setRfEdges([]); return; }
    const colorMap = new Map((types as StructureType[]).map(t => [t.id, t.color ?? '#64748b']));
    const { nodes, edges } = buildLayout(
      tree as OrgNode[], colorMap, collapsed,
      { onAddChild: handleAddChild, onToggleCollapse: handleToggleCollapse },
    );
    setRfNodes(nodes);
    setRfEdges(edges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, types, collapsed]);

  /* ── Mutations ── */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['org-node-tree'] });
    qc.invalidateQueries({ queryKey: ['org-nodes-flat'] });
  };

  const updateTypeMut = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      systemConfigService.updateStructureType(id, { weight }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-structure-types'] }),
  });

  const createMut = useMutation({
    mutationFn: (dto: { type_id: string; parent_id?: string; name: string; weight: number }) =>
      systemConfigService.createOrgNode(dto),
    onSuccess: () => { invalidate(); setShowAdd(false); setAddParentId(''); setAddParentName(''); },
  });

  const updateMut = useMutation({
    mutationFn: (dto: EditForm) => systemConfigService.updateOrgNode(selectedId!, {
      name: dto.name, code: dto.code || undefined, weight: dto.weight,
      description: dto.description || undefined, address: dto.address || undefined,
      city: dto.city || undefined, country: dto.country || undefined,
      phone: dto.phone || undefined, email: dto.email || undefined,
      is_active: dto.is_active,
    }),
    onSuccess: () => { invalidate(); setEditPanel('info'); },
  });

  const deleteMut = useMutation({
    mutationFn: () => systemConfigService.deleteOrgNode(selectedId!),
    onSuccess: () => { invalidate(); setSelectedId(null); },
  });

  const reparentMut = useMutation({
    mutationFn: ({ nodeId, parentId }: { nodeId: string; parentId: string }) =>
      systemConfigService.updateOrgNode(nodeId, { parent_id: parentId }),
    onSuccess: invalidate,
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      systemConfigService.updateOrgNode(id, { is_active }),
    onSuccess: invalidate,
  });

  /* ── Drag reparent ── */
  const CARD_H = 90;
  const onNodeDrag = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const cx = draggedNode.position.x + NW / 2;
    const cy = draggedNode.position.y + CARD_H / 2;
    let found: string | null = null;
    for (const n of rfNodes) {
      if (n.id === draggedNode.id) continue;
      const { x, y } = n.position;
      if (cx >= x && cx <= x + NW && cy >= y && cy <= y + CARD_H) { found = n.id; break; }
    }
    dropTargetRef.current = found;
    setDropTargetId(found);
  }, [rfNodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const targetId = dropTargetRef.current;
    dropTargetRef.current = null;
    setDropTargetId(null);
    if (!targetId) return;
    if (isDescendant(tree as OrgNode[], draggedNode.id, targetId)) return;
    const current = findInTree(tree as OrgNode[], draggedNode.id);
    if (current?.parent_id === targetId) return;
    reparentMut.mutate({ nodeId: draggedNode.id, parentId: targetId });
  }, [tree, reparentMut]);

  /* ── Node click / context menu ── */
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const orgNode = (node.data as OrgNodeData).node;
    setSelectedId(node.id);
    setEditForm(nodeToForm(orgNode));
    setEditPanel('info');
    setShowAdd(false);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    const orgNode = (node.data as OrgNodeData).node;
    setContextMenu({ nodeId: node.id, nodeName: orgNode.name, x: e.clientX, y: e.clientY });
    setSelectedId(node.id);
    setEditForm(nodeToForm(orgNode));
    setEditPanel('info');
  }, []);

  const selectedNode = useMemo(
    () => selectedId ? findInTree(tree as OrgNode[], selectedId) : null,
    [selectedId, tree],
  );
  const selectedTypeColor = useMemo(() => {
    if (!selectedNode) return '#64748b';
    return (types as StructureType[]).find(t => t.id === selectedNode.type_id)?.color ?? '#64748b';
  }, [selectedNode, types]);

  const collapseAll = useCallback(() => {
    const ids = new Set<string>();
    const visit = (nodes: OrgNode[]) => nodes.forEach(n => { if (n.children?.length) { ids.add(n.id); visit(n.children); } });
    visit(tree as OrgNode[]);
    setCollapsed(ids);
  }, [tree]);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  if (treeLoading || typesLoading) return <Spinner />;

  const sBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: active ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
    background: active ? 'rgba(255,94,58,.07)' : '#fff',
    color: active ? '#ff5e3a' : '#64748b',
  });

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: 'none',
    background: active ? '#fff' : 'transparent',
    color: active ? '#0e2235' : '#94a3b8',
    borderRadius: 5, transition: 'all .12s',
  });

  /* ── Render ── */
  return (
    <div>
      {/* Section toggle + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={sBtn(section === 'flow')}  onClick={() => setSection('flow')}>Árbol visual</button>
        <button style={sBtn(section === 'types')} onClick={() => setSection('types')}>Tipos de estructura</button>

        {section === 'flow' && (
          <>
            {/* Expand/collapse all */}
            {(tree as OrgNode[]).some(n => n.children?.length) && (
              <>
                <button onClick={collapseAll}
                  style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronRight size={11} /> Colapsar todo
                </button>
                <button onClick={expandAll}
                  style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronDown size={11} /> Expandir todo
                </button>
              </>
            )}

            {/* Add root node */}
            <button
              onClick={() => { setAddParentId(''); setAddParentName(''); setShowAdd(v => !v); setSelectedId(null); setContextMenu(null); }}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px',
                background: showAdd ? '#fff' : '#ff5e3a',
                color: showAdd ? '#64748b' : '#fff',
                border: showAdd ? '1px solid #e2e8f0' : 'none',
                borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {showAdd ? <><X size={12} /> Cancelar</> : <><Plus size={12} /> Nuevo nodo</>}
            </button>
          </>
        )}
      </div>

      {/* ── Tipos de estructura ── */}
      {section === 'types' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Tipos de estructura org
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
            El peso (1–10) de cada tipo se usa en el cálculo de prioridad automática.
          </div>
          {(types as StructureType[]).map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 8,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color ?? '#64748b', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>{t.name}</span>
                <code style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{t.slug}</code>
                {t.allows_users && (
                  <span style={{ fontSize: 9, color: '#059669', marginLeft: 8, fontWeight: 700 }}>· tiene usuarios</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>Peso</span>
                <input type="range" min={1} max={10} value={t.weight}
                  onChange={e => updateTypeMut.mutate({ id: t.id, weight: +e.target.value })}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 18, color: weightColor(t.weight) }}>{t.weight}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Árbol visual ── */}
      {section === 'flow' && (
        <>
          {/* Quick add panel */}
          {showAdd && (
            <QuickAddPanel
              types={types as StructureType[]}
              flatNodes={flatNodes as OrgNode[]}
              preParentId={addParentId}
              preParentName={addParentName}
              isPending={createMut.isPending}
              onSave={dto => createMut.mutate(dto)}
              onCancel={() => { setShowAdd(false); setAddParentId(''); setAddParentName(''); }}
            />
          )}

          {/* React Flow canvas */}
          <div style={{ height: 560, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            {rfNodes.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafbfc' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Plus size={20} style={{ color: '#94a3b8' }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Sin estructura organizacional</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Usa "+ Nuevo nodo" para construir la jerarquía.</div>
                  <button
                    onClick={() => { setAddParentId(''); setAddParentName(''); setShowAdd(true); }}
                    style={{ padding: '8px 18px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Plus size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    Crear primer nodo
                  </button>
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={rfNodes.map(n => ({
                  ...n,
                  style: n.id === dropTargetId
                    ? { outline: '2.5px solid #ff5e3a', borderRadius: 12, outlineOffset: 3 }
                    : undefined,
                }))}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onPaneClick={() => { setSelectedId(null); setContextMenu(null); }}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                nodesDraggable={!reparentMut.isPending}
                nodesConnectable={false}
                elementsSelectable
                style={{ background: '#fafbfc' }}
              >
                <Background color="#e2e8f0" gap={24} />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeColor={n => (n.data as OrgNodeData).typeColor ?? '#64748b'}
                  style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
                <FlowAutoFit nodeCount={rfNodes.length} />
              </ReactFlow>
            )}
          </div>

          {/* Status bar */}
          <div style={{ marginTop: 6, fontSize: 11, display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ color: reparentMut.isPending ? '#f59e0b' : '#94a3b8' }}>
              {reparentMut.isPending
                ? 'Cambiando padre…'
                : 'Clic → detalles · Arrastra → reparentar · Clic derecho → menú · [+] en nodo → hijo'}
            </span>
            {collapsed.size > 0 && (
              <span style={{ color: '#64748b', fontWeight: 600 }}>
                {collapsed.size} rama{collapsed.size !== 1 ? 's' : ''} colapsada{collapsed.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* ── Node detail / edit panel ── */}
          {selectedNode && (
            <div style={{
              marginTop: 10, background: '#fff',
              border: `1.5px solid ${selectedTypeColor}`,
              borderRadius: 10, overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                background: `${selectedTypeColor}08`, borderBottom: '1px solid #e2e8f0',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: selectedTypeColor, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>{selectedNode.name}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>
                    {selectedNode.type_slug}
                    {selectedNode.parent_name && <> · hijo de {selectedNode.parent_name}</>}
                    {selectedNode.code && <> · <code>{selectedNode.code}</code></>}
                  </span>
                </div>
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 3, gap: 2 }}>
                  <button style={tabBtn(editPanel === 'info')} onClick={() => setEditPanel('info')}>
                    <Info size={10} style={{ display: 'inline', marginRight: 3 }} />Info
                  </button>
                  <button style={tabBtn(editPanel === 'edit')} onClick={() => setEditPanel('edit')}>
                    Editar
                  </button>
                </div>
                {/* Add child from panel */}
                <button
                  title="Agregar hijo"
                  onClick={() => handleAddChild(selectedNode.id, selectedNode.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                    background: 'rgba(255,94,58,.08)', color: '#ff5e3a',
                    border: '1px solid rgba(255,94,58,.25)', borderRadius: 5,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <Plus size={11} /> Hijo
                </button>
                <button onClick={() => setSelectedId(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: '2px 4px' }}>
                  <X size={14} />
                </button>
              </div>

              {/* ── Info view ── */}
              {editPanel === 'info' && (
                <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <InfoRow label="Tipo"   value={selectedNode.type_slug} />
                    <InfoRow label="Padre"  value={selectedNode.parent_name ?? 'Raíz'} />
                    {selectedNode.code && <InfoRow label="Código" value={selectedNode.code} />}
                    <InfoRow label="Peso"   value={<span style={{ fontWeight: 800, color: weightColor(selectedNode.weight) }}>{selectedNode.weight}</span>} />
                    <InfoRow label="Estado" value={<span style={{ fontWeight: 700, color: selectedNode.is_active ? '#22c55e' : '#94a3b8' }}>{selectedNode.is_active ? 'Activo' : 'Inactivo'}</span>} />
                    {(selectedNode.user_count > 0 || selectedNode.child_count > 0) && (
                      <InfoRow label="Conteos" value={`${selectedNode.user_count} usuarios · ${selectedNode.child_count} sub-nodos`} />
                    )}
                  </div>
                  {(selectedNode.address || selectedNode.city || selectedNode.country || selectedNode.phone || selectedNode.email) && (
                    <div style={{ flex: '1 1 200px' }}>
                      {selectedNode.address  && <InfoRow label="Dirección" value={selectedNode.address}  icon={<MapPin size={11} />} />}
                      {(selectedNode.city || selectedNode.country) && (
                        <InfoRow label="Ciudad" value={[selectedNode.city, selectedNode.country].filter(Boolean).join(', ')} icon={<MapPin size={11} />} />
                      )}
                      {selectedNode.phone && <InfoRow label="Teléfono" value={selectedNode.phone} icon={<Phone size={11} />} />}
                      {selectedNode.email && <InfoRow label="Email"    value={selectedNode.email} icon={<Mail size={11} />} />}
                    </div>
                  )}
                  {selectedNode.description && (
                    <div style={{ width: '100%', fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '8px 12px', borderRadius: 6, borderLeft: `3px solid ${selectedTypeColor}40` }}>
                      {selectedNode.description}
                    </div>
                  )}
                  <div style={{ width: '100%', display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditPanel('edit')}
                      style={{ padding: '6px 16px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Editar nodo
                    </button>
                    <button
                      onClick={() => toggleActiveMut.mutate({ id: selectedNode.id, is_active: !selectedNode.is_active })}
                      disabled={toggleActiveMut.isPending}
                      style={{ padding: '6px 12px', background: '#fff', color: selectedNode.is_active ? '#ef4444' : '#22c55e', border: `1px solid ${selectedNode.is_active ? '#fecaca' : '#bbf7d0'}`, borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {selectedNode.is_active ? <><ToggleRight size={12} /> Desactivar</> : <><ToggleLeft size={12} /> Activar</>}
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Eliminar "${selectedNode.name}"?`)) deleteMut.mutate(); }}
                      disabled={deleteMut.isPending}
                      style={{ padding: '6px 12px', background: '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Trash2 size={12} /> {deleteMut.isPending ? '…' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Edit view ── */}
              {editPanel === 'edit' && (
                <div style={{ padding: '16px' }}>
                  <SectionTitle>Básico</SectionTitle>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: '3 1 180px' }}>
                      <p style={fLabel}>Nombre *</p>
                      <input style={inp} value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 120px' }}>
                      <p style={fLabel}>Código</p>
                      <input style={inp} value={editForm.code} placeholder="ej. BOG-01"
                        onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <p style={fLabel}>Peso (1–10)</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="range" min={1} max={10} value={editForm.weight}
                          onChange={e => setEditForm(f => ({ ...f, weight: +e.target.value }))} style={{ flex: 1 }} />
                        <span style={{ fontWeight: 700, color: weightColor(editForm.weight), minWidth: 18 }}>{editForm.weight}</span>
                      </div>
                    </div>
                    <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <p style={fLabel}>Estado</p>
                      <button onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: editForm.is_active ? '#22c55e' : '#94a3b8', fontWeight: 700 }}>
                        {editForm.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {editForm.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  </div>
                  <SectionTitle>Descripción</SectionTitle>
                  <textarea style={{ ...inp, minHeight: 52, resize: 'vertical', marginBottom: 12 }}
                    value={editForm.description} placeholder="Descripción opcional..."
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                  <SectionTitle>Localización y contacto</SectionTitle>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: '2 1 200px' }}>
                      <p style={fLabel}>Dirección</p>
                      <input style={inp} value={editForm.address} placeholder="Calle, número..."
                        onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <p style={fLabel}>Ciudad</p>
                      <input style={inp} value={editForm.city} placeholder="Bogotá"
                        onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <p style={fLabel}>País</p>
                      <input style={inp} value={editForm.country} placeholder="Colombia"
                        onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <p style={fLabel}>Teléfono</p>
                      <input style={inp} value={editForm.phone} placeholder="+57 1 234 5678"
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div style={{ flex: '2 1 180px' }}>
                      <p style={fLabel}>Email</p>
                      <input type="email" style={inp} value={editForm.email} placeholder="sede@empresa.com"
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => updateMut.mutate(editForm)}
                      disabled={!editForm.name.trim() || updateMut.isPending}
                      style={{ padding: '7px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: !editForm.name.trim() ? 0.5 : 1 }}>
                      <Check size={13} /> {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button onClick={() => setEditPanel('info')}
                      style={{ padding: '7px 14px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancelar
                    </button>
                  </div>
                  {updateMut.isSuccess && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#22c55e' }}>Nodo actualizado.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onEdit={() => setEditPanel('info')}
          onAddChild={handleAddChild}
          onToggleActive={() => {
            if (!selectedNode) return;
            toggleActiveMut.mutate({ id: selectedNode.id, is_active: !selectedNode.is_active });
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

/* ── Small helpers ────────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #f1f5f9',
    }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', minWidth: 70, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#0e2235', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon && <span style={{ color: '#94a3b8' }}>{icon}</span>}
        {value}
      </span>
    </div>
  );
}
