import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jobOf, parseJobs } from './jobs.ts';

describe('jobs', () => {
  it('finds the job a first message is about, accents and case aside', () => {
    assert.equal(jobOf('Corrige le bug du endpoint /login'), 'tech');
    assert.equal(jobOf('Prépare la fiche de poste et les questions d’ENTRETIEN'), 'hr');
    assert.equal(jobOf('Fais une maquette Figma de l’écran de connexion'), 'design');
    assert.equal(jobOf('Déploie la nouvelle version avec Docker'), 'devops');
    assert.equal(jobOf('Corrige la faille XSS du formulaire'), 'cyber');
    assert.equal(jobOf('Fais un audit de sécurité'), 'cyber', 'as much about tech and cyber: the more specialised job');
    assert.equal(jobOf('Rédige les user stories du MVP et priorise le backlog'), 'product');
    assert.equal(jobOf('Une campagne LinkedIn pour la newsletter'), 'marketing');
    assert.equal(jobOf('Analyse la conversion dans PostHog'), 'data');
    assert.equal(jobOf('Fais un audit de l’architecture et de la dette technique'), 'tech', 'its lead is tech too');
  });

  it('finds nothing in a message without the words of a job, and short words only whole', () => {
    assert.equal(jobOf('Salut, ça va ?'), null);
    assert.equal(jobOf(''), null);
    assert.equal(jobOf('cinéma'), null, '"ci" is not the start of every word');
    assert.equal(jobOf('les deux publics'), null);
    assert.equal(jobOf('Une fiche produit pour la société'), 'product', '"produit" is not DevOps, "société" not Cyber');
  });

  it('keeps the known jobs of untrusted JSON, once each', () => {
    assert.deepEqual(parseJobs(['hr', 'tech', 'hr', 'pilot', 'cyber', 3]), ['cyber', 'tech', 'hr']);
    assert.deepEqual(parseJobs('tech'), []);
  });
});
