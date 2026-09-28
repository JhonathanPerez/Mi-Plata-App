declare module 'jeep-sqlite/loader' {
  export function defineCustomElements(win?: Window): Promise<void>;
}

// Build de navegador de ExcelJS (evita depender de polyfills de Node).
declare module 'exceljs/dist/exceljs.min.js';
