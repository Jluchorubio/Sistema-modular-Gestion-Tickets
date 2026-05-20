'use client';

import { useState } from 'react';
import { Plus, X, MapPin, Layers, Grid3X3, Briefcase } from 'lucide-react';
import styles from '../../complete-profile/complete-profile.module.css';
import orgStyles from './org-step.module.css';
import { systemConfigService } from '@/services/system-config.service';

export interface OrgData {
  headquarters: string[];
  departments:  string[];
  areas:        string[];
  positions:    string[];
}

interface Props {
  onNext: (data: OrgData) => void;
  onBack: () => void;
}

function InlineList({
  icon, title, sub, items, onAdd, onRemove, placeholder, required,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
  required?: boolean;
}) {
  const [draft, setDraft] = useState('');

  function handleAdd() {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft('');
  }

  return (
    <div className={orgStyles.section}>
      <div className={orgStyles.sectionHead}>
        <span className={orgStyles.sectionIcon}>{icon}</span>
        <div>
          <div className={orgStyles.sectionTitle}>
            {title}
            {required && <span className={styles.req}> *</span>}
          </div>
          <div className={orgStyles.sectionSub}>{sub}</div>
        </div>
      </div>

      <div className={orgStyles.addRow}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder={placeholder}
          className={orgStyles.addInput}
        />
        <button type="button" onClick={handleAdd} className={orgStyles.addBtn}>
          <Plus size={14} /> Agregar
        </button>
      </div>

      {items.length > 0 && (
        <div className={orgStyles.chips}>
          {items.map((item, i) => (
            <span key={i} className={orgStyles.chip}>
              {item}
              <button type="button" onClick={() => onRemove(i)} className={orgStyles.chipRemove}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgStep({ onNext, onBack }: Props) {
  const [hqs,   setHqs]   = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [pos,   setPos]   = useState<string[]>([]);
  const [error, setError]  = useState('');
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (hqs.length === 0) {
      setError('Agrega al menos una sede antes de continuar.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await Promise.all([
        ...hqs.map(name =>
          systemConfigService.createHeadquarter({ name, address: null, city: null, country: 'Colombia', phone: null, email: null }),
        ),
        ...depts.map(name =>
          systemConfigService.createDepartment({ name }),
        ),
        ...areas.map(name =>
          systemConfigService.createArea({ name }),
        ),
        ...pos.map((name, i) =>
          systemConfigService.createPosition({ name, level: i + 1 }),
        ),
      ]);
      onNext({ headquarters: hqs, departments: depts, areas, positions: pos });
    } catch {
      setError('Error al guardar la estructura. Verifica e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className={styles.progressWrap}>
        <div className={styles.progressHeader}>
          <span className={styles.progressTitle}>Paso 2 de 3</span>
          <span className={styles.progressPct}>66%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: '66%' }} />
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionNum}>02 — ORGANIZACIÓN</div>
            <div className={styles.sectionTitle}>Estructura organizacional</div>
            <div className={styles.sectionSub}>
              Define sedes, departamentos, áreas y cargos. Los usuarios los usarán en su perfil.
            </div>
          </div>
        </div>
        <div className={styles.sectionDivider} />

        {error && <div className={styles.errorBanner}>{error}</div>}

        <InlineList
          icon={<MapPin size={14} />}
          title="Sedes"
          sub="Ubicaciones físicas de la empresa"
          items={hqs}
          onAdd={v => setHqs(p => [...p, v])}
          onRemove={i => setHqs(p => p.filter((_, idx) => idx !== i))}
          placeholder="Ej: Sede Principal, Sede Norte..."
          required
        />

        <InlineList
          icon={<Layers size={14} />}
          title="Departamentos"
          sub="Áreas funcionales grandes (opcional)"
          items={depts}
          onAdd={v => setDepts(p => [...p, v])}
          onRemove={i => setDepts(p => p.filter((_, idx) => idx !== i))}
          placeholder="Ej: Sistemas, Soporte, RRHH..."
        />

        <InlineList
          icon={<Grid3X3 size={14} />}
          title="Áreas"
          sub="Sub-áreas dentro de departamentos (opcional)"
          items={areas}
          onAdd={v => setAreas(p => [...p, v])}
          onRemove={i => setAreas(p => p.filter((_, idx) => idx !== i))}
          placeholder="Ej: Redes, Desarrollo, Atención..."
        />

        <InlineList
          icon={<Briefcase size={14} />}
          title="Cargos"
          sub="Posiciones jerárquicas de menor a mayor nivel (opcional)"
          items={pos}
          onAdd={v => setPos(p => [...p, v])}
          onRemove={i => setPos(p => p.filter((_, idx) => idx !== i))}
          placeholder="Ej: Técnico TI, Coordinador, Director..."
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className={styles.submitBtn}
          style={{ background: 'var(--border2)', color: 'var(--text)', flex: '0 0 120px' }}
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className={styles.submitBtn}
          style={{ flex: 1 }}
        >
          {saving ? 'Guardando...' : 'Continuar → Finalizar'}
        </button>
      </div>
    </div>
  );
}
