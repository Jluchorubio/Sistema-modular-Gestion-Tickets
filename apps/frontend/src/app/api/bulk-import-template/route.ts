import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function GET() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NEXO ITSM';
  wb.created = new Date();

  const ws = wb.addWorksheet('Usuarios NEXO', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  // Column definitions
  ws.columns = [
    { header: 'first_name',    key: 'first_name',    width: 20 },
    { header: 'last_name',     key: 'last_name',     width: 20 },
    { header: 'email',         key: 'email',         width: 32 },
    { header: 'phone',         key: 'phone',         width: 16 },
    { header: 'document',      key: 'document',      width: 16 },
    { header: 'employee_code', key: 'employee_code', width: 16 },
    { header: 'position',      key: 'position',      width: 24 },
    { header: 'department',    key: 'department',    width: 22 },
    { header: 'site',          key: 'site',          width: 22 },
    { header: 'global_role',   key: 'global_role',   width: 18 },
  ];

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell, col) => {
    const required = col <= 3;
    cell.value      = ws.getColumn(col).header as string;
    cell.font       = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FFCC3300' : 'FFFF6B00' } };
    cell.alignment  = { horizontal: 'center', vertical: 'middle' };
    cell.border     = { bottom: { style: 'thin', color: { argb: 'FFAA2200' } } };
  });

  // Sub-header: labels in Spanish
  const subLabels = ['Nombre *', 'Apellido *', 'Correo *', 'Teléfono', 'Documento', 'Cód. empleado', 'Cargo', 'Área/Depto.', 'Sede', 'Rol global'];
  const subRow = ws.addRow(subLabels);
  subRow.height = 22;
  subRow.eachCell((cell, col) => {
    cell.font      = { italic: true, size: 9, color: { argb: col <= 3 ? 'FFCC3300' : 'FF94A3B8' }, name: 'Calibri' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Example rows
  const examples = [
    { first_name: 'Juan', last_name: 'Pérez', email: 'juan.perez@empresa.com', phone: '3001234567', document: '12345678', employee_code: 'EMP001', position: 'Analista TI', department: 'Tecnología', site: 'Sede Principal', global_role: 'usuario' },
    { first_name: 'María', last_name: 'García', email: 'maria.garcia@empresa.com', phone: '3109876543', document: '87654321', employee_code: 'EMP002', position: 'Coordinadora', department: 'RRHH', site: 'Sede Norte', global_role: 'usuario' },
    { first_name: 'Carlos', last_name: 'López', email: 'carlos.lopez@empresa.com', phone: '', document: '', employee_code: '', position: 'Técnico', department: 'Soporte', site: 'Sede Principal', global_role: 'usuario' },
  ];

  examples.forEach((ex, i) => {
    const row = ws.addRow(ex);
    row.height = 22;
    row.eachCell(cell => {
      cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFAFBFC' } };
      cell.alignment = { vertical: 'middle' };
    });
  });

  // Freeze top 2 rows
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  // Auto filter on header
  ws.autoFilter = { from: 'A1', to: 'J1' };

  // Instructions sheet
  const info = wb.addWorksheet('Instrucciones');
  info.getColumn(1).width = 60;
  info.getColumn(2).width = 40;

  const instrucciones = [
    ['NEXO ITSM — Plantilla importación de usuarios', ''],
    ['', ''],
    ['CAMPOS OBLIGATORIOS', 'DESCRIPCIÓN'],
    ['first_name', 'Nombre del usuario'],
    ['last_name', 'Apellido del usuario'],
    ['email', 'Correo electrónico (único en el sistema)'],
    ['', ''],
    ['CAMPOS OPCIONALES', 'DESCRIPCIÓN'],
    ['phone', 'Teléfono de contacto'],
    ['document', 'Número de documento de identidad'],
    ['employee_code', 'Código interno del empleado'],
    ['position', 'Cargo o puesto de trabajo'],
    ['department', 'Área o departamento'],
    ['site', 'Sede o ubicación'],
    ['global_role', 'Rol en el sistema (ej: usuario, admin_modulo)'],
    ['', ''],
    ['NOTAS', ''],
    ['• Los campos con * son obligatorios', ''],
    ['• El sistema asignará contraseña temporal: Ticket2026!', ''],
    ['• El usuario deberá cambiarla al primer inicio de sesión', ''],
    ['• Correos duplicados serán omitidos automáticamente', ''],
    ['• Máximo 200 usuarios por importación', ''],
  ];

  instrucciones.forEach((rowData, i) => {
    const row = info.addRow(rowData);
    if (i === 0) {
      row.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFF6B00' }, name: 'Calibri' };
    } else if (rowData[0] === 'CAMPOS OBLIGATORIOS' || rowData[0] === 'CAMPOS OPCIONALES' || rowData[0] === 'NOTAS') {
      row.getCell(1).font = { bold: true, size: 10, color: { argb: 'FFCC3300' }, name: 'Calibri' };
      row.getCell(2).font = { bold: true, size: 10, color: { argb: 'FFCC3300' }, name: 'Calibri' };
    } else {
      row.getCell(1).font = { size: 10, name: 'Calibri', color: { argb: 'FF475569' } };
      row.getCell(2).font = { size: 10, name: 'Calibri', color: { argb: 'FF64748B' } };
    }
    row.height = 18;
  });

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_nexo_usuarios.xlsx"',
    },
  });
}
