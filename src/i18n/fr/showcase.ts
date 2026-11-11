/** The tour of what Open Space does (Tour.tsx: the onboarding's last step, and again from the settings), and the news of each version (WhatsNewDialog.tsx). */
export const showcase = {
  tour: {
    label: 'Ce que tu peux faire',
    /** the slides, in their order (Tour.tsx `SLIDES`) */
    slides: {
      room: {
        kicker: 'La salle',
        title: 'Chaque session est un perso',
        text: 'Il tape quand il travaille, lève la main quand il a besoin de toi et sourit quand il a fini. Un clic sur lui ouvre sa conversation.',
      },
      parallel: {
        kicker: 'Les sessions',
        title: 'Plusieurs à la fois, sans t’y perdre',
        text: (modifier: string) => `N lance une nouvelle conversation, ${modifier}K retrouve n’importe laquelle. Elles avancent en parallèle, tu passes de l’une à l’autre.`,
      },
      automata: {
        kicker: 'Les automates',
        title: 'Des sessions qui partent toutes seules',
        text: 'Chaque matin à 8 h, ou dès qu’un ticket t’est assigné. Elles te préviennent sur Telegram et tu leur réponds depuis ton téléphone.',
      },
      mods: {
        kicker: 'Les mods',
        title: 'Une fenêtre sur mesure, en une phrase',
        text: 'Décris ce qu’il te faut, « un minuteur », « mes coûts de la semaine » : un agent la fabrique et elle s’ouvre sur ton bureau.',
      },
      browser: {
        kicker: 'Le navigateur',
        title: 'Regarde tes agents tester ton site',
        text: 'Quand une session vérifie une page, son navigateur s’ouvre en mini-fenêtre. Tu la vois cliquer en direct, et tu peux cliquer avec elle.',
      },
      layout: {
        kicker: 'Ton écran',
        title: 'Range tout comme tu veux',
        text: (modifier: string) => `Tab cache tout sauf la salle, ${modifier} . passe en mode focus, et une conversation peut sortir dans sa propre fenêtre, au-dessus de tes autres apps.`,
      },
    },
    /** the people of the drawings: no one's name, only roles */
    cast: { working: 'au travail', waiting: 't’attend', done: 'fini' },
    art: {
      schedule: 'Tous les jours · 8:00',
      webhook: 'Ticket assigné',
      telegram: 'Le run est fini, 3 fichiers changés',
      telegramReply: 'Merci, pousse la branche',
      modPrompt: 'un minuteur pomodoro',
      modTitle: 'Pomodoro',
      tester: 'Testeur 1',
      address: 'localhost:3000/inscription',
      signUp: 'Créer mon compte',
      popOut: 'Au-dessus des autres apps',
      hide: 'tout cacher',
      focus: 'mode focus',
      search: 'chercher',
      newSession: 'nouvelle conv',
    },
    slide: (index: number, count: number) => `${index} sur ${count}`,
    goTo: (index: number) => `Aller à l’étape ${index}`,
    previous: 'Précédent',
    next: 'Suivant',
    skip: 'Passer',
    done: 'Compris',
  },
  whatsNew: {
    title: 'Quoi de neuf',
    kicker: (version: string) => `Open Space ${version}`,
    intro: 'Ce qui a changé depuis ta dernière visite.',
    version: (version: string) => `Version ${version}`,
    allNotes: 'Toutes les notes de version',
    close: 'C’est noté',
    /** the button in the settings' About that opens it again */
    reopen: 'Voir les nouveautés',
    tour: 'Revoir la visite',
    releases: {
      '1.31': {
        title: 'Bien démarrer, et voir ce qui change',
        items: {
          whatsNew: { title: 'Les nouveautés à chaque mise à jour', text: 'À la première ouverture d’une nouvelle version, cette fenêtre te montre ce qui a changé. Tu la retrouves dans Réglages > À propos.' },
          tour: { title: 'Une visite des fonctions', text: 'Les automates, les mods, le navigateur en mini-fenêtre et les raccourcis, expliqués en quelques écrans. Tu peux la refaire quand tu veux.' },
          onboarding: { title: 'Un premier lancement plus clair', text: 'La salle dessinée dès l’accueil, trois réglages rapides, puis la visite, que les nouveaux venus peuvent passer.' },
        },
      },
    },
    actions: { automata: 'Ouvrir les automates', mods: 'Voir mes mods', settings: 'Ouvrir le réglage', tour: 'Faire la visite' },
  },
};
