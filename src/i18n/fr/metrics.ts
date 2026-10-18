export const metrics = {
  /** the numbers object of the room: the Markdown file of the settings, read only */
  title: 'Chiffres',
  empty: 'Ce fichier n’existe pas encore : il s’affichera ici dès qu’un script ou une session Claude l’aura écrit.',
  emptyHint: (file: string) => `L’objet lit ${file}, à changer dans les Réglages.`,
  loading: 'Chargement…',
  changed: (duration: string) => `Fichier réécrit il y a ${duration}`,
};
