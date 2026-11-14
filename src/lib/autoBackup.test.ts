import { describe, expect, it } from 'vitest';
import {
  backupFileName, cloudBackupFileName, computeNextBackup, dateFromBackupName, dateFromCloudBackupName, describeCloudLag, describeNextBackup, isAutoBackupFrequency, isBackupDue, namesToPrune,
} from './autoBackup';

const at = (iso: string, time: string) => new Date(`${iso}T${time}:00`);

describe('computeNextBackup', () => {
  it('apagada no tiene próxima copia', () => {
    expect(computeNextBackup('off', '2026-11-13', '21:00', at('2026-11-13', '10:00'))).toBeNull();
  });

  it('suma el intervalo a la fecha de la última copia, a la hora elegida', () => {
    const now = at('2026-11-13', '10:00');
    expect(computeNextBackup('daily', '2026-11-13', '21:30', now)).toEqual(at('2026-11-14', '21:30'));
    expect(computeNextBackup('weekly', '2026-11-13', '08:05', now)).toEqual(at('2026-11-20', '08:05'));
    expect(computeNextBackup('monthly', '2026-11-13', '23:00', now)).toEqual(at('2026-12-13', '23:00'));
  });

  it('sin copia previa (o con un dato dañado) toca de inmediato', () => {
    const now = at('2026-11-13', '10:00');
    expect(computeNextBackup('weekly', null, '21:00', now)).toEqual(now);
    expect(computeNextBackup('weekly', 'no-es-fecha', '21:00', now)).toEqual(now);
  });

  it('una hora inválida se reemplaza por la de siempre', () => {
    expect(computeNextBackup('daily', '2026-11-13', '99:99', at('2026-11-13', '10:00'))).toEqual(at('2026-11-14', '21:00'));
  });
});

describe('isBackupDue', () => {
  it('apagada nunca hace copias', () => {
    expect(isBackupDue('off', null, '21:00', at('2026-11-13', '10:00'))).toBe(false);
  });

  it('solo toca cuando llega la hora elegida', () => {
    // Copia diaria a las 9:00 p. m., la última fue ayer: hoy toca a las 9:00 p. m., no antes.
    expect(isBackupDue('daily', '2026-11-12', '21:00', at('2026-11-13', '20:59'))).toBe(false);
    expect(isBackupDue('daily', '2026-11-12', '21:00', at('2026-11-13', '21:00'))).toBe(true);
    // Hecha hoy: no vuelve a tocar hasta mañana.
    expect(isBackupDue('daily', '2026-11-13', '21:00', at('2026-11-13', '23:30'))).toBe(false);
  });

  it('si la app estuvo cerrada, la copia queda pendiente y toca en cuanto se abre', () => {
    expect(isBackupDue('daily', '2026-11-10', '21:00', at('2026-11-13', '07:15'))).toBe(true);
    expect(isBackupDue('weekly', '2026-11-06', '21:00', at('2026-11-13', '21:01'))).toBe(true);
    expect(isBackupDue('weekly', '2026-11-07', '21:00', at('2026-11-13', '21:01'))).toBe(false);
  });

  it('la primera copia toca apenas se activa', () => {
    expect(isBackupDue('monthly', null, '21:00', at('2026-11-13', '10:00'))).toBe(true);
  });
});

describe('describeCloudLag', () => {
  const now = at('2026-11-13', '22:00');

  it('no avisa si la copia de la nube va al día o las copias están apagadas', () => {
    expect(describeCloudLag('daily', '2026-11-13', '21:00', now)).toBeNull();
    expect(describeCloudLag('off', '2026-11-01', '21:00', now)).toBeNull();
  });

  it('avisa, con la fecha de la última que llegó, cuando ya debía enviarse y no llegó', () => {
    const lag = describeCloudLag('daily', '2026-11-08', '21:00', now);
    expect(lag).toContain('8 noviembre 2026');
    expect(lag).toContain('pendiente');
  });

  it('avisa cuando todavía no ha llegado ninguna', () => {
    expect(describeCloudLag('weekly', null, '21:00', now)).toContain('ninguna');
  });
});

describe('describeNextBackup', () => {
  const now = at('2026-11-13', '10:00');

  it('dice la fecha y la hora de la próxima copia', () => {
    expect(describeNextBackup('daily', '2026-11-13', '21:00', now)).toBe('Próxima copia de seguridad: sábado 14 de noviembre a las 9:00 p. m. (mañana).');
    expect(describeNextBackup('daily', '2026-11-12', '21:00', now)).toContain('(hoy)');
    expect(describeNextBackup('weekly', '2026-11-13', '08:30', now)).toBe('Próxima copia de seguridad: viernes 20 de noviembre a las 8:30 a. m.');
  });

  it('avisa cuando está pendiente y no dice nada si está apagada', () => {
    expect(describeNextBackup('daily', '2026-11-10', '21:00', now)).toContain('pendiente');
    expect(describeNextBackup('off', '2026-11-10', '21:00', now)).toBeNull();
  });
});

describe('archivos de copia automática', () => {
  it('el nombre lleva la fecha y se puede leer de vuelta', () => {
    expect(backupFileName('2026-11-13')).toBe('MiPlata_auto_2026-11-13.json');
    expect(dateFromBackupName('MiPlata_auto_2026-11-13.json')).toBe('2026-11-13');
    expect(dateFromBackupName('MiPlata_copia_2026-11-13.json')).toBeNull();
    expect(dateFromBackupName('MiPlata_auto_2026-13-45.json')).toBeNull();
  });

  it('conserva las copias más recientes y borra el resto, sin tocar otros archivos', () => {
    const names = [
      'MiPlata_auto_2026-11-01.json', 'MiPlata_auto_2026-11-08.json', 'MiPlata_auto_2026-10-25.json',
      'MiPlata_auto_2026-11-13.json', 'MiPlata_auto_2026-10-18.json', 'MiPlata_auto_2026-10-11.json', 'notas.txt',
    ];
    expect(namesToPrune(names, 5).sort()).toEqual(['MiPlata_auto_2026-10-11.json']);
    expect(namesToPrune(names.slice(0, 3), 5)).toEqual([]);
  });

  it('las copias de la nube tienen su propio nombre y no se mezclan con las locales', () => {
    expect(cloudBackupFileName('2026-11-13')).toBe('MiPlata_nube_2026-11-13.json');
    expect(dateFromCloudBackupName('MiPlata_nube_2026-11-13.json')).toBe('2026-11-13');
    expect(dateFromCloudBackupName('MiPlata_auto_2026-11-13.json')).toBeNull();
    const names = ['MiPlata_nube_2026-11-01.json', 'MiPlata_nube_2026-11-08.json', 'MiPlata_nube_2026-11-13.json', 'MiPlata_auto_2026-01-01.json', 'foto.jpg'];
    // Solo cuenta (y borra) lo que es de la nube; los demás archivos de la carpeta no se tocan.
    expect(namesToPrune(names, 2, dateFromCloudBackupName)).toEqual(['MiPlata_nube_2026-11-01.json']);
  });

  it('reconoce las frecuencias válidas', () => {
    expect(isAutoBackupFrequency('weekly')).toBe(true);
    expect(isAutoBackupFrequency('hourly')).toBe(false);
    expect(isAutoBackupFrequency(null)).toBe(false);
  });
});
