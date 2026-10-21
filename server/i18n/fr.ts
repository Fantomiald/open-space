export const fr = {
  /** what new agents are told (system prompt, rename note, side question) */
  prompt: {
    identity: (name: string, user: string, note: string) => {
      const who = user || 'l’utilisateur';
      return `Dans l'Open Space de ${who}, tu es l'agent « ${name} ». Si on te demande ton nom ou qui tu es, réponds « ${name} » ` +
        `(tu restes Claude, le modèle d'Anthropic). Plusieurs agents travaillent en parallèle, chacun sous son propre nom. ` +
        `${user || 'L’utilisateur'} suit plusieurs sessions à la fois : sois concis. Pas de préambule ni de récapitulatif de ce que tu viens de faire, ` +
        `pas de narration de chaque étape ; quelques phrases courtes suffisent, et tu ne détailles que si on te le demande. ` +
        `Cette consigne porte sur tes messages, pas sur la qualité ni la complétude du travail.` +
        ` Open Space affiche dans le fil les images que tu envoies avec SendUserFile et les pages que tu publies avec Artifact : quand tu changes quelque chose de visible (une page, un écran) et que tu peux en prendre une capture, envoie-la.` +
        (note ? `\n\nCe que ${who} demande à tous ses agents : ${note}` : '');
    },
    /** the files the user sent with a message, as their paths: Claude opens them with its tools */
    /** sent by Open Space itself to a conversation left alone (Preferences.idleCompact) */
    idleCompact: '/compact Garde ce qu’il faut pour continuer sans rien réexpliquer : où on en est (branche, fichiers non commités), chaque décision et pourquoi, ce que l’utilisateur a demandé ou refusé avec ses mots, ce qui reste à faire, les fichiers clés et les pièges déjà rencontrés.',
    attached: (paths: readonly string[]) => (paths.length === 1 ? `Fichier joint : ${paths[0]}` : `Fichiers joints :\n${paths.map((file) => `- ${file}`).join('\n')}`),
    rename: (name: string) => `(Note d'Open Space : tu t'appelles désormais « ${name} ». Garde ce nom.)\n\n`,
    aside: 'Question à côté (/btw), posée pendant que tu travailles : réponds brièvement, à partir de ce qui est déjà ' +
      'dans la conversation, sans utiliser d’outil. Ta réponse n’entre pas dans la conversation principale.',
  },
  process: {
    stopped: 'Claude Code s’est arrêté.',
    refused: 'Claude Code a refusé.',
  },
  aside: {
    tooLong: 'La question à côté a pris trop de temps.',
    stoppedWithoutAnswer: 'Claude Code s’est arrêté sans répondre.',
    withdrawn: 'Question retirée.',
  },
  sessions: {
    /** why a session stopped, shown in its thread (the releases of an idle process are not shown) */
    stopped: {
      byUser: 'Fermée par toi.',
      serverStopped: 'Le serveur s’est arrêté pendant qu’elle travaillait.',
      ended: 'Claude Code s’est terminé.',
      idle: 'Processus relâché après un moment sans rien faire.',
      released: 'Processus relâché à l’arrêt du serveur.',
      updated: 'Processus relâché : le prochain message part avec la nouvelle version de Claude Code.',
      compacted: 'Processus relâché après le compactage de la conversation.',
    },
    closing: 'Cette session est en train de se fermer, réessaie dans un instant.',
    tooMany: (max: number) => `Trop de sessions actives (${max} au maximum). Ferme-en une.`,
    folderGone: 'Le dossier de cette session n’est plus dans les racines autorisées.',
    uploadsGone: (count: number) => (count > 1 ? `${count} fichiers joints n’existent plus : le message est parti sans eux. Joins-les de nouveau.` : 'Un fichier joint n’existe plus : le message est parti sans lui. Joins-le de nouveau.'),
    outsideRoots: 'Ce dossier n’est pas dans les racines autorisées (OFFICE_ROOTS).',
    remoteFailed: (reason: string) => `Remote Control n’a pas démarré : ${reason}`,
    requestGone: 'Cette demande n’existe plus.',
    questionNotYesNo: 'Cette question attend une réponse, pas un oui ou un non.',
    requestYesNo: 'Cette demande attend un oui ou un non.',
    chooseAnswer: 'Choisis une réponse avant d’envoyer.',
    killed: (signal: string) => `Claude Code a été arrêté (${signal}).`,
    exited: (code: number | null) => `Claude Code s’est arrêté (code ${code}).`,
    resumed: (title: string) => `Reprise de « ${title} ».`,
    resumedWithHistory: (title: string) => `Reprise de « ${title} » : ses derniers échanges.`,
    nextMessageContinues: 'Ton prochain message continue la conversation.',
    untitledConversation: 'la conversation',
    duplicateOf: (name: string) => `la conversation de ${name}`,
    nothingToDuplicate: 'Cette session n’a encore rien dit : rien à dupliquer.',
    logFailed: (name: string, reason: string) => `Le journal de ${name} n’a pas pu être écrit (${reason}). Il sera rouvert au prochain événement.`,
    stoppingNoStart: 'Le serveur s’arrête : aucune session ne peut démarrer.',
    stoppingNoCreate: 'Le serveur s’arrête : aucune session ne peut être créée.',
    claudeMissing: 'Claude Code n’est pas installé sur cet ordinateur.',
    notFound: 'Cette session n’existe pas.',
    alreadyOpen: 'Cette conversation est déjà ouverte ici.',
    emptyName: 'Le nom ne peut pas être vide.',
    trustNeeded: 'Ce dossier fait tourner du code à lui : confirme d’abord.',
  },
  /** what the thread shows of tool calls, permissions and messages from other sessions */
  normalizer: {
    peerUnknown: 'Une autre session',
    recipientUnknown: 'une autre session',
    sentTo: (recipient: string, text: string) => `→ ${recipient} : ${text}`,
    extraSubagent: (number: number) => `Renfort ${number}`,
    searchIn: 'dans',
    thisTool: 'cet outil',
    ruleWholeTool: (tool: string) => `${tool}, pour tout`,
    ruleCommandsStartingWith: (prefix: string) => `les commandes qui commencent par « ${prefix} »`,
    ruleCommand: (command: string) => `la commande « ${command} »`,
    ruleToolOn: (tool: string, content: string) => `${tool} sur « ${content} »`,
  },
  crew: {
    giveYourName: 'Donne ton prénom.',
    giveName: 'Donne un prénom.',
    notInCrew: (name: string) => `${name} n’est pas dans l’équipe.`,
    alreadyInCrew: (name: string) => `${name} existe déjà dans l’équipe.`,
    selfNotRemovable: 'Ton propre avatar ne se supprime pas, change plutôt son look.',
  },
  /** macOS notifications: "<name> <what>" */
  notifier: {
    finished: 'a terminé',
    permission: 'demande une autorisation',
    question: 'te pose une question',
    error: 'a rencontré une erreur',
  },
  terminal: {
    macOnly: 'Ouvrir un terminal ne marche que sur macOS pour l’instant.',
    failed: 'Le terminal ne s’ouvre pas.',
  },
  /** a hook or an MCP server a folder would run */
  trust: {
    entry: (name: string, what: string) => `${name} : ${what}`,
  },
  journal: {
    missing: (name: string) => `La note ${name} n’est plus dans le dossier du tableau.`,
    badName: (name: string) => `« ${name} » ne peut pas être une note du tableau.`,
    tooBig: 'Cette note est trop longue pour le tableau (1 Mo au plus).',
  },
  metrics: {
    tooBig: 'Le fichier des chiffres est trop long pour l’écran (1 Mo au plus).',
  },
  server: {
    stoppingRetry: 'Le serveur s’arrête : réessaie une fois relancé.',
    nameTaken: (asked: string, name: string) => `${asked} n’était pas dispo : c’est ${name} qui s’en occupe.`,
  },
  console: {
    portTaken: (port: number) => `  Le port ${port} est déjà pris : Open Space tourne peut-être déjà.`,
    cannotStart: '  Le serveur ne démarre pas :',
    devBridge: '  (pont seul, l’interface est servie par Vite)',
    bookmark: '  (mets-le en favori)',
    pair: (link: string) => `  Autoriser un navigateur (une fois) : ${link}`,
    folders: (folders: string) => `  Dossiers : ${folders || 'à choisir dans la page, au premier lancement'}`,
    data: (folder: string) => `  Données : ${folder}`,
    claudeMissing: '  Claude Code introuvable : impossible de lancer des sessions.',
    stopHint: '  Pour arrêter : Ctrl + C. Les onglets ouverts se reconnectent seuls au prochain lancement.',
  },
};
