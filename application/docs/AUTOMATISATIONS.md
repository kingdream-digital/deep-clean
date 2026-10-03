# Automatisations (rappels automatiques)

Code : `backend/src/modules/automations/automations.service.ts`, planifié dans
`backend/src/server.ts` (heures de Paris). Chaque rappel a une clé unique en
base (`automation_events`) : il ne part jamais deux fois.

| Quand | Quoi | Qui reçoit |
|---|---|---|
| Toutes les 5 min | Pointage d'arrivée oublié (15 min après le début de la mission, sauf congé) | L'employé concerné |
| Toutes les 5 min | Personne n'a pointé 30 min après le début | Superviseurs + chef d'équipe du chantier |
| Toutes les 5 min | Sortie oubliée (30 min après la fin de la mission, ou 10 h sans mission) | L'employé concerné |
| 8 h | Récap : pointages à valider, absences à décider | Superviseurs + RH |
| 8 h | Demande d'absence sans réponse depuis 48 h | RH, direction, superviseurs |
| 9 h | Devis en brouillon depuis plus de 24 h (tous les 2 jours, 3 fois max) | Le commercial / créateur du devis |
| 9 h | Devis à valider depuis plus de 24 h | Direction + RH |
| 9 h | Devis validé mais pas envoyé | Le commercial / créateur |
| 9 h | Devis envoyé sans réponse depuis 7 jours, ou date de relance atteinte | Le commercial / créateur |
| 18 h | Missions du lendemain | Chaque personne affectée |
| Le 1er à 8 h 10 | Chantiers du mois écoulé pas encore facturés | Direction + RH |

Les délais sont réunis dans `AUTOMATION_SETTINGS` (même fichier).
