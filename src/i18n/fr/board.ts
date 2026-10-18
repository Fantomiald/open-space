export const board = {
  /** the whiteboard of the room: the notes of the journal folder, one tab per Markdown file */
  title: 'Tableau',
  tabs: 'Notes',
  add: 'Nouvelle note',
  newPlaceholder: 'Nom de la note (ex. meadow)',
  create: 'Créer',
  cancel: 'Annuler',
  badName: 'Lettres, chiffres, espaces, « - » et « _ » seulement.',
  empty: (folder: string) => `Aucune note dans ${folder} pour l’instant : chaque fichier .md de ce dossier devient un onglet du tableau.`,
  // before the line for CLAUDE.md (claudeLine)
  emptyHint: 'Écris ici, ou laisse tes sessions Claude y écrire, par exemple avec cette ligne dans ton CLAUDE.md : ',
  help: 'À quoi sert le tableau',
  helpWhat: (folder: string) => `Le tableau montre les fichiers .md de ton dossier de notes (${folder}), un onglet par fichier. Tu peux y écrire ici.`,
  // before the line for CLAUDE.md (claudeLine)
  helpSessions: 'Tes sessions Claude peuvent y écrire aussi : ajoute par exemple à ton CLAUDE.md une ligne comme ',
  helpFolder: 'Le dossier des notes se change dans les Réglages.',
  /** an example of a line for CLAUDE.md that makes sessions keep the notes */
  claudeLine: (folder: string) => `Quand une tâche est finie, ajoute une ligne dans ${folder}/<projet>.md`,
  edit: 'Modifier',
  view: 'Voir',
  blank: 'Note vide : clique pour écrire.',
  editLabel: (title: string) => `Texte de la note ${title}`,
  loading: 'Chargement…',
  conflict: 'Une session a modifié cette note entre-temps : rechargée, ta dernière modification n’a pas été gardée.',
};
