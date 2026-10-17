// What crew members do in real life, and the words in a first message that point to one of those jobs: a session
// started without a name goes to someone free whose job fits the request (see Crew.freeNameFor). The job never
// enters the session's prompt, it only chooses who comes.

/** The more specialised jobs first: a request as much about both goes to them ("a security audit" is cyber). */
export const JOBS = ['cyber', 'devops', 'tech', 'product', 'design', 'data', 'marketing', 'hr'] as const;
export type Job = (typeof JOBS)[number];

/**
 * Word beginnings, without accents and in lower case: "recrut" matches "recruter", "recrutement". Words of two letters
 * or fewer match whole only ("ui", "ci", "pr"). Several words in one entry match as a phrase.
 */
/** Tech is development and its lead (architecture, reviews); the infrastructure is DevOps, security is Cyber. */
const KEYWORDS: Record<Job, readonly string[]> = {
  cyber: [
    'securite', 'security', 'faille', 'vulnerab', 'pentest', 'cve', 'xss', 'csrf', 'injection', 'owasp', 'chiffr', 'encrypt', 'mot de passe',
    'password', 'rgpd', 'gdpr', 'firewall', 'pare feu', 'phishing', 'malware', 'intrusion', 'cyber', 'iso 27001', 'siem',
  ],
  devops: [
    'deploi', 'deploy', 'docker', 'kubernetes', 'k8s', 'serveur', 'server', 'ci', 'cd', 'pipeline', 'nginx', 'dns', 'cloud', 'aws', 'gcp', 'azure',
    'monitoring', 'logs', 'backup', 'sauvegarde', 'ssl', 'certificat', 'infra', 'terraform', 'ansible', 'devops', 'github actions', 'staging', 'production',
  ],
  tech: [
    'bug', 'fix', 'code', 'coder', 'implement', 'fonction', 'function', 'api', 'endpoint', 'test', 'refacto', 'composant', 'component', 'script',
    'build', 'compil', 'erreur', 'error', 'crash', 'typescript', 'javascript', 'react', 'vue', 'php', 'laravel', 'python', 'migration', 'commit',
    'merge', 'pr', 'backend', 'frontend', 'debug', 'regex', 'requete', 'query', 'classe', 'methode', 'variable', 'package', 'npm', 'lint',
    'architecture', 'archi', 'stack', 'choix technique', 'scalab', 'revue de code', 'code review', 'audit', 'dette technique',
    'performance', 'perf', 'strategie technique', 'recrutement technique',
  ],
  product: ['produit', 'product', 'feature', 'fonctionnalite', 'user story', 'spec', 'backlog', 'priori', 'roadmap', 'utilisateur', 'besoin', 'mvp', 'persona', 'parcours', 'cahier des charges', 'ticket', 'sprint'],
  design: ['design', 'maquette', 'figma', 'ui', 'ux', 'interface', 'couleur', 'typo', 'logo', 'icone', 'animation', 'css', 'mockup', 'wireframe', 'charte', 'ecran'],
  data: ['data', 'donnee', 'analyse', 'analytics', 'dashboard', 'statisti', 'kpi', 'metrique', 'metric', 'excel', 'csv', 'sql', 'posthog', 'conversion', 'cohorte'],
  marketing: ['marketing', 'seo', 'campagne', 'publicite', 'ads', 'newsletter', 'emailing', 'reseaux sociaux', 'linkedin', 'instagram', 'tiktok', 'contenu', 'article', 'blog', 'landing', 'copywriting', 'communication'],
  hr: ['recrut', 'entretien', 'candidat', 'rh', 'onboarding', 'contrat', 'salaire', 'conge', 'fiche de poste', 'offre d emploi', 'embauche', 'collaborateur', 'paie', 'mutuelle', 'formation', 'annuel'],
};

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** How many of a job's keywords a text holds. */
function score(words: readonly string[], phrase: string, job: Job): number {
  return KEYWORDS[job].filter((keyword) => (keyword.includes(' ')
    ? ` ${phrase} `.includes(` ${keyword}`)
    : words.some((word) => (keyword.length <= 2 ? word === keyword : word.startsWith(keyword))))).length;
}

/** The job a request is most about, or null when none of the jobs' words are in it. A tie goes to the first in JOBS. */
export function jobOf(text: string): Job | null {
  const phrase = plain(text);
  const words = phrase.split(' ');
  let best: Job | null = null;
  let bestScore = 0;
  for (const job of JOBS) {
    const found = score(words, phrase, job);
    if (found > bestScore) { best = job; bestScore = found; }
  }
  return best;
}

export const isJob = (value: unknown): value is Job => JOBS.some((job) => job === value);

/** The jobs found in untrusted JSON, each once, in JOBS order. */
export function parseJobs(raw: unknown): Job[] {
  return Array.isArray(raw) ? JOBS.filter((job) => raw.includes(job)) : [];
}
