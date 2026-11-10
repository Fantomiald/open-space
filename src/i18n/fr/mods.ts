export const mods = {
  /** the button of the header and the dialog it opens (ModsPanel.tsx) */
  title: 'Mods',
  buttonTitle: 'Tes mods : des petites fenêtres faites par tes agents',
  news: 'Du nouveau dans un mod',
  heading: 'Tes mods',
  none: 'Aucun mod pour l’instant. Décris-en un ci-dessous : un agent le fabrique et il s’ouvre ici.',
  open: 'ouvert',
  draft: 'en fabrication',
  unread: 'du nouveau',
  openTitle: 'Ouvrir sa fenêtre',
  edit: 'Modifier',
  editTitle: (name: string) => `Modifier ${name} : rouvre la session qui l’écrit`,
  remove: 'Supprimer',
  removeTitle: (name: string) => `Mettre ${name} à la corbeille`,
  confirmRemove: 'Confirmer',
  newHeading: 'Nouveau mod',
  newPlaceholder: 'Décris le mod que tu veux',
  /** ideas shown while there is no mod yet: a click puts one in the field */
  ideas: ['Mes coûts Claude de la semaine', 'Un minuteur pomodoro', 'Les sessions qui m’attendent'],
  ideasLabel: 'Des idées pour commencer',
  create: 'Créer',
  newHint: 'Un agent l’écrit dans une session, il s’ouvre ici quand il est prêt.',
  /** the numbers file of the preferences, listed with the mods */
  /** a mod's window (ModWindows.tsx) */
  windowLabel: (name: string) => `Mod ${name}`,
  reload: 'Recharger',
  fold: 'Replier',
  unfold: 'Déplier',
  close: 'Fermer',
  building: (who: string | null) => (who ? `${who} le fabrique…` : 'En fabrication…'),
  buildingText: 'La fenêtre se remplit dès que l’agent a fini.',
  showSession: 'Voir la session',
};
