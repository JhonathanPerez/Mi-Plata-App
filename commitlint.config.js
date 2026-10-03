/**
 * Reglas para los mensajes de commit (Conventional Commits), las mismas que entiende semantic-release.
 * Se validan en tu máquina con el hook .husky/commit-msg.
 *
 *   tipo(ámbito): descripción        ->  feat(ui): hoja de método de pago con vista previa (E4-T18)
 *
 *   feat  -> sube la versión MINOR      fix -> sube el PATCH      feat! -> sube el MAJOR
 *   refactor, perf, docs, style, test, build, ci, chore, revert -> no publican versión
 *
 * Se parte de la configuración estándar y se relajan solo las reglas de longitud y de mayúsculas,
 * porque los mensajes del proyecto son largos, en español y a veces empiezan con un nombre propio (Ajustes, Tarjetas…).
 */
export default {
  extends: ['@commitlint/config-conventional'],
  helpUrl: 'https://www.conventionalcommits.org/es/v1.0.0/',
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'revert']],
    'header-max-length': [0],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
