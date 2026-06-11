-- Reglas SLA por módulo (sobrescriben las globales de config.sla_rules)
CREATE TABLE IF NOT EXISTS modules.module_sla_rules (
    id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
    module_id               uuid        NOT NULL,
    priority                varchar(20) NOT NULL,
    hours_to_resolve        integer     NOT NULL CHECK (hours_to_resolve > 0),
    hours_to_first_response integer     NOT NULL DEFAULT 1 CHECK (hours_to_first_response > 0),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_module_sla_rules       PRIMARY KEY (id),
    CONSTRAINT uq_module_sla_priority    UNIQUE (module_id, priority),
    CONSTRAINT module_sla_priority_check CHECK (priority IN ('baja','media','alta','critica'))
);

ALTER TABLE modules.module_sla_rules
    ADD CONSTRAINT module_sla_rules_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_module_sla_rules_module ON modules.module_sla_rules (module_id);

CREATE TRIGGER trg_module_sla_rules_updated_at
    BEFORE UPDATE ON modules.module_sla_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
