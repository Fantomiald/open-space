/** where an isolated session works (see WorktreeInfo) */
type Place = { branch: string; base: string; root: string; mainRoot: string };

/** an isolated session: where it works, what it must not touch, and the dev servers of the others */
const worktreeNote = ({ branch, base, root, mainRoot }: Place) =>
  `Tu travailles sur ta propre branche, « ${branch} », partie de « ${base} », dans ton propre dossier : ${root} (un worktree git). ` +
  `Le dossier principal du projet, ${mainRoot}, est celui des autres sessions : n’y écris jamais, et n’y lance aucune commande git. ` +
  `Commite sur ta branche quand c’est utile ; c’est Open Space qui fusionne dans « ${base} », quand l’utilisateur le demande. ` +
  `Un serveur de dev lancé depuis le dossier principal tient peut-être déjà son port : vérifie avant d’en lancer un (lsof -i :<port>), prends un autre port si besoin, et ne lance jamais un second Metro.`;

export const fr = {
  /** what new agents are told (system prompt, rename note, side question) */
  prompt: {
    /** the tester sub-agent each session can launch (server/browser.ts testerAgents) */
    tester: {
      description: 'Teste un parcours dans un navigateur à lui, affiché en direct dans Open Space. À lancer avec le parcours, l’adresse et ce qui doit se passer. Pour plusieurs parcours en même temps, un browser-tester de numéro différent par parcours.',
      prompt: 'Tu testes un parcours web dans ton propre navigateur (les outils tester-browser), que l’utilisateur regarde en direct. Fais le parcours demandé comme un vrai visiteur, sans rien modifier dans le code. Regarde la console et ce qui s’affiche à chaque étape, prends une capture des étapes clés. Rends un rapport court : ce qui marche, puis chaque problème avec comment le reproduire.',
    },
    identity: (name: string, user: string, note: string, browser: boolean) => {
      const who = user || 'l’utilisateur';
      return `Dans l'Open Space de ${who}, tu es l'agent « ${name} ». Si on te demande ton nom ou qui tu es, réponds « ${name} » ` +
        `(tu restes Claude, le modèle d'Anthropic). Plusieurs agents travaillent en parallèle, chacun sous son propre nom. ` +
        `${user || 'L’utilisateur'} suit plusieurs sessions à la fois : sois concis. Pas de préambule ni de récapitulatif de ce que tu viens de faire, ` +
        `pas de narration de chaque étape ; quelques phrases courtes suffisent, et tu ne détailles que si on te le demande. ` +
        `Cette consigne porte sur tes messages, pas sur la qualité ni la complétude du travail.` +
        ` Open Space affiche dans le fil les images que tu envoies avec SendUserFile et les pages que tu publies avec Artifact : quand tu changes quelque chose de visible (une page, un écran) et que tu peux en prendre une capture, envoie-la.` +
        (browser ? ` Ton navigateur (les outils Playwright) s’affiche en direct dans Open Space, et ${user || 'l’utilisateur'} peut cliquer dedans : sers-t’en pour tester ce que tu fais. Pour tester plusieurs parcours en même temps, lance en parallèle les sous-agents browser-tester-1 à browser-tester-4, un numéro différent par parcours : chacun a son propre navigateur, affiché lui aussi. Quand tu as fini de t’en servir, ferme ton navigateur (browser_close) : sinon il reste affiché à l’écran.` : '') +
        (note ? `\n\nCe que ${who} demande à tous ses agents : ${note}` : '');
    },
    /** the files the user sent with a message, as their paths: Claude opens them with its tools */
    /** sent by Open Space itself to a conversation left alone (Preferences.idleCompact) */
    idleCompact: '/compact Garde ce qu’il faut pour continuer sans rien réexpliquer : où on en est (branche, fichiers non commités), chaque décision et pourquoi, ce que l’utilisateur a demandé ou refusé avec ses mots, ce qui reste à faire, les fichiers clés et les pièges déjà rencontrés.',
    /** another session named by "@" in the user's message */
    mention: (name: string, folder: string) => `@${name} : la session « ${name} » de l’Open Space (dossier ${folder}). Pour lui écrire : SendMessage avec to: "${name}".`,
    attached: (paths: readonly string[]) => (paths.length === 1 ? `Fichier joint : ${paths[0]}` : `Fichiers joints :\n${paths.map((file) => `- ${file}`).join('\n')}`),
    rename: (name: string) => `(Note d'Open Space : tu t'appelles désormais « ${name} ». Garde ce nom.)\n\n`,
    aside: 'Question à côté (/btw), posée pendant que tu travailles : réponds brièvement, à partir de ce qui est déjà ' +
      'dans la conversation, sans utiliser d’outil. Ta réponse n’entre pas dans la conversation principale.',
    worktree: (worktree: Place) => worktreeNote(worktree),
    intoWorktree: (worktree: Place) => `(Note d'Open Space : tu as changé de dossier. ${worktreeNote(worktree)})\n\n`,
    backHome: (folder: string) => `(Note d'Open Space : ta branche et son dossier n’existent plus. Tu travailles maintenant dans le dossier principal du projet, ${folder}, avec les autres sessions.)\n\n`,
    /** what an isolated session is asked to do when the user merges its branch */
    merge: ({ branch, base, root, mainRoot }: { branch: string; base: string; root: string; mainRoot: string }) =>
      `Open Space te demande de fusionner ta branche « ${branch} » dans « ${base} ». Travaille seulement dans ton dossier (${root}) :\n` +
      `1. Regroupe tout ton travail en un seul commit sur ta branche, avec un message clair qui dit ce qu’il apporte (git add -A, git reset --soft $(git merge-base ${base} HEAD), puis un seul git commit).\n` +
      `2. Remets ta branche à jour : git rebase ${base}. S’il y a des conflits, règle-les en gardant le travail des deux côtés, puis git rebase --continue.\n` +
      `3. Lance les vérifications rapides du projet s’il en a (types, lint, tests courts) et corrige ce qui casse.\n` +
      `4. Ne fais ni merge ni push, et ne touche pas au dossier principal (${mainRoot}) : Open Space avance « ${base} » lui-même à la fin de ton tour.\n` +
      `Finis avec ton dossier propre (tout commité), et dis en une phrase ce que contient le commit.`,
    catchUp: (base: string) => `« ${base} » a encore bougé pendant ta fusion. Refais les étapes 2 et 3 (git rebase ${base}, les conflits, les vérifications), garde un seul commit et finis avec ton dossier propre.`,
    pullRequest: ({ branch, base, mainRoot }: { branch: string; base: string; mainRoot: string }) =>
      `Open Space te demande d’ouvrir une pull request pour ta branche « ${branch} » vers « ${base} » : commite ce qui reste, pousse ta branche (git push -u origin ${branch}), ` +
      `puis ouvre la PR avec gh pr create --base ${base}, un titre et une description clairs. Ne touche pas au dossier principal (${mainRoot}). Termine en donnant le lien de la PR.`,
  },
  process: {
    stopped: 'Claude Code s’est arrêté.',
    refused: 'Claude Code a refusé.',
    timedOut: 'Claude Code a mis trop de temps à répondre.',
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
      moved: 'Processus relâché pour changer de dossier.',
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
  /** a session on a branch of its own (server/worktrees.ts) */
  worktree: {
    preparing: 'Préparation de la branche…',
    preparingRetry: 'La branche se prépare encore, réessaie dans un instant.',
    prepareFailed: (reason: string, name: string, folder: string) => `La branche n’a pas pu être préparée (${reason}). ${name} reste dans ${folder} ; ton message attend au-dessus du champ.`,
    notRepo: 'ce dossier n’est pas dans un repo git',
    noBase: 'le dossier principal n’est sur aucune branche',
    noCommit: 'le repo n’a encore aucun commit',
    unknownBase: (base: string) => `la branche « ${base} » n’existe pas`,
    notCopied: (name: string) => `Les dépendances et les .env du dossier principal n’ont pas pu être copiés : ${name} installera ce qu’il faut.`,
    revived: (branch: string) => `Branche « ${branch} » retrouvée : son dossier est recréé.`,
    folderGone: (branch: string, folder: string) => `Le dossier de la branche « ${branch} » a disparu : la session continue dans ${folder}.`,
    waitTurn: (name: string) => `${name} travaille encore : attends la fin de son tour.`,
    nothingToMerge: 'La branche n’a rien de nouveau à fusionner.',
    notIsolated: 'Cette session ne travaille pas sur une branche à elle.',
    /** what makes Open Space leave a branch's folder as it is rather than lose something */
    notOnBranch: (branch: string) => `le dossier n’est plus sur la branche « ${branch} » (une autre branche, ou aucune)`,
    midOperation: 'un rebase, un merge ou un cherry-pick est en cours dans le dossier de la branche',
    putAwayFailed: (name: string, reason: string) => `La branche de ${name} n’a pas pu être rangée (${reason}). Rien n’a été supprimé : la session et son dossier restent.`,
    outsideRoots: (folder: string) => `le repo commence au-dessus de tes dossiers autorisés (${folder})`,
    restricted: (name: string) => `La branche fait tourner du code (hooks, serveurs MCP) que le dossier principal n’a pas : ${name} y travaille sans les réglages du projet.`,
    /** the short lines the thread shows for what Open Space asks of the session */
    mergeBubble: (base: string) => `Fusionne dans ${base}`,
    catchUpBubble: (base: string) => `Remets-toi à jour sur ${base}`,
    prBubble: (base: string) => `Ouvre une PR vers ${base}`,
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
    macOnly: 'Ouvrir un terminal est disponible sur macOS et Windows.',
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
    taken: (name: string) => `Une note s’appelle déjà ${name}.`,
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
