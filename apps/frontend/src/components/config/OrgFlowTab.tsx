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
  ToggleLeft, ToggleRight, Users, Info,
} from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { OrgNode, StructureType } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';

/* ── Layout constants ─────────────────────────────────────────────────────── */

const NW = 190;   // node card width
const VG = 100;   // vertical gap between levels (row height = card height + VG)
const HG = 40;    // horizontal gap between sibling subtrees

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#94a3b8';

/* ── Tree layout ─────────────────────────────────────────────────────────── */

function leafCount(node: OrgNode): number {
  return node.children?.length
    ? node.children.reduce((s, c) => s + leafCount(c), 0)
    : 1;
}

function buildLayout(
  roots: OrgNode[],
  colorMap: Map<string, string>,
  depth = 0,
  xStart = 0,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let x = xStart;

  for (const node of roots) {
    const lc       = leafCount(node);
    const subtreeW = lc * (NW + HG);
    const nodeX    = x + (subtreeW - NW) / 2;

    nodes.push({
      id:       node.id,
      type:     'orgNode',
      position: { x: nodeX, y: depth * (90 + VG) },
      data:     { node, typeColor: colorMap.get(node.type_id) ?? '#64748b' },
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

    if (node.children?.length) {
      const child = buildLayout(node.children, colorMap, depth + 1, x);
      nodes.push(...child.nodes);
      edges.push(...child.edges);
    }

    x += subtreeW;
  }

  return { nodes, edges };
}

/* ── Custom node card ────────────────────────────────────────────────────── */

type OrgNodeData = { node: OrgNode; typeColor: string };

function OrgNodeCard({ data, selected }: { data: OrgNodeData; selected: boolean }) {
  const { node, typeColor } = data;
  const subtitle = node.city
    ? node.city
    : node.code
    ? node.code
    : null;

  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: typeColor, border: 'none', width: 8, height: 8 }} />
      <div style={{
        width: NW, background: '#fff', fontFamily: 'inherit',
        border: `2px solid ${selected ? typeColor : '#e2e8f0'}`,
        borderRadius: 8, padding: '8px 12px',
        boxShadow: selected
          ? `0 0 0 3px ${typeColor}22, 0 2px 8px rgba(0,0,0,.1)`
          : '0 1px 3px rgba(0,0,0,.07)',
        cursor: 'pointer',
        opacity: node.is_active === false ? 0.5 : 1,
      }}>
        {/* Header row: type badge + weight */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99,
            background: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}28`,
            textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
          }}>
            {node.type_slug}
          </span>
          {node.is_active === false && (
            <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>inactivo</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: weightColor(node.weight) }}>
            {node.weight}
          </span>
        </div>

        {/* Name */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', lineHeight: 1.3, wordBreak: 'break-word' }}>
          {node.name}
        </div>

        {/* Subtitle (city or code) */}
        {subtitle && (
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
            {node.city ? <MapPin size={9} style={{ flexShrink: 0 }} /> : null}
            {subtitle}
          </div>
        )}

        {/* Footer: user count + child count */}
        {(() => {
          const childCount = node.child_count ?? node.children?.length ?? 0;
          if (node.user_count <= 0 && childCount <= 0) return null;
          return (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {node.user_count > 0 && (
                <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Users size={9} /> {node.user_count}
                </span>
              )}
              {childCount > 0 && (
                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                  {childCount} sub
                </span>
              )}
            </div>
          );
        })()}
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: typeColor, border: 'none', width: 8, height: 8 }} />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes = { orgNode: OrgNodeCard as any };

/* ── Auto-fit helper (must be inside ReactFlow context) ─────────────────── */

function FlowAutoFit({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount]);
  return null;
}

/* ── Edit form type ──────────────────────────────────────────────────────── */

type EditForm = {
  name:        string;
  code:        string;
  weight:      number;
  description: string;
  address:     string;
  city:        string;
  country:     string;
  phone:       string;
  email:       string;
  is_active:   boolean;
};

const EDIT_EMPTY: EditForm = {
  name: '', code: '', weight: 5, description: '',
  address: '', city: '', country: '', phone: '', email: '', is_active: true,
};

function nodeToForm(n: OrgNode): EditForm {
  return {
    name:        n.name,
    code:        n.code        ?? '',
    weight:      n.weight,
    description: n.description ?? '',
    address:     n.address     ?? '',
    city:        n.city        ?? '',
    country:     n.country     ?? '',
    phone:       n.phone       ?? '',
    email:       n.email       ?? '',
    is_active:   n.is_active,
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

const fLabel: React.CSSProperties = {
  margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b',
};

/* ── OrgFlowTab ──────────────────────────────────────────────────────────── */

export function OrgFlowTab() {
  const qc = useQueryClient();

  const [section,    setSection]    = useState<'flow' | 'types'>('flow');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<EditForm>(EDIT_EMPTY);
  const [editPanel,  setEditPanel]  = useState<'info' | 'edit'>('info');
  const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState({ type_id: '', parent_id: '', name: '', weight: 5 });
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dropTargetRef  = useRef<string | null>(null);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  /* queries */
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
  });

  /* sync layout */
  useEffect(() => {
    if (!tree.length) { setRfNodes([]); setRfEdges([]); return; }
    const colorMap = new Map((types as StructureType[]).map(t => [t.id, t.color ?? '#64748b']));
    const { nodes, edges } = buildLayout(tree as OrgNode[], colorMap);
    setRfNodes(nodes);
    setRfEdges(edges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, types]);

  /* mutations */
  const updateTypeMut = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      systemConfigService.updateStructureType(id, { weight }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-structure-types'] }),
  });

  const createMut = useMutation({
    mutationFn: () => systemConfigService.createOrgNode({
      type_id:   addForm.type_id,
      parent_id: addForm.parent_id || undefined,
      name:      addForm.name,
      weight:    addForm.weight,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-node-tree'] });
      qc.invalidateQueries({ queryKey: ['org-nodes-flat'] });
      setShowAdd(false);
      setAddForm({ type_id: '', parent_id: '', name: '', weight: 5 });
    },
  });

  const updateMut = useMutation({
    mutationFn: (dto: EditForm) => systemConfigService.updateOrgNode(selectedId!, {
      name:        dto.name,
      code:        dto.code        || undefined,
      weight:      dto.weight,
      description: dto.description || undefined,
      address:     dto.address     || undefined,
      city:        dto.city        || undefined,
      country:     dto.country     || undefined,
      phone:       dto.phone       || undefined,
      email:       dto.email       || undefined,
      is_active:   dto.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-node-tree'] });
      qc.invalidateQueries({ queryKey: ['org-nodes-flat'] });
      setEditPanel('info');
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => systemConfigService.deleteOrgNode(selectedId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-node-tree'] });
      qc.invalidateQueries({ queryKey: ['org-nodes-flat'] });
      setSelectedId(null);
    },
  });

  const reparentMut = useMutation({
    mutationFn: ({ nodeId, parentId }: { nodeId: string; parentId: string }) =>
      systemConfigService.updateOrgNode(nodeId, { parent_id: parentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-node-tree'] });
      qc.invalidateQueries({ queryKey: ['org-nodes-flat'] });
    },
  });

  /* drag callbacks */
  const CARD_H = 85;

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, draggedNode: Node) => {
      const dragCX = draggedNode.position.x + NW / 2;
      const dragCY = draggedNode.position.y + CARD_H / 2;
      let found: string | null = null;
      for (const n of rfNodes) {
        if (n.id === draggedNode.id) continue;
        const { x, y } = n.position;
        if (dragCX >= x && dragCX <= x + NW && dragCY >= y && dragCY <= y + CARD_H) {
          found = n.id;
          break;
        }
      }
      dropTargetRef.current = found;
      setDropTargetId(found);
    },
    [rfNodes],
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, draggedNode: Node) => {
      const targetId = dropTargetRef.current;
      dropTargetRef.current = null;
      setDropTargetId(null);

      if (!targetId) return;
      if (isDescendant(tree as OrgNode[], draggedNode.id, targetId)) return;
      const current = findInTree(tree as OrgNode[], draggedNode.id);
      if (current?.parent_id === targetId) return;

      reparentMut.mutate({ nodeId: draggedNode.id, parentId: targetId });
    },
    [tree, reparentMut],
  );

  /* callbacks */
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const orgNode = (node.data as OrgNodeData).node;
    setSelectedId(node.id);
    setEditForm(nodeToForm(orgNode));
    setEditPanel('info');
    setShowAdd(false);
  }, []);

  const selectedNode = useMemo(
    () => (selectedId ? findInTree(tree as OrgNode[], selectedId) : null),
    [selectedId, tree],
  );

  /* selected node type color */
  const selectedTypeColor = useMemo(() => {
    if (!selectedNode) return '#64748b';
    return (types as StructureType[]).find(t => t.id === selectedNode.type_id)?.color ?? '#64748b';
  }, [selectedNode, types]);

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

  /* ── render ── */
  return (
    <div>
      {/* Section toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button style={sBtn(section === 'flow')}  onClick={() => setSection('flow')}>Árbol visual</button>
        <button style={sBtn(section === 'types')} onClick={() => setSection('types')}>Tipos de estructura</button>
        {section === 'flow' && (
          <button
            onClick={() => { setShowAdd(v => !v); setSelectedId(null); }}
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
        )}
      </div>

      {/* ────────────────── Tipos de estructura ────────────────── */}
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
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: t.color ?? '#64748b', flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>{t.name}</span>
                <code style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{t.slug}</code>
                {t.allows_users && (
                  <span style={{ fontSize: 9, color: '#059669', marginLeft: 8, fontWeight: 700 }}>
                    · tiene usuarios
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>Peso</span>
                <input type="range" min={1} max={10} value={t.weight}
                  onChange={e => updateTypeMut.mutate({ id: t.id, weight: +e.target.value })}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 18, color: weightColor(t.weight) }}>
                  {t.weight}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ────────────────── Árbol visual ────────────────── */}
      {section === 'flow' && (
        <>
          {/* Create form */}
          {showAdd && (
            <div style={{
              padding: '14px 16px', background: '#fff', border: '1.5px solid #0e2235',
              borderRadius: 8, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10,
            }}>
              <div style={{ flex: '1 1 140px' }}>
                <p style={fLabel}>Tipo *</p>
                <select value={addForm.type_id}
                  onChange={e => setAddForm(f => ({ ...f, type_id: e.target.value }))}
                  style={inp}>
                  <option value="">— seleccionar —</option>
                  {(types as StructureType[]).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '2 1 140px' }}>
                <p style={fLabel}>Nombre *</p>
                <input style={inp} value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Sede Bogotá" />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <p style={fLabel}>Nodo padre</p>
                <select value={addForm.parent_id}
                  onChange={e => setAddForm(f => ({ ...f, parent_id: e.target.value }))}
                  style={inp}>
                  <option value="">— raíz —</option>
                  {(flatNodes as OrgNode[]).map(n => (
                    <option key={n.id} value={n.id}>[{n.type_slug}] {n.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 110px' }}>
                <p style={fLabel}>Peso (1–10)</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="range" min={1} max={10} value={addForm.weight}
                    onChange={e => setAddForm(f => ({ ...f, weight: +e.target.value }))}
                    style={{ flex: 1 }} />
                  <span style={{ fontWeight: 700, color: weightColor(addForm.weight), minWidth: 16 }}>
                    {addForm.weight}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  disabled={!addForm.type_id || !addForm.name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                  style={{
                    padding: '6px 14px', background: '#ff5e3a', color: '#fff', border: 'none',
                    borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    opacity: !addForm.type_id || !addForm.name.trim() ? 0.5 : 1,
                  }}>
                  {createMut.isPending ? '…' : 'Crear'}
                </button>
              </div>
            </div>
          )}

          {/* React Flow canvas */}
          <div style={{ height: 500, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {rfNodes.length === 0 ? (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f8fafc',
              }}>
                <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Sin nodos en el árbol.</div>
                  <div style={{ fontSize: 11 }}>Usa "+ Nuevo nodo" para construir la estructura organizacional.</div>
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={rfNodes.map(n => ({
                  ...n,
                  style: n.id === dropTargetId
                    ? { outline: '2.5px solid #ff5e3a', borderRadius: 10, outlineOffset: 2 }
                    : undefined,
                }))}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onPaneClick={() => setSelectedId(null)}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                nodesDraggable={!reparentMut.isPending}
                nodesConnectable={false}
                elementsSelectable
                style={{ background: '#f8fafc' }}
              >
                <Background color="#e2e8f0" gap={20} />
                <Controls />
                <MiniMap
                  nodeColor={n => (n.data as OrgNodeData).typeColor ?? '#64748b'}
                  style={{ background: '#fff', border: '1px solid #e2e8f0' }}
                />
                <FlowAutoFit nodeCount={rfNodes.length} />
              </ReactFlow>
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
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: selectedTypeColor, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>
                    {selectedNode.name}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>
                    {selectedNode.type_slug}
                    {selectedNode.code && <> · <code>{selectedNode.code}</code></>}
                  </span>
                </div>
                {/* Info / Edit tabs */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 3, gap: 2 }}>
                  <button style={tabBtn(editPanel === 'info')} onClick={() => setEditPanel('info')}>
                    <Info size={10} style={{ display: 'inline', marginRight: 3 }} />Info
                  </button>
                  <button style={tabBtn(editPanel === 'edit')} onClick={() => setEditPanel('edit')}>
                    Editar
                  </button>
                </div>
                <button onClick={() => setSelectedId(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: '2px 4px' }}>
                  <X size={14} />
                </button>
              </div>

              {/* ── Info view ── */}
              {editPanel === 'info' && (
                <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                  {/* Left column */}
                  <div style={{ flex: '1 1 200px' }}>
                    <InfoRow label="Tipo"   value={selectedNode.type_slug} />
                    <InfoRow label="Padre"  value={selectedNode.parent_name ?? 'Raíz'} />
                    {selectedNode.code && <InfoRow label="Código" value={selectedNode.code} />}
                    <InfoRow label="Peso"
                      value={
                        <span style={{ fontWeight: 800, color: weightColor(selectedNode.weight) }}>
                          {selectedNode.weight}
                        </span>
                      }
                    />
                    <InfoRow label="Estado"
                      value={
                        <span style={{ fontWeight: 700, color: selectedNode.is_active ? '#22c55e' : '#94a3b8' }}>
                          {selectedNode.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      }
                    />
                    {(selectedNode.user_count > 0 || selectedNode.child_count > 0) && (
                      <InfoRow label="Conteos"
                        value={`${selectedNode.user_count} usuarios · ${selectedNode.child_count} sub-nodos`}
                      />
                    )}
                  </div>

                  {/* Right column: contact/location */}
                  {(selectedNode.address || selectedNode.city || selectedNode.country ||
                    selectedNode.phone  || selectedNode.email) && (
                    <div style={{ flex: '1 1 200px' }}>
                      {selectedNode.address && (
                        <InfoRow label="Dirección" value={selectedNode.address}
                          icon={<MapPin size={11} />} />
                      )}
                      {(selectedNode.city || selectedNode.country) && (
                        <InfoRow label="Ciudad"
                          value={[selectedNode.city, selectedNode.country].filter(Boolean).join(', ')}
                          icon={<MapPin size={11} />}
                        />
                      )}
                      {selectedNode.phone && (
                        <InfoRow label="Teléfono" value={selectedNode.phone}
                          icon={<Phone size={11} />} />
                      )}
                      {selectedNode.email && (
                        <InfoRow label="Email" value={selectedNode.email}
                          icon={<Mail size={11} />} />
                      )}
                    </div>
                  )}

                  {/* Description */}
                  {selectedNode.description && (
                    <div style={{ width: '100%', fontSize: 11, color: '#64748b',
                      background: '#f8fafc', padding: '8px 12px', borderRadius: 6,
                      borderLeft: `3px solid ${selectedTypeColor}40` }}>
                      {selectedNode.description}
                    </div>
                  )}

                  {/* Quick actions */}
                  <div style={{ width: '100%', display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditPanel('edit')}
                      style={{ padding: '6px 16px', background: '#0e2235', color: '#fff', border: 'none',
                        borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Editar nodo
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Desactivar "${selectedNode.name}"?`)) deleteMut.mutate(); }}
                      disabled={deleteMut.isPending}
                      style={{ padding: '6px 12px', background: '#fff', color: '#ef4444',
                        border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Trash2 size={12} /> {deleteMut.isPending ? '…' : 'Desactivar'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Edit view ── */}
              {editPanel === 'edit' && (
                <div style={{ padding: '16px' }}>
                  {/* Section: Básico */}
                  <SectionTitle>Básico</SectionTitle>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: '3 1 180px' }}>
                      <p style={fLabel}>Nombre *</p>
                      <input style={inp} value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 120px' }}>
                      <p style={fLabel}>Código</p>
                      <input style={inp} value={editForm.code}
                        placeholder="ej. BOG-01"
                        onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <p style={fLabel}>Peso (1–10)</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="range" min={1} max={10} value={editForm.weight}
                          onChange={e => setEditForm(f => ({ ...f, weight: +e.target.value }))}
                          style={{ flex: 1 }} />
                        <span style={{ fontWeight: 700, color: weightColor(editForm.weight), minWidth: 18 }}>
                          {editForm.weight}
                        </span>
                      </div>
                    </div>
                    <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <p style={fLabel}>Estado</p>
                      <button
                        onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                          border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff',
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                          color: editForm.is_active ? '#22c55e' : '#94a3b8', fontWeight: 700,
                        }}>
                        {editForm.is_active
                          ? <ToggleRight size={18} />
                          : <ToggleLeft size={18} />}
                        {editForm.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  </div>

                  {/* Section: Descripción */}
                  <SectionTitle>Descripción</SectionTitle>
                  <textarea
                    style={{ ...inp, minHeight: 56, resize: 'vertical', marginBottom: 12 }}
                    value={editForm.description}
                    placeholder="Descripción opcional del nodo..."
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />

                  {/* Section: Localización y contacto */}
                  <SectionTitle>Localización y contacto</SectionTitle>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: '2 1 200px' }}>
                      <p style={fLabel}>Dirección</p>
                      <input style={inp} value={editForm.address}
                        placeholder="Calle, número, barrio..."
                        onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <p style={fLabel}>Ciudad</p>
                      <input style={inp} value={editForm.city}
                        placeholder="Bogotá"
                        onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <p style={fLabel}>País</p>
                      <input style={inp} value={editForm.country}
                        placeholder="Colombia"
                        onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <p style={fLabel}>Teléfono</p>
                      <input style={inp} value={editForm.phone}
                        placeholder="+57 1 234 5678"
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div style={{ flex: '2 1 180px' }}>
                      <p style={fLabel}>Email</p>
                      <input type="email" style={inp} value={editForm.email}
                        placeholder="sede@empresa.com"
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => updateMut.mutate(editForm)}
                      disabled={!editForm.name.trim() || updateMut.isPending}
                      style={{
                        padding: '7px 18px', background: '#059669', color: '#fff', border: 'none',
                        borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 5,
                        opacity: !editForm.name.trim() ? 0.5 : 1,
                      }}>
                      <Check size={13} /> {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button onClick={() => setEditPanel('info')}
                      style={{ padding: '7px 14px', background: '#fff', color: '#64748b',
                        border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        fontFamily: 'inherit' }}>
                      Cancelar
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Desactivar "${selectedNode.name}"?`)) deleteMut.mutate(); }}
                      disabled={deleteMut.isPending}
                      style={{ marginLeft: 'auto', padding: '7px 12px', background: '#fff', color: '#ef4444',
                        border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Trash2 size={12} /> {deleteMut.isPending ? '…' : 'Desactivar'}
                    </button>
                  </div>

                  {updateMut.isSuccess && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#22c55e' }}>
                      Nodo actualizado.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11, color: reparentMut.isPending ? '#f59e0b' : '#94a3b8' }}>
            {reparentMut.isPending
              ? 'Aplicando nuevo padre…'
              : 'Clic para ver detalles · Arrastra un nodo sobre otro para reparentarlo'}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Small helper components ─────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 8, paddingBottom: 4,
      borderBottom: '1px solid #f1f5f9',
    }}>
      {children}
    </div>
  );
}

function InfoRow({
  label, value, icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', minWidth: 70, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: '#0e2235', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon && <span style={{ color: '#94a3b8' }}>{icon}</span>}
        {value}
      </span>
    </div>
  );
}
